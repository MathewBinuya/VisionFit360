import { useRef } from 'react';
import { Animated, Pressable } from 'react-native';

// Button wrapper that gives a tactile press: a quick scale-down on press-in and
// spring-back on release. Runs on the native driver (transform only), so there's
// no JS-thread work per frame. Drop-in for TouchableOpacity on CTA buttons.
export default function PressableScale({ children, style, onPress, disabled, scaleTo = 0.96, ...rest }) {
  const scale = useRef(new Animated.Value(1)).current;
  const animate = (toValue) =>
    Animated.spring(scale, { toValue, useNativeDriver: true, speed: 40, bounciness: 0 }).start();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      onPressIn={() => animate(scaleTo)}
      onPressOut={() => animate(1)}
      {...rest}
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
