import { generateJSON } from "../lib/groq.js";
import User from "../models/user.model.js";
import Workout from "../models/workout.model.js";
import { getUserAnalytics } from "../lib/workoutAnalytics.js";
import { EXERCISE_CATALOG, canonicalExerciseName, catalogPromptLines } from "../lib/exerciseCatalog.js";

// AI calls go through generateJSON() in lib/groq.js (Groq / Llama 3.3 70B,
// OpenAI-compatible), which rotates across all configured API keys, fails over
// on 429/5xx, and re-tries on unparseable JSON. Output is still untrusted and
// is validated/clamped below before use.

// Errors that should surface to the user as a friendly "AI is busy, try again"
// (429 rate limit / quota and transient 5xx), rather than a generic 500. The
// failover in lib/groq.js already retries these across keys with backoff, so
// reaching here means it stayed busy for the whole request.
const isBusyError = (err) => {
  const status = err?.status || 0;
  if ([429, 500, 502, 503, 504].includes(status)) return true;
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate") ||
    msg.includes("quota") ||
    msg.includes("resource has been exhausted") ||
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable")
  );
};

//  goal guidance — patterns, NOT rigid rules. Keep in sync with the mobile enum.
const GOAL_GUIDANCE = {
  get_fit:
    "Goal: Get Fit — balanced strength and conditioning for general fitness, moderate volume (about 3 sets per exercise), mix strength moves with some cardio.",
  maintain_weight:
    "Goal: Maintain Weight — consistency-focused, balanced volume, maintain strength with moderate loads, include reasonable cardio. Sustainable over intense.",
  get_lean:
    "Goal: Get Lean / Ripped — resistance training first with progressive overload (build on the user's previous weights/reps), higher volume where appropriate (3–4 sets, 8–15 reps), plus conditioning/cardio when suitable. No crash diets or extreme advice.",
};

// BMI is a training-personalization signal only — never a diagnosis.
const BMI_GUIDANCE = {
  underweight:
    "BMI guidance (underweight range): emphasise resistance/strength work, moderate volume, keep cardio light, allow full rest (75–120s).",
  normal:
    "BMI guidance (normal range): standard intensity and volume for the user's level.",
  overweight:
    "BMI guidance (overweight range): moderate intensity, mix strength with low-impact conditioning, rest 60–90s, offer beginner-friendly progressions.",
  obese:
    "BMI guidance (obesity range): prioritise low-impact moves (avoid high-impact cardio like Jumping Jacks / High Knees unless the user asks or their history shows they handle it), moderate sets/reps, longer rest (90–120s), build volume gradually.",
};

// --- Age-based safety tiers --------------------------------------------------
// Youth strength-training guidance follows the NSCA / AAP consensus: resistance
// training IS safe for children and adolescents, provided it stays submaximal,
// technique-focused, and avoids maximal (1RM) / heavy loads before skeletal
// maturity (the growth-plate concern). Younger => lighter, bodyweight-first.
// VisionFit is unsupervised (AR rep counter, no coach present), so for minors we
// also HARD-CAP the weight the AI can prescribe — the prompt guidance below is
// reinforced by weight clamping in sanitizeExercises so an off-prompt heavy
// load can never reach a young user. The kg caps are pragmatic app-level safety
// limits, NOT medical thresholds — tune freely.
const AGE_TIERS = {
  child:      { weightCapKg: 5 },    // under 13 (pre-adolescent)
  adolescent: { weightCapKg: 20 },   // 13–17
  adult:      { weightCapKg: 500 },  // 18+ — existing default, unrestricted
};

const ageTier = (age) => {
  if (age == null) return "adult"; // unknown age => no age-based restriction
  if (age <= 12) return "child";
  if (age <= 17) return "adolescent";
  return "adult";
};

