import { create } from "zustand";
import { API_URL } from "../lib/api";

// Tracks whether the backend is in maintenance mode so the app can show a
// full-screen "down for maintenance" page instead of raw errors.
//
// `check()` uses fetch directly (not the axios instance) on purpose: the axios
// interceptor imports this store, so importing axios back here would create a
// cycle. It also keeps the check independent of auth tokens.
const DEFAULT_MESSAGE = "We're doing some quick maintenance. Please check back shortly.";

export const useMaintenanceStore = create((set) => ({
  active: false,
  message: "",

  // Called by the axios interceptor when any API call returns a 503 maintenance
  // response, so maintenance that starts mid-session flips the screen on.
  trigger: (message) => set({ active: true, message: message || DEFAULT_MESSAGE }),

  // Ask the backend directly. Used on app startup and by the "Try again" button.
  // Fails open (active:false) so a network blip never traps the user on the page.
  check: async () => {
    try {
      const res = await fetch(`${API_URL}/maintenance`, { method: "GET" });
      const data = await res.json();
      set({ active: !!data?.maintenance, message: data?.message || DEFAULT_MESSAGE });
      return !!data?.maintenance;
    } catch {
      set({ active: false });
      return false;
    }
  },
}));
