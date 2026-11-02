import Workout from "../models/workout.model.js";
import { canonicalExerciseName } from "./exerciseCatalog.js";

// All analytics are DERIVED from completed Workout documents — nothing is stored.
// Weeks run Monday–Sunday in Asia/Manila (UTC+8, no DST), matching the app's
// notification timezone.
export const TIMEZONE = "Asia/Manila";
const MANILA_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const manilaDayIndex = (d) => Math.floor((new Date(d).getTime() + MANILA_OFFSET_MS) / DAY_MS);
const weekStartDay = (d) => {
  const day = manilaDayIndex(d);
  const weekday = new Date(day * DAY_MS).getUTCDay(); // 0 = Sunday
  return day - ((weekday + 6) % 7);
};
const dayToISODate = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);

const whenOf = (w) => new Date(w.completedAt || w.date || w.createdAt);

// Which sets of a workout count toward progress. A workout logged with the
// per-set checkboxes has at least one set flagged completed — for those we count
// ONLY the finished sets (the rest of the program is kept in history but doesn't
// count). Older workouts (completed before checkboxes existed) have no finished
// flags at all, so we count every set, exactly as before — existing history,
// volume and PRs never change.
const setCounts = (w) =>
  (w.exercises || []).some((ex) => (ex.sets || []).some((s) => s.completed))
    ? (s) => !!s.completed
    : () => true;

// Σ reps × weightKg over the counted sets (see setCounts).
export const workoutVolume = (w) => {
  const counts = setCounts(w);
  return (w.exercises || []).reduce(
    (sum, ex) => sum + (ex.sets || []).reduce((s, set) => s + (counts(set) ? (set.reps || 0) * (set.weightKg || 0) : 0), 0),
    0
  );
};

const round1 = (n) => Math.round(n * 10) / 10;
const pctChange = (cur, prev) => (prev > 0 ? round1(((cur - prev) / prev) * 100) : null);
const exerciseKey = (name) => String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "");

const buildWeeks = (workouts, weeks, now) => {
  const current = weekStartDay(now);
  const series = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const start = current - 7 * i;
    series.push({ start, weekStart: dayToISODate(start), weekEnd: dayToISODate(start + 6), volume: 0, workouts: 0 });
  }
  const byStart = new Map(series.map((s) => [s.start, s]));
  for (const w of workouts) {
    const bucket = byStart.get(weekStartDay(whenOf(w)));
    if (!bucket) continue;
    bucket.volume += workoutVolume(w);
    bucket.workouts += 1;
  }
  return series.map(({ start, ...rest }) => ({ ...rest, volume: Math.round(rest.volume) }));
};

// Per-exercise heaviest weight, with the PR timeline. Only sets with reps > 0
// and weightKg > 0 count as a lift (bodyweight / AR sessions are weight 0).
const buildRecords = (workouts) => {
  const map = new Map();
  const sorted = [...workouts].sort((a, b) => whenOf(a) - whenOf(b));

  for (const w of sorted) {
    const date = whenOf(w);
    const counts = setCounts(w); // only finished sets count (legacy: all sets)
    const perSession = new Map();
    for (const ex of w.exercises || []) {
      const key = exerciseKey(ex.name);
      if (!key) continue;
      for (const s of ex.sets || []) {
        if (!counts(s)) continue;
        if (!(s.reps > 0 && s.weightKg > 0)) continue;
        const cur = perSession.get(key);
        if (!cur || s.weightKg > cur.topKg || (s.weightKg === cur.topKg && s.reps > cur.topReps)) {
          perSession.set(key, { name: ex.name, topKg: s.weightKg, topReps: s.reps });
        }
      }
    }

    for (const [key, sess] of perSession) {
      let rec = map.get(key);
      if (!rec) {
        rec = { exercise: canonicalExerciseName(sess.name) || sess.name.trim(), bestKg: 0, bestDate: null, previousBestKg: null, sessions: [], prs: [] };
        map.set(key, rec);
      }
      rec.sessions.push({ date, topKg: sess.topKg, topReps: sess.topReps });
      if (sess.topKg > rec.bestKg) {
        if (rec.bestKg > 0) {
          rec.prs.push({ exercise: rec.exercise, weightKg: sess.topKg, previousBestKg: rec.bestKg, improvementKg: round1(sess.topKg - rec.bestKg), date });
          rec.previousBestKg = rec.bestKg;
        }
        rec.bestKg = sess.topKg;
        rec.bestDate = date;
      }
    }
  }
  return [...map.values()];
};

