import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, useWindowDimensions, Animated, Easing } from 'react-native'
import { useState, useEffect, useCallback, useRef } from 'react'
import { router, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { goBack } from '../lib/nav'
import { Image } from 'expo-image'
import { Ionicons } from "@expo/vector-icons"
import COLORS from "../constants/colors"
import styles from '../assets/styles/repvisionguide.style'
import { AR_EXERCISES } from '../lib/exercises'
import { fetchExerciseDemo, DEMO_ATTRIBUTION } from '../lib/exerciseDemo'

// what the coloured camera border means (shown once, shared by every exercise)
const BORDER_LEGEND = [
  { color: "#1DB954", label: "Green", text: "Rep counted — good form." },
  { color: "#E24B4A", label: "Red", text: "Form problem — rep not counted." },
  { color: "#E0A526", label: "Amber", text: "Position unclear or app not ready yet." },
];

// Collapsible guide section — keeps every detail but tucks it behind a tappable
// header, so the page stays minimal and the user opens only what they need.
function GuideSection({ title, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  // Gentle "tap me" nudge on the See more chevron — a native-driver loop (cheap,
  // runs on the UI thread). It ONLY runs while collapsed; opening stops it.
  const boost = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (open) { boost.stopAnimation(); boost.setValue(0); return; }
    // chevron shoots downward fast then eases to a stop (ease-OUT = decelerate,
    // right for a downward motion), fades, then the loop resets it to the top —
    // reading like a repeating downward "boost".
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(boost, { toValue: 1, duration: 600, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.delay(350),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [open]);
  const translateY = boost.interpolate({ inputRange: [0, 1], outputRange: [0, 14] });
  const boostOpacity = boost.interpolate({ inputRange: [0, 0.6, 1], outputRange: [1, 1, 0] });

  return (
    <View style={styles.tipsBox}>
      <TouchableOpacity
        style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.7}
      >
        <Text style={[styles.tipsHeading, { flex: 1, marginBottom: 0 }]}>{title}</Text>
        <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.button }}>
          {open ? "See less" : "See more"}
        </Text>
        {open ? (
          <Ionicons name="chevron-up" size={18} color={COLORS.button} />
        ) : (
          <Animated.View style={{ transform: [{ translateY }], opacity: boostOpacity }}>
            <Ionicons name="chevron-down" size={18} color={COLORS.button} />
          </Animated.View>
        )}
      </TouchableOpacity>
      {open && <View style={{ marginTop: 12 }}>{children}</View>}
    </View>
  );
}

