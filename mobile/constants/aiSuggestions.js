// Suggested questions ("FAQ chips") shown on the AI Coach screen so users know
// what they can ask. Tapping a chip sends its text to the coach as a normal
// message — the backend (chatWithCoach) already personalises answers from the
// user's saved profile (height, weight, goal, estimated level) and, when a
// profile detail is missing, says what's missing instead of guessing.
//
// Keep this list SHORT (4–6) and edit it here only — it's the single source of
// truth, so nothing is hard-coded across screens.
export const AI_SUGGESTED_QUESTIONS = [
  "What is my current BMI?",
  "Recommend me a workout based on my goal",
  "How many sets and reps should I do?",
  "What should I train today?",
  "How many days a week should I work out?",
];

export default AI_SUGGESTED_QUESTIONS;
