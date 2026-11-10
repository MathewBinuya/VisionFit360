import express from "express";
import auth from "../middleware/auth.middleware.js";
import { aiLimiter } from "../middleware/rateLimit.middleware.js";
import { recommendWorkout, chatWithCoach } from "../controller/aiController.js";

const router = express.Router();

// aiLimiter runs after auth so it can key off the user id (per-user cap on the
// paid LLM calls).
router.post("/recommend", auth, aiLimiter, recommendWorkout);
router.post("/chat", auth, aiLimiter, chatWithCoach);



export default router;