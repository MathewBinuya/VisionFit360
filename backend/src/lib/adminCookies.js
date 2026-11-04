import crypto from "crypto";

// The admin JWT now rides in an httpOnly cookie instead of being handed to the
// dashboard's JavaScript, so it can't be read out of localStorage / DevTools or
// stolen by an XSS payload. The dashboard and the API live on different domains,
// so the cookie has to be cross-site: that REQUIRES SameSite=None + Secure.
// For local http dev set COOKIE_SECURE=false in the backend env — it drops to
// SameSite=Lax so the cookie still works over http between localhost ports
// (different ports are same-site, so Lax is sent on XHR there).
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const secure = process.env.COOKIE_SECURE !== "false";
const sameSite = secure ? "none" : "lax";

export const AUTH_COOKIE = "adminToken";

const base = { secure, sameSite, path: "/" };
const authCookieOptions = { ...base, httpOnly: true, maxAge: WEEK_MS };

// Per-session CSRF value. It is baked into the signed JWT (as a claim) AND
// returned to the dashboard in the login response body; the dashboard echoes it
// back as a header on every mutating request (double-submit). An attacker on
// another site can send the ambient cookie but cannot know this value.
export const newCsrfToken = () => crypto.randomBytes(32).toString("hex");

// Tiny cookie reader so we don't pull in cookie-parser just for one cookie.
export const readCookie = (req, name) => {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i === -1) continue;
    if (part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
};

export const setAuthCookie = (res, token) => res.cookie(AUTH_COOKIE, token, authCookieOptions);

// clearCookie must repeat the same attributes (sameSite/secure/path) or the
// browser won't match and clear a cross-site cookie.
export const clearAuthCookie = (res) => res.clearCookie(AUTH_COOKIE, { ...base, httpOnly: true });
