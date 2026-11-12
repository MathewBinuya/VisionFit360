import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../lib/api";

// Two-step sign-in: password, then a 6-digit code. With an authenticator set up
// (Security page), the admin chooses: authenticator app or email code — or a
// one-time backup code. Without one, the email code is sent straight away.
const METHOD_COPY = {
  email: { label: "Email code", hint: (to) => `Enter the 6-digit code sent to ${to}` },
  app: { label: "Authenticator code", hint: () => "Enter the 6-digit code from your authenticator app" },
  backup: { label: "Backup code", hint: () => "Enter one of your saved backup codes (e.g. abcd-1234)" },
};

export default function Login() {
  const [step, setStep] = useState("password"); // password | choose | code
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [challenge, setChallenge] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [methods, setMethods] = useState({ email: true, app: false, backup: false });
  const [canChoose, setCanChoose] = useState(false);
  const [method, setMethod] = useState("email");
  const [resendIn, setResendIn] = useState(0);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  // Already signed in (returning to /login via the URL bar, a bookmark, or the
  // back button)? Skip the form and go straight into the app. If the hint is
  // stale, the first API call 401s and the interceptor sends us back here.
  useEffect(() => {
    if (localStorage.getItem("adminCsrf")) navigate("/dashboard", { replace: true });
  }, [navigate]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const clearMessages = () => { setError(""); setInfo(""); };

  const openCode = (m) => {
    setMethod(m);
    setCode("");
    setStep("code");
  };

  const backToPassword = (message = "") => {
    setStep("password");
    setChallenge("");
    setCode("");
    setInfo("");
    setError(message);
  };

  const failed = (err, fallback) => {
    const data = err.response?.data || {};
    if (data.restart) return backToPassword(data.message);
    if (data.resendInSeconds) setResendIn(data.resendInSeconds);
    setError(data.message || fallback);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const { data } = await api.post("/login", { email, password });
      setChallenge(data.challenge);
      setSentTo(data.email);
      setMethods(data.methods || { email: true });
      setCanChoose(!!data.choose);
      if (data.choose) {
        setStep("choose");
      } else {
        setResendIn(data.resendInSeconds ?? 60);
        openCode("email");
      }
    } catch (err) {
      setError(err.response?.data?.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // Choosing email sends the code now (or reuses one sent in the last minute).
  const chooseEmail = async () => {
    clearMessages();
    setLoading(true);
    try {
      const { data } = await api.post("/login/resend", { challenge, first: true });
      setResendIn(data.resendInSeconds ?? 60);
      openCode("email");
    } catch (err) {
      failed(err, "Couldn't send the email code");
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    clearMessages();
    try {
      const { data } = await api.post("/login/resend", { challenge });
      setResendIn(data.resendInSeconds ?? 60);
      setInfo("A new code was sent.");
    } catch (err) {
      failed(err, "Couldn't resend the code");
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      const res = await api.post("/login/verify", { challenge, code, method });
      // The auth token is now an httpOnly cookie set by the server — never stored
      // in JS. We keep only the CSRF value (to echo back) and the name (display).
      localStorage.setItem("adminCsrf", res.data.csrf);
      localStorage.setItem("adminName", res.data.admin.name);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      failed(err, "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  if (step === "choose") {
    return (
      <div className="login-wrap">
        <div className="login-card">
          <h1>VisionFIT360</h1>
          <p className="subtitle">How do you want to verify it's you?</p>

          {error && <div className="error">{error}</div>}

          <button type="button" className="choice-btn" onClick={() => { clearMessages(); openCode("app"); }} disabled={loading}>
            <span className="choice-title">Authenticator app</span>
            <span className="choice-sub">Use the 6-digit code from your app</span>
          </button>
          <button type="button" className="choice-btn" onClick={chooseEmail} disabled={loading}>
            <span className="choice-title">{loading ? "Sending code..." : "Email code"}</span>
            <span className="choice-sub">Send a code to {sentTo}</span>
          </button>

          <div className="login-links">
            <button type="button" className="link-btn" onClick={() => backToPassword()}>
              ← Back
            </button>
            {methods.backup && (
              <button type="button" className="link-btn" onClick={() => { clearMessages(); openCode("backup"); }}>
                Use a backup code
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (step === "code") {
    const isBackup = method === "backup";
    const ready = isBackup ? code.replace(/[^a-z0-9]/gi, "").length === 8 : code.length === 6;

    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={handleVerify}>
          <h1>VisionFIT360</h1>
          <p className="subtitle">{METHOD_COPY[method].hint(sentTo)}</p>

          {error && <div className="error">{error}</div>}
          {info && <div className="notice">{info}</div>}

          <label>{METHOD_COPY[method].label}</label>
          <input
            className="otp-input"
            type="text"
            inputMode={isBackup ? "text" : "numeric"}
            autoComplete="one-time-code"
            maxLength={isBackup ? 9 : 6}
            value={code}
            onChange={(e) =>
              setCode(isBackup ? e.target.value.toLowerCase().slice(0, 9) : e.target.value.replace(/\D/g, "").slice(0, 6))
            }
            placeholder={isBackup ? "abcd-1234" : "••••••"}
            autoFocus
            required
          />

          <button type="submit" disabled={loading || !ready}>
            {loading ? "Verifying..." : "Verify & Sign In"}
          </button>

          <div className="login-links">
            <button type="button" className="link-btn" onClick={() => backToPassword()}>
              ← Back
            </button>
            {method === "email" && (
              <button type="button" className="link-btn" onClick={handleResend} disabled={resendIn > 0}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
              </button>
            )}
          </div>

          {canChoose && (
            <button type="button" className="link-btn login-switch" onClick={() => { clearMessages(); setCode(""); setStep("choose"); }}>
              Try another way
            </button>
          )}

          {method === "email" && <p className="login-hint">Code expires in 10 minutes. Check Spam if it doesn't arrive.</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={handleLogin}>
        <h1>VisionFIT360</h1>
        <p className="subtitle">Admin Dashboard</p>

        {error && <div className="error">{error}</div>}

        <label>Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Admin User"
          required
        />

        <label>Password</label>
        <div className="password-field">
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            className="password-toggle"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            tabIndex={-1}
          >
            {showPassword ? (
              // password visible -> open eye (matches the mobile app's convention)
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              // password hidden -> slashed eye-off
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            )}
          </button>
        </div>

        <button type="submit" disabled={loading}>
          {loading ? "Sending code..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
