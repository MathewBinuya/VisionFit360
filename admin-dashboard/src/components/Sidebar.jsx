import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { NavLink, useNavigate } from "react-router-dom";
import api from "../lib/api";

export default function Sidebar() {
  const navigate = useNavigate();
  const adminName = localStorage.getItem("adminName") || "Admin";
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const onKey = (e) => { if (e.key === "Escape") setConfirming(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [confirming]);

  const logout = async () => {
    // Ask the server to clear the httpOnly cookie; ignore failures so logout
    // always proceeds locally.
    try { await api.post("/logout"); } catch { /* clear locally regardless */ }
    localStorage.removeItem("adminCsrf");
    localStorage.removeItem("adminName");
    navigate("/login");
  };

  return (
    <div className="sidebar">
      <div className="brand">VisionFIT360</div>
      <NavLink to="/dashboard" className={({ isActive }) => isActive ? "active" : ""}>Dashboard</NavLink>
      <NavLink to="/users" className={({ isActive }) => isActive ? "active" : ""}>Users</NavLink>
      <NavLink to="/users-per-exercise" className={({ isActive }) => isActive ? "active" : ""}>Users per Exercise</NavLink>
      <NavLink to="/feedback" className={({ isActive }) => isActive ? "active" : ""}>Feedback</NavLink>
      <NavLink to="/analytics" className={({ isActive }) => isActive ? "active" : ""}>Analytics</NavLink>
      <NavLink to="/security" className={({ isActive }) => isActive ? "active" : ""}>Security</NavLink>
      <button className="logout" onClick={() => setConfirming(true)}>Log out ({adminName})</button>

      {/* portal: the sticky sidebar is its own stacking context, so the dialog
          must render at <body> level to sit above the page content */}
      {confirming && createPortal(
        <div className="dialog-backdrop" onClick={() => setConfirming(false)}>
          <div
            className="dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="logout-title"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 id="logout-title" className="dialog-title">Log out?</h2>
            <p className="dialog-text">You'll need your password and a verification code to sign back in.</p>
            <div className="dialog-actions">
              <button className="btn-ghost" onClick={() => setConfirming(false)} autoFocus>Cancel</button>
              <button className="btn-small" onClick={logout}>Log out</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