const AGE_GUIDANCE = {
  child:
    "Age: under 13 (pre-adolescent). SAFETY — keep it technique-first and bodyweight-focused. " +
    "Prefer bodyweight exercises; for any weighted exercise use a very light load (5 kg max) with higher-rep, submaximal sets. " +
    "NEVER program maximal or heavy lifts. Prioritise good form and movement skill over load.",
  adolescent:
    "Age: 13–17 (adolescent). SAFETY — resistance training is fine but must be submaximal and progressive. " +
    "Keep loads moderate (20 kg max on weighted exercises), roughly 8–15 reps, with adequate rest. " +
    "NEVER program maximal (1RM) or near-maximal attempts — the skeleton is still developing.",
  adult: null, // 18+ — standard behaviour, no extra restriction line
};

// Gender is ONE soft factor: it may nudge emphasis, never restrict or change difficulty.
const GENDER_GUIDANCE = {
  female:
    "Gender: female. You may lean slightly toward lower-body/glute and full-body work that many women commonly prefer, but still include upper-body strength. Do NOT reduce weights, volume or difficulty because of gender.",
  male:
    "Gender: male. You may lean slightly toward upper-body strength work that many men commonly prefer, but still include lower body and core. Do NOT increase weights, volume or difficulty because of gender.",
  // "other" is no longer selectable (removed from the user/admin modules); kept
  // only so any legacy account still holding it gets sensible, neutral guidance.
  other: "Gender: other — no gender-based emphasis.",
};

const bmiCategory = (bmi) =>
  bmi < 18.5 ? "underweight" : bmi < 25 ? "normal" : bmi < 30 ? "overweight" : "obese";

const ageFrom = (dob) => {
  if (!dob) return null;
  const d = new Date(dob);
  if (isNaN(d)) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now < new Date(now.getFullYear(), d.getMonth(), d.getDate())) age--;
  return age > 0 && age < 120 ? age : null;
};

// Estimated from logged history only (there is no self-reported level field).
const estimateLevel = ({ totalWorkouts, avgWorkoutsPerWeek }) => {
  if (totalWorkouts < 6 || avgWorkoutsPerWeek < 1) return "beginner";
  if (totalWorkouts >= 40 && avgWorkoutsPerWeek >= 4) return "advanced";
  return "intermediate";
};

// Exercise names are user-typed; canonicalise to the catalog or strip to safe characters.
const safeExerciseName = (name) =>
  canonicalExerciseName(name) || String(name || "").replace(/[^A-Za-z0-9 \-]/g, "").trim().slice(0, 40) || "exercise";

const describeSession = (w) => {
  const date = new Date(w.completedAt || w.date).toISOString().slice(0, 10);
  const parts = (w.exercises || []).slice(0, 6).map((ex) => {
    const sets = (ex.sets || []).filter((s) => s.reps > 0);
    if (!sets.length) return safeExerciseName(ex.name);
    const top = sets.reduce((a, b) => ((b.weightKg || 0) > (a.weightKg || 0) ? b : a));
    return `${safeExerciseName(ex.name)} ${sets.length}x${top.reps}${top.weightKg ? ` @ ${top.weightKg}kg` : ""}`;
  });
  return `${date}: ${parts.join(", ") || "no exercises"}`;
};