// Completed workouts per Manila calendar day for the activity grid: 53 Monday-start
// weeks ending today. `days` is sparse — only days with at least one workout.
const CALENDAR_WEEKS = 53;
const buildCalendar = (workouts, now) => {
  const today = manilaDayIndex(now);
  const start = weekStartDay(now) - (CALENDAR_WEEKS - 1) * 7;
  const days = {};
  for (const w of workouts) {
    const day = manilaDayIndex(whenOf(w));
    if (day < start || day > today) continue;
    const key = dayToISODate(day);
    days[key] = (days[key] || 0) + 1;
  }

  const active = Object.keys(days).length;
  let currentDayStreak = 0;
  for (let d = days[dayToISODate(today)] ? today : today - 1; days[dayToISODate(d)]; d--) currentDayStreak++;
  let longestDayStreak = 0;
  let run = 0;
  for (let d = start; d <= today; d++) {
    run = days[dayToISODate(d)] ? run + 1 : 0;
    longestDayStreak = Math.max(longestDayStreak, run);
  }

  return {
    start: dayToISODate(start),
    end: dayToISODate(today),
    days,
    activeDays: active,
    totalWorkouts: Object.values(days).reduce((a, b) => a + b, 0),
    currentDayStreak,
    longestDayStreak,
  };
};

const buildInsights = ({ weeks, summary, records, now }) => {
  const insights = [];
  if (!summary.totalWorkouts) return insights;

  const n = weeks.length;
  const thisWeek = weeks[n - 1];
  const lastWeek = weeks[n - 2];
  const weekBefore = weeks[n - 3];

  // Volume trend — judged on COMPLETED weeks so a Monday doesn't read as a "drop".
  if (thisWeek && lastWeek && lastWeek.volume > 0 && thisWeek.volume > lastWeek.volume) {
    insights.push({ type: "volume_up", tone: "positive", message: "You've already lifted more total volume this week than last week. Progressive overload is moving in the right direction." });
  } else if (lastWeek && weekBefore && lastWeek.volume > 0 && weekBefore.volume > 0) {
    const pct = pctChange(lastWeek.volume, weekBefore.volume);
    if (pct > 30) {
      insights.push({ type: "volume_up", tone: "positive", message: `Your training volume jumped ${pct}% last week. Great work — make sure your recovery and form keep up with the extra load.` });
    } else if (pct >= 5) {
      insights.push({ type: "volume_up", tone: "positive", message: `Your training volume increased ${pct}% last week. Good progress.` });
    } else if (pct <= -25) {
      insights.push({ type: "volume_down", tone: "caution", message: `Your training volume decreased ${Math.abs(pct)}% last week. Recovery may be useful, but check whether you're still following your planned routine.` });
    } else {
      insights.push({ type: "volume_steady", tone: "neutral", message: "Your weekly volume has been steady. Consistency is the foundation of progress." });
    }
  }

  // Plateau: same top weight AND reps over the last 3 sessions, all within ~5 weeks.
  const cutoff = now.getTime() - 35 * DAY_MS;
  const plateaus = records
    .filter((r) => r.sessions.length >= 3)
    .filter((r) => {
      const last3 = r.sessions.slice(-3);
      return last3[0].date.getTime() >= cutoff && last3.every((s) => s.topKg === last3[0].topKg && s.topReps === last3[0].topReps);
    })
    .slice(0, 2);
  for (const r of plateaus) {
    const s = r.sessions[r.sessions.length - 1];
    insights.push({
      type: "plateau",
      tone: "neutral",
      message: `Your recent ${r.exercise} sessions have been consistent at ${s.topKg} kg × ${s.topReps}. If your form feels solid, consider a small increase — about 1–2.5 kg or 1–2 more reps.`,
    });
  }

  if (summary.weekStreak >= 3) {
    insights.push({ type: "streak", tone: "positive", message: `You've trained ${summary.weekStreak} weeks in a row. That consistency is what builds results.` });
  }
  if (summary.daysSinceLastWorkout != null && summary.daysSinceLastWorkout >= 5) {
    insights.push({ type: "inactive", tone: "caution", message: "You haven't logged a workout in a few days. A short session today can help keep your routine going." });
  }
  return insights;
};

