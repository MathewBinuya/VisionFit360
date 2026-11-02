import { useEffect, useRef } from 'react';
import { Modal, View, Text, Animated, Easing, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import COLORS from '../constants/colors';

const CONFETTI_COLORS = ['#F2C14E', '#F26B5E', '#4E9BF2', '#59C27A', '#A368F0', '#111111'];
const PIECES = 16;

// A one-shot celebration popup: a card springs in with a checkmark while a small
// burst of confetti flies out and fades. Every animation runs once with the native
// driver (no loops), so it's cheap. Auto-dismisses, and has an explicit button too.
export default function Celebration({
  visible,
  title = 'Nice! 🎉',
  message,
  onClose,
  autoHideMs = 2200,
}) {
  const pop = useRef(new Animated.Value(0)).current;
  const pieces = useRef([...Array(PIECES)].map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!visible) return;
    pop.setValue(0);
    pieces.forEach((p) => p.setValue(0));
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    Animated.stagger(
      25,
      pieces.map((p) =>
        Animated.timing(p, {
          toValue: 1,
          duration: 850 + Math.random() * 500,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        })
      )
    ).start();
    const t = autoHideMs ? setTimeout(() => onClose?.(), autoHideMs) : null;
    return () => { if (t) clearTimeout(t); };
  }, [visible]);

  if (!visible) return null;

  const cardScale = pop.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' }}>
        {/* confetti burst from the centre */}
        {pieces.map((p, i) => {
          const angle = (i / PIECES) * Math.PI * 2;
          const dist = 110 + (i % 3) * 34;
          const tx = p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.cos(angle) * dist] });
          const ty = p.interpolate({ inputRange: [0, 1], outputRange: [0, Math.sin(angle) * dist + 70] });
          const rot = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${(i % 2 ? 1 : -1) * 360}deg`] });
          const op = p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 1, 0] });
          return (
            <Animated.View
              key={i}
              style={{
                position: 'absolute', top: '50%', left: '50%',
                width: 8, height: 13, borderRadius: 2,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                opacity: op,
                transform: [{ translateX: tx }, { translateY: ty }, { rotate: rot }],
              }}
            />
          );
        })}

        {/* celebration card */}
        <Animated.View
          style={{
            backgroundColor: COLORS.white, borderRadius: 22,
            paddingVertical: 28, paddingHorizontal: 28,
            alignItems: 'center', width: 270,
            opacity: pop, transform: [{ scale: cardScale }],
          }}
        >
          <View style={{
            width: 66, height: 66, borderRadius: 33, backgroundColor: COLORS.inputBackground,
            alignItems: 'center', justifyContent: 'center', marginBottom: 14,
          }}>
            <Ionicons name="checkmark-circle" size={42} color={COLORS.button} />
          </View>
          <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.black, textAlign: 'center' }}>{title}</Text>
          {!!message && (
            <Text style={{ fontSize: 13, color: '#555555', textAlign: 'center', marginTop: 6, lineHeight: 18 }}>
              {message}
            </Text>
          )}
          <TouchableOpacity
            onPress={onClose}
            style={{ marginTop: 18, backgroundColor: COLORS.button, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 30 }}
          >
            <Text style={{ color: COLORS.white, fontWeight: '700', fontSize: 14 }}>Awesome</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}
