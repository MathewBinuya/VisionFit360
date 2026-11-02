import { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

// A drop-in replacement for TouchableOpacity that springs a subtle scale on press,
// giving buttons and cards a tactile, "alive" feel. Uses the native driver so the
// animation stays smooth even while JS is busy. Pass it the same props you'd give
// a TouchableOpacity (style, onPress, disabled, hitSlop, onLongPress…).
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export default function PressableScale({
  children,
  style,
  scaleTo = 0.96,      // how far it shrinks while pressed
  disabled,
  onPressIn,
  onPressOut,
  activeOpacity,       // accepted for drop-in parity, not used (scale replaces it)
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const pressIn = (e) => {
    Animated.spring(scale, { toValue: scaleTo, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
    onPressIn?.(e);
  };
  const pressOut = (e) => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 8 }).start();
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPressIn={disabled ? undefined : pressIn}
      onPressOut={disabled ? undefined : pressOut}
      style={[style, { transform: [{ scale }] }]}
    >
      {children}
    </AnimatedPressable>
  );
}
