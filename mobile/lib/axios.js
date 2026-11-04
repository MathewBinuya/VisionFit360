import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from "expo-router";
import { API_URL } from './api'
import { useAuthStore } from "../store/authStore";
import { useMaintenanceStore } from "../store/maintenanceStore";

const api = axios.create({ baseURL: API_URL });

// Automatically attach the token to every request
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If ANY request comes back 401, the stored token is no longer valid for any
// reason (account deleted, tampered/expired token, etc.) — force a clean
// logout instead of leaving the app stuck showing "Failed to load..." everywhere.
let isLoggingOut = false;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    // Backend in maintenance mode — flip the app over to the maintenance screen.
    if (error.response?.status === 503 && error.response.data?.maintenance) {
      useMaintenanceStore.getState().trigger(error.response.data.message);
    }

    if (error.response?.status === 401 && !isLoggingOut) {
      isLoggingOut = true;
      try {
        await AsyncStorage.removeItem("token");
        await AsyncStorage.removeItem("user");
        useAuthStore.setState({ token: null, user: null });
        router.replace("/(auth)");
      } finally {
        isLoggingOut = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;