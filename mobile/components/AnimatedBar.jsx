import { useEffect, useRef } from 'react';
import { Animated, View } from 'react-native';

// A horizontal progress bar whose fill animates to `fraction` (0–1) whenever it
// changes. Width can't use the native driver, but a thin bar is cheap to animate.
export default function AnimatedBar({ fraction = 0, trackStyle, fillStyle, duration = 450 }) {
  const v = useRef(new Animated.Value(0)).current;
  const clamped = Math.max(0, Math.min(1, Number(fraction) || 0));

  useEffect(() => {
    Animated.timing(v, { toValue: clamped, duration, useNativeDriver: false }).start();
  }, [clamped]);

  const width = v.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });

  return (
    <View style={trackStyle}>
      <Animated.View style={[fillStyle, { width }]} />
    </View>
  );
}
