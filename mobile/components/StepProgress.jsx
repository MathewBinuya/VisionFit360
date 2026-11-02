import { useRef, useEffect } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import COLORS from '../constants/colors';

// Onboarding step indicator: a "STEP x OF n" caption above a row of segments.
// The filled segments fade in with a quick stagger whenever the step changes —
// native-driver opacity only, so it's effectively free.
export default function StepProgress({ current, total }) {
  const anims = useRef(Array.from({ length: total }, () => new Animated.Value(0))).current;

  useEffect(() => {
    Animated.stagger(
      70,
      anims.map((a, i) =>
        Animated.timing(a, {
          toValue: i < current ? 1 : 0,
          duration: 280,
          useNativeDriver: true,
        })
      )
    ).start();
  }, [current, anims]);

  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{
        fontSize: 12, letterSpacing: 1.2, color: COLORS.placeholderText,
        fontWeight: '700', marginBottom: 10, fontFamily: 'GeneralSans-Variable',
      }}>
        STEP {current} OF {total}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {anims.map((a, i) => (
          <View
            key={i}
            style={{ flex: 1, height: 5, borderRadius: 3, backgroundColor: COLORS.border, overflow: 'hidden' }}
          >
            <Animated.View
              style={{ ...StyleSheet.absoluteFillObject, backgroundColor: COLORS.button, opacity: a }}
            />
          </View>
        ))}
      </View>
    </View>
  );
}
