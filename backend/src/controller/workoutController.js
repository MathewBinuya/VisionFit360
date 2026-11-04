import Workout from "../models/workout.model.js";
import { getUserAnalytics } from "../lib/workoutAnalytics.js";
import { planCompletion } from "../lib/workoutCompletion.js";
import { buildWorkoutFields } from "../lib/workoutValidation.js";

// A client-supplied idempotency key must be a plain, bounded string — never an
// object/array (which Mongo could turn into an operator) or an oversized blob.
const cleanIdempotencyKey = (v) =>
  typeof v === "string" && v.length > 0 && v.length <= 64 ? v : null;

// Weekly volume / workout counts / PRs / overload feedback, derived from completed workouts.
export const getAnalytics = async (req, res) => {
  try {
    const weeks = Math.min(26, Math.max(4, parseInt(req.query.weeks, 10) || 8));
    res.json(await getUserAnalytics(req.user.id, { weeks }));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create a workout. Hardened for offline sync + security:
//   - the request body is NEVER spread into the document; only validated,
//     whitelisted fields are kept (ownership + completion are server-owned).
//   - an optional clientWorkoutId makes creation idempotent: if this device
//     already created this exact workout (recognised by its key), the existing
//     record is returned instead of inserting a duplicate — so a retried sync
//     after a dropped response can never create the same workout twice.
export const createWorkout = async (req, res) => {
  try {
    const clientWorkoutId = cleanIdempotencyKey(req.body?.clientWorkoutId);

    // Idempotent fast-path: already synced under this key → return it unchanged.
    if (clientWorkoutId) {
      const existing = await Workout.findOne({ clientWorkoutId, user: req.user.id });
      if (existing) return res.status(200).json(existing);
    }

    const built = buildWorkoutFields(req.body, { partial: false });
    if (!built.ok) return res.status(400).json({ message: built.message });

    const doc = { ...built.value, user: req.user.id };
    if (clientWorkoutId) doc.clientWorkoutId = clientWorkoutId;

    const workout = await Workout.create(doc);
    res.status(201).json(workout);
  } catch (err) {
    // Duplicate-key race: two near-simultaneous syncs of the same offline creation.
    // It is already recorded — resolve the retry as success.
    if (err?.code === 11000 && cleanIdempotencyKey(req.body?.clientWorkoutId)) {
      const already = await Workout.findOne({
        clientWorkoutId: req.body.clientWorkoutId,
        user: req.user.id,
      });
      if (already) return res.status(200).json(already);
    }
    res.status(400).json({ message: err.message });
  }
};

export const getWorkouts = async (req, res) => {
  try {
    const { page = 1, limit = 20, completed } = req.query;

    //  completed status
    const filter = { user: req.user.id };
    if (completed === "true") filter.completed = true;
    if (completed === "false") filter.completed = false;

    const workouts = await Workout.find(filter)
      .sort({ date: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json(workouts); 
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getWorkout = async (req, res) => {
  try {
    const workout = await Workout.findOne({ _id: req.params.id, user: req.user.id });
    if (!workout) return res.status(404).json({ message: "Not found" });
    res.json(workout);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update a workout. Like create, the body is validated + whitelisted (never
// spread): ownership and completion state are server-owned and can't be set here.
// `partial: true` keeps only the editable fields actually present in the request.
export const updateWorkout = async (req, res) => {
  try {
    const built = buildWorkoutFields(req.body, { partial: true });
    if (!built.ok) return res.status(400).json({ message: built.message });

    const workout = await Workout.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { $set: built.value },
      { returnDocument: "after", runValidators: true }
    );
    if (!workout) return res.status(404).json({ message: "Not found" });
    res.json(workout);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

//  mark a workout as done - moves it to history.
//  Idempotent so offline completions can be retried safely (dropped responses,
//  app restarts, repeated sync passes) without ever counting a workout twice:
//   - a workout already completed is returned unchanged (its original completedAt
//     is preserved — we never re-stamp it to "now");
//   - the optional clientCompletionId lets us recognise an already-synced
//     completion even if the workout is addressed again after the fact.
//  Completion rules live in lib/workoutCompletion.js (planCompletion).
export const completeWorkout = async (req, res) => {
  try {
    const { clientCompletionId } = req.body || {};

    const workout = await Workout.findOne({ _id: req.params.id, user: req.user.id });
    const plan = planCompletion({ workout, body: req.body || {} });

    if (plan.kind === "not_found") {
      // The workout id is unknown here, but if this exact offline completion was
      // already synced under its clientCompletionId, treat the retry as success.
      if (clientCompletionId) {
        const already = await Workout.findOne({ clientCompletionId, user: req.user.id });
        if (already) return res.json(already);
      }
      return res.status(404).json({ message: "Not found" });
    }

    if (plan.kind === "idempotent") return res.json(workout);

    Object.assign(workout, plan.set);
    await workout.save();
    res.json(workout);
  } catch (err) {
    // A duplicate-key race on clientCompletionId (two near-simultaneous syncs of the
    // same completion) means it is already recorded — resolve it as success.
    if (err?.code === 11000 && req.body?.clientCompletionId) {
      const already = await Workout.findOne({
        clientCompletionId: req.body.clientCompletionId,
        user: req.user.id,
      });
      if (already) return res.json(already);
    }
    res.status(500).json({ message: err.message });
  }
};

export const deleteWorkout = async (req, res) => {
  try {
    const workout = await Workout.findOneAndDelete({ _id: req.params.id, user: req.user.id });
    if (!workout) return res.status(404).json({ message: "Not found" });
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getExerciseProgress = async (req, res) => {
  try {
    const { name } = req.params;
    const workouts = await Workout.find({
      user: req.user.id,
      "exercises.name": name,
    }).sort({ date: 1 });

    const progress = workouts.map((w) => {
      const ex = w.exercises.find((e) => e.name === name);
      const maxWeight = Math.max(...ex.sets.map((s) => s.weightKg || 0));
      const totalVolume = ex.sets.reduce((sum, s) => sum + (s.reps || 0) * (s.weightKg || 0), 0);
      return { date: w.date, maxWeight, totalVolume };
    });

    res.json(progress);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};