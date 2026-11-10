import User from "../models/user.model.js";

// Prunes abandoned signups: accounts that were created but never verified their
// email. This is SAFE and narrowly scoped on purpose:
//   - deletes ONLY isVerified:false (a local email/password signup that never
//     entered its code). Google accounts are always saved isVerified:true, so
//     they can never match. Real, logged-in users are verified, so never match.
//   - INACTIVE users are verified people who just haven't opened the app lately —
//     they are isVerified:true, so they are NEVER touched.
//   - only removes rows older than the grace window (default 24h), which is far
//     longer than the 15-minute verification code lifetime, so no in-progress
//     signup is ever caught. (Rows with no createdAt are skipped, not deleted.)
// Runs on its own timer and never touches the signup/verify request path.

const GRACE_HOURS = Number(process.env.UNVERIFIED_TTL_HOURS) || 24;
const SWEEP_EVERY_MS = 60 * 60 * 1000; // hourly

async function sweep() {
  try {
    const cutoff = new Date(Date.now() - GRACE_HOURS * 60 * 60 * 1000);
    const result = await User.deleteMany({
      isVerified: false,
      createdAt: { $lt: cutoff },
    });
    if (result.deletedCount) {
      console.log(`[cleanup] removed ${result.deletedCount} unverified account(s) older than ${GRACE_HOURS}h`);
    }
  } catch (err) {
    // Never let a cleanup error affect anything else — just log and move on.
    console.log("[cleanup] sweep failed:", err.message);
  }
}

// Kicks off an initial sweep, then repeats hourly. Call once, after the DB is up.
export function startUnverifiedCleanup() {
  sweep();
  const timer = setInterval(sweep, SWEEP_EVERY_MS);
  timer.unref?.(); // don't keep the process alive just for this
  console.log(`[cleanup] unverified-account cleanup active (grace ${GRACE_HOURS}h, hourly)`);
}
