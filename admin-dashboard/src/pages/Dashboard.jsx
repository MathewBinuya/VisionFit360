import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { StateBlock, PresenceBadge, Avatar } from "../components/ui";
import { LineChart, BarChart } from "../components/Charts";
import api from "../lib/api";
import { exerciseLabel, relativeTime, displayName } from "../lib/format";

const PRESENCE_POLL_MS = 20000;  // how often the dashboard refreshes presence
const DASHBOARD_POLL_MS = 60000; // how often the rest of the numbers refresh
const EXERCISE_PREVIEW = 8;     // top-N exercises shown on the dashboard (full list lives on its own page)
const PEOPLE_PREVIEW = 8;

const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const NOT_SPECIFIED = "Not specified";
const GENDER_ORDER = ["male", "female"];
const BMI_ORDER = ["Underweight", "Normal", "Overweight", "Obese"];
const AGE_ORDER = ["Under 13", "13–17", "18–24", "25–34", "35–44", "45–54", "55–64", "65+"];

// turn a [{_id,count}] breakdown into ordered BarChart rows.
// Users with no data on file ("Not specified") are dropped from the view.
const toBars = (arr, order, labelFn = (x) => x) => {
  const map = new Map((arr || []).map((d) => [d._id, d.count]));
  const rows = order.filter((k) => map.has(k)).map((k) => ({ label: labelFn(k), value: map.get(k) }));
  for (const d of arr || []) {
    if (!order.includes(d._id) && d._id !== NOT_SPECIFIED) rows.push({ label: labelFn(d._id), value: d.count });
  }
  return rows;
};

// age bands with the share of users shown alongside the count (e.g. "12 · 40%")
const toAgeBars = (arr) => {
  const map = new Map((arr || []).map((d) => [d._id, d.count]));
  const total = (arr || []).reduce((sum, d) => sum + d.count, 0);
  return AGE_ORDER.filter((k) => map.has(k)).map((k) => ({
    label: k,
    value: map.get(k),
    sub: total ? `${Math.round((map.get(k) / total) * 100)}%` : "0%",
  }));
};

function Kpi({ label, value, hint }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value ?? "—"}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}

function Breakdown({ rows }) {
  if (!rows.length) return <div className="state state-empty">No data</div>;
  return <BarChart data={rows} />;
}

