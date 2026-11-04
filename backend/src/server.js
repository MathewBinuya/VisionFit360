import express from "express";
import "dotenv/config.js";
import job from "./lib/cron.js";

import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import bmiRoutes from "./routes/bmiRoutes.js";
import workoutRoutes from "./routes/workoutRoutes.js";
import aiRoutes from './routes/aiRoutes.js'
import adminRoutes from "./routes/adminRoutes.js";
import feedbackRoutes from "./routes/feedbackRoutes.js";
import cors from "cors";

import { connectDB } from "./lib/db.js";
import { homePage, privacyPage, termsPage } from "./lib/legalPages.js";

const app = express();
const PORT = process.env.PORT || 3000;

// job.start();

// Render terminates TLS at a proxy and forwards via X-Forwarded-For. Trusting the
// first hop lets req.ip resolve to the real client so the auth rate limiters key
// off each user, not the shared proxy IP.
app.set("trust proxy", 1);

// Credentialed CORS so the admin dashboard (a different origin) can send its
// httpOnly auth cookie. A wildcard origin is NOT allowed with credentials, so we
// echo back only known origins. Requests with no Origin header (the mobile app,
// curl, server-to-server) are always allowed. Set ADMIN_ORIGINS (comma-separated,
// e.g. "https://your-dashboard.vercel.app") in the backend env to lock browser
// access down to the dashboard; until it's set we stay permissive so nothing breaks.
const allowedOrigins = (process.env.ADMIN_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (!allowedOrigins.length) return cb(null, true);
      return cb(null, allowedOrigins.includes(origin));
    },
    credentials: true,
  })
);                            // must come before routes
app.use(express.json());      // keep this once, before routes

// Public pages required to publish the Google OAuth consent screen (home /
// privacy / terms under an authorized domain).
app.get("/", (req, res) => res.type("html").send(homePage()));
app.get("/privacy", (req, res) => res.type("html").send(privacyPage()));
app.get("/terms", (req, res) => res.type("html").send(termsPage()));

app.use("/api/ai", aiRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/bmi", bmiRoutes);
app.use("/api/workouts", workoutRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/feedback", feedbackRoutes);

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  connectDB();
});