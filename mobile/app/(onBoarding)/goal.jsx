import { View, Text, ActivityIndicator, ScrollView, Animated } from 'react-native'
import { useState, useRef, useEffect } from 'react'
import { router } from 'expo-router'
import { Ionicons } from "@expo/vector-icons"
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/onBoardingStyle/profile.style'
import api from '../../lib/axios'
import { GOALS } from '../../lib/goals'
import { useAlert } from '../../components/AppAlert'
import { useAuthStore } from '../../store/authStore'
import StepProgress from '../../components/StepProgress'
import PressableScale from '../../components/PressableScale'
import FadeInView from '../../components/FadeInView'

// elevated look for the selected goal
const activeShadow = {
  shadowColor: '#1A1D24', shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.18, shadowRadius: 16, elevation: 8,
};

// A selectable goal card: springs/pops its checkmark when chosen, lifts when
// active, and fades in with a per-item stagger. All animation is native-driver.
function GoalCard({ g, active, index, onPress }) {
  const pop = useRef(new Animated.Value(active ? 1 : 0.6)).current;
  useEffect(() => {
    Animated.spring(pop, { toValue: active ? 1 : 0.6, useNativeDriver: true, friction: 5, tension: 120 }).start();
  }, [active, pop]);

  return (
    <FadeInView delay={index * 70}>
      <PressableScale
        style={[styles.goalOption, active && styles.goalOptionActive, active && activeShadow]}
        onPress={onPress}
      >
        <View style={[styles.goalIcon, active && styles.goalIconActive]}>
          <Ionicons name={g.icon} size={20} color={active ? COLORS.white : COLORS.button} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.goalLabel, active && styles.goalLabelActive]}>{g.label}</Text>
          <Text style={[styles.goalDesc, active && styles.goalDescActive]}>{g.desc}</Text>
        </View>
        {active && (
          <Animated.View style={{ transform: [{ scale: pop }] }}>
            <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />
          </Animated.View>
        )}
      </PressableScale>
    </FadeInView>
  );
}

export default function Goal() {
  const alert = useAlert();
  const [goal, setGoal] = useState("get_fit"); // safe default
  const [isSaving, setIsSaving] = useState(false);

  const handleContinue = async () => {
    if (!goal) {
      alert("Pick a goal", "Please choose a fitness goal to continue.");
      return;
    }
    setIsSaving(true);
    try {
      await api.put("/profile", { goal });
      await api.put("/profile/complete-onboarding");       // flip the flag on backend
      await useAuthStore.getState().completeOnboarding();  // sync store + storage
      router.replace("/(tabs)/home");
    } catch (error) {
      alert("Error", error.response?.data?.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <StepProgress current={4} total={4} />
        <Text style={styles.title}>{"What's your main goal?"}</Text>
        <Text style={[styles.subtitle, { marginBottom: 4 }]}>{"We'll tailor your workouts to this."}</Text>

        <View style={{ marginTop: 16, marginBottom: 20 }}>
          {GOALS.map((g, i) => (
            <GoalCard key={g.key} g={g} index={i} active={goal === g.key} onPress={() => setGoal(g.key)} />
          ))}
        </View>

        <PressableScale
          style={[styles.button, isSaving && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={isSaving}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </PressableScale>
      </View>
    </ScrollView>
  );
}
