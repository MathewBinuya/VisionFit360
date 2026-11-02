import { Stack } from "expo-router";

export default function onBoardLayout() {
  // slide each onboarding step in from the right when the user taps Continue,
  // so the flow feels like moving forward through the steps.
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        animation: "slide_from_right",
        animationDuration: 300,
        gestureEnabled: false,
      }}
    />
  );
}