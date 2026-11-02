import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Keyboard, Platform, BackHandler, Modal } from 'react-native'
import { showAlert } from '../components/AppAlert'
import PressableScale from '../components/PressableScale'
import AnimatedBar from '../components/AnimatedBar'
import { useState, useEffect, useRef } from 'react'
import { refreshProgressNotifications } from '../lib/notifications'
import { router } from 'expo-router'
import { goBack } from '../lib/nav'
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import COLORS from "../constants/colors"
import styles from '../assets/styles/workout.style'
import AsyncStorage from "@react-native-async-storage/async-storage"
import { guideSeenKey } from '../lib/progress'
import { useAuthStore } from '../store/authStore'
import {
  loadActiveWorkouts,
  completeWorkout as completeWorkoutOffline,
  createWorkoutOffline,
  updateWorkoutOffline,
  deleteWorkoutOffline,
  syncPending,
  getPending,
  onSyncComplete,
} from '../lib/offlineWorkouts'

// A request failing with no HTTP response means we're offline (vs a real server error).
const isOffline = (error) => !error?.response;

const MAX_REPS = 100;
const MAX_WEIGHT_KG = 1000;
const MAX_SETS_PER_EXERCISE = 20;

// One-time intro that tells new users the tracker keeps working without internet.
const OFFLINE_GUIDE_STEPS = [
  {
    icon: "cloud-offline-outline",
    title: "Works without internet",
    text: "No Wi-Fi or mobile data? You can still create, edit and delete routines and mark workouts complete — the tracker keeps working offline.",
  },
  {
    icon: "checkmark-circle-outline",
    title: "Save anytime",
    text: "Add or change a routine and it's saved on your device right away, no waiting for a connection — even at the gym.",
  },
  {
    icon: "sync-outline",
    title: "Syncs automatically",
    text: "When you're back online, completed workouts upload on their own and update your streak, history and progress — on the right day they happened.",
  },
  {
    icon: "shield-checkmark-outline",
    title: "Nothing gets lost",
    text: "A workout saved offline uploads exactly once, even if you close the app before it syncs. You'll see “Saved offline · will sync” until it's done.",
  },
];

const emptyExercise = () => ({
  name: '',
  sets: [{ reps: '', weightKg: '', restSeconds: '60', completed: false }]
});

// strips anything that isn't a digit — also makes negative numbers impossible to type
const sanitizeNumeric = (text) => text.replace(/[^0-9]/g, '');

// How many sets across a workout the user has ticked — shown on Mark Complete,
// and what actually gets recorded when they complete it.
const countCheckedSets = (w) =>
  (w?.exercises || []).reduce((n, ex) => n + (ex.sets || []).filter((s) => s.completed).length, 0);

// shared validation for both Add and Edit — returns an error message string, or null if valid
const validateExercises = (exercises) => {
  for (const ex of exercises) {
    if (ex.sets.length > MAX_SETS_PER_EXERCISE) {
      return `"${ex.name || 'An exercise'}" has too many sets (max ${MAX_SETS_PER_EXERCISE}).`;
    }
    for (const s of ex.sets) {
      const reps = s.reps === '' ? 0 : Number(s.reps);
      const weight = s.weightKg === '' ? 0 : Number(s.weightKg);

      if (isNaN(reps) || reps < 0) return "Reps can't be negative.";
      if (reps > MAX_REPS) return `Reps can't exceed ${MAX_REPS}.`;

      if (isNaN(weight) || weight < 0) return "Weight can't be negative.";
      if (weight > MAX_WEIGHT_KG) return `Weight can't exceed ${MAX_WEIGHT_KG}kg.`;
    }
  }
  return null;
};

// Subtle one-line status under the header. Shows nothing when everything is
// online and nothing is pending — offline is a normal state, not an error.
function SyncBanner({ online, syncing, justSynced, pendingCount, onRetry }) {
  let bg, color, icon, text, spin = false, onPress = null;

  if (syncing) {
    bg = '#EAF2FF'; color = '#2F6FEB'; icon = 'sync'; spin = true; text = 'Syncing…';
  } else if (justSynced) {
    bg = '#E7F6EC'; color = '#1E8E4E'; icon = 'checkmark-circle'; text = 'Synced';
  } else if (!online && pendingCount > 0) {
    bg = '#FFF4E5'; color = '#9A6400'; icon = 'cloud-offline-outline';
    text = `Saved offline · ${pendingCount} waiting to sync`;
  } else if (!online) {
    bg = '#FFF4E5'; color = '#9A6400'; icon = 'cloud-offline-outline'; text = "You're offline";
  } else if (pendingCount > 0) {
    bg = '#FFF4E5'; color = '#9A6400'; icon = 'cloud-upload-outline';
    text = `${pendingCount} waiting to sync · tap to retry`; onPress = onRetry;
  } else {
    return null;
  }

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.7 : 1}
      onPress={onPress || undefined}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 8,
        marginHorizontal: 16, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12,
        backgroundColor: bg, borderRadius: 10,
      }}
    >
      {spin
        ? <ActivityIndicator size="small" color={color} />
        : <Ionicons name={icon} size={16} color={color} />}
      <Text style={{ fontSize: 13, color, fontWeight: '600', flex: 1 }}>{text}</Text>
    </TouchableOpacity>
  );
}

