import { View, Text, Image, Pressable, ActivityIndicator, StyleSheet } from "react-native";
import { useState } from "react";
import COLORS from "../constants/colors";
import { useMaintenanceStore } from "../store/maintenanceStore";

// Full-screen takeover shown while the backend is in maintenance mode. White
// background with the VisionFIT logo — deliberately plain so it reads as an
// intentional "we'll be right back" screen, not a crash.
export default function MaintenanceScreen() {
  const message = useMaintenanceStore((s) => s.message);
  const check = useMaintenanceStore((s) => s.check);
  const [checking, setChecking] = useState(false);

  // Re-ask the backend. If maintenance is over, the store flips `active` to
  // false and this screen unmounts on its own.
  const retry = async () => {
    setChecking(true);
    try { await check(); } finally { setChecking(false); }
  };

  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/images/visionfit-logo.png")}
        style={styles.logo}
        resizeMode="contain"
      />
      <Text style={styles.appName}>VisionFIT360</Text>

      <View style={styles.pill}>
        <Text style={styles.pillText}>Under maintenance</Text>
      </View>

      <Text style={styles.message}>
        {message || "We're doing some quick maintenance. Please check back shortly."}
      </Text>

      <Pressable
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
        onPress={retry}
        disabled={checking}
      >
        {checking
          ? <ActivityIndicator size="small" color={COLORS.white} />
          : <Text style={styles.buttonText}>Try again</Text>}
      </Pressable>

      <Text style={styles.footer}>Thanks for your patience.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  logo: { width: 110, height: 110, marginBottom: 14 },
  appName: {
    fontSize: 26, fontWeight: "600", color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
  },
  pill: {
    marginTop: 18, paddingVertical: 6, paddingHorizontal: 14,
    borderRadius: 20, backgroundColor: COLORS.inputBackground,
  },
  pillText: {
    fontSize: 12, fontWeight: "600", letterSpacing: 0.3,
    color: COLORS.black, fontFamily: "GeneralSans-Variable",
  },
  message: {
    marginTop: 18, fontSize: 15, lineHeight: 22, textAlign: "center",
    color: COLORS.black, opacity: 0.8, fontFamily: "GeneralSans-Variable",
    maxWidth: 340,
  },
  button: {
    marginTop: 28, minWidth: 180, height: 50, borderRadius: 12,
    backgroundColor: COLORS.button, justifyContent: "center", alignItems: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: {
    color: COLORS.white, fontSize: 15, fontWeight: "600",
    fontFamily: "GeneralSans-Variable",
  },
  footer: {
    marginTop: 20, fontSize: 12, color: COLORS.gray,
    fontFamily: "GeneralSans-Variable",
  },
});