function Panel({ title, meta, action, children }) {
  return (
    <div className="card">
      <div className="panel-head">
        <h3 className="card-title">{title}</h3>
        {action || (meta && <span className="panel-meta">{meta}</span>)}
      </div>
      {children}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState(7);

  const [data, setData] = useState(null);
  const [dashLoading, setDashLoading] = useState(true);
  const [dashError, setDashError] = useState("");

  const [presence, setPresence] = useState(null);
  const [presError, setPresError] = useState("");

  const loadDashboard = useCallback((r) => {
    // loading spinner only matters on first load (data === null); on range change we
    // keep showing the current data to avoid flicker, so no synchronous setState here.
    api
      .get(`/dashboard?range=${r}`)
      .then((res) => { setData(res.data); setDashError(""); })
      .catch((err) => setDashError(err.response?.data?.message || "Failed to load dashboard"))
      .finally(() => setDashLoading(false));
  }, []);

  const loadPresence = useCallback(() => {
    api
      .get("/presence")
      .then((res) => { setPresence(res.data); setPresError(""); })
      .catch((err) => setPresError(err.response?.data?.message || "Failed to load presence"));
  }, []);

  useEffect(() => { loadDashboard(range); }, [range, loadDashboard]);

  // keep the numbers current while the tab is open; skip while it's hidden and
  // catch up as soon as the admin comes back to it
  useEffect(() => {
    const tick = () => { if (document.visibilityState === "visible") loadDashboard(range); };
    const id = setInterval(tick, DASHBOARD_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", tick); };
  }, [range, loadDashboard]);

  useEffect(() => {
    loadPresence();
    const id = setInterval(loadPresence, PRESENCE_POLL_MS);
    return () => clearInterval(id);
  }, [loadPresence]);

  const goUser = (id) => id && navigate(`/users/${id}`);

  const k = data?.kpis;
  const counts = presence?.counts;
  const activeList = (presence?.users || []).filter((u) => u.status === "active");
  const recentList = (presence?.users || []).filter((u) => u.status === "recently_active");
  const people = [...activeList, ...recentList].slice(0, PEOPLE_PREVIEW);

  const demo = data?.demographics || {};
  const body = demo.body;
  const exercisePreview = (data?.workouts?.exerciseUsage || []).slice(0, EXERCISE_PREVIEW);

  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <div className="page-head">
          <div>
            <h1 className="page-title">Overview</h1>
          </div>
          <div className="range-toggle" role="group" aria-label="Trend range">
            {[7, 30].map((r) => (
              <button key={r} className={range === r ? "active" : ""} onClick={() => setRange(r)}>
                {r} days
              </button>
            ))}
          </div>
        </div>

        <StateBlock loading={dashLoading && !data} error={dashError}>
          {/* key numbers */}
          <div className="kpi-strip">
            <Kpi label="Total users" value={k?.totalUsers} hint={`+${k?.newUsers ?? 0} in ${range} days`} />
            <Kpi label={`Active · ${k?.accountActiveDays ?? 7} days`} value={k?.activeAccounts} hint={`${k?.inactiveAccounts ?? 0} inactive`} />
            <Kpi label="Active now" value={counts?.active} hint="seen in last 2 min" />
            <Kpi label={`Sessions · ${range} days`} value={k?.sessionsInRange} hint={`completed · ${k?.totalSessions ?? 0} all time`} />
            <Kpi label="Avg rating" value={k?.avgRating || null} hint={`${k?.feedbackCount ?? 0} reviews`} />
          </div>

          {/* trends — titles link through to the full Analytics page */}
          <div className="grid-2">
            <Panel
              title={
                <span className="card-title-link" onClick={() => navigate("/analytics")} title="View in Analytics">
                  New users <span className="title-arrow">→</span>
                </span>
              }
              meta={`last ${range} days`}
            >
              <StateBlock empty={!data?.analytics?.newUsersTrend?.length} emptyText="No sign-ups in this range.">
                <LineChart data={data?.analytics?.newUsersTrend || []} />
              </StateBlock>
            </Panel>
            <Panel
              title={
                <span className="card-title-link" onClick={() => navigate("/analytics")} title="View in Analytics">
                  Completed sessions <span className="title-arrow">→</span>
                </span>
              }
              meta={`last ${range} days`}
            >
              <StateBlock empty={!data?.workouts?.usageTrend?.length} emptyText="No sessions in this range.">
                <LineChart data={data?.workouts?.usageTrend || []} />
              </StateBlock>
            </Panel>
          </div>

          {/* exercises + presence */}
          <div className="grid-2">
            <Panel
              title="Top exercises"
              action={<button className="link-btn" onClick={() => navigate("/users-per-exercise")}>View all →</button>}
            >
              <StateBlock empty={!exercisePreview.length} emptyText="No workout records yet.">
                <BarChart
                  data={exercisePreview.map((e) => ({
                    label: exerciseLabel(e.exercise),
                    value: e.userCount,
                    sub: `${e.sessions} sessions`,
                  }))}
                />
              </StateBlock>
            </Panel>

            <Panel title="Active & recently active" meta="refreshes every 20s">
              {presError && <div className="state state-error">{presError}</div>}
              <StateBlock loading={!presence && !presError} empty={!!presence && people.length === 0} emptyText="No one active recently.">
                <ul className="people">
                  {people.map((u) => (
                    <li key={u._id} className="person clickable" onClick={() => goUser(u._id)}>
                      <Avatar user={u} />
                      <span className="person-name">{displayName(u)}</span>
                      <PresenceBadge status={u.status} />
                      <span className="person-time">{relativeTime(u.lastActiveAt)}</span>
                    </li>
                  ))}
                </ul>
              </StateBlock>
            </Panel>
          </div>

          {/* demographics — one card per breakdown so each is easy to read */}
          <div className="section">
            <div className="section-head">
              <div>
                <div className="section-title">Demographics</div>
                <div className="section-subtitle">excludes users with no data on file</div>
              </div>
            </div>
            <div className="grid-3">
              <Panel title="Gender">
                <Breakdown rows={toBars(demo.gender, GENDER_ORDER, cap)} />
              </Panel>
              <Panel title="Age">
                <Breakdown rows={toAgeBars(demo.age)} />
              </Panel>
              <Panel title="BMI category">
                <Breakdown rows={toBars(demo.bmiCategories, BMI_ORDER)} />
              </Panel>
            </div>
            <Panel title="Body averages">
              <div className="inline-stats" style={{ marginTop: 0, paddingTop: 0, borderTop: "none" }}>
                <span>Avg height<strong>{body?.avgHeight ? `${Math.round(body.avgHeight)} cm` : "—"}</strong></span>
                <span>Avg weight<strong>{body?.avgWeight ? `${Math.round(body.avgWeight)} kg` : "—"}</strong></span>
                <span>Height on file<strong>{body?.withHeight ?? 0}</strong></span>
                <span>Weight on file<strong>{body?.withWeight ?? 0}</strong></span>
              </div>
            </Panel>
          </div>

          {/* recent logins */}
          <Panel
            title="Recent logins"
            action={<button className="link-btn" onClick={() => navigate("/users")}>All users →</button>}
          >
            <StateBlock empty={!data?.logins?.recent?.length} emptyText="No logins recorded yet.">
              <ul className="people">
                {data?.logins?.recent?.slice(0, PEOPLE_PREVIEW).map((ev) => (
                  <li key={ev._id} className="person clickable" onClick={() => goUser(ev.user?._id)}>
                    <Avatar user={ev.user} />
                    <span className="person-name">{displayName(ev.user)}</span>
                    <span className="person-time">{relativeTime(ev.createdAt)}</span>
                  </li>
                ))}
              </ul>
            </StateBlock>
          </Panel>
        </StateBlock>
      </div>
    </div>
  );
}
