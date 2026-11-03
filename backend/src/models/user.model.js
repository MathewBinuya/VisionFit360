import mongoose from "mongoose";
import bcrypt from "bcryptjs";

const userSchema = new mongoose.Schema(
  {
    // username is the single public identity (@handle + "Hello, X" greeting). It
    // is now chosen during onboarding rather than at signup, so an account can
    // briefly exist without one — hence not required, and a sparse unique index
    // so the many "no username yet" accounts don't collide.
    username: { type: String, unique: true, sparse: true },
    email: { type: String, required: true, unique: true },
    // Password is required only for local (email/password) accounts. Google
    // accounts authenticate through Google and never set one.
    password: {
      type: String,
      required: function () { return this.authProvider !== "google"; },
      minlength: 6,
    },
    // --- sign-in method ---
    // "local" = email + password, "google" = Google OAuth. googleId is Google's
    // stable user id (the token "sub"); sparse unique so the many local accounts
    // without one don't collide.
    authProvider: { type: String, enum: ["local", "google"], default: "local" },
    googleId: { type: String, unique: true, sparse: true },
    onBoardingComplete: { type: Boolean, default: false },
    name: { type: String, default: "" }, // legacy display name; kept for existing data
    // real name (optional, set-once). Middle name is optional even then.
    firstName: { type: String, default: "" },
    lastName: { type: String, default: "" },
    middleName: { type: String, default: "" },
    photo: { type: String, default: "" },
    bio: { type: String, default: "" },
    dateOfBirth: Date,
    gender: { type: String, enum: ["male", "female"] },
    // fitness goal — optional with a safe default; existing users read as "get_fit"
    // only after they save, so consumers must still handle a missing value.
    goal: { type: String, enum: ["get_fit", "maintain_weight", "get_lean"], default: "get_fit" },
    heightCm: Number,
    weightKg: Number,
    currentToken: { type: String, default: "" },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    // --- login / presence tracking (additive; existing users simply have these unset) ---
    lastLoginAt: { type: Date, default: null },   // stamped on each successful login
    lastActiveAt: { type: Date, default: null },  // updated by the app heartbeat / activity
    // forgot password fields
    resetToken: { type: String, default: "" },
    resetTokenExpiry: { type: Date, default: null },
    isVerified: { type: Boolean, default: false },
    verificationCode: { type: String, default: "" },
    verificationCodeExpiry: { type: Date, default: null },
  },
  
  { timestamps: true }
);

// Indexes for the admin dashboard aggregations (registration trend, presence, demographics).
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ lastLoginAt: -1 });
userSchema.index({ gender: 1 });

userSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

userSchema.methods.comparePassword = async function (userPassword) {
  return await bcrypt.compare(userPassword, this.password);
};

export default mongoose.model("User", userSchema);