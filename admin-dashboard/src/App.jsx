import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Users from "./pages/Users";
import UsersPerExercise from "./pages/UsersPerExercise";
import UserDetail from "./pages/UserDetail";
import Feedback from "./pages/Feedback";
import Analytics from "./pages/Analytics";
import Security from "./pages/Security";
import "./App.css";

// The real gate is the server's httpOnly cookie; this localStorage hint only
// decides what to show first so we don't flash the app before login. A stale
// hint is harmless — the first API call returns 401 and the axios interceptor
// redirects to /login.
const isAuthed = () => !!localStorage.getItem("adminCsrf");

function Protected({ children }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to={isAuthed() ? "/dashboard" : "/login"} replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/users" element={<Protected><Users /></Protected>} />
        <Route path="/users-per-exercise" element={<Protected><UsersPerExercise /></Protected>} />
        <Route path="/users/:id" element={<Protected><UserDetail /></Protected>} />
        <Route path="/feedback" element={<Protected><Feedback /></Protected>} />
        <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
        <Route path="/security" element={<Protected><Security /></Protected>} />
        {/* Unknown path: send authed users into the app, everyone else to login. */}
        <Route path="*" element={<Navigate to={isAuthed() ? "/dashboard" : "/login"} replace />} />
      </Routes>
    </BrowserRouter>
  );
}