//  Build the Gemini context from STRUCTURED, validated fields only.
//  Never include free-text fields (bio, display name, workout titles).
const buildUserContext = async (userId) => {
  const [user, recent, analytics] = await Promise.all([
    User.findById(userId).select("-password"),
    Workout.find({ user: userId, completed: true }).sort({ completedAt: -1, date: -1 }).limit(5).lean(),
    getUserAnalytics(userId, { weeks: 6 }),
  ]);
  const { summary, records, weeks } = analytics;

  const lines = [];

  let bmiCat = null;
  if (user?.heightCm && user?.weightKg) {
    const h = user.heightCm / 100;
    const bmi = user.weightKg / (h * h);
    bmiCat = bmiCategory(bmi);
    lines.push(`BMI ${bmi.toFixed(1)} (${bmiCat} range; height ${user.heightCm} cm, weight ${user.weightKg} kg). ${BMI_GUIDANCE[bmiCat]}`);
  } else {
    lines.push("BMI unknown — use standard intensity for the user's level.");
  }

  const age = ageFrom(user?.dateOfBirth);
  const tier = ageTier(age);
  const weightCap = AGE_TIERS[tier].weightCapKg;
  if (age) {
    lines.push(`Age: ${age}.`);
    if (AGE_GUIDANCE[tier]) lines.push(AGE_GUIDANCE[tier]);
  }

  lines.push(GENDER_GUIDANCE[user?.gender] || "Gender: unspecified — no gender-based emphasis.");
  lines.push(GOAL_GUIDANCE[user?.goal] || GOAL_GUIDANCE.get_fit);

  const level = estimateLevel(summary);
  lines.push(
    `Estimated fitness level: ${level} (from ${summary.totalWorkouts} logged workouts, ~${summary.avgWorkoutsPerWeek}/week over the last 4 weeks; ` +
    `${summary.daysSinceLastWorkout == null ? "no workouts logged yet" : `last workout ${summary.daysSinceLastWorkout} day(s) ago`}).`
  );

  if (summary.totalWorkouts) {
    const vol = weeks.slice(-4).map((w) => `${w.weekStart}: ${w.workouts} workouts, ${w.volume} kg`).join("; ");
    lines.push(`Weekly training (volume = reps x kg): ${vol}.`);
  }
  if (recent.length) lines.push(`Recent sessions: ${recent.map(describeSession).join(" | ")}.`);

  const best = records.slice(0, 6).map((r) => `${safeExerciseName(r.exercise)} ${r.bestKg} kg`);
  if (best.length) {
    lines.push(`Heaviest recorded weights: ${best.join(", ")}. Base suggested weights on these — progress by small steps (about 1–2.5 kg or 1–2 reps) only when appropriate, never large jumps.`);
  }

  const text =
    `User profile:\n- ${lines.join("\n- ")}\n` +
    `Combine ALL of these factors. Gender is only one soft factor — the user can train any muscle group and any supported exercise. BMI is not a medical diagnosis. ` +
    `Age safety guidance (when present) is a HARD constraint, not a suggestion. ` +
    `If there's little history, start conservatively and beginner-friendly. Avoid repeating the exact same focus as the most recent session when possible. Always prioritise good form over load.`;

  // weightCap feeds the server-side weight clamp (defense-in-depth for minors).
  // `profile` holds the SAME structured signals as the prompt, so the rule-based
  // fallback (buildFallbackWorkout) can personalise without the AI.
  const profile = {
    bmiCat,
    goal: user?.goal || "get_fit",
    gender: user?.gender,
    ageTier: tier,
    level,
    records, // [{ exercise, bestKg }, ...] for base weights
  };
  return { text, age, weightCap, profile };
};

const CATALOG_RULE =
  `Supported VisionFit exercises (use ONLY these, with the name spelled exactly as listed):\n${catalogPromptLines()}\n` +
  `Use 0 for weightKg on bodyweight and cardio exercises. For weighted exercises suggest a realistic dumbbell/barbell weight for this user (0 is allowed if they have no equipment history).`;

// ----- server-side validation / clamping of AI output (defense-in-depth) -----
// Gemini output is untrusted. We clamp to sane ranges, drop malformed entries,
// and keep the EXACT response shape the frontend + POST /workouts expect.
const clampInt = (n, lo, hi, dflt) => {
  const x = Number(n);
  if (!isFinite(x)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(x)));
};
const clampFloat = (n, lo, hi, dflt) => {
  const x = Number(n);
  if (!isFinite(x)) return dflt;
  return Math.min(hi, Math.max(lo, Math.round(x * 10) / 10));
};

const sanitizeSets = (sets, weighted, maxWeightKg = 500) =>
  (Array.isArray(sets) ? sets : [])
    .slice(0, 12)
    .map((s) => ({
      reps: clampInt(s?.reps, 1, 100, 10),
      // weight is clamped to the age-tier cap (see AGE_TIERS) so a minor can
      // never be prescribed a heavy load, even if the model ignores the prompt.
      weightKg: weighted ? clampFloat(s?.weightKg, 0, maxWeightKg, 0) : 0,
      restSeconds: clampInt(s?.restSeconds, 0, 600, 60),
    }));

