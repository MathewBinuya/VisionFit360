import jwt from "jsonwebtoken";
import crypto from "crypto";
import Admin from "../models/admin.model.js";
import { sendEmail } from "../lib/email.js";
import { ADMIN_EMAIL, isAllowedAdmin } from "../lib/adminAccess.js";
import { EXERCISE_CATALOG, canonicalExerciseName } from "../lib/exerciseCatalog.js";
import {
  generateTotpSecret, verifyTotp, otpauthUrl, encryptSecret, decryptSecret,
  generateBackupCodes, hashBackupCode,
} from "../lib/totp.js";
import User from "../models/user.model.js";
import Workout from "../models/workout.model.js";
import Exercise from "../models/exercise.model.js";
import Feedback from "../models/feedback.model.js";
import LoginEvent from "../models/loginEvent.model.js";
import {
  ACTIVE_WINDOW_MS,
  RECENTLY_ACTIVE_WINDOW_MS,
  ACCOUNT_ACTIVE_DAYS,
  presenceStatus,
} from "../lib/presence.js";
import { setAuthCookie, clearAuthCookie, newCsrfToken } from "../lib/adminCookies.js";
import { getSetting, setMaintenance } from "../lib/maintenance.js";

// The CSRF value is embedded in the token so it can be checked statelessly: the
// dashboard sends it back as a header and the middleware matches it to this claim.
const generateAdminToken = (id, csrf) =>
  jwt.sign({ id, role: "admin", csrf }, process.env.JWT_SECRET, { expiresIn: "7d" });

// Explicit allow-list of user fields safe to expose to admins.
// (Never leak password, currentToken, reset/verification codes, etc.)
// dateOfBirth is shown in the admin (user detail + age demographics); age itself
// is derived from it on the client, never stored.
const SAFE_USER_FIELDS =
  "name username email photo bio firstName lastName middleName gender dateOfBirth goal heightCm weightKg status onBoardingComplete isVerified createdAt updatedAt lastLoginAt lastActiveAt";

const DAY_MS = 24 * 60 * 60 * 1000;

// A "session" is a workout the user actually finished — planned workouts still
// sitting in the tracker are not counted. It's dated by when it was completed.
const TZ = "Asia/Manila";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const SESSION_MATCH = { completed: true };
const SESSION_DATE = { $ifNull: ["$completedAt", "$date"] };

// Start of the Manila calendar day `daysAgo` days before today.
const manilaDayStart = (now, daysAgo) => {
  const day = Math.floor((now.getTime() + MANILA_OFFSET_MS) / DAY_MS) - daysAgo;
  return new Date(day * DAY_MS - MANILA_OFFSET_MS);
};
const manilaDate = (t) => new Date(t + MANILA_OFFSET_MS).toISOString().slice(0, 10);

// One point per day (oldest -> today), so quiet days show as 0 instead of being skipped.
const fillDays = (rows, start, now) => {
  const counts = new Map(rows.map((r) => [r._id, r.count]));
  const out = [];
  for (let t = start.getTime(); t <= now.getTime(); t += DAY_MS) {
    const date = manilaDate(t);
    out.push({ date, count: counts.get(date) || 0 });
  }
  return out;
};

