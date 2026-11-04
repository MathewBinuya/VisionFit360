import { Stack } from "expo-router";
import { View, StyleSheet } from "react-native";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";
import SafeScreen from "../components/SafeScreen"
import MaintenanceScreen from "../components/MaintenanceScreen"
import { AlertProvider } from "../components/AppAlert"
import { StatusBar } from "expo-status-bar";
import {useFonts} from "expo-font";
import { useMaintenanceStore } from "../store/maintenanceStore";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    "GeneralSans-Variable": require("../assets/fonts/GeneralSans-Variable.ttf"),
  });

  const maintenanceActive = useMaintenanceStore((s) => s.active);
  const checkMaintenance = useMaintenanceStore((s) => s.check);

  // Ask once on launch so the app opens straight onto the maintenance screen if
  // the backend is down for an update, instead of flashing broken screens.
  useEffect(() => { checkMaintenance(); }, [checkMaintenance]);

  if(!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <AlertProvider>
      <SafeScreen>
        <Stack screenOptions={{headerShown: false}} >
          <Stack.Screen name="index"/>
          <Stack.Screen name="(auth)"/>
          <Stack.Screen name="(onBoarding)"/>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="workout" />
          <Stack.Screen name="getstarted" />
          <Stack.Screen name="notifications" />
          <Stack.Screen name="ar-select" />
          <Stack.Screen name="posetracker" />
          <Stack.Screen name="repvision-guide" />
          <Stack.Screen name="feedback" />
          <Stack.Screen name="progress" />

          
        </Stack>
      </SafeScreen>
      </AlertProvider>

      {/* Covers the entire app (including the Stack) whenever the backend is in
          maintenance mode, so nothing underneath can be used. */}
      {maintenanceActive && (
        <View style={StyleSheet.absoluteFill} pointerEvents="auto">
          <MaintenanceScreen />
        </View>
      )}

      <StatusBar style="dark"/>
    </SafeAreaProvider>
  );
}
 