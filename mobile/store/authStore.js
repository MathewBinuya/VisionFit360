import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { API_URL } from "../lib/api";
import { getGoogleIdToken } from "../lib/google";
import { ensureInboxOwner, resetInbox, clearInboxOwner } from "../lib/notifInbox";

// expo-notifications is called directly here (not via lib/notifications) because
// that module imports the axios instance, which imports this store — importing it
// would create a cycle. This store only needs the one cancel call.
const cancelScheduled = async () => {
  try { await Notifications.cancelAllScheduledNotificationsAsync(); } catch (_e) {}
};

// Keep the in-app notification feed isolated per account on a shared device: when
// the signed-in account changes, clear the feed and drop any OS reminders queued
// for the previous account (they reschedule for the new one from the dashboard).
const isolateNotificationsFor = async (userId) => {
  try {
    if (await ensureInboxOwner(userId)) await cancelScheduled();
  } catch (_e) {}
};


export const useAuthStore = create((set) => ({
  user: null,
  token: null,
  isLoading: false,
  isCheckingAuth: true,

  register: async (email, password) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Something went wrong");

      // no token/user yet — account isn't verified until verifyEmail succeeds
      set({ isLoading: false });

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: error.message };
    }
  },

  verifyEmail: async (email, verificationCode) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`${API_URL}/auth/verify-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          verificationCode,
        }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Something went wrong");

      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      await AsyncStorage.setItem("token", data.token);
      await isolateNotificationsFor(data.user?.id);

      set({ token: data.token, user: data.user, isLoading: false });

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: error.message };
    }
  },

  resendVerificationCode: async (email) => {
    try {
      const response = await fetch(`${API_URL}/auth/resend-verification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Something went wrong");

      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  },

  login: async (email, password) => {
    set({ isLoading: true });

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        set({ isLoading: false });
        // 403 = correct password but email not verified yet. Surface it so the
        // login screen can send the user straight to the verification step.
        return {
          success: false,
          error: data.message || "Something went wrong",
          needsVerification: response.status === 403,
          email: data.email,
        };
      }

      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      await AsyncStorage.setItem("token", data.token);
      await isolateNotificationsFor(data.user?.id);

      set({ token: data.token, user: data.user, isLoading: false });

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: error.message };
    }
  },

  googleLogin: async () => {
    set({ isLoading: true });
    try {
      const { idToken, cancelled } = await getGoogleIdToken();
      if (cancelled) {
        set({ isLoading: false });
        return { success: false, cancelled: true };
      }

      const response = await fetch(`${API_URL}/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      const data = await response.json();

      if (!response.ok) throw new Error(data.message || "Google sign-in failed");

      await AsyncStorage.setItem("user", JSON.stringify(data.user));
      await AsyncStorage.setItem("token", data.token);
      await isolateNotificationsFor(data.user?.id);

      set({ token: data.token, user: data.user, isLoading: false });

      return { success: true };
    } catch (error) {
      set({ isLoading: false });
      return { success: false, error: error.message };
    }
  },

  checkAuth: async () => {
    try {
      const token = await AsyncStorage.getItem("token");
      const userJson = await AsyncStorage.getItem("user");
      const user = userJson ? JSON.parse(userJson) : null;

      // restoring a saved session: reconcile the feed owner (no-op for the same
      // account; resets it if a different account's data somehow lingers).
      if (user) await isolateNotificationsFor(user?.id);

      set({ token, user });
    } catch (error) {
      console.log("Auth check failed", error);
    } finally {
      set({ isCheckingAuth: false });
    }
  },

  completeOnboarding: async () => {
    const current = useAuthStore.getState().user;
    const updated = { ...current, onBoardingComplete: true };   
    await AsyncStorage.setItem("user", JSON.stringify(updated));
    set({ user: updated });
  },

  setUser: async (updatedUser) => {
    await AsyncStorage.setItem("user", JSON.stringify(updatedUser));
    set({ user: updatedUser });
  },

  logout: async () => {
    await AsyncStorage.removeItem("token");
    await AsyncStorage.removeItem("user");
    // leave no trace of this account's notifications for the next sign-in
    try { await resetInbox(); await clearInboxOwner(); await cancelScheduled(); } catch (_e) {}
    set({ token: null, user: null });
  },
}));