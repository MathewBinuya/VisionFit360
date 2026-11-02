import { View, Text, TouchableOpacity, ScrollView, Image, RefreshControl, Modal, Animated } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { Ionicons } from "@expo/vector-icons"
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage'
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/tabStyle/home.style'
import api from '../../lib/axios'
import { useAuthStore } from '../../store/authStore'
import PressableScale from '../../components/PressableScale'
import CountUp from '../../components/CountUp'
import {
  refreshProgressNotifications, requestPermission, scheduleProgressNotifications,
  NOTIF_SETTINGS_KEY, MORNING, EVENING, TIMEZONE,
} from '../../lib/notifications'
import { reconcileInbox, unreadCount } from '../../lib/notifInbox'
import ActivityCard from '../../components/ActivityCard'

// one-time, per-device flag so the first-run notification ask shows only once
const NOTIF_PRIME_KEY = 'notifPrimeSeen_v1';

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const [workouts, setWorkouts] = useState([]);
  const [summary, setSummary] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showNotifPrompt, setShowNotifPrompt] = useState(false);
  const [unreadNotifs, setUnreadNotifs] = useState(0);

  // First run after onboarding: if notifications aren't already allowed (and we
  // can still ask), prime the user with WHY, then trigger the OS permission dialog.
  // If they're already granted — or the OS won't let us ask again — we never prompt.
  useEffect(() => {
    (async () => {
      try {
        if (await AsyncStorage.getItem(NOTIF_PRIME_KEY)) return;   // already handled on this device
        const perm = await Notifications.getPermissionsAsync();
        if (perm.status === 'granted' || perm.canAskAgain === false) {
          await AsyncStorage.setItem(NOTIF_PRIME_KEY, '1');        // allowed / can't ask -> don't nag
          return;
        }
        setShowNotifPrompt(true);
      } catch (_e) {}
    })();
  }, []);

  const markNotifPrimeSeen = async () => {
    try { await AsyncStorage.setItem(NOTIF_PRIME_KEY, '1'); } catch (_e) {}
  };

  const allowNotifications = async () => {
    setShowNotifPrompt(false);
    await markNotifPrimeSeen();
    const granted = await requestPermission();   // shows the OS dialog
    if (!granted) return;
    try {
      // turn the reminder setting on (same shape the Notifications screen saves) + schedule
      await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify({
        enabled: true,
        morningHour: MORNING.hour, morningMinute: MORNING.minute,
        eveningHour: EVENING.hour, eveningMinute: EVENING.minute,
        timezone: TIMEZONE,
      }));
      await scheduleProgressNotifications();
    } catch (_e) {}
  };

  const dismissNotifPrompt = async () => {
    setShowNotifPrompt(false);
    await markNotifPrimeSeen();
  };

  // reload completed workouts every time home comes into focus
  useFocusEffect(
    useCallback(() => {
      loadWorkouts();
      loadAnalytics();
      // refresh the bell: pull any fired reminders into the feed, update the badge
      (async () => {
        try { await reconcileInbox(); setUnreadNotifs(await unreadCount()); } catch (_e) {}
      })();
    }, [])
  );

  const loadWorkouts = async () => {
    try {
      const res = await api.get("/workouts?completed=true");
      setWorkouts(res.data);
    } catch (error) {
      console.log("Failed to load workouts", error.message);
    }
  };

  // totals + this week come from the analytics endpoint (covers ALL completed
  // workouts, not just the first page), and keep the 8 AM / 8 PM reminders current
  const loadAnalytics = async () => {
    try {
      const res = await api.get("/workouts/analytics");
      setSummary(res.data.summary);
      setCalendar(res.data.calendar || null);
      refreshProgressNotifications(res.data);
    } catch (error) {
      console.log("Failed to load analytics", error.message);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadWorkouts(), loadAnalytics()]);
    setRefreshing(false);
  };

  //   derived stats
  const workoutsDone = summary ? summary.totalWorkouts : workouts.length;
  const volumeThisWeek = summary?.thisWeek.volume ?? 0;

  // BMI from stored height/weight
  const bmiData = () => {
    if (!user?.heightCm || !user?.weightKg) return null;
    const h = user.heightCm / 100;
    const bmi = +(user.weightKg / (h * h)).toFixed(1);
    let category = "Obese";
    if (bmi < 18.5) category = "Underweight";
    else if (bmi < 25) category = "Normal";
    else if (bmi < 30) category = "Overweight";
    return { bmi, category };
  };

  const workoutVolume = (w) => {
    let total = 0;
    w.exercises?.forEach((ex) =>
      ex.sets?.forEach((s) => {
        total += (s.reps || 0) * (s.weightKg || 0);
      })
    );
    return total;
  };

  const bmi = bmiData();
  const recent = workouts.slice(0, 2);

  // One-shot entrance: content gently fades + rises in on mount (native driver,
  // no loops — cheap, runs once).
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(enter, { toValue: 1, duration: 450, useNativeDriver: true }).start();
  }, []);
  const enterStyle = {
    opacity: enter,
    transform: [{ translateY: enter.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }],
  };

  const bmiColor = (cat) => {
    if (cat === "Normal") return COLORS.button;
    if (cat === "Underweight" || cat === "Overweight") return "#854f0b";
    return "#a32d2d";
  };

  return (
    <View style={styles.container}>
      {/* profile */}
      <View style={styles.topBar}>
        <View>
          <Text style={styles.hello}>Hello,</Text>
          <Text style={styles.username}>{user?.username || "there"}</Text>
        </View>
        <View style={styles.topBarRight}>
          {/* Notifications bell — opens the in-app feed; badge shows unread count */}
          <TouchableOpacity onPress={() => router.push("/notifications-inbox")} style={styles.bellBtn}>
            <Ionicons name="notifications-outline" size={24} color={COLORS.black} />
            {unreadNotifs > 0 && (
              <View style={{
                position: "absolute", top: -2, right: -2,
                minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 3,
                backgroundColor: "#E24B4A", alignItems: "center", justifyContent: "center",
                borderWidth: 1.5, borderColor: COLORS.background,
              }}>
                <Text style={{ color: COLORS.white, fontSize: 9, fontWeight: "700" }}>
                  {unreadNotifs > 9 ? "9+" : unreadNotifs}
                </Text>
              </View>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.avatar}
            onPress={() => router.push("/(tabs)/profile")}
          >
            {user?.photo ? (
              <Image source={{ uri: user.photo }} style={styles.avatarImage} />
            ) : (
              <Text style={styles.avatarText}>
                {(user?.username || "").trim().charAt(0).toUpperCase() || "?"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
    </View>
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.button} colors={[COLORS.button]} />
        }
      >
        <Animated.View style={enterStyle}>
        {/* stats strip — numbers count up on load */}
        <View style={styles.statsRow}>
          <PressableScale style={styles.statCard} onPress={() => router.push("/progress")}>
            <Text style={styles.statLabel}>Workouts done</Text>
            <CountUp value={workoutsDone} style={styles.statValue} />
          </PressableScale>
          <PressableScale style={styles.statCard} onPress={() => router.push("/progress")}>
            <Text style={styles.statLabel}>Volume this week</Text>
            <Text style={styles.statValue}>
              <CountUp value={volumeThisWeek} format={(n) => n.toLocaleString()} />
              <Text style={styles.statUnit}> kg</Text>
            </Text>
          </PressableScale>
        </View>
        <TouchableOpacity style={styles.progressLink} onPress={() => router.push("/progress")}>
          <Ionicons name="stats-chart-outline" size={16} color={COLORS.black} />
          <Text style={styles.progressLinkText}>View progress</Text>
          <Ionicons name="chevron-forward" size={16} color={COLORS.placeholderText} />
        </TouchableOpacity>

        {/* Workout Tracker — primary action, moved up front */}
        <PressableScale style={styles.trackerCard} onPress={() => router.push("/workout")}>
          <Ionicons name="barbell" size={24} color={COLORS.white} />
          <View style={{ marginLeft: 12 }}>
            <Text style={styles.trackerTitle}>Workout Tracker</Text>
            <Text style={styles.trackerSub}>{"Log today's session"}</Text>
          </View>
        </PressableScale>

        {/* RepVision + History — quick actions */}
        <View style={styles.placeholderRow}>
          <PressableScale style={styles.placeholder} onPress={() => router.push("/ar-select")}>
            <Ionicons name="body-outline" size={24} color={COLORS.button} />
            <Text style={styles.placeholderLabel}>RepVision</Text>
            <Text style={styles.placeholderSub}>AR rep counter</Text>
          </PressableScale>
          <PressableScale style={styles.historyButton} onPress={() => router.push("/history")}>
            <Ionicons name="time-outline" size={24} color={COLORS.button} />
            <Text style={styles.historyButtonLabel}>History</Text>
            <Text style={styles.historyButtonSub}>Past sessions</Text>
          </PressableScale>
        </View>

        {/* activity grid + streak (completed workouts per day) */}
        <ActivityCard calendar={calendar} style={{ marginBottom: 14 }} />

        {/* BMI card — tap to open Profile (where height/weight live) */}
        {bmi && (
          <PressableScale style={styles.bmiCard} onPress={() => router.push("/(tabs)/profile")}>
            <View>
              <Text style={styles.bmiLabel}>Your BMI</Text>
              <Text style={styles.bmiValue}>{bmi.bmi}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <View style={[styles.bmiBadge, { backgroundColor: bmiColor(bmi.category) + "22" }]}>
                <Text style={[styles.bmiBadgeText, { color: bmiColor(bmi.category) }]}>
                  {bmi.category}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.placeholderText} />
            </View>
          </PressableScale>
        )}

        {/* recent peek */}
        <View style={styles.recentHeader}>
          <Text style={styles.sectionTitle}>Recent</Text>
          {workouts.length > 0 && (
            <TouchableOpacity onPress={() => router.push("/history")}>
              <Text style={styles.seeAll}>See all</Text>
            </TouchableOpacity>
          )}
        </View>
        {recent.length === 0 ? (
          <Text style={styles.empty}>No workouts yet</Text>
        ) : (
          recent.map((w) => (
            <View key={w._id} style={styles.recentItem}>
              <View>
                <Text style={styles.recentTitle}>{w.title || "Workout"}</Text>
                <Text style={styles.recentSub}>
                  {w.exercises?.length || 0} exercises · {workoutVolume(w).toLocaleString()} kg
                </Text>
              </View>
              <Text style={styles.recentDate}>
                {new Date(w.completedAt || w.date).toLocaleDateString()}
              </Text>
            </View>
          ))
        )}
        </Animated.View>
      </ScrollView>

      {/* FIRST-RUN NOTIFICATION ASK — Modal so the dim backdrop covers the whole screen uniformly */}
      <Modal visible={showNotifPrompt} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissNotifPrompt}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center', padding: 24,
        }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 22 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 26, backgroundColor: COLORS.inputBackground,
              alignItems: 'center', justifyContent: 'center', marginBottom: 14,
            }}>
              <Ionicons name="notifications" size={26} color={COLORS.button} />
            </View>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.black, marginBottom: 6 }}>
              Turn on reminders?
            </Text>
            <Text style={{ fontSize: 14, lineHeight: 20, color: '#555555', marginBottom: 14 }}>
              Allow notifications and VisionFit will help you stay consistent:
            </Text>
            {[
              ['alarm-outline', "Workout reminders so you don't skip a session"],
              ['trending-up-outline', 'Nudges based on your weekly progress'],
              ['trophy-outline', 'A cheer when you hit a new personal record'],
            ].map(([icon, text]) => (
              <View key={text} style={{ flexDirection: 'row', gap: 10, alignItems: 'center', marginBottom: 10 }}>
                <Ionicons name={icon} size={18} color={COLORS.button} />
                <Text style={{ flex: 1, fontSize: 13, color: COLORS.black }}>{text}</Text>
              </View>
            ))}
            <TouchableOpacity
              onPress={allowNotifications}
              style={{ backgroundColor: COLORS.button, borderRadius: 12, padding: 15, alignItems: 'center', marginTop: 8 }}
            >
              <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 15 }}>Allow notifications</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={dismissNotifPrompt} style={{ padding: 12, alignItems: 'center', marginTop: 2 }}>
              <Text style={{ color: COLORS.placeholderText, fontWeight: '600', fontSize: 14 }}>Maybe later</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}