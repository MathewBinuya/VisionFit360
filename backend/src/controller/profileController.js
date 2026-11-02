import User from "../models/user.model.js";
import { cloudinary } from "../lib/cloudinary.js";

export const getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Fields that may only be set ONCE: after the account has a value, it can't be
// changed here (matches the product's "lock after you set it" rule).
const SET_ONCE_FIELDS = ["dateOfBirth", "firstName", "lastName", "middleName"];

export const updateProfile = async (req, res) => {
  try {
    const { name, photo, bio, username, firstName, lastName, middleName,
            dateOfBirth, gender, heightCm, weightKg, goal } = req.body;
    const updates = { name, photo, bio, username, firstName, lastName, middleName,
                      dateOfBirth, gender, heightCm, weightKg, goal };
    Object.keys(updates).forEach((k) => updates[k] === undefined && delete updates[k]);

    // Username = the public @handle / "Hello, X" identity. Editable and unique:
    // validate the format and make sure no other account already holds it.
    if (updates.username !== undefined) {
      const uname = String(updates.username).trim();
      if (!/^[a-zA-Z0-9_]{3,30}$/.test(uname))
        return res.status(400).json({ message: "Username must be 3–30 characters: letters, numbers or underscores." });
      const taken = await User.findOne({ username: uname, _id: { $ne: req.user.id } }).select("_id");
      if (taken) return res.status(400).json({ message: "That username is already taken." });
      updates.username = uname;
    }

    // Set-once fields (date of birth + real name): never overwrite a value the
    // account already has; each can only be set while it's still empty.
    if (SET_ONCE_FIELDS.some((f) => updates[f] !== undefined)) {
      const current = await User.findById(req.user.id).select(SET_ONCE_FIELDS.join(" "));
      for (const field of SET_ONCE_FIELDS) {
        if (updates[field] === undefined) continue;
        const existing = current?.[field];
        const alreadySet = field === "dateOfBirth" ? !!existing : !!String(existing || "").trim();
        if (alreadySet) { delete updates[field]; continue; }
        if (field !== "dateOfBirth") updates[field] = String(updates[field] || "").trim();
      }
    }

    const user = await User.findByIdAndUpdate(req.user.id, updates, {
      new: true,
      runValidators: true,
    }).select("-password");

    res.json(user);
  } catch (err) {
    // unique-index race on username -> friendly message instead of a 500
    if (err?.code === 11000 && err?.keyPattern?.username) {
      return res.status(400).json({ message: "That username is already taken." });
    }
    res.status(500).json({ message: err.message });
  }
};

export const uploadPhoto = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: "No file uploaded" });

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photo: req.file.path },
      { new: true }
    ).select("-password");

    res.json({ photo: user.photo, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deletePhoto = async (req, res) => {
  try {
    await cloudinary.uploader.destroy(`profile_photos/user_${req.user.id}`);
    const user = await User.findByIdAndUpdate(
      req.user.id,
      { photo: "" },
      { new: true }
    ).select("-password");

    res.json({ message: "Photo removed", user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};


// Lightweight presence ping. The app calls this on login, on workout start/finish,
// and on a throttled interval. Only touches lastActiveAt — no other side effects.
export const heartbeat = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user.id },
      { $set: { lastActiveAt: new Date() } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const completeOnBoarding = async (req, res) => {
  try {
      const user = await User.findByIdAndUpdate(
        req.user.id,
        { onBoardingComplete: true },
        { new: true }
      ).select("-password");

      res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};