import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Animated } from "react-native";
import { useRef, useEffect } from "react";
import COLORS from "../../constants/colors";
import { useHeartbeat } from "../../lib/heartbeat";
import { useWorkoutSync } from "../../lib/workoutSync";

// Tab icon that gives a small, visible "pop + lift" when its tab becomes active —
// no background, just the icon springing up a touch. Native-driver (smooth + cheap).
function TabIcon({ name, color, size, focused }) {
  const anim = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(anim, {
      toValue: focused ? 1 : 0,
      useNativeDriver: true,
      friction: 5,
      tension: 170,
    }).start();
  }, [focused]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] });
  const lift = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -2] });

  return (
    <Animated.View style={{ transform: [{ scale }, { translateY: lift }] }}>
      <Ionicons name={name} size={size} color={color} />
    </Animated.View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  useHeartbeat(); // keep presence fresh while the user is in the app
  useWorkoutSync(); // flush offline workout completions on start / resume

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: COLORS.button,
        tabBarInactiveTintColor: COLORS.placeholderText,
        tabBarStyle: {
          backgroundColor: COLORS.cards,
          borderTopColor: COLORS.border,
          height: 52 + insets.bottom,
          paddingBottom: insets.bottom + 6,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: "GeneralSans-Variable", fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="home" size={size} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="ai"
        options={{
          title: "AI",
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="sparkles" size={size} color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profile",
          tabBarIcon: ({ color, size, focused }) => <TabIcon name="person" size={size} color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}