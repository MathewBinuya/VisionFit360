import { useRef, useEffect } from 'react';
import { Animated, Easing } from 'react-native';

// Lightweight entrance animation: fade + slight slide-up on mount. Runs entirely
// on the native driver (opacity + transform only), so it never touches the JS
// thread per frame and has no measurable performance cost.
export default function FadeInView({ children, style, delay = 0, duration = 420 }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [delay, duration, opacity, translateY]);

  return (
    <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>
      {children}
    </Animated.View>
  );
}
