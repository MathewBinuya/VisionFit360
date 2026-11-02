import { View, Text, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native'
import { useState } from 'react'
import { router } from 'expo-router'
import { Ionicons } from "@expo/vector-icons"
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/onBoardingStyle/profile.style'
import api from '../../lib/axios'
import { GOALS } from '../../lib/goals'
import { useAlert } from '../../components/AppAlert'
import { useAuthStore } from '../../store/authStore'

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
        <Text style={styles.label}>4 of 4</Text>
        <Text style={styles.title}>{"What's your main goal?"}</Text>

        <View style={{ marginTop: 16, marginBottom: 20 }}>
          {GOALS.map((g) => {
            const active = goal === g.key;
            return (
              <TouchableOpacity
                key={g.key}
                style={[styles.goalOption, active && styles.goalOptionActive]}
                onPress={() => setGoal(g.key)}
                activeOpacity={0.8}
              >
                <View style={[styles.goalIcon, active && styles.goalIconActive]}>
                  <Ionicons name={g.icon} size={20} color={active ? COLORS.white : COLORS.button} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.goalLabel, active && styles.goalLabelActive]}>{g.label}</Text>
                  <Text style={[styles.goalDesc, active && styles.goalDescActive]}>{g.desc}</Text>
                </View>
                {active && <Ionicons name="checkmark-circle" size={22} color={COLORS.white} />}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={[styles.button, isSaving && { opacity: 0.6 }]}
          onPress={handleContinue}
          disabled={isSaving}
        >
          {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Continue</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}
