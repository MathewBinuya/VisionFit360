import { View, Text } from 'react-native';
import COLORS from '../constants/colors';

// Minimal onboarding step indicator: a "STEP x OF n" caption above a row of
// segments that fill up to the current step. Keeps the flow feeling cohesive.
export default function StepProgress({ current, total }) {
  return (
    <View style={{ marginBottom: 18 }}>
      <Text style={{
        fontSize: 12, letterSpacing: 1.2, color: COLORS.placeholderText,
        fontWeight: '700', marginBottom: 10, fontFamily: 'GeneralSans-Variable',
      }}>
        STEP {current} OF {total}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={{
              flex: 1, height: 5, borderRadius: 3,
              backgroundColor: i < current ? COLORS.button : COLORS.border,
            }}
          />
        ))}
      </View>
    </View>
  );
}