// Only exercises VisionFit supports survive; names are normalised to the catalog.
const sanitizeExercises = (exercises, maxWeightKg = 500) =>
  (Array.isArray(exercises) ? exercises : [])
    .filter((e) => e && typeof e.name === "string" && e.name.trim())
    .map((e) => ({ ...e, name: canonicalExerciseName(e.name) }))
    .filter((e) => e.name)
    .slice(0, 15)
    .map((e) => {
      const weighted = EXERCISE_CATALOG.find((c) => c.name === e.name)?.kind === "weighted";
      return { name: e.name, sets: sanitizeSets(e.sets, weighted, maxWeightKg) };
    })
    .filter((e) => e.sets.length > 0);

const sanitizeText = (t, max) =>
  (typeof t === "string" ? t.trim().slice(0, max) : "");

// Groq/Llama use JSON mode (valid JSON guaranteed) but NOT a strict schema, so
// we spell the exact shape in the prompt. The sanitize/clamp layer above is the
// real enforcer — names are canonicalised to the catalog, weights clamped, etc.
const WORKOUT_JSON_SHAPE =
  `Respond with ONLY a valid JSON object (no markdown, no code fences) of exactly this shape:\n` +
  `{"intro": "short friendly one-line intro", "title": "short workout title", "exercises": [{"name": "<a supported exercise name, spelled EXACTLY as listed above>", "sets": [{"reps": <integer>, "weightKg": <number, 0 for bodyweight/cardio>, "restSeconds": <integer>}]}]}\n` +
  `Include 4-6 exercises. Use ONLY supported exercise names.`;

const CHAT_JSON_SHAPE =
  `Respond with ONLY a valid JSON object (no markdown, no code fences):\n` +
  `{"responseType": "chat" or "workout", "reply": "<always present; for chat the full answer, for workout a short one-sentence intro>", "title": "<only for workout>", "exercises": [<only for workout; same shape as a workout's exercises: {"name","sets":[{"reps","weightKg","restSeconds"}]}>]}\n` +
  `Set responseType to "workout" ONLY when giving a workout/routine/plan; otherwise "chat" and omit title/exercises. Use ONLY supported exercise names.`;

// ---- Rule-based fallback workout (no AI) ------------------------------------
// Served when EVERY AI call fails (Groq down, network, unparseable output) so the
// user ALWAYS gets a real, profile-appropriate workout instead of an error.
// Uses the SAME structured signals as the AI (BMI, age tier, gender, goal, PR
// history), applied as deterministic rules. Less varied than the LLM, but safe
// and genuinely personalised. Its output still passes through sanitizeExercises.
const rotate = (arr, seed) => arr[((seed % arr.length) + arr.length) % arr.length];

