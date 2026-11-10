import rateLimit from "express-rate-limit";

// Per-IP throttles for the auth endpoints. Limits are generous enough for real
// users (who retry a handful of times) but stop password brute-forcing and
// email/code spamming. A tripped limiter returns 429 with { message }, which the
// app already surfaces via its normal error handling.
//
// NOTE: behind Render's proxy, `app.set("trust proxy", 1)` must be set (see
// server.js) so these key off the real client IP, not the shared proxy IP.
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const make = (limit, message) =>
  rateLimit({
    windowMs: WINDOW_MS,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message },
  });

// Password attempts — the main brute-force surface.
export const loginLimiter = make(10, "Too many login attempts. Please try again in a few minutes.");

// Endpoints that send an email (register / forgot password / resend) — kept tight
// to prevent inbox spamming. The controllers also enforce a 60s resend cooldown.
export const emailLimiter = make(6, "Too many requests. Please wait a few minutes and try again.");

// Code-entry endpoints (verify email / reset password). The controllers already
// lock a code after 5 wrong guesses; this bounds hammering across codes too.
export const codeLimiter = make(20, "Too many attempts. Please wait a few minutes and try again.");

// App-wide floor against single-source flooding, applied to every route. It is
// deliberately GENEROUS — normal use, including a busy demo with several devices
// behind one shared/campus wifi IP, stays far below it; it only trips a runaway
// client hammering the API. Per IP, per minute. Tune with GLOBAL_RATE_LIMIT.
export const globalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  limit: Number(process.env.GLOBAL_RATE_LIMIT) || 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please slow down and try again shortly." },
});

// AI endpoints call a paid LLM, so abuse costs real money, not just load. They get
// a tighter cap keyed by the authenticated USER id (not IP) — so people sharing one
// network don't throttle each other, and one account can't spam expensive calls.
// Mounted AFTER the auth middleware (which sets req.user.id). Per user, per 5 min.
// Tune with AI_RATE_LIMIT.
export const aiLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  limit: Number(process.env.AI_RATE_LIMIT) || 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => String(req.user?.id || "anonymous"),
  message: { message: "You're sending AI requests too quickly. Please wait a moment and try again." },
});
