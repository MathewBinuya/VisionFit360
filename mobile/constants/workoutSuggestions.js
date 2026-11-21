// Suggestion lists for the Workout Tracker's searchable name fields.
//
// IMPORTANT: these are SUGGESTIONS ONLY. They never replace manual input — the
// user can always type any custom routine or exercise name and it is accepted
// as-is. The dropdown just helps users who don't know the name.
//
// Edit the lists here (single source of truth) — nothing is hard-coded in the
// screens. Keep EXERCISE_SUGGESTIONS reasonable (~20–30 common moves), not
// exhaustive. Exercise names that VisionFit's AR tracker supports are spelled to
// match the catalog so they stay consistent across the app.

// a) Routine (workout) names — the routine, not the exercise.
export const ROUTINE_SUGGESTIONS = [
  "Push Day",
  "Pull Day",
  "Leg Day",
  "Chest Day",
  "Back Day",
  "Shoulder Day",
  "Arm Day",
  "Upper Body",
  "Lower Body",
  "Full Body",
  "Core / Abs",
  "Cardio",
];

// b) Common exercise names (~24). The user may still type anything else.
export const EXERCISE_SUGGESTIONS = [
  "Squats",
  "Sumo Squats",
  "Lunges",
  "Deadlift",
  "Leg Press",
  "Bench Press",
  "Push-ups",
  "Chest Fly",
  "Pull-up",
  "Bent-over Row",
  "Lat Pulldown",
  "Shoulder Press",
  "Lateral Raises",
  "Front Raises",
  "Bicep Curls",
  "Tricep Extension",
  "Plank",
  "Knee Raises",
  "Side Bends",
  "Side Leg Raises",
  "Crunches",
  "Jumping Jacks",
  "High Knees",
  "Mountain Climbers",
];

// Optional helper for ordering: when a routine is chosen, these exercises float
// to the top of the exercise suggestions (still followed by the full list).
// Keys are matched case-insensitively against whatever the user typed as the
// routine name, so "Leg Day", "leg", and "Lower Body" all map sensibly.
export const ROUTINE_EXERCISE_HINTS = [
  { match: ["leg", "lower"], exercises: ["Squats", "Sumo Squats", "Lunges", "Deadlift", "Leg Press", "Side Leg Raises"] },
  { match: ["chest", "push"], exercises: ["Bench Press", "Push-ups", "Chest Fly", "Shoulder Press", "Tricep Extension"] },
  { match: ["back", "pull"], exercises: ["Pull-up", "Bent-over Row", "Lat Pulldown", "Deadlift", "Bicep Curls"] },
  { match: ["shoulder"], exercises: ["Shoulder Press", "Lateral Raises", "Front Raises"] },
  { match: ["arm"], exercises: ["Bicep Curls", "Tricep Extension"] },
  { match: ["upper"], exercises: ["Bench Press", "Push-ups", "Shoulder Press", "Bicep Curls", "Pull-up"] },
  { match: ["full"], exercises: ["Squats", "Push-ups", "Deadlift", "Shoulder Press", "Plank"] },
  { match: ["core", "abs"], exercises: ["Plank", "Crunches", "Knee Raises", "Side Bends", "Mountain Climbers"] },
  { match: ["cardio"], exercises: ["Jumping Jacks", "High Knees", "Mountain Climbers"] },
];

// Build an exercise suggestion list ordered for the given routine name:
// related exercises first (in their hint order), then everything else. When no
// routine is given or nothing matches, returns EXERCISE_SUGGESTIONS unchanged.
export const exercisesForRoutine = (routineName) => {
  const r = (routineName || "").toLowerCase();
  if (!r) return EXERCISE_SUGGESTIONS;
  const hint = ROUTINE_EXERCISE_HINTS.find((h) => h.match.some((m) => r.includes(m)));
  if (!hint) return EXERCISE_SUGGESTIONS;
  const top = hint.exercises.filter((e) => EXERCISE_SUGGESTIONS.includes(e));
  const rest = EXERCISE_SUGGESTIONS.filter((e) => !top.includes(e));
  return [...top, ...rest];
};
