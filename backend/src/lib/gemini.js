import { GoogleGenerativeAI } from "@google/generative-ai";

// gemini-2.5-flash was retired for new API projects (404 "no longer available
// to new users"), so default to the current flash model. Overridable via env so
// a future model bump needs no code change / redeploy.
const MODEL_NAME = (process.env.GEMINI_MODEL || "gemini-3.8-flash").trim();

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
  console.log(`Gemini ready (${keys.length} key${keys.length > 1 ? "s" : ""}, model ${MODEL_NAME})`);
}

// One model client per key.
const models = keys.map((key) =>
  new GoogleGenerativeAI(key).getGenerativeModel({ model: MODEL_NAME })
);

// Back-compat: anything still importing `model` gets the first key's client.
export const model = models[0];

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
// a quota 429 these clear on their own, so we retry them the same way: sweep the
// keys and back off between sweeps rather than failing the request immediately.
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

const isRetryable = (err) => isRateLimit(err) || isTransient(err);

// Round-robin start so load spreads across keys instead of always hitting #1.
let cursor = 0;

/**
 * Generate content with multi-key failover.
 * Tries a key; on a rate-limit/quota (429) error it moves to the NEXT key.
 * After sweeping every key it backs off briefly and sweeps again (up to
 * `maxLoops` times). Non-rate-limit errors throw immediately.
 * @param {object} request  passed straight to model.generateContent (e.g. { contents, generationConfig })
 * @returns {Promise<string>} the response text
 */
export const generateContent = async (request, { maxLoops = 2 } = {}) => {
  if (!models.length) {
    throw new Error("Gemini is not configured (GEMINI_API_KEY / GEMINI_API_KEYS)");
  }
  const total = models.length;
  let lastErr;

  for (let attempt = 0; attempt < total * maxLoops; attempt++) {
    const idx = (cursor + attempt) % total;
    try {
      const result = await models[idx].generateContent(request);
      cursor = (idx + 1) % total; // next call starts at the following key
      return result.response.text();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err; // real error — don't burn the other keys
      // Finished a full sweep of all keys and all were limited: wait, then retry.
      if ((attempt + 1) % total === 0) {
        const loop = Math.floor((attempt + 1) / total); // 1, 2, ...
        await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, loop - 1)));
      }
    }
  }
  throw lastErr;
};