const buildFallbackWorkout = (profile = {}, weightCap = 500) => {
  const bmi = profile.bmiCat;
  const goal = profile.goal || "get_fit";
  const tier = profile.ageTier || "adult";
  const female = profile.gender === "female";
  const obese = bmi === "obese";
  const child = tier === "child";
  // rotate a couple of picks by day so it isn't identical every single day
  const day = Math.floor((Date.now() + 8 * 3600 * 1000) / 86400000); // ~Manila day

  // sets / reps / rest from goal + BMI + age tier (mirrors the prompt guidance)
  let sets = 3, reps = 10, rest = 60;
  if (goal === "get_lean") { reps = 13; rest = 50; }
  else if (goal === "maintain_weight") { reps = 11; rest = 60; }
  if (bmi === "underweight") { reps = 8; rest = 90; }
  else if (bmi === "overweight") { rest = 75; }
  else if (obese) { reps = 12; rest = 105; }        // obesity range: longer rest
  if (child) { sets = 2; reps = 12; rest = 60; }     // youth: lower volume

  // base weight for a weighted move: the user's recorded best (no progression in
  // the fallback), else a level default; always clamped to the age cap; 0 for kids.
  const weightFor = (name) => {
    if (child) return 0; // bodyweight-first for under-13
    const rec = (profile.records || []).find((r) => canonicalExerciseName(r.exercise) === name);
    const level = profile.level || "beginner";
    const base = rec && rec.bestKg > 0
      ? rec.bestKg
      : level === "advanced" ? 15 : level === "intermediate" ? 10 : 5;
    return Math.min(base, weightCap);
  };

  // balanced selection across muscle groups, respecting constraints:
  // no high-impact cardio for obese; bodyweight-first for children; slight
  // gender emphasis (never changes difficulty).
  const names = [];
  names.push(rotate(female ? ["Sumo Squats", "Squats"] : ["Squats", "Sumo Squats"], day)); // Legs
  names.push("Push-ups"); // Chest
  if (child) {
    names.push("Knee Raises", "Side Leg Raises", "Side Bends"); // all bodyweight
  } else {
    names.push(female ? "Lateral Raises" : "Shoulder Press"); // Shoulders
    names.push("Bicep Curls");                                 // Arms
    names.push(female ? "Side Bends" : "Knee Raises");         // Core
  }
  // conditioning / extra — skip high-impact cardio for the obesity range & kids
  names.push(obese || child ? "Side Leg Raises" : rotate(["Jumping Jacks", "High Knees"], day));

  const exercises = [...new Set(names)].slice(0, 6).map((name) => {
    const weighted = EXERCISE_CATALOG.find((c) => c.name === name)?.kind === "weighted";
    const w = weighted ? weightFor(name) : 0;
    return { name, sets: Array.from({ length: sets }, () => ({ reps, weightKg: w, restSeconds: rest })) };
  });

  const title =
    (goal === "get_lean" ? "Lean & Conditioning"
      : goal === "maintain_weight" ? "Maintenance Full-Body"
      : "Balanced Full-Body") + (obese ? " (Low-Impact)" : "");
  const intro = obese
    ? "Here's a low-impact, joint-friendly full-body session built around your profile."
    : child
      ? "Here's a technique-first, bodyweight session suited to you — focus on good form."
      : "Here's a balanced workout picked for your profile — prioritise good form over load.";

  return { intro, title, exercises };
};

export const recommendWorkout = async (req, res) => {
  // Keep the profile accessible in catch so a total AI failure still yields a
  // personalised, rule-based workout instead of an error.
  let weightCap = 500;
  let profile = {};
  try {
    const ctx = await buildUserContext(req.user.id);
    weightCap = ctx.weightCap;
    profile = ctx.profile;
    const context = ctx.text;

    const systemPrompt = `You are a friendly, encouraging fitness coach. ${context}\n${CATALOG_RULE}`;
    const userPrompt =
      `Recommend a single workout for today built specifically for THIS person — choose exercises, intensity, sets, reps, weights and rest from their goal, BMI, estimated level, gender emphasis and recent training. Keep the intro short and motivating (one sentence) and make it reflect why this workout suits them.\n\n${WORKOUT_JSON_SHAPE}`;

    // generateJSON parses the response and, if a model returns invalid JSON,
    // fails over to the next key/model (capped length bounds a runaway).
    const parsed = await generateJSON({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      // headroom: gpt-oss is a reasoning model, so leave room for its reasoning
      // pass plus the JSON without truncating the workout.
      maxTokens: 4096,
    });

    // validate + clamp (weights capped to the user's age tier). If nothing
    // usable survives, throw so the catch serves the rule-based fallback.
    const exercises = sanitizeExercises(parsed.exercises, weightCap);
    if (!exercises.length) throw new Error("AI recommendation had no valid exercises after sanitation");

    const recommendation = {
      intro: sanitizeText(parsed.intro, 300) || "Here's a workout for today.",
      title: sanitizeText(parsed.title, 80) || "Today's Workout",
      exercises,
    };

    res.json({ recommendation });
  } catch (err) {
    // AI fully failed (Groq down / rate-limited / unparseable / no valid moves).
    // Never error the user — serve a personalised, rule-based workout built from
    // their profile so Smart Plan always returns something usable.
    console.log("AI recommend failed; serving rule-based fallback:", err.message);
    try {
      const fb = buildFallbackWorkout(profile, weightCap);
      const exercises = sanitizeExercises(fb.exercises, weightCap);
      if (!exercises.length) throw new Error("fallback produced no exercises");
      return res.json({
        recommendation: { intro: fb.intro, title: fb.title, exercises },
        source: "fallback", // lets the client note it's an offline/standby plan if desired
      });
    } catch (fbErr) {
      console.log("Fallback workout failed:", fbErr.message);
      return res.status(500).json({ message: "Could not generate recommendation" });
    }
  }
};

