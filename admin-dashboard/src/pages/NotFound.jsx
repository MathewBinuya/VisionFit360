import { Link, useLocation } from "react-router-dom";
import Sidebar from "../components/Sidebar";

// Custom 404. Signed-in admins see it inside the normal app shell (sidebar +
// main) so they never lose their navigation; signed-out visitors get a centered
// card that mirrors the login screen. Auth here is the same localStorage UI hint
// the route guard uses — the real gate stays server-side.
export default function NotFound() {
  const { pathname } = useLocation();
  const authed = !!localStorage.getItem("adminCsrf");

  const body = (
    <div className="notfound">
      <div className="notfound-code" aria-hidden="true">404</div>
      <h1 className="notfound-title">Page not found</h1>
      <p className="notfound-text">
        We couldn't find <code className="notfound-path">{pathname}</code>. It may have been
        moved, or the link is incorrect.
      </p>
      <div className="notfound-actions">
        {authed ? (
          <>
            <Link to="/dashboard" className="btn-small">Back to dashboard</Link>
            <Link to="/users" className="btn-ghost">View users</Link>
          </>
        ) : (
          <Link to="/login" className="btn-small">Go to login</Link>
        )}
      </div>
    </div>
  );

  if (authed) {
    return (
      <div className="layout">
        <Sidebar />
        <div className="main">{body}</div>
      </div>
    );
  }

  return (
    <div className="login-wrap">
      <div className="login-card notfound-card">{body}</div>
    </div>
  );
}
