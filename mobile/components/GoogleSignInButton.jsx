import { View, Text, StyleSheet, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { showAlert } from "./AppAlert";
import PressableScale from "./PressableScale";
import { useAuthStore } from "../store/authStore";
import { statusCodes, isErrorWithCode } from "../lib/google";
import COLORS from "../constants/colors";

// "Continue with Google" button. Self-contained: runs the native Google flow via
// the auth store, then routes exactly like the email login does (home if
// onboarding is done, otherwise the onboarding profile step).
export default function GoogleSignInButton({ label = "Continue with Google", showDivider = true }) {
  const googleLogin = useAuthStore((s) => s.googleLogin);
  const [busy, setBusy] = useState(false);

  const handlePress = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await googleLogin();

      if (result.cancelled) return;         // user backed out — stay silent
      if (!result.success) {
        showAlert("Google sign-in failed", result.error || "Please try again.");
        return;
      }

      const user = useAuthStore.getState().user;
      if (user?.onBoardingComplete) router.replace("/(tabs)/home");
      else router.replace("/(onBoarding)/profile");
    } catch (error) {
      // Native-layer errors (e.g. Play Services missing) surface here.
      if (isErrorWithCode(error) && error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        showAlert("Google Play Services required", "Please update Google Play Services to sign in with Google.");
      } else if (!(isErrorWithCode(error) && error.code === statusCodes.SIGN_IN_CANCELLED)) {
        showAlert("Google sign-in failed", error.message || "Please try again.");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View>
      {showDivider && (
        <View style={styles.dividerRow}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>or</Text>
          <View style={styles.dividerLine} />
        </View>
      )}

      <PressableScale style={styles.button} onPress={handlePress} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={COLORS.black} />
        ) : (
          <>
            <Ionicons name="logo-google" size={20} color="#EA4335" />
            <Text style={styles.buttonText}>{label}</Text>
          </>
        )}
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  dividerRow: { flexDirection: "row", alignItems: "center", marginVertical: 18 },
  dividerLine: { flex: 1, height: 1, backgroundColor: COLORS.border },
  dividerText: { marginHorizontal: 12, color: COLORS.gray, fontSize: 13 },
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: COLORS.white,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 14,
    paddingVertical: 15,
  },
  buttonText: { color: COLORS.black, fontSize: 15, fontWeight: "600" },
});
