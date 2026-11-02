import { View, Text, TouchableOpacity, ScrollView, useWindowDimensions } from 'react-native'
import { useState } from 'react'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { goBack } from '../lib/nav'
import { Ionicons } from "@expo/vector-icons"
import COLORS from "../constants/colors"
import styles from '../assets/styles/arselect.style'
import { AR_EXERCISES } from '../lib/exercises'
import ExerciseIcon from '../components/ExerciseIcon'
import PressableScale from '../components/PressableScale'
import { EXERCISE_ICON_CREDIT } from '../lib/exerciseIcons'

const GRID_PADDING = 16;
const GRID_GAP = 12;
const MAX_GRID_WIDTH = 1000;

export default function ArSelect() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // responsive columns: 2 on phones, 3 on large phones / small tablets, 4 on tablets
  const columns = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gridWidth = Math.min(width, MAX_GRID_WIDTH);
  const cardWidth = (gridWidth - GRID_PADDING * 2 - GRID_GAP * (columns - 1)) / columns;

  // "Scroll for more" cue: show it while the list overflows and we're not yet at
  // the bottom, so new users realise there are more exercises below the fold.
  const [contentH, setContentH] = useState(0);
  const [viewportH, setViewportH] = useState(0);
  const [scrollY, setScrollY] = useState(0);
  const overflows = contentH > viewportH + 4;
  // forgiving threshold so the cue reliably clears once the list rests at/near the end
  const atBottom = scrollY + viewportH >= contentH - 48;
  const showScrollCue = overflows && !atBottom;

  return (
    <View style={styles.container}>
      {/* header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Vision Reps</Text>
        <View style={{ width: 24 }} />
      </View>

      <Text style={styles.subtitle}>Pick an exercise to see how to do it, then track it with your camera</Text>

      <ScrollView
        contentContainerStyle={[styles.grid, { width: gridWidth, alignSelf: "center", paddingBottom: insets.bottom + 72 }]}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
        onContentSizeChange={(_w, h) => setContentH(h)}
        onScroll={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        onMomentumScrollEnd={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        onScrollEndDrag={(e) => setScrollY(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator
      >
        {AR_EXERCISES.map((ex) => (
          <PressableScale
            key={ex.key}
            style={[styles.card, { width: cardWidth }, ex.working === false && { opacity: 0.5 }]}
            disabled={ex.working === false}
            onPress={() => router.push(`/repvision-guide?exercise=${ex.key}`)}
            scaleTo={0.92}
          >
            <ExerciseIcon exerciseKey={ex.key} fallback={ex.icon} size={56} color={COLORS.button} />
            <Text style={styles.cardLabel} numberOfLines={1}>{ex.label}</Text>
            <Text style={styles.cardGroup}>{ex.group}</Text>
            {ex.working === false ? (
              <Text style={styles.soon}>Coming soon</Text>
            ) : (
              <View style={styles.howRow}>
                <Ionicons name="play-circle-outline" size={13} color={COLORS.button} />
                <Text style={styles.howText}>How to do it</Text>
              </View>
            )}
          </PressableScale>
        ))}
        <Text style={styles.credit}>{EXERCISE_ICON_CREDIT}</Text>
      </ScrollView>

      {/* floating "scroll for more" cue — sits above the device nav/gesture bar
          (safe-area inset) so it never overlaps system navigation. Fades out at the end. */}
      {showScrollCue && (
        <View style={[styles.scrollCue, { bottom: insets.bottom + 16 }]} pointerEvents="none">
          <Ionicons name="chevron-down" size={14} color={COLORS.white} />
          <Text style={styles.scrollCueText}>Scroll for more exercises</Text>
        </View>
      )}
    </View>
  );
}
