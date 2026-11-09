import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { RatingStars, Avatar, StateBlock, Pagination, TableScroll } from "../components/ui";
import api from "../lib/api";
import {
  relativeTime, dateTime, shortDate, bmiInfo, exerciseLabel, displayName, accountStatus,
  ageFromDob, birthDate,
} from "../lib/format";

const GOAL_LABELS = {
  get_fit: "Get fit",
  maintain_weight: "Maintain weight",
  get_lean: "Get lean",
};

const WORKOUTS_PER_PAGE = 10;

function Row({ label, value }) {
  return (
    <div className="info-row">
      <span>{label}</span>
      <span>{value ?? "Not specified"}</span>
    </div>
  );
}

export default function UserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [woPage, setWoPage] = useState(1); // workout history page
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(() => {
    api
      .get(`/users/${id}`)
      .then((res) => { setData(res.data); setError(""); })
      .catch((err) => setError(err.response?.data?.message || "Failed to load user"))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // permanently removes the account and everything tied to it (workouts,
  // feedback, login events) via the backend's cascade delete.
  const handleDelete = useCallback(() => {
    const u = data?.user;
    const who = u ? (displayName(u) + (u.email ? ` (${u.email})` : "")) : "this user";
    if (!window.confirm(`Permanently delete ${who} and all their data? This cannot be undone.`)) return;
    setDeleting(true);
    api
      .delete(`/users/${id}`)
      .then(() => navigate("/users"))
      .catch((err) => {
        setError(err.response?.data?.message || "Failed to delete user");
        setDeleting(false);
      });
  }, [data, id, navigate]);

  const u = data?.user;
  const bmi = u ? bmiInfo(u.heightCm, u.weightKg) : null;
  const st = u ? accountStatus(u) : null;

  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <button className="btn-ghost" style={{ marginBottom: 16 }} onClick={() => navigate("/users")}>
          ← Back to Users
        </button>
        <h1 className="page-title">User Account</h1>

        <StateBlock loading={loading && !data} error={error}>
          {u && (
            <>
              <div className="card profile-header">
                <Avatar user={u} size={64} />
                <div className="profile-id">
                  <div className="profile-name">{displayName(u)}</div>
                  <div className="muted">@{u.username}</div>
                </div>
                <div className="profile-badges">
                  <span className={`badge ${st.className}`}>{st.label}</span>
                  {u.goal && <span className="badge badge-neutral">{GOAL_LABELS[u.goal] || u.goal}</span>}
                  <button className="btn-danger" onClick={handleDelete} disabled={deleting}>
                    {deleting ? "Deleting…" : "Delete user"}
                  </button>
                </div>
              </div>

              <div className="detail-grid">
                <div className="card">
                  <h3 className="card-title">Account &amp; activity</h3>
                  <Row label="Username" value={u.username ? `@${u.username}` : null} />
                  <Row label="Full name" value={[u.firstName, u.middleName, u.lastName].filter(Boolean).join(" ") || null} />
                  <Row label="Email" value={u.email} />
                  <Row label="Status" value={<span className={`badge ${st.className}`}>{st.label}</span>} />
                  <Row label="Last login" value={u.lastLoginAt ? relativeTime(u.lastLoginAt) : "Never"} />
                  <Row label="Last active" value={u.lastActiveAt ? relativeTime(u.lastActiveAt) : "Never"} />
                  <Row label="Joined" value={dateTime(u.createdAt)} />
                  <Row label="Goal" value={GOAL_LABELS[u.goal] || null} />
                </div>

                <div className="card">
                  <h3 className="card-title">Body &amp; demographics</h3>
                  <Row label="Gender" value={u.gender ? u.gender.charAt(0).toUpperCase() + u.gender.slice(1) : null} />
                  <Row label="Birth date" value={u.dateOfBirth ? birthDate(u.dateOfBirth) : null} />
                  <Row label="Age" value={ageFromDob(u.dateOfBirth)} />
                  <Row label="Height" value={u.heightCm ? `${u.heightCm} cm` : null} />
                  <Row label="Weight" value={u.weightKg ? `${u.weightKg} kg` : null} />
                  <Row label="BMI" value={bmi ? `${bmi.bmi} (${bmi.category})` : null} />
                </div>
              </div>

              <div className="card">
                <h3 className="card-title">Workout history ({data.workouts.length})</h3>
                <StateBlock empty={data.workouts.length === 0} emptyText="No workout history found.">
                  <TableScroll>
                    <table className="rows">
                      <thead>
                        <tr>
                          <th>Title</th>
                          <th>Exercises</th>
                          <th className="col-center">Completed</th>
                          <th className="col-right">Date</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.workouts
                          .slice((woPage - 1) * WORKOUTS_PER_PAGE, woPage * WORKOUTS_PER_PAGE)
                          .map((w) => (
                            <tr key={w._id}>
                              <td>{w.title || "—"}</td>
                              <td className="muted">
                                {(w.exercises || []).map((e) => exerciseLabel(e.name)).join(", ") || "—"}
                              </td>
                              <td className="col-center">{w.completed ? "Yes" : "No"}</td>
                              <td className="muted col-right">{shortDate(w.createdAt)}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </TableScroll>
                  <Pagination
                    page={woPage}
                    totalPages={Math.max(1, Math.ceil(data.workouts.length / WORKOUTS_PER_PAGE))}
                    total={data.workouts.length}
                    label="workouts"
                    onPage={setWoPage}
                  />
                </StateBlock>
              </div>

              <div className="card">
                <h3 className="card-title">Feedback ({data.feedback?.length || 0})</h3>
                <StateBlock empty={!data.feedback?.length} emptyText="No feedback from this user.">
                  <ul className="feedback-list">
                    {data.feedback?.map((f) => (
                      <li key={f._id} className="feedback-item">
                        <div className="feedback-item-head">
                          <RatingStars value={f.rating} />
                          <span className="person-time">{relativeTime(f.createdAt)}</span>
                        </div>
                        {f.comment ? <p className="feedback-comment">{f.comment}</p> : null}
                      </li>
                    ))}
                  </ul>
                </StateBlock>
              </div>
            </>
          )}
        </StateBlock>
      </div>
    </div>
  );
}