export default function Workout() {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const [workouts, setWorkouts] = useState([]);
  const [loading, setLoading] = useState(true);

  //  OFFLINE / SYNC STATE
  const [online, setOnline] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(false);

  //  OFFLINE GUIDE (one-time per account, reopenable from the header "?")
  const [showGuide, setShowGuide] = useState(false);
  const guideKey = guideSeenKey("workoutOffline", user);

  useEffect(() => {
    (async () => {
      try { if (!(await AsyncStorage.getItem(guideKey))) setShowGuide(true); } catch {}
    })();
  }, [guideKey]);

  const closeGuide = async () => {
    setShowGuide(false);
    try { await AsyncStorage.setItem(guideKey, "1"); } catch {}
  };

  //  ADD WORKOUT MODAL STATE 
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newExercises, setNewExercises] = useState([emptyExercise()]);
  const [saving, setSaving] = useState(false);

  //  THREE DOTS MENU STATE 
  const [menuWorkout, setMenuWorkout] = useState(null);

  //  CARD EXPAND/COLLAPSE — cards start compact; tap the summary to reveal sets
  const [expandedCards, setExpandedCards] = useState({});
  const toggleCard = (id) => setExpandedCards((p) => ({ ...p, [id]: !p[id] }));

  //  EDIT MODAL STATE 
  const [showEdit, setShowEdit] = useState(false);
  const [editWorkout, setEditWorkout] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editExercises, setEditExercises] = useState([]);
  const [editSaving, setEditSaving] = useState(false);

  //  KEYBOARD HANDLING (Add/Edit overlays)
  // The overlays are plain Views (not Modal) and Android runs edge-to-edge, so the
  // window doesn't shrink for the keyboard. We pad the overlay by however much the
  // keyboard actually covers it, then scroll the focused input into view.
  const [keyboardInset, setKeyboardInset] = useState(0);
  const overlayRef = useRef(null);
  const formScrollRef = useRef(null);
  const formContentRef = useRef(null);
  const formViewport = useRef({ y: 0, h: 0 });

  const revealFocusedInput = () => {
    const input = TextInput.State.currentlyFocusedInput?.();
    const content = formContentRef.current;
    const scroll = formScrollRef.current;
    if (!input || !content || !scroll) return;
    input.measureLayout(content, (_x, y, _w, h) => {
      const { y: top, h: viewH } = formViewport.current;
      const pad = 24;
      if (y - pad < top) scroll.scrollTo({ y: Math.max(0, y - pad), animated: true });
      else if (y + h + pad > top + viewH) scroll.scrollTo({ y: y + h + pad - viewH, animated: true });
    }, () => {});
  };

  const onInputFocus = () => setTimeout(revealFocusedInput, 120);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      const { height, screenY } = e.endCoordinates;
      const overlay = overlayRef.current;
      if (!overlay) { setKeyboardInset(height); return; }
      overlay.measureInWindow((_x, y, _w, h) => {
        // overlap = 0 if the OS already resized the window above the keyboard
        const overlap = h > 0 && screenY > 0 ? y + h - screenY : height;
        setKeyboardInset(Math.max(0, overlap));
        setTimeout(revealFocusedInput, 120);
      });
    });
    const hideSub = Keyboard.addListener(hideEvt, () => setKeyboardInset(0));
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  useEffect(() => {
    loadWorkouts();
    // Opening the tracker while online is a good moment to flush offline completions.
    runSync();
    // When a background sync finishes, refresh the list + pending badge.
    const off = onSyncComplete(() => { loadWorkouts(); });
    return off;
  }, []);

  //  ANDROID HARDWARE BACK BUTTON 
  useEffect(() => {
    const backAction = () => {
      if (showGuide) { closeGuide(); return true; }
      if (showAdd) { setShowAdd(false); return true; }
      if (showEdit) { setShowEdit(false); return true; }
      if (menuWorkout) { setMenuWorkout(null); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [showGuide, showAdd, showEdit, menuWorkout]);

  const refreshPendingCount = async () => {
    try { setPendingCount((await getPending(user)).length); } catch {}
  };

  const loadWorkouts = async () => {
    try {
      // Offline-first: loads from the server when online (refreshing the cache),
      // or from the local cache when offline. Workouts already completed offline
      // are filtered out so they don't show as still-to-do.
      const { workouts: list, online: isOn } = await loadActiveWorkouts(user);
      // newest first — invalid/missing dates sort to the bottom
      const sorted = [...list].sort((a, b) => {
        const ta = new Date(a.date).getTime() || 0;
        const tb = new Date(b.date).getTime() || 0;
        return tb - ta;
      });
      setWorkouts(sorted);
      setOnline(isOn);
    } catch (error) {
      console.log("Failed to load workouts", error.message);
    } finally {
      await refreshPendingCount();
      setLoading(false);
    }
  };

  // Try to upload any pending offline completions; reflect progress in the banner.
  const runSync = async () => {
    const before = await getPending(user);
    if (!before.length) { setOnline(true); return; }
    setSyncing(true);
    try {
      const result = await syncPending(user);
      if (result?.synced > 0) {
        setJustSynced(true);
        setTimeout(() => setJustSynced(false), 2500);
      }
      // A confirmed sync (or a fully drained queue) proves we're online.
      if (result?.synced > 0 || result?.remaining === 0) setOnline(true);
    } finally {
      setSyncing(false);
      await refreshPendingCount();
    }
  };

  //  OPEN ADD MODAL (always starts fresh) 
  const openAddModal = () => {
    setNewTitle('');
    setNewExercises([emptyExercise()]);
    setShowAdd(true);
  };

  //  ADD MODAL HELPERS 
  const updateNewExerciseName = (exIdx, name) => {
    const updated = [...newExercises];
    updated[exIdx] = { ...updated[exIdx], name };
    setNewExercises(updated);
  };

  const updateNewSet = (exIdx, setIdx, field, value) => {
    const cleaned = (field === 'reps' || field === 'weightKg') ? sanitizeNumeric(value) : value;
    const updated = [...newExercises];
    updated[exIdx].sets[setIdx] = { ...updated[exIdx].sets[setIdx], [field]: cleaned };
    setNewExercises(updated);
  };

  const addSetToNewExercise = (exIdx) => {
    if (newExercises[exIdx].sets.length >= MAX_SETS_PER_EXERCISE) {
      showAlert("Limit reached", `You can add up to ${MAX_SETS_PER_EXERCISE} sets per exercise.`);
      return;
    }
    const updated = [...newExercises];
    updated[exIdx].sets.push({ reps: '', weightKg: '', restSeconds: '60', completed: false });
    setNewExercises(updated);
  };

  const removeNewSet = (exIdx, setIdx) => {
    const updated = [...newExercises];
    updated[exIdx].sets = updated[exIdx].sets.filter((_, i) => i !== setIdx);
    setNewExercises(updated);
  };

  const addNewExercise = () => {
    setNewExercises([...newExercises, emptyExercise()]);
  };

  const removeNewExercise = (exIdx) => {
    setNewExercises(newExercises.filter((_, i) => i !== exIdx));
  };

  //  OPEN EDIT MODAL 
  const openEdit = (w) => {
    setMenuWorkout(null);
    setEditWorkout(w);
    setEditTitle(w.title || '');
    setEditExercises(w.exercises?.map(ex => ({
      name: ex.name || '',
      sets: ex.sets?.map(s => ({
        reps: s.reps?.toString() || '',
        weightKg: s.weightKg?.toString() || '',
        restSeconds: s.restSeconds?.toString() || '60',
        completed: s.completed || false,
      })) || []
    })) || []);
    setShowEdit(true);
  };

  //  EDIT HELPERS 
  const updateExerciseName = (exIdx, name) => {
    const updated = [...editExercises];
    updated[exIdx] = { ...updated[exIdx], name };
    setEditExercises(updated);
  };

  const updateSet = (exIdx, setIdx, field, value) => {
    const cleaned = (field === 'reps' || field === 'weightKg') ? sanitizeNumeric(value) : value;
    const updated = [...editExercises];
    updated[exIdx].sets[setIdx] = { ...updated[exIdx].sets[setIdx], [field]: cleaned };
    setEditExercises(updated);
  };

  const addSetToExercise = (exIdx) => {
    if (editExercises[exIdx].sets.length >= MAX_SETS_PER_EXERCISE) {
      showAlert("Limit reached", `You can add up to ${MAX_SETS_PER_EXERCISE} sets per exercise.`);
      return;
    }
    const updated = [...editExercises];
    updated[exIdx].sets.push({ reps: '', weightKg: '', restSeconds: '60', completed: false });
    setEditExercises(updated);
  };

  const removeSet = (exIdx, setIdx) => {
    const updated = [...editExercises];
    updated[exIdx].sets = updated[exIdx].sets.filter((_, i) => i !== setIdx);
    setEditExercises(updated);
  };

  const addExercise = () => {
    setEditExercises([...editExercises, {
      name: '',
      sets: [{ reps: '', weightKg: '', restSeconds: '60', completed: false }]
    }]);
  };

  const removeExercise = (exIdx) => {
    setEditExercises(editExercises.filter((_, i) => i !== exIdx));
  };

  //  SAVE EDIT 
  const saveEdit = async () => {
    if (!editTitle.trim()) { showAlert("Missing", "Please enter a workout title"); return; }

    const validationError = validateExercises(editExercises);
    if (validationError) {
      showAlert("Invalid input", validationError);
      return;
    }

    setEditSaving(true);
    try {
      const payload = {
        title: editTitle.trim(),
        exercises: editExercises.map(ex => ({
          name: ex.name,
          sets: ex.sets.map(s => ({
            reps: Number(s.reps) || 0,
            weightKg: Number(s.weightKg) || 0,
            restSeconds: Number(s.restSeconds) || 60,
            completed: s.completed,
          }))
        }))
      };
      // Offline-capable: saves to the server when online, otherwise queues the edit
      // (or folds it into a still-unsynced creation) and reflects it immediately.
      const result = await updateWorkoutOffline(user, editWorkout, payload);
      setWorkouts(prev => prev.map(w => w._id === editWorkout._id ? result.workout : w));
      setShowEdit(false);
      setEditWorkout(null);
      if (result.status === "pending") {
        setOnline(false);
        await refreshPendingCount();
      }
    } catch (error) {
      if (isOffline(error)) {
        // A device-storage failure — the only way an offline edit can fail now.
        showAlert("Couldn't save", "We couldn't save this change on your device. Please free up some space and try again.");
      } else {
        showAlert("Error", error.response?.data?.message || "Failed to save changes");
      }
    } finally {
      setEditSaving(false);
    }
  };

  //  COMPLETE WORKOUT (offline-capable)
  // The whole routine is kept in history (finished + unfinished sets), with each
  // set's "completed" flag preserved — so the program stays reusable. Only the
  // finished (ticked) sets count toward progress/volume/PRs (filtered server-side).
  const completeWorkout = async (workout) => {
    // Require at least one ticked set so the record clearly marks what was done
    // (and so progress counts only finished sets, never a blank session).
    if (countCheckedSets(workout) === 0) {
      showAlert(
        "Tick your finished sets",
        "Check the sets you completed first — only ticked sets count toward your progress."
      );
      return;
    }

    // Optimistic: the workout leaves the active list immediately, online or not.
    setWorkouts(prev => prev.filter(w => w._id !== workout._id));
    try {
      const result = await completeWorkoutOffline(user, workout);
      if (result.status === "pending") {
        setOnline(false);
        await refreshPendingCount();
        // Not an error — reassure the user it's safely saved.
        showAlert(
          "Saved offline",
          "This workout is saved on your device and will sync automatically when you're back online.",
          [{ text: "Got it" }]
        );
      } else {
        setOnline(true);
        refreshProgressNotifications();
      }
    } catch (error) {
      // A real server/auth error (not connectivity). Put it back so nothing is lost.
      setWorkouts(prev => [workout, ...prev]);
      showAlert("Error", error.response?.data?.message || "Failed to complete workout");
    }
  };

  //  TICK A SINGLE SET DONE (offline-capable)
  // Each set on a card is a checkbox so the user can see, set by set, what they've
  // finished. Toggling one flips its `completed` flag and saves the whole routine
  // through the same offline-first update path the Edit screen uses.
  const toggleSetDone = async (workout, exIdx, setIdx) => {
    const current = workout.exercises?.[exIdx]?.sets?.[setIdx];
    if (!current) return;
    const nextCompleted = !current.completed;

    // Full exercises payload with just this one set's flag flipped.
    const exercises = workout.exercises.map((ex, i) => ({
      name: ex.name,
      sets: ex.sets.map((s, j) => ({
        reps: Number(s.reps) || 0,
        weightKg: Number(s.weightKg) || 0,
        restSeconds: Number(s.restSeconds) || 60,
        completed: i === exIdx && j === setIdx ? nextCompleted : !!s.completed,
      })),
    }));
    const payload = { title: workout.title, exercises };

    // Optimistic: the tick appears instantly, online or not.
    setWorkouts(prev => prev.map(w => (w._id === workout._id ? { ...w, exercises } : w)));

    try {
      const result = await updateWorkoutOffline(user, workout, payload);
      setWorkouts(prev => prev.map(w => (w._id === workout._id ? result.workout : w)));
      if (result.status === "pending") {
        setOnline(false);
        await refreshPendingCount();
      }
    } catch (error) {
      // Put the set back the way it was so the checkbox never lies.
      setWorkouts(prev => prev.map(w => (w._id === workout._id ? workout : w)));
      if (isOffline(error)) {
        showAlert("Couldn't save", "We couldn't save that on your device. Please try again.");
      } else {
        showAlert("Error", error.response?.data?.message || "Failed to update set");
      }
    }
  };

  //  DELETE WORKOUT
  const confirmDelete = (workout) => {
    setMenuWorkout(null);
    showAlert(
      "Delete workout",
      `Remove "${workout?.title || "this workout"}"?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteWorkout(workout) },
      ]
    );
  };

  const deleteWorkout = async (workout) => {
    // Optimistic: it leaves the list immediately, online or not.
    setWorkouts(prev => prev.filter(w => w._id !== workout._id));
    try {
      const result = await deleteWorkoutOffline(user, workout);
      if (result.status === "pending") {
        setOnline(false);
        await refreshPendingCount();
      }
    } catch (error) {
      // Put it back so nothing silently disappears on a storage/server failure.
      setWorkouts(prev => [workout, ...prev]);
      if (isOffline(error)) {
        showAlert("Couldn't delete", "We couldn't save this change on your device. Please try again.");
      } else {
        showAlert("Error", error.response?.data?.message || "Failed to delete");
      }
    }
  };

  //  SAVE NEW WORKOUT 
  const saveWorkout = async () => {
    if (!newTitle.trim()) { showAlert("Missing", "Please enter a workout title"); return; }

    const validExercises = newExercises.filter(ex => ex.name.trim());
    if (validExercises.length === 0) {
      showAlert("Missing", "Please add at least one exercise");
      return;
    }

    const validationError = validateExercises(validExercises);
    if (validationError) {
      showAlert("Invalid input", validationError);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: newTitle.trim(),
        date: new Date().toISOString(),
        exercises: validExercises.map(ex => ({
          name: ex.name.trim(),
          sets: ex.sets.map(s => ({
            reps: Number(s.reps) || 0,
            weightKg: Number(s.weightKg) || 0,
            restSeconds: Number(s.restSeconds) || 60,
            completed: false,
          }))
        })),
      };
      // Offline-capable: creates on the server when online, otherwise saves the
      // routine locally (badged) and syncs it automatically once back online.
      const result = await createWorkoutOffline(user, payload);
      setWorkouts(prev => [result.workout, ...prev]);
      setShowAdd(false);
      if (result.status === "pending") {
        setOnline(false);
        await refreshPendingCount();
        showAlert(
          "Saved offline",
          "This routine is saved on your device and will sync automatically when you're back online.",
          [{ text: "Got it" }]
        );
      }
    } catch (error) {
      if (isOffline(error)) {
        // A device-storage failure — the only way an offline create can fail now.
        showAlert("Couldn't save", "We couldn't save this routine on your device. Please free up some space and try again.");
      } else {
        showAlert("Error", error.response?.data?.message || "Failed to save");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* HEADER */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Workouts</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
          <TouchableOpacity onPress={() => setShowGuide(true)} hitSlop={8} accessibilityLabel="How the tracker works offline">
            <Ionicons name="help-circle-outline" size={22} color={COLORS.black} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.push('/progress')} hitSlop={8} accessibilityLabel="View progress">
            <Ionicons name="stats-chart-outline" size={22} color={COLORS.black} />
          </TouchableOpacity>
          <TouchableOpacity onPress={openAddModal}>
            <Ionicons name="add" size={28} color={COLORS.black} />
          </TouchableOpacity>
        </View>
      </View>

      {/* SYNC / OFFLINE STATUS — subtle, never alarming */}
      <SyncBanner
        online={online}
        syncing={syncing}
        justSynced={justSynced}
        pendingCount={pendingCount}
        onRetry={runSync}
      />

      {/* WORKOUT LIST */}
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 24 }}>
        {loading ? (
          <ActivityIndicator size="large" color={COLORS.button} style={{ marginTop: 40 }} />
        ) : workouts.length === 0 ? (
          <Text style={styles.empty}>No workouts yet — tap + to add one</Text>
        ) : (
          workouts.map((w) => {
            const checkedSets = countCheckedSets(w);
            const totalSets = (w.exercises || []).reduce((n, ex) => n + (ex.sets?.length || 0), 0);
            const exCount = w.exercises?.length || 0;
            const isOpen = !!expandedCards[w._id];
            return (
            <View key={w._id} style={styles.workoutCard}>
              {/* card top: title + ⋮ */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.workoutTitle}>{w.title || "Workout"}</Text>
                  <Text style={styles.workoutDate}>
                    {new Date(w.date).toLocaleDateString()}
                  </Text>
                  {w._pending && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                      <Ionicons name="cloud-offline-outline" size={13} color="#9A6400" />
                      <Text style={{ fontSize: 12, color: '#9A6400', fontWeight: '600' }}>
                        Saved offline · will sync
                      </Text>
                    </View>
                  )}
                </View>
                {/* THREE DOTS */}
                <TouchableOpacity
                  onPress={() => setMenuWorkout(w)}
                  hitSlop={10}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="ellipsis-vertical" size={20} color={COLORS.placeholderText} />
                </TouchableOpacity>
              </View>

              {/* compact summary — tap to reveal the sets */}
              <TouchableOpacity
                style={styles.cardSummary}
                onPress={() => toggleCard(w._id)}
                activeOpacity={0.7}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardSummaryText}>
                    {exCount} exercise{exCount === 1 ? "" : "s"} · {checkedSets}/{totalSets} set{totalSets === 1 ? "" : "s"} done
                  </Text>
                  {/* thin progress bar (fill animates as sets are ticked) */}
                  <AnimatedBar
                    fraction={totalSets ? checkedSets / totalSets : 0}
                    trackStyle={styles.progressTrack}
                    fillStyle={styles.progressFill}
                  />
                </View>
                <Ionicons name={isOpen ? "chevron-up" : "chevron-down"} size={18} color={COLORS.placeholderText} />
              </TouchableOpacity>

              {/* exercises + set checkboxes — only when expanded */}
              {isOpen && w.exercises?.map((ex, i) => (
                <View key={i} style={styles.exerciseBlock}>
                  <Text style={styles.exerciseName}>{ex.name}</Text>
                  {ex.sets?.map((s, si) => (
                    <TouchableOpacity
                      key={si}
                      style={styles.setCheckRow}
                      onPress={() => toggleSetDone(w, i, si)}
                      hitSlop={6}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: !!s.completed }}
                      accessibilityLabel={`Set ${si + 1}, ${s.reps || 0} reps`}
                    >
                      <Ionicons
                        name={s.completed ? "checkbox" : "square-outline"}
                        size={20}
                        color={s.completed ? COLORS.button : COLORS.placeholderText}
                      />
                      <Text style={[styles.setCheckText, s.completed && styles.setCheckTextDone]}>
                        Set {si + 1} · {s.reps || 0} × {s.weightKg || 0} kg
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ))}

              {/* complete button — shows how many ticked sets will be saved */}
              <PressableScale
                style={[styles.completeBtn, checkedSets === 0 && { opacity: 0.6 }]}
                onPress={() => completeWorkout(w)}
              >
                <Ionicons name="checkmark-circle-outline" size={18} color={COLORS.white} />
                <Text style={styles.completeText}>
                  {checkedSets > 0 ? `Mark Complete (${checkedSets} set${checkedSets === 1 ? "" : "s"})` : "Mark Complete"}
                </Text>
              </PressableScale>
            </View>
            );
          })
        )}
      </ScrollView>

      {/* ── THREE DOTS MENU — Modal (no text input, so no keyboard concern); the dim
           backdrop covers the whole screen uniformly ── */}
      <Modal visible={!!menuWorkout} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuWorkout(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
            activeOpacity={1}
            onPress={() => setMenuWorkout(null)}
          >
            <View style={{
              position: 'absolute',
              bottom: insets.bottom + 16,
              left: 24, right: 24,
              backgroundColor: COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.border,
              overflow: 'hidden',
            }}>
              {/* header */}
              <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}>
                <Text style={{ fontWeight: '700', fontSize: 15, color: COLORS.black }}>
                  {menuWorkout?.title || "Workout"}
                </Text>
                <Text style={{ fontSize: 13, color: COLORS.gray, marginTop: 2 }}>
                  {menuWorkout ? new Date(menuWorkout.date).toLocaleDateString() : ''}
                </Text>
              </View>

              {/* EDIT */}
              <TouchableOpacity
                onPress={() => openEdit(menuWorkout)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 14,
                  padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border,
                }}
              >
                <Ionicons name="create-outline" size={20} color={COLORS.button} />
                <View>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.button }}>
                    Edit workout
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.gray, marginTop: 1 }}>
                    Change title, add or remove exercises
                  </Text>
                </View>
              </TouchableOpacity>

              {/* DELETE */}
              <TouchableOpacity
                onPress={() => confirmDelete(menuWorkout)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}
              >
                <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#E24B4A' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
      </Modal>


      {/*  EDIT WORKOUT OVERLAY  */}
      {showEdit && (
      <View ref={overlayRef} style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 60, elevation: 60,
      }}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center', alignItems: 'center', padding: 20,
          paddingBottom: 20 + keyboardInset,
        }}>
          <View style={{ width: '100%', maxWidth: 480, maxHeight: '85%' }}>
            <View style={{
              backgroundColor: COLORS.white,
              borderRadius: 20,
              overflow: 'hidden',
              maxHeight: '100%',
            }}>
              {/* edit header */}
              <View style={{
                flexDirection: 'row', alignItems: 'center',
                justifyContent: 'space-between',
                padding: 20,
                borderBottomWidth: 1, borderBottomColor: COLORS.border,
              }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.black }}>
                  Edit Workout
                </Text>
                <TouchableOpacity onPress={() => setShowEdit(false)}>
                  <Ionicons name="close" size={24} color={COLORS.black} />
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={formScrollRef}
                contentContainerStyle={{ padding: 20 }}
                keyboardShouldPersistTaps="handled"
                onLayout={(e) => { formViewport.current.h = e.nativeEvent.layout.height; }}
                onScroll={(e) => { formViewport.current.y = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={32}
              >
              <View ref={formContentRef} collapsable={false}>
                {/* title */}
                <Text style={{ fontSize: 13, fontWeight: '600', color: COLORS.gray, marginBottom: 6 }}>
                  WORKOUT TITLE
                </Text>
                <TextInput
                  style={{
                    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
                    padding: 12, fontSize: 15, color: COLORS.black,
                    backgroundColor: COLORS.inputBackground, marginBottom: 20,
                  }}
                  value={editTitle}
                  onChangeText={setEditTitle}
                  placeholder="e.g. Upper Body Day"
                  placeholderTextColor={COLORS.placeholderText}
                  onFocus={onInputFocus}
                />

                {/* exercises */}
                {editExercises.map((ex, exIdx) => (
                  <View key={exIdx} style={{
                    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                    padding: 14, marginBottom: 16, backgroundColor: COLORS.inputBackground,
                  }}>
                    {/* exercise name + remove */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <TextInput
                        style={{
                          flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
                          padding: 10, fontSize: 14, color: COLORS.black, backgroundColor: COLORS.white,
                        }}
                        value={ex.name}
                        onChangeText={(t) => updateExerciseName(exIdx, t)}
                        placeholder="Exercise name"
                        placeholderTextColor={COLORS.placeholderText}
                        onFocus={onInputFocus}
                      />
                      <TouchableOpacity onPress={() => removeExercise(exIdx)} hitSlop={8}>
                        <Ionicons name="close-circle" size={22} color="#E24B4A" />
                      </TouchableOpacity>
                    </View>

                    {/* sets */}
                    {ex.sets.map((s, setIdx) => (
                      <View key={setIdx} style={{
                        flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center',
                      }}>
                        <Text style={{ fontSize: 12, color: COLORS.gray, width: 36 }}>
                          Set {setIdx + 1}
                        </Text>
                        <TextInput
                          style={{
                            flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
                            padding: 8, fontSize: 13, color: COLORS.black,
                            backgroundColor: COLORS.white, textAlign: 'center',
                          }}
                          value={s.reps}
                          onChangeText={(t) => updateSet(exIdx, setIdx, 'reps', t)}
                          placeholder="Reps"
                          placeholderTextColor={COLORS.placeholderText}
                          onFocus={onInputFocus}
                          keyboardType="numeric"
                          maxLength={3}
                        />
                        <TextInput
                          style={{
                            flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
                            padding: 8, fontSize: 13, color: COLORS.black,
                            backgroundColor: COLORS.white, textAlign: 'center',
                          }}
                          value={s.weightKg}
                          onChangeText={(t) => updateSet(exIdx, setIdx, 'weightKg', t)}
                          placeholder="kg"
                          placeholderTextColor={COLORS.placeholderText}
                          onFocus={onInputFocus}
                          keyboardType="numeric"
                          maxLength={4}
                        />
                        <TouchableOpacity onPress={() => removeSet(exIdx, setIdx)} hitSlop={8}>
                          <Ionicons name="remove-circle-outline" size={20} color={COLORS.gray} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* add set */}
                    <TouchableOpacity
                      onPress={() => addSetToExercise(exIdx)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={COLORS.button} />
                      <Text style={{ fontSize: 13, color: COLORS.button, fontWeight: '600' }}>
                        Add set
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* add exercise */}
                <PressableScale
                  onPress={addExercise}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: 14, borderRadius: 12,
                    borderWidth: 1, borderColor: COLORS.border,
                    borderStyle: 'dashed', marginBottom: 20,
                  }}
                >
                  <Ionicons name="add" size={20} color={COLORS.button} />
                  <Text style={{ fontSize: 15, color: COLORS.button, fontWeight: '600' }}>
                    Add exercise
                  </Text>
                </PressableScale>

                {/* save */}
                <PressableScale
                  onPress={saveEdit}
                  disabled={editSaving}
                  style={{
                    backgroundColor: COLORS.button, borderRadius: 12, padding: 16,
                    alignItems: 'center', opacity: editSaving ? 0.6 : 1, marginBottom: 8,
                  }}
                >
                  <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
                    {editSaving ? 'Saving...' : 'Save changes'}
                  </Text>
                </PressableScale>
              </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
      )}

      {/*  ADD WORKOUT OVERLAY   */}
      {showAdd && (
      <View ref={overlayRef} style={{
        position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
        zIndex: 70, elevation: 70,
      }}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.4)',
          justifyContent: 'center', alignItems: 'center', padding: 20,
          paddingBottom: 20 + keyboardInset,
        }}>
          <View style={{ width: '100%', maxWidth: 480, maxHeight: '85%' }}>
            <View style={{
              backgroundColor: COLORS.white,
              borderRadius: 20,
              overflow: 'hidden',
              maxHeight: '100%',
            }}>
              <View style={{
                flexDirection: 'row', justifyContent: 'space-between',
                alignItems: 'center', padding: 20,
                borderBottomWidth: 1, borderBottomColor: COLORS.border,
              }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.black }}>
                  New Workout
                </Text>
                <TouchableOpacity onPress={() => setShowAdd(false)}>
                  <Ionicons name="close" size={24} color={COLORS.black} />
                </TouchableOpacity>
              </View>

              <ScrollView
                ref={formScrollRef}
                contentContainerStyle={{ padding: 20 }}
                keyboardShouldPersistTaps="handled"
                onLayout={(e) => { formViewport.current.h = e.nativeEvent.layout.height; }}
                onScroll={(e) => { formViewport.current.y = e.nativeEvent.contentOffset.y; }}
                scrollEventThrottle={32}
              >
              <View ref={formContentRef} collapsable={false}>
                <Text style={styles.inputLabel}>Routine Name</Text>
                <TextInput
                  style={[styles.input, { marginBottom: 20 }]}
                  placeholder="e.g Upper Body Day"
                  placeholderTextColor={COLORS.placeholderText}
                  onFocus={onInputFocus}
                  value={newTitle}
                  onChangeText={setNewTitle}
                />

                {/* exercises */}
                {newExercises.map((ex, exIdx) => (
                  <View key={exIdx} style={{
                    borderWidth: 1, borderColor: COLORS.border, borderRadius: 12,
                    padding: 14, marginBottom: 16, backgroundColor: COLORS.inputBackground,
                  }}>
                    {/* exercise name + remove */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                      <TextInput
                        style={{
                          flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
                          padding: 10, fontSize: 14, color: COLORS.black, backgroundColor: COLORS.white,
                        }}
                        value={ex.name}
                        onChangeText={(t) => updateNewExerciseName(exIdx, t)}
                        placeholder="Exercise name"
                        placeholderTextColor={COLORS.placeholderText}
                        onFocus={onInputFocus}
                      />
                      <TouchableOpacity onPress={() => removeNewExercise(exIdx)} hitSlop={8}>
                        <Ionicons name="close-circle" size={22} color="#E24B4A" />
                      </TouchableOpacity>
                    </View>

                    {/* sets */}
                    {ex.sets.map((s, setIdx) => (
                      <View key={setIdx} style={{
                        flexDirection: 'row', gap: 8, marginBottom: 8, alignItems: 'center',
                      }}>
                        <Text style={{ fontSize: 12, color: COLORS.gray, width: 36 }}>
                          Set {setIdx + 1}
                        </Text>
                        <TextInput
                          style={{
                            flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
                            padding: 8, fontSize: 13, color: COLORS.black,
                            backgroundColor: COLORS.white, textAlign: 'center',
                          }}
                          value={s.reps}
                          onChangeText={(t) => updateNewSet(exIdx, setIdx, 'reps', t)}
                          placeholder="Reps"
                          placeholderTextColor={COLORS.placeholderText}
                          onFocus={onInputFocus}
                          keyboardType="numeric"
                          maxLength={3}
                        />
                        <TextInput
                          style={{
                            flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
                            padding: 8, fontSize: 13, color: COLORS.black,
                            backgroundColor: COLORS.white, textAlign: 'center',
                          }}
                          value={s.weightKg}
                          onChangeText={(t) => updateNewSet(exIdx, setIdx, 'weightKg', t)}
                          placeholder="kg"
                          placeholderTextColor={COLORS.placeholderText}
                          onFocus={onInputFocus}
                          keyboardType="numeric"
                          maxLength={4}
                        />
                        <TouchableOpacity onPress={() => removeNewSet(exIdx, setIdx)} hitSlop={8}>
                          <Ionicons name="remove-circle-outline" size={20} color={COLORS.gray} />
                        </TouchableOpacity>
                      </View>
                    ))}

                    {/* add set */}
                    <TouchableOpacity
                      onPress={() => addSetToNewExercise(exIdx)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}
                    >
                      <Ionicons name="add-circle-outline" size={18} color={COLORS.button} />
                      <Text style={{ fontSize: 13, color: COLORS.button, fontWeight: '600' }}>
                        Add set
                      </Text>
                    </TouchableOpacity>
                  </View>
                ))}

                {/* add exercise */}
                <PressableScale
                  onPress={addNewExercise}
                  style={{
                    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
                    gap: 8, padding: 14, borderRadius: 12,
                    borderWidth: 1, borderColor: COLORS.border,
                    borderStyle: 'dashed', marginBottom: 20,
                  }}
                >
                  <Ionicons name="add" size={20} color={COLORS.button} />
                  <Text style={{ fontSize: 15, color: COLORS.button, fontWeight: '600' }}>
                    Add exercise
                  </Text>
                </PressableScale>

                <PressableScale
                  style={[styles.saveBtn, saving && { opacity: 0.6 }]}
                  onPress={saveWorkout}
                  disabled={saving}
                >
                  <Text style={styles.saveText}>{saving ? 'Saving...' : 'Save Workout'}</Text>
                </PressableScale>
              </View>
              </ScrollView>
            </View>
          </View>
        </View>
      </View>
      )}

      {/*  OFFLINE GUIDE — Modal so the dim backdrop covers the WHOLE screen uniformly
           (an in-layout absolute overlay left lighter patches around the system bars) */}
      <Modal visible={showGuide} transparent animationType="fade" statusBarTranslucent onRequestClose={closeGuide}>
        <View style={{
          flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center', padding: 20,
        }}>
          <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 20, maxHeight: '85%' }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.black, marginBottom: 4 }}>
              Train offline, sync later
            </Text>
            <Text style={{ fontSize: 13, color: COLORS.gray, marginBottom: 14 }}>
              {"Your Workout Tracker doesn't need the internet."}
            </Text>
            <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
              {OFFLINE_GUIDE_STEPS.map((step) => (
                <View key={step.title} style={{ flexDirection: 'row', gap: 12, marginBottom: 14 }}>
                  <View style={{
                    width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.inputBackground,
                    alignItems: 'center', justifyContent: 'center',
                  }}>
                    <Ionicons name={step.icon} size={18} color={COLORS.button} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.black }}>{step.title}</Text>
                    <Text style={{ fontSize: 12, lineHeight: 18, color: '#555555', marginTop: 2 }}>{step.text}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
            <TouchableOpacity
              style={{ backgroundColor: COLORS.button, borderRadius: 12, padding: 14, alignItems: 'center', marginTop: 6 }}
              onPress={closeGuide}
            >
              <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '700' }}>Got it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}