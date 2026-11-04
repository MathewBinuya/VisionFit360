import { GoogleGenerativeAI } from "@google/generative-ai";

// Model(s) to use, in preference order. GEMINI_MODEL may be a comma-separated
// list — if the first model is unavailable (404) or stays overloaded (503)
// across every key, we fall over to the next model in the list. Env-overridable
// so a model change needs no code change / redeploy.
//
// Default: gemini-3.5-flash-lite (primary) → gemini-3.8-flash (fallback).
//  - 3.5-flash-lite is a fast, low-latency model and a DIFFERENT model from
//    3.8-flash, so it doesn't share 3.8's "high demand" 503 overload. Plenty
//    capable for the structured workout/chat output here, and much quicker.
//  - 3.8-flash is the higher-quality fallback for when lite is unavailable.
// NOTES: gemini-2.5-flash is retired (404 for new projects). gemini-3.7-flash is
// NOT a useful fallback — Google auto-forwards it to 3.8-flash (same capacity).
const MODEL_NAMES = (process.env.GEMINI_MODEL || "gemini-3.5-flash-lite,gemini-3.8-flash")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// Collect every configured key: GEMINI_API_KEY (single, legacy) plus
// GEMINI_API_KEYS (comma-separated). The order here is the failover order.
// NOTE: extra keys only add quota if they come from DIFFERENT Google Cloud
// projects/accounts — keys in the same project share one quota pool.
const keys = [
  ...new Set(
    [process.env.GEMINI_API_KEY, ...(process.env.GEMINI_API_KEYS || "").split(",")]
      .map((k) => (k || "").trim())
      .filter(Boolean)
  ),
];

if (!keys.length) {
  console.log("GEMINI NOT CONFIGURED: set GEMINI_API_KEY or GEMINI_API_KEYS");
} else {
  console.log(
    `Gemini ready (${keys.length} key${keys.length > 1 ? "s" : ""}, model${MODEL_NAMES.length > 1 ? "s" : ""} ${MODEL_NAMES.join(" → ")})`
  );
}

// clients[modelIndex][keyIndex] — one client per (model, key) pair.
const clients = MODEL_NAMES.map((name) =>
  keys.map((key) => new GoogleGenerativeAI(key).getGenerativeModel({ model: name }))
);

// Back-compat: anything still importing `model` gets the first (model, key) client.
export const model = clients[0] && clients[0][0];

const isRateLimit = (err) => {
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("429") ||
    msg.includes("rate") ||
    msg.includes("quota") ||
    msg.includes("resource has been exhausted")
  );
};

// Transient server-side errors (model overloaded / briefly unavailable). Unlike
// a quota 429 these clear on their own, so we retry: sweep the keys (and any
// fallback models) and back off between sweeps rather than failing immediately.
const isTransient = (err) => {
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("503") ||
    msg.includes("overloaded") ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("500") ||
    msg.includes("internal error")
  );
};

// The model itself is gone/unknown (retired, typo'd env, no access). Retrying the
// SAME model on another key won't help — skip straight to the next model instead.
const isModelUnavailable = (err) => {
  const msg = (err?.message || "").toLowerCase();
  return (
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("not available") ||
    msg.includes("no longer available")
  );
};

const isRetryable = (err) => isRateLimit(err) || isTransient(err);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Round-robin start so load spreads across keys instead of always hitting #1.
let cursor = 0;

/**
 * Generate content with multi-key AND multi-model failover.
 * For each configured model (in order) it sweeps every key; a rate-limit/quota
 * (429) or transient overload (503) moves on to the next key, and a model-gone
 * (404) jumps to the next model. After a full sweep of all models×keys where at
 * least one error was transient/rate-limited, it backs off and sweeps again (up
 * to `maxLoops` times) to ride out short provider overload spikes. A genuine
 * error (bad request, safety block, auth) throws immediately.
 * @param {object} request  passed straight to generateContent (e.g. { contents, generationConfig })
 * @returns {Promise<string>} the response text
 */
export const generateContent = async (request, { maxLoops = 3 } = {}) => {
  if (!keys.length) {
    throw new Error("Gemini is not configured (GEMINI_API_KEY / GEMINI_API_KEYS)");
  }
  const total = keys.length;
  let lastErr;

  for (let loop = 0; loop < maxLoops; loop++) {
    let retryableSeen = false;

    for (let mi = 0; mi < clients.length; mi++) {
      let modelGone = false;
      for (let k = 0; k < total; k++) {
        const idx = (cursor + k) % total;
        try {
          const result = await clients[mi][idx].generateContent(request);
          cursor = (idx + 1) % total; // next call starts at the following key
          return result.response.text();
        } catch (err) {
          lastErr = err;
          if (isModelUnavailable(err)) { modelGone = true; break; } // → next model
          if (!isRetryable(err)) throw err; // real error — don't burn the rest
          retryableSeen = true;
        }
      }
      if (modelGone) continue; // try the next fallback model
    }

    // Nothing worth retrying (e.g. every model 404'd) — stop now.
    if (!retryableSeen) break;
    // Back off before the next sweep (capped), to ride out a provider spike.
    if (loop < maxLoops - 1) await sleep(Math.min(4000, 1000 * Math.pow(2, loop)));
  }

  throw lastErr;
};
