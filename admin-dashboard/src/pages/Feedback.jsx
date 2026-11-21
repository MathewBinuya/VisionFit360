import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar";
import { Avatar, RatingStars, StateBlock, Pagination, TableScroll } from "../components/ui";
import api from "../lib/api";
import { relativeTime, dateTime, displayName } from "../lib/format";

// 5 per page so the Prev/Next pager appears without needing a large volume of
// reviews (the shared Pagination component only shows arrows past one page).
const PAGE_SIZE = 5;

// Date-range + sort options (filtering/sorting happens server-side, in the query).
// "Today / This Week / This Month" are computed in Asia/Manila by the backend.
const RANGES = [
  { key: "all", label: "All time" },
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
];

// Star-rating tabs: All + 5★…1★.
const RATING_TABS = ["all", 5, 4, 3, 2, 1];
const ratingLabel = (r) => (r === "all" ? "All" : `${r}★`);

export default function Feedback() {
  const navigate = useNavigate();
  const [resp, setResp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [rating, setRating] = useState("all");   // "all" | 5 | 4 | 3 | 2 | 1
  const [range, setRange] = useState("all");      // all | today | week | month
  const [sort, setSort] = useState("newest");     // newest | oldest
  const [page, setPage] = useState(1);

  const load = useCallback((params) => {
    setLoading(true);
    api
      .get("/feedback", { params })
      .then((res) => { setResp(res.data); setError(""); })
      .catch((err) => setError(err.response?.data?.message || "Failed to load feedback"))
      .finally(() => setLoading(false));
  }, []);

  // React to any filter/sort/page change. First load fires immediately.
  const first = useRef(true);
  useEffect(() => {
    const params = {
      page,
      limit: PAGE_SIZE,
      sort,
      range: range === "all" ? undefined : range,
      rating: rating === "all" ? undefined : rating,
    };
    load(params);
    first.current = false;
  }, [page, sort, range, rating, load]);

  const items = resp?.data || [];
  const counts = resp?.counts || {};
  const filtersActive = range !== "all" || rating !== "all";

  return (
    <div className="layout">
      <Sidebar />
      <div className="main">
        <h1 className="page-title">Feedback</h1>
        <p className="page-sub" style={{ marginBottom: 20 }}>
          User-submitted feedback from the mobile app. Filter by date and star rating.
        </p>

        {/* star-rating tabs (counts reflect the active date filter) */}
        <div className="seg-tabs" role="tablist" aria-label="Filter by rating">
          {RATING_TABS.map((r) => (
            <button
              key={r}
              role="tab"
              aria-selected={rating === r}
              className={rating === r ? "active" : ""}
              onClick={() => { setPage(1); setRating(r); }}
            >
              {ratingLabel(r)}
              <span className="seg-count">({counts[r] ?? 0})</span>
            </button>
          ))}
        </div>

        {/* date range + sort (server-side) */}
        <div className="toolbar">
          <select
            className="select"
            value={range}
            onChange={(e) => { setPage(1); setRange(e.target.value); }}
            aria-label="Date range"
          >
            {RANGES.map((r) => (
              <option key={r.key} value={r.key}>{r.label}</option>
            ))}
          </select>
          <select
            className="select"
            value={sort}
            onChange={(e) => { setPage(1); setSort(e.target.value); }}
            aria-label="Sort by date"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </div>

        <div className="card">
          <StateBlock
            loading={loading && !resp}
            error={error}
            empty={resp && items.length === 0}
            emptyText={filtersActive ? "No reviews found for this filter." : "No feedback submitted yet."}
          >
            <TableScroll>
              <table className="rows">
                <thead>
                  <tr>
                    <th>User</th>
                    <th className="col-center">Rating</th>
                    <th>Message</th>
                    <th className="col-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((f) => (
                    <tr
                      key={f._id}
                      className={f.user ? "clickable" : ""}
                      onClick={() => f.user && navigate(`/users/${f.user._id}`)}
                    >
                      <td>
                        <span className="user-cell">
                          <Avatar user={f.user} /> {displayName(f.user)}
                        </span>
                      </td>
                      <td className="col-center"><RatingStars value={f.rating} /></td>
                      <td className="muted feedback-message">{f.comment ? f.comment : "—"}</td>
                      <td className="muted col-right" title={dateTime(f.createdAt)}>
                        {relativeTime(f.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableScroll>
          </StateBlock>
          {resp && items.length > 0 && (
            <Pagination
              page={resp.page}
              totalPages={resp.totalPages}
              total={resp.total}
              label="feedback"
              onPage={setPage}
            />
          )}
        </div>
      </div>
    </div>
  );
}
