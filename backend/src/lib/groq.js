// Groq (OpenAI-compatible) chat client with multi-key failover + invalid-JSON
// failover. No SDK dependency — it calls the REST endpoint with the global
// fetch (Node 18+). The key(s) come from env, never hardcoded.
//
// Why Groq / gpt-oss-120b: it's a free, fast, large (120B) open-weight model
// that is far less prone to the repetition-loop degeneration small "lite" models
// fall into on structured output. We still use JSON mode AND the server-side
// sanitize/clamp layer as guards — never trust model output blindly.
// NOTE: available models vary by Groq account — check GET /openai/v1/models.

const ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

// Model(s) in preference order; GROQ_MODEL can be a comma-separated list for
// fallback (gpt-oss-120b for quality → gpt-oss-20b, smaller/faster). All
// env-overridable so a model change needs no redeploy.
const MODELS = (process.env.GROQ_MODEL || "openai/gpt-oss-120b,openai/gpt-oss-20b")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

// GROQ_API_KEY (single) plus optional GROQ_API_KEYS (comma-separated). Order =
// failover order. Extra keys only add quota if from different Groq orgs.
const keys = [
  ...new Set(
    [process.env.GROQ_API_KEY, ...(process.env.GROQ_API_KEYS || "").split(",")]
      .map((k) => (k || "").trim())
      .filter(Boolean)
  ),
];

if (!keys.length) {
  console.log("GROQ NOT CONFIGURED: set GROQ_API_KEY (or GROQ_API_KEYS)");
} else {
  console.log(
    `Groq ready (${keys.length} key${keys.length > 1 ? "s" : ""}, model${MODELS.length > 1 ? "s" : ""} ${MODELS.join(" → ")})`
  );
}

// Classify by HTTP status (callGroq always sets err.status) — NOT by message
// substrings, which caused false positives (e.g. "gene*rate* JSON" matching
// /rate/ and treating a 400 as a rate-limit). A network error has no status.
const statusOf = (err) => err?.status || 0;
const isRateLimit = (err) => statusOf(err) === 429;
const isTransient = (err) =>
  [500, 502, 503, 504].includes(statusOf(err)) ||
  (!statusOf(err) && /fetch failed|network|timeout|socket|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(err?.message || ""));
const isModelUnavailable = (err) => statusOf(err) === 404;
const isRetryable = (err) => isRateLimit(err) || isTransient(err);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Pull a JSON object out of a model response. We do NOT use Groq's strict JSON
// mode (response_format), because reasoning models like gpt-oss emit reasoning
// first and Groq then 400s with "Failed to generate JSON". Instead we extract:
// strip any ``` fence, try a direct parse, then fall back to slicing from the
// first "{" to the last "}" so a reasoning/prose preamble around the JSON is
// tolerated. Unparseable output is rejected by generateJSON and failed over.
const stripFences = (t) => {
  const s = String(t || "").trim();
  const m = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : s;
};
const extractJSON = (t) => {
  const s = stripFences(String(t || "").trim());
  try {
    return JSON.parse(s);
  } catch {}
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start !== -1 && end > start) return JSON.parse(s.slice(start, end + 1));
  throw new Error("no JSON object in response");
};

// One raw completion call.
const callGroq = async (key, model, { messages, maxTokens = 2048, temperature = 0.7, jsonMode = false }) => {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
  });
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).replace(/\s+/g, " ").slice(0, 200);
    } catch {}
    const err = new Error(`Groq ${res.status}: ${detail}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
};

// Round-robin start so load spreads across keys.
let cursor = 0;

/**
 * Generate a completion with multi-key AND multi-model failover.
 * @param {object} request  { messages, maxTokens?, temperature?, jsonMode? }
 * @param {object} [opts]
 * @param {number} [opts.maxLoops=3]
 * @param {(text: string) => void} [opts.validate]  throws to REJECT a response
 *   (e.g. unparseable JSON) — rejected responses fail over like a 503.
 * @returns {Promise<string>} the response text
 */
export const generateContent = async (request, { maxLoops = 3, validate } = {}) => {
  if (!keys.length) throw new Error("Groq is not configured (GROQ_API_KEY)");
  const total = keys.length;
  let lastErr;

  for (let loop = 0; loop < maxLoops; loop++) {
    let retryableSeen = false;

    for (let mi = 0; mi < MODELS.length; mi++) {
      let modelGone = false;
      for (let k = 0; k < total; k++) {
        const idx = (cursor + k) % total;
        try {
          const text = await callGroq(keys[idx], MODELS[mi], request);
          if (validate) validate(text); // may throw -> treated as retryable
          cursor = (idx + 1) % total;
          return text;
        } catch (err) {
          lastErr = err;
          if (err?.isValidationError) { retryableSeen = true; continue; } // bad content → next key/model
          if (isModelUnavailable(err)) { modelGone = true; break; } // → next model
          if (!isRetryable(err)) throw err; // real error (401 bad key, 400 bad req)
          retryableSeen = true;
        }
      }
      const why = (lastErr?.message || "").replace(/\s+/g, " ").slice(0, 160);
      const kind = modelGone ? "unavailable/404" : lastErr?.isValidationError ? "bad content" : "busy 429/5xx";
      console.log(`Groq: ${MODELS[mi]} failed this sweep (${kind}) — ${why}`);
      if (modelGone) continue;
    }

    if (!retryableSeen) break;
    if (loop < maxLoops - 1) await sleep(Math.min(4000, 1000 * Math.pow(2, loop)));
  }

  throw lastErr;
};

/**
 * Like generateContent but for JSON: forces JSON mode, parses the result, and
 * on unparseable JSON rejects + fails over to the next key/model.
 * @param {object} request  { messages, maxTokens?, temperature? }
 * @returns {Promise<any>} the parsed JSON
 */
export const generateJSON = async (request, opts = {}) => {
  const text = await generateContent(request, {
    ...opts,
    validate: (t) => {
      try {
        extractJSON(t);
      } catch {
        const e = new Error("AI returned unparseable JSON");
        e.isValidationError = true;
        throw e;
      }
    },
  });
  return extractJSON(text);
};
