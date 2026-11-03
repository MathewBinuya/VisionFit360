import User from "../models/user.model.js";
import LoginEvent from "../models/loginEvent.model.js";
import generateToken from "../utils/generateToken.js";
import { isAllowedEmail, normalizeEmail } from "../utils/emailValidator.js";
import { sendEmail } from "../lib/email.js";
import { OAuth2Client } from "google-auth-library";
import crypto from "crypto";

// Verifies Google ID tokens. The audience is our Web client ID — the token is
// minted for it, so it's what we validate against.
const googleClient = new OAuth2Client();
const GOOGLE_WEB_CLIENT_ID = process.env.GOOGLE_WEB_CLIENT_ID;

const CODE_EXPIRY_MS = 15 * 60 * 1000; // 15 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between emails
const MAX_CODE_ATTEMPTS = 5; // wrong guesses allowed per code

// ---------- helpers ----------

const generateCode = () => crypto.randomInt(100000, 1000000).toString();

const hashCode = (code) =>
  crypto.createHash("sha256").update(String(code).trim()).digest("hex");

const cooldownSecondsLeft = (lastSentAt) => {
  if (!lastSentAt) return 0;
  const left = RESEND_COOLDOWN_MS - (Date.now() - new Date(lastSentAt).getTime());
  return left > 0 ? Math.ceil(left / 1000) : 0;
};