export const computeAnalytics = (workouts, { weeks = 8, now = new Date(), pendingWorkouts = 0 } = {}) => {
  // need at least 6 weeks internally for the 4-full-week average + comparisons
  const span = Math.max(weeks, 6);
  const allWeeks = buildWeeks(workouts, span, now);
  const n = allWeeks.length;
  const thisWeek = allWeeks[n - 1];
  const lastWeek = allWeeks[n - 2];

  let weekStreak = 0;
  for (let i = thisWeek.workouts > 0 ? n - 1 : n - 2; i >= 0 && allWeeks[i].workouts > 0; i--) weekStreak++;

  const fullWeeks = allWeeks.slice(n - 5, n - 1);
  const avgWorkoutsPerWeek = round1(fullWeeks.reduce((s, w) => s + w.workouts, 0) / fullWeeks.length);
  // Personal target from the user's own recent rhythm; 3/week when there's no history.
  const weeklyTarget = avgWorkoutsPerWeek > 0 ? Math.min(5, Math.max(2, Math.round(avgWorkoutsPerWeek))) : 3;

  const visible = allWeeks.slice(n - weeks);
  const mostActive = visible.reduce((best, w) => (w.workouts > 0 && (!best || w.workouts >= best.workouts) ? w : best), null);

  const lastWorkoutAt = workouts.length ? new Date(Math.max(...workouts.map((w) => whenOf(w).getTime()))) : null;

  const summary = {
    totalWorkouts: workouts.length,
    pendingWorkouts,
    thisWeek: { volume: thisWeek.volume, workouts: thisWeek.workouts },
    lastWeek: { volume: lastWeek.volume, workouts: lastWeek.workouts },
    volumeChangePct: pctChange(thisWeek.volume, lastWeek.volume),
    workoutsChange: thisWeek.workouts - lastWeek.workouts,
    mostActiveWeek: mostActive,
    activeWeeks: visible.filter((w) => w.workouts > 0).length,
    weekStreak,
    avgWorkoutsPerWeek,
    weeklyTarget,
    lastWorkoutAt,
    daysSinceLastWorkout: lastWorkoutAt ? manilaDayIndex(now) - manilaDayIndex(lastWorkoutAt) : null,
  };

  const records = buildRecords(workouts);
  const insights = buildInsights({ weeks: allWeeks, summary, records, now });
  const calendar = buildCalendar(workouts, now);

  const recentPRs = records
    .flatMap((r) => r.prs)
    .sort((a, b) => b.date - a.date)
    .slice(0, 5);

  const publicRecords = records
    .sort((a, b) => b.bestDate - a.bestDate)
    .slice(0, 20)
    .map((r) => ({
      exercise: r.exercise,
      bestKg: r.bestKg,
      bestDate: r.bestDate,
      previousBestKg: r.previousBestKg,
      improvementKg: r.previousBestKg != null ? round1(r.bestKg - r.previousBestKg) : null,
      sessions: r.sessions.length,
      history: r.sessions.slice(-12).map((s) => ({ date: s.date, topKg: s.topKg, topReps: s.topReps })),
    }));

  return {
    timezone: TIMEZONE,
    weekStartsOn: "monday",
    generatedAt: now,
    weeks: visible,
    summary,
    records: publicRecords,
    recentPRs,
    insights,
    calendar,
  };
};

export const getUserAnalytics = async (userId, opts = {}) => {
  const [workouts, pendingWorkouts] = await Promise.all([
    Workout.find({ user: userId, completed: true }).select("date completedAt createdAt exercises").lean(),
    Workout.countDocuments({ user: userId, completed: false }),
  ]);
  return computeAnalytics(workouts, { ...opts, pendingWorkouts });
};