export default function RepVisionGuide() {
  // `from=ar` means we were opened on top of a live AR session.
  const { exercise = "squat", from } = useLocalSearchParams();
  const openedFromAr = from === "ar";

  const found = AR_EXERCISES.find((e) => e.key === exercise);
  const unknownKey = !found;
  if (unknownKey) {
    // make an unknown key visible instead of silently showing Squat
    console.warn(`[RepVisionGuide] unknown exercise key "${exercise}" — falling back to ${AR_EXERCISES[0].key}`);
  }
  const ex = found || AR_EXERCISES[0];

  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  // Live demo from AscendAPI. status: 'none' (no mapping) | 'loading' | 'ready' | 'failed'
  const ascendId = ex.ascend?.id || null;
  const [demo, setDemo] = useState(null);
  const [status, setStatus] = useState(ascendId ? "loading" : "none");

  const loadDemo = useCallback(async () => {
    if (!ascendId) { setStatus("none"); return; }
    setStatus("loading");
    const result = await fetchExerciseDemo(ascendId); // fresh every time (free tier: no caching)
    if (result) { setDemo(result); setStatus("ready"); }
    else { setDemo(null); setStatus("failed"); }
  }, [ascendId]);

  useEffect(() => { loadDemo(); }, [loadDemo]);

  // specific muscles, falls back to the group if no target is set
  const targetMuscles = ex.target?.length ? ex.target : [ex.group];
  // responsive demo size: square, capped so it never dominates big screens
  // free-tier GIFs are 180x180 — keep the upscale modest so they stay sharp
  const demoSize = Math.min(width - 40, 260);

  const onStart = () => {
    // Opened from the AR screen → go BACK to the existing session (never spawn a
    // second AR instance). Opened from the exercise list → push the tracker.
    if (openedFromAr) goBack();
    else router.push(`/posetracker?exercise=${ex.key}`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>How to do it</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 24 }]}>
        {unknownKey && (
          <View style={styles.warnBox}>
            <Ionicons name="alert-circle-outline" size={16} color="#854f0b" />
            <Text style={styles.warnText}>
              Unknown exercise {`"${String(exercise)}"`}. Showing {ex.label} instead.
            </Text>
          </View>
        )}

        <View style={styles.iconWrap}>
          <Ionicons name={ex.icon} size={48} color={COLORS.button} />
        </View>
        <Text style={styles.title}>{ex.label}</Text>
        <Text style={styles.group}>{ex.group}</Text>

        {/* equipment */}
        {!!ex.equipment && (
          <View style={styles.metaRow}>
            <View style={styles.metaChip}>
              <Ionicons name="barbell-outline" size={14} color={COLORS.button} />
              <Text style={styles.metaChipText}>{ex.equipment}</Text>
            </View>
          </View>
        )}

        {/* demo — live from AscendAPI; graceful fallback if unmapped/offline */}
        <View style={[styles.demoBox, { width: demoSize, height: demoSize }]}>
          {status === "ready" && demo ? (
            <Image
              source={{ uri: demo.gifUrl }}
              style={styles.demoImage}
              contentFit="contain"
              cachePolicy="none"
              autoplay
              onError={() => setStatus("failed")}
              accessibilityLabel={`${ex.label} demonstration`}
            />
          ) : status === "loading" ? (
            <View style={styles.demoPlaceholder}>
              <ActivityIndicator color={COLORS.button} />
              <Text style={styles.demoPlaceholderText}>Loading demo…</Text>
            </View>
          ) : status === "failed" ? (
            <TouchableOpacity style={styles.demoPlaceholder} onPress={loadDemo} activeOpacity={0.7}>
              <Ionicons name="cloud-offline-outline" size={36} color={COLORS.placeholderText} />
              <Text style={styles.demoPlaceholderText}>{"Couldn't load the demo"}</Text>
              <Text style={styles.demoRetryText}>Tap to retry</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.demoPlaceholder}>
              <Ionicons name={ex.icon} size={40} color={COLORS.placeholderText} />
              <Text style={styles.demoPlaceholderText}>Demo coming soon</Text>
            </View>
          )}
        </View>
        {status === "ready" && (
          <Text style={styles.creditText}>
            {ex.ascend?.approx && demo?.name ? `Closest available demo: "${demo.name}". ` : ""}
            {DEMO_ATTRIBUTION}
          </Text>
        )}

        {/* target muscles */}
        <Text style={styles.sectionHeading}>Target muscles</Text>
        <View style={styles.muscleWrap}>
          {targetMuscles.map((muscle) => (
            <View key={muscle} style={styles.muscleChip}>
              <Ionicons name={ex.icon} size={14} color={COLORS.button} />
              <Text style={styles.muscleChipText}>{muscle}</Text>
            </View>
          ))}
        </View>

        {/* step-by-step — the core guide, open by default */}
        {!!ex.instructions?.length && (
          <GuideSection title="How to perform it" defaultOpen>
            {ex.instructions.map((step, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.tipNumber}>
                  <Text style={styles.tipNumberText}>{i + 1}</Text>
                </View>
                <Text style={styles.tipText}>{step}</Text>
              </View>
            ))}
          </GuideSection>
        )}

        {/* setup & form tips — tap to expand */}
        {!!ex.tips?.length && (
          <GuideSection title="Setup & form tips">
            {ex.tips.map((tip, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.bullet} />
                <Text style={styles.tipText}>{tip}</Text>
              </View>
            ))}
          </GuideSection>
        )}

        {/* weight logging & personal records (weighted lifts only) — tap to expand */}
        {/dumbbell|barbell/i.test(ex.equipment || "") && (
          <GuideSection title="Tracking your lifts & PRs">
            {[
              "Set the weight you're lifting on the tracker with the − / + buttons (or tap to type it).",
              "On Finish & Save, the set — your reps and weight — is saved to your History.",
              "Your heaviest set for each exercise becomes a Personal Record (PR); beat it and you'll see a 🏆.",
              "Weights show in kg or lb — switch the unit in your Profile; your data stays the same.",
            ].map((t, i) => (
              <View key={i} style={styles.tipRow}>
                <View style={styles.bullet} />
                <Text style={styles.tipText}>{t}</Text>
              </View>
            ))}
          </GuideSection>
        )}

        {/* shared setup + border colours — tap to expand */}
        <GuideSection title="Setup & border colours">
          {[
            "Place your phone at about hip height.",
            "Stand about 2–3 m away so your full body and head are in frame.",
            "Turn side-on for the deadlift and push-up (a side view is needed to judge them).",
          ].map((t, i) => (
            <View key={i} style={styles.tipRow}>
              <View style={styles.bullet} />
              <Text style={styles.tipText}>{t}</Text>
            </View>
          ))}

          <View style={{ height: 8 }} />
          {BORDER_LEGEND.map((row) => (
            <View key={row.label} style={styles.legendRow}>
              <View style={[styles.legendDot, { backgroundColor: row.color }]} />
              <Text style={styles.tipText}>
                <Text style={{ fontWeight: "700" }}>{row.label}</Text> — {row.text}
              </Text>
            </View>
          ))}
        </GuideSection>

        <TouchableOpacity style={styles.startBtn} onPress={onStart}>
          <Ionicons name="camera" size={20} color={COLORS.white} />
          <Text style={styles.startText}>
            {openedFromAr ? "Back to RepVision" : "Start RepVision"}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