function verificationEmailHtml(code) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f7f7f7; border-radius: 12px;">
      <h2 style="color: #111111; margin-bottom: 8px;">Welcome to VisionFIT360</h2>
      <p style="color: #555; margin-bottom: 24px;">Use the code below to verify your email and activate your account.</p>
      <div style="background: #ffffff; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 8px;">YOUR VERIFICATION CODE</p>
        <p style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #111111; margin: 0;">${code}</p>
      </div>
      <p style="color: #888; font-size: 13px; text-align: center;">This code expires in <strong>15 minutes</strong>.</p>
    </div>
  `;
}

function resetEmailHtml(code) {
  return `
    <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f7f7f7; border-radius: 12px;">
      <h2 style="color: #111111; margin-bottom: 8px;">Password Reset</h2>
      <p style="color: #555; margin-bottom: 24px;">You requested a password reset for your VisionFIT360 account.</p>
      <div style="background: #ffffff; border-radius: 10px; padding: 24px; text-align: center; margin-bottom: 24px;">
        <p style="color: #888; font-size: 13px; margin-bottom: 8px;">YOUR RESET CODE</p>
        <p style="font-size: 36px; font-weight: 900; letter-spacing: 8px; color: #111111; margin: 0;">${code}</p>
      </div>
      <p style="color: #888; font-size: 13px; text-align: center;">This code expires in <strong>15 minutes</strong>.</p>
      <p style="color: #bbb; font-size: 12px; text-align: center; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
    </div>
  `;
}

// Sets a fresh verification code on the user doc (caller must save)
function issueVerificationCode(user) {
  const code = generateCode();
  user.verificationCode = hashCode(code);
  user.verificationCodeExpiry = new Date(Date.now() + CODE_EXPIRY_MS);
  user.verificationAttempts = 0;
  user.verificationSentAt = new Date();
  return code;
}



export const register = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required" });

    if (email.length > 100)
      return res.status(400).json({ message: "Email is too long" });
    if (password.length > 64)
      return res.status(400).json({ message: "Password must be 64 characters or less" });
    if (password.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    if (!/[a-zA-Z]/.test(password))
      return res.status(400).json({ message: "Password must include at least one letter" });
    if (!/[0-9]/.test(password))
      return res.status(400).json({ message: "Password must include at least one number" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ message: "Please enter a valid email address" });

    // only Gmail / Outlook / Yahoo allowed (blocks temp-mail and other disposable domains)
    if (!isAllowedEmail(email))
      return res.status(400).json({ message: "Please use a Gmail, Outlook, or Yahoo email address" });

    const normalizedEmail = normalizeEmail(email);

    const existingEmail = await User.findOne({ email: normalizedEmail });

    // only block if that email belongs to an already-verified account
    if (existingEmail && existingEmail.isVerified) {
      return res.status(400).json({ message: "Email already exists" });
    }

    // stop people from spamming an inbox by re-registering the same unverified email
    if (existingEmail) {
      const wait = cooldownSecondsLeft(existingEmail.verificationSentAt);
      if (wait > 0) {
        return res.status(429).json({
          message: `Please wait ${wait} seconds before requesting another code.`,
        });
      }
    }

    // Username is no longer collected at signup — it is chosen during onboarding
    // (with a uniqueness check there). An account is created with email + password
    // only; the public @handle/username is set on the first onboarding step.
    let user;
    if (existingEmail) {
      // stale unverified account from a previous incomplete signup — reuse it
      existingEmail.password = password; // pre-save hook re-hashes since password is modified
      user = existingEmail;
    } else {
      user = new User({ email: normalizedEmail, password });
    }

    const verificationCode = issueVerificationCode(user);
    await user.save();

    console.log("Sending verification email to:", user.email);

    await sendEmail({
      to: user.email,
      subject: "VisionFIT360 — Verify Your Email",
      html: verificationEmailHtml(verificationCode),
    });

    res.status(201).json({
      message: "Account created. Please check your email for a verification code.",
      email: user.email,
    });
  } catch (error) {
    console.log("Error in register route", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { email, verificationCode } = req.body;

    if (!email || !verificationCode)
      return res.status(400).json({ message: "Email and verification code are required" });

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user)
      return res.status(400).json({ message: "Invalid verification request" });

    if (user.isVerified)
      return res.status(400).json({ message: "Account is already verified" });

    if (!user.verificationCodeExpiry || user.verificationCodeExpiry < new Date())
      return res.status(400).json({ message: "Verification code has expired. Please request a new one." });

    // too many wrong guesses -> this code is dead, user must request a new one
    if ((user.verificationAttempts || 0) >= MAX_CODE_ATTEMPTS) {
      return res.status(429).json({
        message: "Too many incorrect attempts. Please request a new code.",
      });
    }

    const hashedCode = hashCode(verificationCode);
    if (user.verificationCode !== hashedCode) {
      user.verificationAttempts = (user.verificationAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid verification code" });
    }

    user.isVerified = true;
    user.verificationCode = "";
    user.verificationCodeExpiry = null;
    user.verificationAttempts = 0;

    const token = generateToken(user._id);
    user.currentToken = token;
    // first successful login happens right after verification — stamp it too
    const now = new Date();
    user.lastLoginAt = now;
    user.lastActiveAt = now;
    await user.save();

    LoginEvent.create({ user: user._id, createdAt: now }).catch((e) =>
      console.log("Failed to record login event:", e.message)
    );

    res.status(200).json({
      message: "Email verified successfully.",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        onBoardingComplete: user.onBoardingComplete,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error in verifyEmail", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resendVerificationCode = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ message: "Email is required" });

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user)
      return res.status(400).json({ message: "Invalid request" });

    if (user.isVerified)
      return res.status(400).json({ message: "Account is already verified" });

    const wait = cooldownSecondsLeft(user.verificationSentAt);
    if (wait > 0) {
      return res.status(429).json({
        message: `Please wait ${wait} seconds before requesting another code.`,
      });
    }

    const verificationCode = issueVerificationCode(user);
    await user.save();

    console.log("Resending verification email to:", user.email);

    await sendEmail({
      to: user.email,
      subject: "VisionFIT360 — Verify Your Email",
      html: verificationEmailHtml(verificationCode),
    });

    res.status(200).json({ message: "Verification code resent." });
  } catch (error) {
    console.log("Error in resendVerificationCode:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "All fields are required" });

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user)
      return res.status(400).json({ message: "Invalid credentials" });

    // Google-only account (no password set) — steer them to the Google button
    // instead of running comparePassword against an empty hash.
    if (!user.password)
      return res.status(400).json({ message: "This account uses Google sign-in. Please continue with Google." });

    const isPasswordCorrect = await user.comparePassword(password);
    if (!isPasswordCorrect)
      return res.status(400).json({ message: "Invalid credentials" });

    if (!user.isVerified)
      return res.status(403).json({ message: "Please verify your email before logging in.", email: user.email });

    const token = generateToken(user._id);

    user.currentToken = token;
    // stamp login + presence (additive — does not change the response shape)
    const now = new Date();
    user.lastLoginAt = now;
    user.lastActiveAt = now;
    await user.save();

    // record the login event for the admin "recent logins" view (best-effort, never blocks login)
    LoginEvent.create({ user: user._id, createdAt: now }).catch((e) =>
      console.log("Failed to record login event:", e.message)
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        onBoardingComplete: user.onBoardingComplete,
        photo: user.photo,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error in login route", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Sign in / sign up with Google. The app sends the Google ID token obtained
// natively; we verify it server-side, then find-or-create the matching user and
// return our own JWT in the exact same shape as login/verifyEmail.
export const googleAuth = async (req, res) => {
  try {
    const { idToken } = req.body;

    if (!idToken)
      return res.status(400).json({ message: "Google ID token is required" });

    if (!GOOGLE_WEB_CLIENT_ID) {
      console.log("GOOGLE_WEB_CLIENT_ID is not set — Google sign-in is unconfigured");
      return res.status(500).json({ message: "Google sign-in is not configured" });
    }

    // Verify the token's signature + audience with Google.
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken,
        audience: GOOGLE_WEB_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } catch (e) {
      console.log("Google token verification failed:", e.message);
      return res.status(401).json({ message: "Invalid or expired Google token" });
    }

    if (!payload?.email || !payload.email_verified)
      return res.status(401).json({ message: "Google account email is not verified" });

    const googleId = payload.sub;
    const email = normalizeEmail(payload.email);

    // 1) Returning Google user.
    let user = await User.findOne({ googleId });

    // 2) Existing email/password account with the same email — link Google to it.
    //    Safe because Google has verified ownership of this email.
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        if (!user.isVerified) user.isVerified = true;
        if (!user.photo && payload.picture) user.photo = payload.picture;
      }
    }

    // 3) Brand-new user. Apply the same allowed-domain policy as email signup.
    if (!user) {
      if (!isAllowedEmail(email))
        return res.status(400).json({ message: "Please use a Gmail, Outlook, or Yahoo account" });

      user = new User({
        email,
        googleId,
        authProvider: "google",
        isVerified: true,
        photo: payload.picture || "",
      });
    }

    const token = generateToken(user._id);
    user.currentToken = token;
    const now = new Date();
    user.lastLoginAt = now;
    user.lastActiveAt = now;
    await user.save();

    LoginEvent.create({ user: user._id, createdAt: now }).catch((e) =>
      console.log("Failed to record login event:", e.message)
    );

    res.status(200).json({
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        onBoardingComplete: user.onBoardingComplete,
        photo: user.photo,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.log("Error in googleAuth route", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email)
      return res.status(400).json({ message: "Email is required" });

    const genericReply = {
      message: "If that email is registered, a reset code has been sent.",
    };

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user) {
      return res.status(200).json(genericReply);
    }

    // silently ignore requests inside the cooldown (also avoids revealing account existence)
    if (cooldownSecondsLeft(user.resetSentAt) > 0) {
      return res.status(200).json(genericReply);
    }

    const resetCode = generateCode();

    user.resetToken = hashCode(resetCode);
    user.resetTokenExpiry = new Date(Date.now() + CODE_EXPIRY_MS);
    user.resetAttempts = 0;
    user.resetSentAt = new Date();
    await user.save();

    console.log("Sending reset email to:", user.email);

    await sendEmail({
      to: user.email,
      subject: "VisionFIT360 — Your Password Reset Code",
      html: resetEmailHtml(resetCode),
    });

    res.status(200).json({
      message: "Reset code sent to your email.",
    });
  } catch (error) {
    console.log("Error in forgotPassword:", error.message);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;

    if (!email || !resetCode || !newPassword)
      return res.status(400).json({ message: "All fields are required" });

    if (newPassword.length < 8)
      return res.status(400).json({ message: "Password must be at least 8 characters long" });
    if (newPassword.length > 64)
      return res.status(400).json({ message: "Password must be 64 characters or less" });
    if (!/[a-zA-Z]/.test(newPassword))
      return res.status(400).json({ message: "Password must include at least one letter" });
    if (!/[0-9]/.test(newPassword))
      return res.status(400).json({ message: "Password must include at least one number" });

    const user = await User.findOne({ email: normalizeEmail(email) });
    if (!user)
      return res.status(400).json({ message: "Invalid reset request" });

    if (!user.resetTokenExpiry || user.resetTokenExpiry < new Date())
      return res.status(400).json({ message: "Reset code has expired. Please request a new one." });

    if ((user.resetAttempts || 0) >= MAX_CODE_ATTEMPTS) {
      return res.status(429).json({
        message: "Too many incorrect attempts. Please request a new code.",
      });
    }

    const hashedCode = hashCode(resetCode);
    if (user.resetToken !== hashedCode) {
      user.resetAttempts = (user.resetAttempts || 0) + 1;
      await user.save();
      return res.status(400).json({ message: "Invalid reset code" });
    }

    user.password = newPassword;
    user.resetToken = "";
    user.resetTokenExpiry = null;
    user.resetAttempts = 0;
    user.currentToken = "";
    await user.save();

    res.status(200).json({ message: "Password reset successfully. Please log in with your new password." });
  } catch (error) {
    console.log("Error in resetPassword", error);
    res.status(500).json({ message: "Internal server error" });
  }
};