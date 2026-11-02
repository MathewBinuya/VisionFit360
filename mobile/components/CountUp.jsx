import { useEffect, useRef, useState } from 'react';
import { Animated, Text } from 'react-native';

// Renders a number that animates from its previous value up to `value` on change.
// `format(n)` can wrap the rounded number with units/pluralization.
export default function CountUp({ value = 0, duration = 700, style, format }) {
  const v = useRef(new Animated.Value(Number(value) || 0)).current;
  const [display, setDisplay] = useState(Number(value) || 0);

  useEffect(() => {
    const id = v.addListener(({ value: val }) => setDisplay(val));
    Animated.timing(v, { toValue: Number(value) || 0, duration, useNativeDriver: false }).start();
    return () => v.removeListener(id);
  }, [value]);

  const n = Math.round(display);
  return <Text style={style}>{format ? format(n) : String(n)}</Text>;
}