// Chat covers BOTH a normal conversational reply and a workout recommendation
// given mid-chat (so "give me a leg day" becomes trackable too) — see
// CHAT_JSON_SHAPE above for the exact JSON shape the model must return.

// Normalise the client history for a system+user/assistant chat: map roles,
// collapse consecutive same-role turns, and lift any leading assistant turn
// (the auto-recommendation, which starts every chat) out so the turns begin
// with a user turn and alternate. The lifted text is returned separately to
// fold into the system prompt as context.
const normalizeChatTurns = (messages) => {
  const mapped = (Array.isArray(messages) ? messages : [])
    .map((m) => ({
      role: m?.role === "user" ? "user" : "assistant",
      text: typeof m?.text === "string" ? m.text.trim() : "",
    }))
    .filter((m) => m.text);

  const collapsed = [];
  for (const m of mapped) {
    const last = collapsed[collapsed.length - 1];
    if (last && last.role === m.role) last.text += `\n\n${m.text}`;
    else collapsed.push({ ...m });
  }

  let primerExtra = "";
  while (collapsed.length && collapsed[0].role === "assistant") {
    primerExtra += (primerExtra ? "\n\n" : "") + collapsed.shift().text;
  }

  return { turns: collapsed, primerExtra };
};

export const chatWithCoach = async (req, res) => {
  try {
    const { messages } = req.body;
    const { text: context, weightCap } = await buildUserContext(req.user.id);

    const { turns, primerExtra } = normalizeChatTurns(
      Array.isArray(messages) ? messages.slice(-10) : []
    );

    const systemPrompt =
      `You are a friendly fitness coach for the VisionFit app. ${context}\n${CATALOG_RULE}\n` +
      `Answer the user's fitness questions concisely and practically, personalised to their profile. Keep responses short. If the user asks for a workout, routine, or exercise plan, set responseType to "workout" and provide structured exercises tailored to them, honouring any muscle group or exercise they ask for. If they ask for an exercise VisionFit doesn't support, briefly say so and use the closest supported alternative. For anything else, set responseType to "chat".\n\n` +
      `SCOPE — IMPORTANT: You ONLY discuss fitness, exercise, workouts, training, nutrition and general wellness (sleep, hydration, recovery). If the user asks about anything unrelated — programming/code, general trivia, maths, news, politics, other apps, etc. — do NOT answer it. Politely decline in a single short sentence and steer them back to their training (set responseType to "chat"). For medical or injury concerns, give only general, non-diagnostic guidance and suggest they consult a qualified professional.` +
      (primerExtra ? `\n\nEarlier in this chat you shared this workout with the user:\n${primerExtra}` : "") +
      `\n\n${CHAT_JSON_SHAPE}`;

    const chatMessages = [
      { role: "system", content: systemPrompt },
      ...turns.map((m) => ({ role: m.role, content: m.text })),
    ];
    // Defensive: the API wants at least one user turn. The app always sends one,
    // but guard against a history that normalised to assistant-only.
    if (!chatMessages.some((m) => m.role === "user")) {
      return res.json({ reply: "Ask me anything about your training!" });
    }

    const parsed = await generateJSON({ messages: chatMessages, maxTokens: 4096 });

    const reply = sanitizeText(parsed.reply, 2000) || "Sorry, I couldn't put that together. Try again.";

    if (parsed.responseType === "workout") {
      const exercises = sanitizeExercises(parsed.exercises, weightCap);
      // Only return a workout if valid exercises survived validation; otherwise
      // degrade gracefully to a plain chat reply (preserves the response shape).
      if (exercises.length) {
        return res.json({
          reply,
          workout: { title: sanitizeText(parsed.title, 80) || "Workout", exercises },
        });
      }
    }

    res.json({ reply });
  } catch (err) {
    console.log("AI chat error", err.message);
    if (isBusyError(err)) {
      return res.status(429).json({
        message: "The AI coach is busy right now. Please try again in a few moments.",
      });
    }
    res.status(500).json({ message: "Could not get a reply" });
  }
};