// --- Pagination helpers (shared by every paginated admin list) ---
// Validate on the server so a crafted ?limit=999999 can't dump the whole table.
const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;
const parsePaging = (req, { defaultLimit = DEFAULT_PAGE_LIMIT } = {}) => {
  const page = Math.max(1, Math.floor(Number(req.query.page)) || 1);
  const limit = Math.min(MAX_PAGE_LIMIT, Math.max(1, Math.floor(Number(req.query.limit)) || defaultLimit));
  return { page, limit };
};
const pageMeta = (data, total, page, limit) => {
  const totalPages = Math.max(1, Math.ceil(total / limit));
  return {
    data,
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
};

// Same exercise under different spellings (RepVision saves "bicepcurl", the
// tracker "Bicep Curls") is merged via the catalog; other names group by their
// letters/digits only ("Push-Ups" = "push ups"). Catalog exercises report the AR
// key, which the dashboard already labels.
const exerciseGroup = (name) => {
  const canonical = canonicalExerciseName(name);
  const entry = canonical && EXERCISE_CATALOG.find((e) => e.name === canonical);
  return entry ? entry.key : String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");
};

// Junk exercise names (test/garbage input) that should never surface on the
// dashboard. Matched against the grouped key (lowercased, alphanumerics only).
//  - keyboard mashes of s/b/h: "sbsh", "shsh", "shshsh", "sbshh", …
//  - purely numeric names: "1000000", "123", … (never a real exercise)
const HIDDEN_EXERCISE_GROUPS = [/^[sbh]{3,}$/, /^\d+$/];
const isHiddenExercise = (key) => HIDDEN_EXERCISE_GROUPS.some((re) => re.test(key));

// Distinct users + completed sessions per exercise. Shared by the dashboard
// summary and the "Users per Exercise" page.
// Records left behind by deleted accounts are ignored everywhere on the dashboard.
const ownedBy = (userIds) => ({ user: { $in: userIds } });

const loadExerciseUsage = async (limit = 50, userIds) => {
  const rows = await Workout.aggregate([
    { $match: { ...SESSION_MATCH, ...ownedBy(userIds) } },
    { $unwind: "$exercises" },
    { $match: { "exercises.name": { $nin: [null, ""] } } },
    {
      $group: {
        _id: { $toLower: { $trim: { input: "$exercises.name" } } },
        users: { $addToSet: "$user" },
        sessions: { $sum: 1 },
      },
    },
  ]);

  const merged = new Map();
  for (const r of rows) {
    const key = exerciseGroup(r._id);
    if (!key || isHiddenExercise(key)) continue;
    const isCatalog = EXERCISE_CATALOG.some((e) => e.key === key);
    const g = merged.get(key) || { exercise: isCatalog ? key : r._id, users: new Set(), sessions: 0, top: 0 };
    r.users.forEach((u) => g.users.add(String(u)));
    g.sessions += r.sessions;
    if (!isCatalog && r.sessions > g.top) { g.exercise = r._id; g.top = r.sessions; } // most-used spelling
    merged.set(key, g);
  }

  return [...merged.values()]
    .map((g) => ({ exercise: g.exercise, userCount: g.users.size, sessions: g.sessions }))
    .sort((a, b) => b.userCount - a.userCount || b.sessions - a.sessions)
    .slice(0, limit);
};

//  AUTH 
// Two-step login: password, then ONE of — the 6-digit code emailed to
// ADMIN_EMAIL, an authenticator-app code, or a one-time backup code.
// Login responses never use 401 — the dashboard's API client treats 401 as
// "session expired" and reloads to /login, which would interrupt this flow.
const OTP_TTL_MS = 10 * 60 * 1000;
const OTP_RESEND_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;
const OTP_SELECT = "+otpHash +otpExpiresAt +otpAttempts +otpSentAt +otpChallengeId +totpSecretEnc +totpLastStep +backupCodes";
const TOTP_ISSUER = "VisionFIT360 Admin";

const hashOtp = (code) => crypto.createHash("sha256").update(String(code).trim()).digest("hex");

const otpMatches = (code, hash) => {
  if (!hash) return false;
  const a = Buffer.from(hashOtp(code), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

// Short-lived pass between step 1 and step 2. Its role is NOT "admin", so
// adminProtect rejects it for every dashboard route. `cid` ties it to the one
// pending sign-in stored on the admin, so it can't be reused after it finishes.
const otpChallenge = (id, cid) =>
  jwt.sign({ id, cid, role: "admin-otp" }, process.env.JWT_SECRET, { expiresIn: Math.floor(OTP_TTL_MS / 1000) });

const readChallenge = (token) => {
  try {
    const d = jwt.verify(String(token || ""), process.env.JWT_SECRET);
    return d.role === "admin-otp" && d.cid ? { id: d.id, cid: d.cid } : null;
  } catch {
    return null;
  }
};

const loadPendingAdmin = async (challenge) => {
  const c = readChallenge(challenge);
  if (!c) return null;
  const admin = await Admin.findById(c.id).select(OTP_SELECT);
  return isAllowedAdmin(admin) && admin.otpChallengeId && admin.otpChallengeId === c.cid ? admin : null;
};

const maskEmail = (email) => {
  const [name, domain] = email.split("@");
  return `${name.slice(0, 2)}${"•".repeat(Math.max(3, name.length - 2))}@${domain}`;
};

const otpEmailHtml = (code) => `
  <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f7f7f7; border-radius: 12px;">
    <h2 style="color: #111111; margin-bottom: 8px;">Admin sign-in code</h2>
    <p style="color: #555; margin-bottom: 24px;">Someone signed in to the VisionFIT360 admin dashboard with the correct password. Enter this code to finish signing in.</p>
    <div style="background: #ffffff; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
      <p style="color: #888; font-size: 13px; margin-bottom: 8px;">YOUR LOGIN CODE</p>
      <p style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #111111; margin: 0;">${code}</p>
    </div>
    <p style="color: #888; font-size: 13px; text-align: center;">This code expires in <strong>10 minutes</strong>.</p>
    <p style="color: #bbb; font-size: 12px; text-align: center; margin-top: 24px;">If this wasn't you, change the admin password right away.</p>
  </div>
`;

// Issues + emails a fresh code (caller saves). Returns false if sending failed.
const sendAdminOtp = async (admin) => {
  const code = crypto.randomInt(100000, 1000000).toString();
  admin.otpHash = hashOtp(code);
  admin.otpExpiresAt = new Date(Date.now() + OTP_TTL_MS);
  admin.otpSentAt = new Date();
  try {
    await sendEmail({ to: ADMIN_EMAIL, subject: "VisionFIT360 — Admin login code", html: otpEmailHtml(code) });
    return true;
  } catch (err) {
    console.log("Admin OTP email failed:", err.message);
    admin.otpHash = undefined;
    admin.otpExpiresAt = undefined;
    admin.otpSentAt = undefined;
    return false;
  }
};

const otpStepResponse = (admin, emailSent) => ({
  otpRequired: true,
  challenge: otpChallenge(admin._id, admin.otpChallengeId),
  email: maskEmail(ADMIN_EMAIL),
  methods: {
    email: !!emailSent,
    app: !!admin.totpEnabled,
    backup: !!admin.totpEnabled && (admin.backupCodes?.length || 0) > 0,
  },
  expiresInSeconds: Math.round(OTP_TTL_MS / 1000),
  resendInSeconds: admin.otpSentAt
    ? Math.max(0, Math.ceil((admin.otpSentAt.getTime() + OTP_RESEND_MS - Date.now()) / 1000))
    : 0,
});

// STEP 1 — email + password. Only ADMIN_EMAIL may sign in.
export const adminLogin = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const { password } = req.body;
    if (email !== ADMIN_EMAIL) return res.status(400).json({ message: "Invalid credentials" });

    const admin = await Admin.findOne({ email }).select(OTP_SELECT);
    if (!admin) return res.status(400).json({ message: "Invalid credentials" });

    const match = await admin.comparePassword(String(password || ""));
    if (!match) return res.status(400).json({ message: "Invalid credentials" });

    admin.otpChallengeId = crypto.randomBytes(16).toString("hex");
    admin.otpAttempts = 0;

    // With an authenticator set up, the admin picks the method on the next
    // screen — no email is sent unless they choose it (POST /login/resend).
    if (admin.totpEnabled) {
      await admin.save();
      return res.json({ ...otpStepResponse(admin, false), choose: true });
    }

    // Email only: a still-valid code sent under a minute ago is reused instead of emailing again.
    const recent = admin.otpHash && admin.otpExpiresAt > new Date() && Date.now() - admin.otpSentAt < OTP_RESEND_MS;
    const emailSent = recent || (await sendAdminOtp(admin));

    // Without an authenticator, email is the only way in.
    if (!emailSent && !admin.totpEnabled) {
      admin.otpChallengeId = undefined;
      await admin.save();
      return res.status(502).json({ message: "Couldn't send the login code. Please try again." });
    }
    await admin.save();
    res.json(otpStepResponse(admin, emailSent));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// STEP 2 — finish with an email code (default), authenticator code, or backup code.
export const verifyAdminOtp = async (req, res) => {
  try {
    const admin = await loadPendingAdmin(req.body.challenge);
    if (!admin) return res.status(400).json({ message: "Your sign-in expired. Please sign in again.", restart: true });

    const method = ["email", "app", "backup"].includes(req.body.method) ? req.body.method : "email";
    const code = String(req.body.code || "").trim();
    let ok = false;

    if (method === "email") {
      if (!admin.otpHash) return res.status(400).json({ message: "No email code is active. Tap Resend code." });
      if (admin.otpExpiresAt < new Date()) {
        return res.status(400).json({ message: "This code has expired. Tap Resend code.", expired: true });
      }
      ok = otpMatches(code, admin.otpHash);
    } else if (method === "app") {
      const secret = admin.totpEnabled && decryptSecret(admin.totpSecretEnc);
      const step = secret ? verifyTotp(secret, code) : null;
      ok = step != null && step > (admin.totpLastStep || 0);
      if (ok) admin.totpLastStep = step;
    } else {
      const h = hashBackupCode(code);
      const idx = admin.totpEnabled ? (admin.backupCodes || []).indexOf(h) : -1;
      ok = idx >= 0;
      if (ok) admin.backupCodes.splice(idx, 1);
    }

    if (!ok) {
      admin.otpAttempts = (admin.otpAttempts || 0) + 1;
      if (admin.otpAttempts >= OTP_MAX_ATTEMPTS) {
        admin.otpHash = undefined;
        admin.otpExpiresAt = undefined;
        admin.otpChallengeId = undefined;
        await admin.save();
        return res.status(400).json({ message: "Too many wrong codes. Please sign in again.", restart: true });
      }
      await admin.save();
      const left = OTP_MAX_ATTEMPTS - admin.otpAttempts;
      return res.status(400).json({ message: `Incorrect code. ${left} attempt${left === 1 ? "" : "s"} left.` });
    }

    admin.otpHash = undefined;
    admin.otpExpiresAt = undefined;
    admin.otpChallengeId = undefined;
    admin.otpAttempts = 0;
    await admin.save();

    // The JWT goes into an httpOnly cookie (never to JS); only the CSRF token is
    // returned for the dashboard to echo back on mutating requests.
    const csrf = newCsrfToken();
    setAuthCookie(res, generateAdminToken(admin._id, csrf));
    res.json({
      csrf,
      admin: { id: admin._id, username: admin.username, email: admin.email, name: admin.name },
      backupCodesLeft: admin.totpEnabled ? admin.backupCodes.length : null,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Clears the auth cookie server-side (the dashboard also drops its local hints).
export const adminLogout = async (req, res) => {
  clearAuthCookie(res);
  res.json({ message: "Logged out" });
};

// Sends the email code — when the admin chooses email (`first: true`) or taps
// Resend (once per minute) — without re-entering the password.
export const resendAdminOtp = async (req, res) => {
  try {
    const admin = await loadPendingAdmin(req.body.challenge);
    if (!admin) return res.status(400).json({ message: "Your sign-in expired. Please sign in again.", restart: true });

    const wait = admin.otpSentAt ? admin.otpSentAt.getTime() + OTP_RESEND_MS - Date.now() : 0;
    // Choosing email again within a minute reuses the code that's already on its way.
    if (req.body.first && wait > 0 && admin.otpHash && admin.otpExpiresAt > new Date()) {
      return res.json(otpStepResponse(admin, true));
    }
    if (wait > 0) {
      return res.status(429).json({ message: `Please wait ${Math.ceil(wait / 1000)}s before resending.`, resendInSeconds: Math.ceil(wait / 1000) });
    }
    const sent = await sendAdminOtp(admin);
    await admin.save();
    if (!sent) {
      return res.status(502).json({
        message: admin.totpEnabled
          ? "Couldn't send the email code. Use your authenticator app instead."
          : "Couldn't send the login code. Please try again.",
      });
    }
    res.json(otpStepResponse(admin, true));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

//  SECURITY — authenticator app (only reachable when already signed in)
const TOTP_SELECT = "+password +totpSecretEnc +totpPendingEnc +totpLastStep +backupCodes";

const newBackupCodes = (admin) => {
  const codes = generateBackupCodes(8);
  admin.backupCodes = codes.map(hashBackupCode);
  return codes;
};

export const getTwoFactorStatus = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select(TOTP_SELECT);
    res.json({ enabled: !!admin.totpEnabled, backupCodesLeft: admin.totpEnabled ? admin.backupCodes?.length || 0 : 0, account: ADMIN_EMAIL });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Starts setup: a new secret is kept as "pending" until a first code confirms it.
export const startTwoFactorSetup = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select(TOTP_SELECT);
    if (admin.totpEnabled) return res.status(400).json({ message: "The authenticator is already set up. Turn it off first to set up a new one." });
    const secret = generateTotpSecret();
    admin.totpPendingEnc = encryptSecret(secret);
    await admin.save();
    res.json({ secret, otpauthUrl: otpauthUrl({ secret, account: ADMIN_EMAIL, issuer: TOTP_ISSUER }) });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const confirmTwoFactorSetup = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select(TOTP_SELECT);
    const secret = admin.totpPendingEnc && decryptSecret(admin.totpPendingEnc);
    if (!secret) return res.status(400).json({ message: "Start the setup again." });
    const step = verifyTotp(secret, req.body.code);
    if (step == null) return res.status(400).json({ message: "That code didn't match. Check your phone's time is automatic and try the newest code." });

    admin.totpSecretEnc = admin.totpPendingEnc;
    admin.totpPendingEnc = undefined;
    admin.totpEnabled = true;
    admin.totpLastStep = step;
    const backupCodes = newBackupCodes(admin);
    await admin.save();
    res.json({ enabled: true, backupCodes });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const regenerateBackupCodes = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select(TOTP_SELECT);
    if (!admin.totpEnabled) return res.status(400).json({ message: "Set up the authenticator first." });
    const step = verifyTotp(decryptSecret(admin.totpSecretEnc), req.body.code);
    if (step == null || step <= (admin.totpLastStep || 0)) return res.status(400).json({ message: "Enter a current code from your authenticator app." });
    admin.totpLastStep = step;
    const backupCodes = newBackupCodes(admin);
    await admin.save();
    res.json({ backupCodes });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Turning it off needs the password AND an authenticator or backup code.
export const disableTwoFactor = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin._id).select(TOTP_SELECT);
    if (!admin.totpEnabled) return res.json({ enabled: false });
    if (!(await admin.comparePassword(String(req.body.password || "")))) {
      return res.status(400).json({ message: "Incorrect password." });
    }
    const code = String(req.body.code || "").trim();
    const step = verifyTotp(decryptSecret(admin.totpSecretEnc), code);
    const backupOk = (admin.backupCodes || []).includes(hashBackupCode(code));
    if (!(step != null && step > (admin.totpLastStep || 0)) && !backupOk) {
      return res.status(400).json({ message: "Enter a current authenticator code or a backup code." });
    }
    admin.totpEnabled = false;
    admin.totpSecretEnc = undefined;
    admin.totpPendingEnc = undefined;
    admin.totpLastStep = undefined;
    admin.backupCodes = [];
    await admin.save();
    res.json({ enabled: false });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

//  MAINTENANCE MODE
// Current switch state, for the admin Security page.
export const getMaintenance = async (req, res) => {
  try {
    const s = await getSetting();
    res.json({
      maintenance: !!s?.maintenanceMode,
      message: s?.maintenanceMessage || "",
      startedAt: s?.maintenanceStartedAt || null,
      updatedBy: s?.maintenanceUpdatedBy || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

// Flip the switch. On = the user-facing API is sealed off (503) for everyone
// until this is turned back off from here.
export const updateMaintenance = async (req, res) => {
  try {
    const s = await setMaintenance({
      enabled: !!req.body.enabled,
      message: req.body.message,
      updatedBy: req.admin?.email || ADMIN_EMAIL,
    });
    res.json({
      maintenance: !!s.maintenanceMode,
      message: s.maintenanceMessage || "",
      startedAt: s.maintenanceStartedAt || null,
      updatedBy: s.maintenanceUpdatedBy || null,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};


//  ANALYTICS
export const getStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalWorkouts = await Workout.countDocuments();
    const completedWorkouts = await Workout.countDocuments({ completed: true });

    // active users = users with a workout in the last 7 days
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUserIds = await Workout.distinct("user", { createdAt: { $gte: weekAgo } });

    res.json({
      totalUsers,
      totalWorkouts,
      completedWorkouts,
      activeUsers: activeUserIds.length,
    });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

//  USER MANAGEMENT
// Server-side pagination so the admin never has to download the whole table.
// Search (name/username/email), sort and the Active/Inactive filter are all
// resolved in a single aggregation; "last seen" is max(lastActiveAt, lastLoginAt)
// — the same rule the UI uses — computed in-pipeline so it can also be sorted on.
// A–Z/Z–A sort on "sortName": the lower-cased effective display name (the user's
// name, falling back to username when name is blank) — the exact string the table
// shows. Sorting the raw `name` field instead ordered by a value the UI doesn't
// display (blank names floated to the top) and was case-sensitive (ASCII order put
// "Zoe" before "alice"); `sortName` makes the order match what's on screen.
const USER_SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  name_az: { sortName: 1 },
  name_za: { sortName: -1 },
  recent_active: { seen: -1 },
  least_active: { seen: 1 },
};
const ACCOUNT_ACTIVE_MS = ACCOUNT_ACTIVE_DAYS * DAY_MS;

export const getUsers = async (req, res) => {
  try {
    const { page, limit } = parsePaging(req);
    const search = String(req.query.search || "").trim();
    const sort = USER_SORTS[req.query.sort] || USER_SORTS.newest;
    const status = ["active", "inactive"].includes(req.query.status) ? req.query.status : null;
    const activeThreshold = new Date(Date.now() - ACCOUNT_ACTIVE_MS);

    const pipeline = [];
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      pipeline.push({ $match: { $or: [{ name: re }, { username: re }, { email: re }] } });
    }
    // effective "last seen" instant (null when never seen), plus the lower-cased
    // display name the A–Z sort orders on (name, else username — mirrors the UI).
    pipeline.push({
      $addFields: {
        seen: { $max: ["$lastActiveAt", "$lastLoginAt"] },
        sortName: {
          $toLower: {
            $trim: {
              input: {
                $cond: [
                  { $gt: [{ $strLenCP: { $ifNull: ["$name", ""] } }, 0] },
                  "$name",
                  { $ifNull: ["$username", ""] },
                ],
              },
            },
          },
        },
      },
    });
    if (status === "active") {
      pipeline.push({ $match: { seen: { $gte: activeThreshold } } });
    } else if (status === "inactive") {
      pipeline.push({ $match: { $or: [{ seen: null }, { seen: { $lt: activeThreshold } }] } });
    }
    pipeline.push({
      $facet: {
        data: [
          { $sort: sort },
          { $skip: (page - 1) * limit },
          { $limit: limit },
          {
            $project: {
              name: 1, username: 1, email: 1, photo: 1, gender: 1, dateOfBirth: 1, goal: 1,
              status: 1, isVerified: 1, createdAt: 1, lastLoginAt: 1, lastActiveAt: 1,
            },
          },
        ],
        total: [{ $count: "count" }],
      },
    });

    const result = await User.aggregate(pipeline);
    const data = result[0]?.data || [];
    const total = result[0]?.total?.[0]?.count || 0;
    res.json(pageMeta(data, total, page, limit));
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(SAFE_USER_FIELDS);
    if (!user) return res.status(404).json({ message: "User not found" });
    const [workouts, feedback] = await Promise.all([
      Workout.find({ user: user._id }).sort({ createdAt: -1 }),
      Feedback.find({ user: user._id }).sort({ createdAt: -1 }),
    ]);
    res.json({ user, workouts, feedback });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: "User not found" });
    // remove everything tied to the account so it doesn't linger in the dashboard
    await Promise.all([
      Workout.deleteMany({ user: req.params.id }),
      Feedback.deleteMany({ user: req.params.id }),
      LoginEvent.deleteMany({ user: req.params.id }),
    ]);
    res.json({ message: "User deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

//  EXERCISE / CONTENT MANAGEMENT 
export const getExercises = async (req, res) => {
  try {
    const exercises = await Exercise.find().sort({ createdAt: 1 });
    res.json(exercises);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

export const createExercise = async (req, res) => {
  try {
    const exercise = await Exercise.create(req.body);
    res.status(201).json(exercise);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const updateExercise = async (req, res) => {
  try {
    const exercise = await Exercise.findByIdAndUpdate(req.params.id, req.body, { returnDocument: "after" });
    if (!exercise) return res.status(404).json({ message: "Exercise not found" });
    res.json(exercise);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteExercise = async (req, res) => {
  try {
    await Exercise.findByIdAndDelete(req.params.id);
    res.json({ message: "Exercise deleted" });
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

//  DASHBOARD (aggregated, admin-only)
//  Heavy aggregations for the full dashboard. Trends respect ?range=7|30 (days).
export const getDashboard = async (req, res) => {
  try {
    const range = [7, 30].includes(Number(req.query.range)) ? Number(req.query.range) : 7;
    const now = new Date();
    // "Last N days" = today plus the previous N-1 calendar days in Manila, so the
    // KPI numbers and the daily charts cover exactly the same days.
    const rangeStart = manilaDayStart(now, range - 1);
    const liveUsers = await User.distinct("_id");
    const owned = ownedBy(liveUsers);
    const sessionsSince = (start) => ({
      ...SESSION_MATCH,
      ...owned,
      $or: [{ completedAt: { $gte: start } }, { completedAt: null, date: { $gte: start } }],
    });
    const recentlyActiveThreshold = new Date(now.getTime() - RECENTLY_ACTIVE_WINDOW_MS);
    const accountActiveThreshold = new Date(now.getTime() - ACCOUNT_ACTIVE_DAYS * DAY_MS);

    // Exact whole-year age from dateOfBirth (Manila calendar), computed in-pipeline:
    // year difference minus 1 if this year's birthday hasn't happened yet.
    const AGE_EXPR = {
      $let: {
        vars: {
          y: { $subtract: [{ $year: { date: now, timezone: TZ } }, { $year: { date: "$dateOfBirth", timezone: TZ } }] },
          hadBirthday: {
            $or: [
              { $gt: [{ $month: { date: now, timezone: TZ } }, { $month: { date: "$dateOfBirth", timezone: TZ } }] },
              {
                $and: [
                  { $eq: [{ $month: { date: now, timezone: TZ } }, { $month: { date: "$dateOfBirth", timezone: TZ } }] },
                  { $gte: [{ $dayOfMonth: { date: now, timezone: TZ } }, { $dayOfMonth: { date: "$dateOfBirth", timezone: TZ } }] },
                ],
              },
            ],
          },
        },
        in: { $subtract: ["$$y", { $cond: ["$$hadBirthday", 0, 1] }] },
      },
    };

    const [
      totalUsers,
      newUsers,
      activeUsers,
      activeAccounts,
      totalSessions,
      sessionsInRange,
      demographics,
      exerciseUsage,
      repQualityAgg,
      workoutTrend,
      newUserTrend,
      feedbackFacet,
      recentFeedback,
      recentLogins,
      recentUsers,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: rangeStart } }),
      User.countDocuments({ lastActiveAt: { $gte: recentlyActiveThreshold } }),
      // Account Active = used OR logged into the app within ACCOUNT_ACTIVE_DAYS.
      // Keyed off lastActiveAt (heartbeat) so persistent sessions still count as
      // active; falls back to lastLoginAt for any legacy row missing lastActiveAt.
      User.countDocuments({
        $or: [
          { lastActiveAt: { $gte: accountActiveThreshold } },
          { lastLoginAt: { $gte: accountActiveThreshold } },
        ],
      }),
      Workout.countDocuments({ ...SESSION_MATCH, ...owned }),
      Workout.countDocuments(sessionsSince(rangeStart)),

      // --- demographics: one pass over users, several facets ---
      User.aggregate([
        {
          $facet: {
            gender: [
              { $group: { _id: { $ifNull: ["$gender", "Not specified"] }, count: { $sum: 1 } } },
            ],
            // age bands — only users with a date of birth on file are counted
            age: [
              { $match: { dateOfBirth: { $ne: null } } },
              { $addFields: { _age: AGE_EXPR } },
              {
                $addFields: {
                  ageBand: {
                    $switch: {
                      branches: [
                        { case: { $lt: ["$_age", 13] }, then: "Under 13" },
                        { case: { $lt: ["$_age", 18] }, then: "13–17" },
                        { case: { $lt: ["$_age", 25] }, then: "18–24" },
                        { case: { $lt: ["$_age", 35] }, then: "25–34" },
                        { case: { $lt: ["$_age", 45] }, then: "35–44" },
                        { case: { $lt: ["$_age", 55] }, then: "45–54" },
                        { case: { $lt: ["$_age", 65] }, then: "55–64" },
                      ],
                      default: "65+",
                    },
                  },
                },
              },
              { $group: { _id: "$ageBand", count: { $sum: 1 } } },
            ],
            bmiCategories: [
              {
                $addFields: {
                  bmi: {
                    $cond: [
                      { $and: [{ $gt: ["$heightCm", 0] }, { $gt: ["$weightKg", 0] }] },
                      { $divide: ["$weightKg", { $pow: [{ $divide: ["$heightCm", 100] }, 2] }] },
                      null,
                    ],
                  },
                },
              },
              {
                $addFields: {
                  bmiCategory: {
                    $switch: {
                      branches: [
                        { case: { $eq: ["$bmi", null] }, then: "Not specified" },
                        { case: { $lt: ["$bmi", 18.5] }, then: "Underweight" },
                        { case: { $lt: ["$bmi", 25] }, then: "Normal" },
                        { case: { $lt: ["$bmi", 30] }, then: "Overweight" },
                      ],
                      default: "Obese",
                    },
                  },
                },
              },
              { $group: { _id: "$bmiCategory", count: { $sum: 1 } } },
            ],
            body: [
              {
                $group: {
                  _id: null,
                  avgHeight: { $avg: "$heightCm" },
                  minHeight: { $min: "$heightCm" },
                  maxHeight: { $max: "$heightCm" },
                  avgWeight: { $avg: "$weightKg" },
                  minWeight: { $min: "$weightKg" },
                  maxWeight: { $max: "$weightKg" },
                  withHeight: { $sum: { $cond: [{ $gt: ["$heightCm", 0] }, 1, 0] } },
                  withWeight: { $sum: { $cond: [{ $gt: ["$weightKg", 0] }, 1, 0] } },
                },
              },
            ],
          },
        },
      ]),

      // --- users per exercise + sessions per exercise ---
      loadExerciseUsage(50, liveUsers),

      // --- good vs bad rep totals (only AR sets carry these) ---
      Workout.aggregate([
        { $match: { ...SESSION_MATCH, ...owned } },
        { $unwind: "$exercises" },
        { $unwind: "$exercises.sets" },
        {
          $group: {
            _id: null,
            good: { $sum: { $ifNull: ["$exercises.sets.goodReps", 0] } },
            bad: { $sum: { $ifNull: ["$exercises.sets.badReps", 0] } },
          },
        },
      ]),

      // --- completed sessions per Manila day, within range ---
      Workout.aggregate([
        { $match: { ...SESSION_MATCH, ...owned } },
        { $addFields: { at: SESSION_DATE } },
        { $match: { at: { $gte: rangeStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: TZ } },
            count: { $sum: 1 },
          },
        },
      ]),

      // --- sign-ups per Manila day, within range ---
      User.aggregate([
        { $match: { createdAt: { $gte: rangeStart } } },
        {
          $group: {
            _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TZ } },
            count: { $sum: 1 },
          },
        },
      ]),

      // --- feedback summary + rating distribution ---
      Feedback.aggregate([
        { $match: owned },
        {
          $facet: {
            summary: [{ $group: { _id: null, avg: { $avg: "$rating" }, count: { $sum: 1 } } }],
            distribution: [
              { $group: { _id: "$rating", count: { $sum: 1 } } },
              { $sort: { _id: 1 } },
            ],
          },
        },
      ]),

      Feedback.find(owned).sort({ createdAt: -1 }).limit(20).populate("user", "name username photo"),
      LoginEvent.find(owned).sort({ createdAt: -1 }).limit(20).populate("user", "name username photo"),
      User.find().sort({ createdAt: -1 }).limit(10).select("name username email gender createdAt"),
    ]);

    const demo = demographics[0] || {};
    const repQuality = repQualityAgg[0] || { good: 0, bad: 0 };
    const fb = feedbackFacet[0] || { summary: [], distribution: [] };
    const fbSummary = fb.summary[0] || { avg: 0, count: 0 };

    res.json({
      range,
      generatedAt: now,
      kpis: {
        totalUsers,
        newUsers,
        activeUsers, // live presence: seen within the "recently active" window
        activeAccounts, // account status: logged in within ACCOUNT_ACTIVE_DAYS
        inactiveAccounts: Math.max(0, totalUsers - activeAccounts),
        accountActiveDays: ACCOUNT_ACTIVE_DAYS,
        totalSessions,
        sessionsInRange,
        avgRating: fbSummary.avg ? +fbSummary.avg.toFixed(2) : 0,
        feedbackCount: fbSummary.count,
      },
      demographics: {
        gender: demo.gender || [],
        age: demo.age || [],
        bmiCategories: demo.bmiCategories || [],
        body: (demo.body && demo.body[0]) || null,
      },
      workouts: {
        exerciseUsage, // [{ exercise, userCount, sessions }]
        repQuality,    // { good, bad }  (ratio only meaningful when good+bad > 0)
        usageTrend: fillDays(workoutTrend, rangeStart, now),
      },
      analytics: {
        newUsersTrend: fillDays(newUserTrend, rangeStart, now),
      },
      feedback: {
        avgRating: fbSummary.avg ? +fbSummary.avg.toFixed(2) : 0,
        count: fbSummary.count,
        distribution: fb.distribution.map((d) => ({ rating: d._id, count: d.count })),
        recent: recentFeedback,
      },
      logins: { recent: recentLogins },
      recentUsers,
    });
  } catch (error) {
    console.log("getDashboard error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

//  PRESENCE (lightweight, polled frequently by the dashboard)
export const getPresence = async (req, res) => {
  try {
    const now = Date.now();
    const activeThreshold = new Date(now - ACTIVE_WINDOW_MS);
    const recentThreshold = new Date(now - RECENTLY_ACTIVE_WINDOW_MS);
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const [countsAgg, users] = await Promise.all([
      User.aggregate([
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $gte: ["$lastActiveAt", activeThreshold] }, 1, 0] } },
            recentlyActive: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $lt: ["$lastActiveAt", activeThreshold] },
                      { $gte: ["$lastActiveAt", recentThreshold] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      User.find({ lastActiveAt: { $gte: recentThreshold } })
        .sort({ lastActiveAt: -1 })
        .limit(limit)
        .select("name username photo lastActiveAt"),
    ]);

    const c = countsAgg[0] || { total: 0, active: 0, recentlyActive: 0 };
    const inactive = c.total - c.active - c.recentlyActive;
    const list = users.map((u) => ({
      _id: u._id,
      name: u.name,
      username: u.username,
      photo: u.photo,
      lastActiveAt: u.lastActiveAt,
      status: presenceStatus(u.lastActiveAt, now),
    }));

    res.json({
      counts: { total: c.total, active: c.active, recentlyActive: c.recentlyActive, inactive },
      users: list,
      windows: { activeMs: ACTIVE_WINDOW_MS, recentlyActiveMs: RECENTLY_ACTIVE_WINDOW_MS },
    });
  } catch (error) {
    console.log("getPresence error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

//  USERS PER EXERCISE
//  Card data: every exercise people have actually done, with distinct-user + session counts.
export const getExerciseUsage = async (req, res) => {
  try {
    const usage = await loadExerciseUsage(100, await User.distinct("_id"));
    res.json(usage);
  } catch (error) {
    console.log("getExerciseUsage error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

//  Drill-down: paginated list of users who have done a given exercise (optional search).
export const getUsersByExercise = async (req, res) => {
  try {
    const exercise = String(req.params.exercise || "").toLowerCase();
    // every stored spelling that belongs to this exercise (e.g. "bicepcurl" + "bicep curls")
    const group = exerciseGroup(exercise);
    const spellings = (await Workout.distinct("exercises.name", SESSION_MATCH))
      .map((n) => String(n).trim().toLowerCase())
      .filter((n) => n && exerciseGroup(n) === group);
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(escaped, "i");

    const result = await Workout.aggregate([
      { $match: SESSION_MATCH },
      { $unwind: "$exercises" },
      { $addFields: { exLower: { $toLower: { $trim: { input: "$exercises.name" } } } } },
      { $match: { exLower: { $in: spellings } } },
      { $group: { _id: "$user", sessions: { $sum: 1 }, lastUsed: { $max: SESSION_DATE } } },
      { $lookup: { from: "users", localField: "_id", foreignField: "_id", as: "user" } },
      { $unwind: "$user" },
      ...(search
        ? [{ $match: { $or: [{ "user.name": re }, { "user.username": re }, { "user.email": re }] } }]
        : []),
      {
        $project: {
          _id: 0,
          userId: "$_id",
          sessions: 1,
          lastUsed: 1,
          name: "$user.name",
          username: "$user.username",
          email: "$user.email",
          photo: "$user.photo",
        },
      },
      { $sort: { sessions: -1, lastUsed: -1 } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          total: [{ $count: "count" }],
        },
      },
    ]);

    const data = result[0]?.data || [];
    const total = result[0]?.total?.[0]?.count || 0;
    res.json({ exercise, users: data, total, page, limit });
  } catch (error) {
    console.log("getUsersByExercise error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

export const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;   // "active" or "inactive"
    if (!["active", "inactive"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { status },
      { returnDocument: "after" }
    ).select(SAFE_USER_FIELDS);
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: "Server error" });
  }
};

//  FEEDBACK (admin read — the dedicated Feedback tab)
//  Paginated, newest first. Records left behind by deleted accounts are ignored,
//  matching the rest of the dashboard. The mobile submit flow is untouched.
export const getFeedback = async (req, res) => {
  try {
    const { page, limit } = parsePaging(req);
    const liveUsers = await User.distinct("_id");
    const match = ownedBy(liveUsers);

    const [data, total] = await Promise.all([
      Feedback.find(match)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate("user", "name username email photo"),
      Feedback.countDocuments(match),
    ]);

    res.json(pageMeta(data, total, page, limit));
  } catch (error) {
    console.log("getFeedback error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

//  HISTORICAL ANALYTICS
//  Everything below is derived live from real records — User.createdAt for
//  "New Users" and the completed-session date (completedAt, falling back to date)
//  for "Completed Sessions" — grouped in Asia/Manila so the buckets line up with
//  the rest of the dashboard. Nothing is pre-computed or faked.
const MANILA = { tz: TZ, offset: MANILA_OFFSET_MS };
// Instant of Manila-local midnight for a given calendar y/m/d. Month/day overflow
// normalises (m=13 -> next January), so "start of next month/year" is just +1.
const manilaInstant = (y, m, d) => new Date(Date.UTC(y, m - 1, d) - MANILA.offset);
const pad2 = (n) => String(n).padStart(2, "0");

// New users per Manila day within [start, end): [{ _id: "YYYY-MM-DD", count }]
const newUsersByDay = (start, end) =>
  User.aggregate([
    { $match: { createdAt: { $gte: start, $lt: end } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: MANILA.tz } }, count: { $sum: 1 } } },
  ]);

// Completed sessions per Manila day within [start, end), ignoring deleted accounts.
const sessionsByDay = (start, end, userIds) =>
  Workout.aggregate([
    { $match: { ...SESSION_MATCH, ...ownedBy(userIds) } },
    { $addFields: { at: SESSION_DATE } },
    { $match: { at: { $gte: start, $lt: end } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$at", timezone: MANILA.tz } }, count: { $sum: 1 } } },
  ]);

const countsMap = (rows) => new Map(rows.map((r) => [r._id, r.count]));

// GET /analytics/monthly?year=&month=  -> weekly breakdown + totals
// Weeks bucket by day-of-month (1–7, 8–14, 15–21, 22–28, 29–end) so EVERY day in
// the month is represented — a 5th partial week is kept, never discarded.
export const getMonthlyAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const year = Math.floor(Number(req.query.year)) || now.getFullYear();
    const month = Math.min(12, Math.max(1, Math.floor(Number(req.query.month)) || (now.getMonth() + 1)));
    const start = manilaInstant(year, month, 1);
    const end = manilaInstant(year, month + 1, 1);

    const liveUsers = await User.distinct("_id");
    const [userRows, sessionRows] = await Promise.all([
      newUsersByDay(start, end),
      sessionsByDay(start, end, liveUsers),
    ]);
    const users = countsMap(userRows);
    const sessions = countsMap(sessionRows);

    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const weeks = [];
    const ranges = [[1, 7], [8, 14], [15, 21], [22, 28], [29, 31]];
    for (let i = 0; i < ranges.length; i++) {
      const from = ranges[i][0];
      const to = Math.min(ranges[i][1], daysInMonth);
      if (from > daysInMonth) break;
      let newUsers = 0, completedSessions = 0;
      for (let d = from; d <= to; d++) {
        const key = `${year}-${pad2(month)}-${pad2(d)}`;
        newUsers += users.get(key) || 0;
        completedSessions += sessions.get(key) || 0;
      }
      weeks.push({ week: i + 1, label: `Week ${i + 1}`, fromDay: from, toDay: to, newUsers, completedSessions });
    }

    const totals = weeks.reduce(
      (t, w) => ({ newUsers: t.newUsers + w.newUsers, completedSessions: t.completedSessions + w.completedSessions }),
      { newUsers: 0, completedSessions: 0 }
    );
    res.json({ year, month, daysInMonth, weeks, totals });
  } catch (error) {
    console.log("getMonthlyAnalytics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /analytics/yearly?year=  -> Jan–Dec breakdown + yearly totals
export const getYearlyAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const year = Math.floor(Number(req.query.year)) || now.getFullYear();
    const start = manilaInstant(year, 1, 1);
    const end = manilaInstant(year + 1, 1, 1);
    const liveUsers = await User.distinct("_id");

    const byMonth = (dateExpr, matchExtra = {}) => [
      { $match: matchExtra },
      { $group: { _id: { $month: { date: dateExpr, timezone: MANILA.tz } }, count: { $sum: 1 } } },
    ];

    const [userRows, sessionRows] = await Promise.all([
      User.aggregate(byMonth("$createdAt", { createdAt: { $gte: start, $lt: end } })),
      Workout.aggregate([
        { $match: { ...SESSION_MATCH, ...ownedBy(liveUsers) } },
        { $addFields: { at: SESSION_DATE } },
        { $match: { at: { $gte: start, $lt: end } } },
        { $group: { _id: { $month: { date: "$at", timezone: MANILA.tz } }, count: { $sum: 1 } } },
      ]),
    ]);
    const users = new Map(userRows.map((r) => [r._id, r.count]));
    const sessions = new Map(sessionRows.map((r) => [r._id, r.count]));

    const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const months = MONTH_NAMES.map((name, i) => ({
      month: i + 1,
      label: name,
      newUsers: users.get(i + 1) || 0,
      completedSessions: sessions.get(i + 1) || 0,
    }));
    const totals = months.reduce(
      (t, m) => ({ newUsers: t.newUsers + m.newUsers, completedSessions: t.completedSessions + m.completedSessions }),
      { newUsers: 0, completedSessions: 0 }
    );
    res.json({ year, months, totals });
  } catch (error) {
    console.log("getYearlyAnalytics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /analytics/daily?date=YYYY-MM-DD  -> that single Manila day's figures
export const getDailyAnalytics = async (req, res) => {
  try {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(req.query.date || ""));
    const now = new Date();
    let year, month, day;
    if (m) {
      year = Number(m[1]); month = Number(m[2]); day = Number(m[3]);
    } else {
      // default to today in Manila
      const todayManila = new Date(now.getTime() + MANILA.offset).toISOString().slice(0, 10).split("-");
      [year, month, day] = todayManila.map(Number);
    }
    const start = manilaInstant(year, month, day);
    const end = manilaInstant(year, month, day + 1);
    const liveUsers = await User.distinct("_id");

    const [newUsers, completedSessions] = await Promise.all([
      User.countDocuments({ createdAt: { $gte: start, $lt: end } }),
      Workout.aggregate([
        { $match: { ...SESSION_MATCH, ...ownedBy(liveUsers) } },
        { $addFields: { at: SESSION_DATE } },
        { $match: { at: { $gte: start, $lt: end } } },
        { $count: "count" },
      ]).then((r) => r[0]?.count || 0),
    ]);
    res.json({ date: `${year}-${pad2(month)}-${pad2(day)}`, newUsers, completedSessions });
  } catch (error) {
    console.log("getDailyAnalytics error:", error);
    res.status(500).json({ message: "Server error" });
  }
};

// GET /analytics/years -> every year that has data, newest first (for the pickers).
// Never hardcoded: derived from the earliest user sign-up / completed session.
export const getAnalyticsYears = async (req, res) => {
  try {
    const now = new Date();
    const currentYear = Number(new Date(now.getTime() + MANILA.offset).toISOString().slice(0, 4));
    const [firstUser, firstSession] = await Promise.all([
      User.findOne().sort({ createdAt: 1 }).select("createdAt").lean(),
      Workout.findOne({ ...SESSION_MATCH }).sort({ date: 1 }).select("date completedAt createdAt").lean(),
    ]);
    const yearOf = (d) => (d ? Number(new Date(new Date(d).getTime() + MANILA.offset).toISOString().slice(0, 4)) : currentYear);
    const earliest = Math.min(
      yearOf(firstUser?.createdAt),
      yearOf(firstSession?.completedAt || firstSession?.date || firstSession?.createdAt),
      currentYear
    );
    const years = [];
    for (let y = currentYear; y >= earliest; y--) years.push(y);
    res.json({ years, currentYear });
  } catch (error) {
    console.log("getAnalyticsYears error:", error);
    res.status(500).json({ message: "Server error" });
  }
};