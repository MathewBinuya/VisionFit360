import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { Section, StateBlock, Avatar, Pagination, TableScroll } from "../components/ui";
import api from "../lib/api";
import { exerciseLabel, relativeTime, displayName } from "../lib/format";

const PAGE_SIZE = 10;        // exercise list
const USER_PAGE_SIZE = 5;    // users within an exercise (drill-down table)

const EX_SORTS = {
  most: { label: "Most users", fn: (a, b) => b.userCount - a.userCount || b.sessions - a.sessions },
  least: { label: "Least users", fn: (a, b) => a.userCount - b.userCount || a.sessions - b.sessions },
  name_az: { label: "Name A–Z", fn: (a, b) => exerciseLabel(a.exercise).localeCompare(exerciseLabel(b.exercise)) },
  name_za: { label: "Name Z–A", fn: (a, b) => exerciseLabel(b.exercise).localeCompare(exerciseLabel(a.exercise)) },
};

export default function UsersPerExercise() {
  const navigate = useNavigate();

  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState("");

  const [exSort, setExSort] = useState("most");
  const [exSearch, setExSearch] = useState(""); // filter the exercise list
  const [exPage, setExPage] = useState(1);       // paginate the exercise list
  const [selected, setSelected] = useState(null); // exercise key
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const sortedUsage = useMemo(() => {
    if (!usage) return [];
    const q = exSearch.trim().toLowerCase();
    const list = q
      ? usage.filter((e) => exerciseLabel(e.exercise).toLowerCase().includes(q))
      : usage;
    return [...list].sort(EX_SORTS[exSort].fn);
  }, [usage, exSort, exSearch]);

  const exTotalPages = Math.max(1, Math.ceil(sortedUsage.length / PAGE_SIZE));
  const pagedUsage = useMemo(
    () => sortedUsage.slice((exPage - 1) * PAGE_SIZE, exPage * PAGE_SIZE),
    [sortedUsage, exPage]
  );

  // scale for the inline usage bars (proportional to the busiest exercise)
  const maxUsers = useMemo(
    () => (usage || []).reduce((m, e) => Math.max(m, e.userCount), 0) || 1,
    [usage]
  );

  const [detail, setDetail] = useState(null); // { users, total, page }
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  // load exercise cards
  useEffect(() => {
    api
      .get("/exercise-usage")
      .then((res) => { setUsage(res.data); setUsageError(""); })
      .catch((err) => setUsageError(err.response?.data?.message || "Failed to load exercises"));
  }, []);

  const loadDetail = useCallback((exercise, pageNum, searchTerm) => {
    setDetailLoading(true);
    api
      .get(`/exercise-usage/${encodeURIComponent(exercise)}/users`, {
        params: { page: pageNum, limit: USER_PAGE_SIZE, search: searchTerm || undefined },
      })
      .then((res) => { setDetail(res.data); setDetailError(""); })
      .catch((err) => setDetailError(err.response?.data?.message || "Failed to load users"))
      .finally(() => setDetailLoading(false));
  }, []);

  // debounce search / react to page + selection changes
  const firstRun = useRef(true);
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => loadDetail(selected, page, search), firstRun.current ? 0 : 250);
    firstRun.current = false;
    return () => clearTimeout(t);
  }, [selected, page, search, loadDetail]);

  const openExercise = (exercise) => {
    firstRun.current = true;
    setSearch("");
    setPage(1);
    setDetail(null);
    setSelected(exercise);
  };

  const closeDetail = () => { setSelected(null); setDetail(null); };

  const totalPages = detail ? Math.max(1, Math.ceil(detail.total / USER_PAGE_SIZE)) : 1;

  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <h1 className="page-title">Users per Exercise</h1>

        {!selected ? (
          <Section
            title="Exercises"
            subtitle="Select an exercise to see the users who have done it"
            actions={
              usage && usage.length > 0 ? (
                <select className="select" value={exSort} onChange={(e) => { setExPage(1); setExSort(e.target.value); }}>
                  {Object.entries(EX_SORTS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              ) : null
            }
          >
            {usage && usage.length > 0 && (
              <div className="toolbar">
                <input
                  className="search-input"
                  placeholder="Filter exercises…"
                  value={exSearch}
                  onChange={(e) => { setExPage(1); setExSearch(e.target.value); }}
                />
              </div>
            )}
            <StateBlock
              loading={!usage && !usageError}
              error={usageError}
              empty={usage && usage.length === 0}
              emptyText="No workout records yet."
            >
              {sortedUsage.length === 0 ? (
                <div className="state state-empty">No exercises match your filter.</div>
              ) : (
                <>
                  <div className="ex-usage">
                    <div className="ex-usage-head">
                      <span>Exercise</span>
                      <span className="ex-usage-head-spacer" aria-hidden="true" />
                      <span className="ex-usage-metric">Users</span>
                      <span className="ex-usage-metric">Sessions</span>
                    </div>
                    {pagedUsage.map((e) => (
                      <button
                        key={e.exercise}
                        className="ex-usage-row"
                        onClick={() => openExercise(e.exercise)}
                      >
                        <span className="ex-usage-name">{exerciseLabel(e.exercise)}</span>
                        <span className="ex-usage-bar" aria-hidden="true">
                          <span
                            className="ex-usage-fill"
                            style={{ width: `${(e.userCount / maxUsers) * 100}%` }}
                          />
                        </span>
                        <span className="ex-usage-metric ex-usage-users">{e.userCount}</span>
                        <span className="ex-usage-metric ex-usage-sessions">{e.sessions}</span>
                      </button>
                    ))}
                  </div>
                  <Pagination
                    page={exPage}
                    totalPages={exTotalPages}
                    total={sortedUsage.length}
                    label="exercises"
                    onPage={setExPage}
                  />
                </>
              )}
            </StateBlock>
          </Section>
        ) : (
          <Section
            title={exerciseLabel(selected)}
            subtitle={detail ? `${detail.total} ${detail.total === 1 ? "user" : "users"}` : "Loading…"}
            actions={
              <button className="btn-ghost" onClick={closeDetail}>← All exercises</button>
            }
          >
            <div className="toolbar">
              <input
                className="search-input"
                placeholder="Search by name, username or email…"
                value={search}
                onChange={(e) => { setPage(1); setSearch(e.target.value); }}
              />
            </div>

            <div className="card">
              <StateBlock
                loading={detailLoading && !detail}
                error={detailError}
                empty={detail && detail.users.length === 0}
                emptyText={search ? "No users match your search." : "No users for this exercise."}
              >
                <TableScroll>
                  <table className="rows">
                    <thead>
                      <tr>
                        <th>User</th>
                        <th>Email</th>
                        <th className="col-right">Sessions</th>
                        <th className="col-right">Last used</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail?.users.map((u) => (
                        <tr key={u.userId} className="clickable" onClick={() => navigate(`/users/${u.userId}`)}>
                          <td><span className="user-cell"><Avatar user={u} /> {displayName(u)}</span></td>
                          <td className="muted">{u.email || "—"}</td>
                          <td className="col-right">{u.sessions}</td>
                          <td className="muted col-right">{relativeTime(u.lastUsed)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </TableScroll>

                {detail && (
                  <Pagination
                    page={page}
                    totalPages={totalPages}
                    total={detail.total}
                    label="users"
                    onPage={setPage}
                  />
                )}
              </StateBlock>
            </div>
          </Section>
        )}
      </div>
    </div>
  );
}
