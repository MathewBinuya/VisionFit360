import jwt from "jsonwebtoken";
import crypto from "crypto";
import Admin from "../models/admin.model.js";
import { isAllowedAdmin } from "../lib/adminAccess.js";
import { AUTH_COOKIE, readCookie } from "../lib/adminCookies.js";

// Reads that can't change state don't need CSRF protection.
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const csrfOk = (req, expected) => {
  const got = req.headers["x-csrf-token"];
  if (!expected || !got) return false;
  const a = Buffer.from(String(got));
  const b = Buffer.from(String(expected));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const adminProtect = async (req, res, next) => {
  try {
    // Prefer the httpOnly cookie; fall back to a Bearer header so non-browser
    // clients (mobile, curl, server-to-server) still work unchanged.
    let token = readCookie(req, AUTH_COOKIE);
    const viaCookie = !!token;
    if (!token) {
      const header = req.headers.authorization;
      if (header && header.startsWith("Bearer ")) token = header.split(" ")[1];
    }
    if (!token) return res.status(401).json({ message: "No token provided" });

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // admin tokens carry role "admin"
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Admin access required" });
    }

    // Cookie auth is ambient (the browser attaches it automatically), so a
    // mutating request must also echo the per-session CSRF token that was baked
    // into this JWT. Bearer auth isn't ambient, so it's exempt.
    if (viaCookie && !SAFE_METHODS.has(req.method) && !csrfOk(req, decoded.csrf)) {
      return res.status(403).json({ message: "Invalid CSRF token" });
    }

    const admin = await Admin.findById(decoded.id).select("-password");
    if (!admin) return res.status(401).json({ message: "Admin not found" });
    if (!isAllowedAdmin(admin)) return res.status(403).json({ message: "Admin access required" });

    req.admin = admin;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid token" });
  }
};

export default adminProtect;
