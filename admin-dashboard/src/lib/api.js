import axios from "axios";

// your backend URL — same backend the mobile app uses
// withCredentials so the browser sends/stores the httpOnly admin auth cookie.
const api = axios.create({
  baseURL: "https://visionfit-backend-cwxi.onrender.com/api/admin",
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
