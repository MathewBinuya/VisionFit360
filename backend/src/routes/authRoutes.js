import express from "express";
import { register, login, googleAuth, forgotPassword, resetPassword, verifyEmail, resendVerificationCode } from "../controller/authController.js";
import { loginLimiter, emailLimiter, codeLimiter } from "../middleware/rateLimit.middleware.js";

const router = express.Router();

router.post("/register", emailLimiter, register);
router.post("/login", loginLimiter, login);
router.post("/google", loginLimiter, googleAuth);
router.post("/forgot-password", emailLimiter, forgotPassword);
router.post("/reset-password", codeLimiter, resetPassword);
router.post("/verify-email", codeLimiter, verifyEmail);
router.post("/resend-verification", emailLimiter, resendVerificationCode);

export default router;