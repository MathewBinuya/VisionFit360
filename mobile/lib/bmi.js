// BMI presentation helpers (client-side display only).
// The BMI NUMBER + category still come from the backend (POST /bmi); this file
// only adds the reference range, explanation and limitations shown to the user.
// Standard adult (18+) reference categories — do NOT invent custom thresholds.

export const BMI_CATEGORIES = [
  { key: "Underweight", label: "Underweight", range: "below 18.5", color: "#854f0b" },
  { key: "Normal",      label: "Normal",      range: "18.5 – 24.9", color: "#0f6e56" },
  { key: "Overweight",  label: "Overweight",  range: "25.0 – 29.9", color: "#854f0b" },
  { key: "Obese",       label: "Obesity",     range: "30.0 and above", color: "#a32d2d" },
];

// Match the backend's category string to our reference row.
export const categoryInfo = (category) =>
  BMI_CATEGORIES.find((c) => c.key === category) ||
  BMI_CATEGORIES.find((c) => c.label === category) ||
  null;

export const colorForCategory = (category) =>
  categoryInfo(category)?.color || "#854f0b";

// Adult categories apply to age 18+. Returns true only when we KNOW the person
// is 18 or older. Unknown/invalid age -> false (caller decides what to show).
export const isAdultAge = (age) => {
  if (age == null || isNaN(Number(age))) return false;
  return Number(age) >= 18;
};

// A short, non-judgmental, non-diagnostic interpretation + limitations note.
export const BMI_INTERPRETATION =
  "BMI is a general screening number, not a verdict on your fitness. It's a quick way to see where your weight-to-height ratio sits against a population reference.";

export const BMI_LIMITATIONS =
  "BMI does not directly measure strength, body fat, muscle mass, body composition, fat distribution, athletic ability or overall fitness. Athletes and very muscular people often read as \"overweight\" despite being lean.";

// Shown when we can't apply an adult category (age unknown/under 18 or bad data).
export const BMI_NEUTRAL_NOTE =
  "Adult BMI categories apply from age 18. We're showing your number without a category — treat it as general context only.";

// Non-medical scope (documented, not shown in the UI by product decision):
// VisionFIT only checks the BMI number computed from the user's height & weight
// against the standard adult categories above. It is NOT a diagnosis, a health-
// risk prediction, or any kind of medical output.
//
// Academic basis for using the standard adult categories (reference only — we
// cite this to ground WHY these cut-offs are used, not to produce medical output):
//   Visaria A, Setoguchi S. "Body mass index and all-cause mortality in a 21st
//   century U.S. population: A National Health Interview Survey analysis."
//   PLOS ONE, 2023.
//   https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0287218
