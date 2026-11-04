import axios from "axios";

// Same-origin path — Vercel (prod) and Vite (dev) both proxy /api to the Render
// backend. Talking to our own origin keeps the httpOnly auth cookie first-party,
// so Brave/Safari third-party-cookie blocking can't break admin login.
// withCredentials so the browser sends/stores that cookie.
const api = axios.create({
  baseURL: "/api/admin",
  withCredentials: true,
});

// Double-submit CSRF: the auth token itself lives in an httpOnly cookie we can't
// read, so the server also gives us a per-session CSRF value (stored at login).
// We echo it on every request; the server matches it to the token's claim.
api.interceptors.request.use((config) => {
  const csrf = localStorage.getItem("adminCsrf");
  if (csrf) config.headers["X-CSRF-Token"] = csrf;
  return config;
});

// if the session is gone/expired, drop local hints and kick back to login
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("adminCsrf");
      localStorage.removeItem("adminName");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;
