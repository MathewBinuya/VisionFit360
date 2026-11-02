import { View,
         Text,
         TextInput,
         KeyboardAvoidingView,
         ActivityIndicator,
         TouchableOpacity,
         ScrollView,
         Platform,
        } from 'react-native'
import { useState, useEffect } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/onBoardingStyle/profile.style';
import { router } from "expo-router";
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { useAlert } from '../../components/AppAlert';
import StepProgress from '../../components/StepProgress';
import {
  cmToFtIn, ftInToCm, kgToLb, lbToKg, cleanNumber, unitPrefKey,
  MIN_HEIGHT_CM, MAX_HEIGHT_CM, MIN_WEIGHT_KG, MAX_WEIGHT_KG,
} from '../../lib/units';

export default function Body() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const alert = useAlert();
  const [isSaving, setIsSaving] = useState(false);

  // canonical metric values (what we send) — strings so inputs stay controlled
  const [metricHeight, setMetricHeight] = useState("");
  const [metricWeight, setMetricWeight] = useState("");

  // display units + the per-unit input fields
  const [heightUnit, setHeightUnit] = useState("cm"); // 'cm' | 'ft'
  const [weightUnit, setWeightUnit] = useState("kg"); // 'kg' | 'lb'
  const [ftVal, setFtVal] = useState("");
  const [inVal, setInVal] = useState("");
  const [lbVal, setLbVal] = useState("");

  // restore the user's saved unit preference
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(unitPrefKey(user?.id));
        if (raw) {
          const p = JSON.parse(raw);
          if (p.height === "ft" || p.height === "cm") setHeightUnit(p.height);
          if (p.weight === "lb" || p.weight === "kg") setWeightUnit(p.weight);
        }
      } catch (_e) {}
    })();
  }, [user?.id]);

  const savePref = async (height, weight) => {
    try {
      await AsyncStorage.setItem(unitPrefKey(user?.id), JSON.stringify({ height, weight }));
    } catch (_e) {}
  };

  const isComplete = metricHeight !== "" && metricWeight !== "";

  const validate = () => {
    if (!metricHeight) return "Please enter your height";
    const h = Number(metricHeight);
    if (isNaN(h) || h < MIN_HEIGHT_CM || h > MAX_HEIGHT_CM)
      return `Please enter a valid height (${MIN_HEIGHT_CM}–${MAX_HEIGHT_CM} cm)`;
    if (!metricWeight) return "Please enter your weight";
    const w = Number(metricWeight);
    if (isNaN(w) || w < MIN_WEIGHT_KG || w > MAX_WEIGHT_KG)
      return `Please enter a valid weight (${MIN_WEIGHT_KG}–${MAX_WEIGHT_KG} kg)`;
    return null;
  };

  // --- height handlers ---
  const onHeightCm = (t) => setMetricHeight(cleanNumber(t));
  const onFt = (t) => { const v = cleanNumber(t); setFtVal(v); setMetricHeight(ftInToCm(v, inVal)); };
  const onIn = (t) => { const v = cleanNumber(t); setInVal(v); setMetricHeight(ftInToCm(ftVal, v)); };
  const toggleHeightUnit = (u) => {
    if (u === heightUnit) return;
    if (u === "ft") { const { ft, in: inch } = cmToFtIn(metricHeight); setFtVal(ft); setInVal(inch); }
    setHeightUnit(u);
    savePref(u, weightUnit);
  };

  // --- weight handlers ---
  const onWeightKg = (t) => setMetricWeight(cleanNumber(t, true));
  const onLb = (t) => { const v = cleanNumber(t, true); setLbVal(v); setMetricWeight(lbToKg(v)); };
  const toggleWeightUnit = (u) => {
    if (u === weightUnit) return;
    if (u === "lb") setLbVal(kgToLb(metricWeight));
    setWeightUnit(u);
    savePref(heightUnit, u);
  };

  const handleContinue = async () => {
    const error = validate();
    if (error) { alert("Hold on", error); return; }

    setIsSaving(true);
    try {
      const res = await api.put("/profile", {
        heightCm: Number(metricHeight),
        weightKg: Number(metricWeight),
      });
      if (res?.data) await setUser(res.data);
      router.push("/(onBoarding)/bmi");
    } catch (error) {
      alert("Error", error.response?.data?.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

  const UnitToggle = ({ units, active, onPick }) => (
    <View style={styles.unitToggle}>
      {units.map((u) => (
        <TouchableOpacity
          key={u}
          style={[styles.unitPill, active === u && styles.unitPillActive]}
          onPress={() => onPick(u)}
        >
          <Text style={[styles.unitText, active === u && styles.unitTextActive]}>
            {u === "ft" ? "ft/in" : u}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.card}>
          <StepProgress current={2} total={4} />
          <Text style={styles.title}>Your height & weight</Text>
          <Text style={[styles.subtitle, { marginBottom: 4 }]}>We use these for your BMI and plans.</Text>

          <View style={styles.formContainer}>
            {/* Height */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Height</Text>
                <UnitToggle units={["cm", "ft"]} active={heightUnit} onPick={toggleHeightUnit} />
              </View>
              {heightUnit === "cm" ? (
                <View style={styles.inputContainer}>
                  <TextInput
                    style={styles.input}
                    placeholder="175"
                    placeholderTextColor={COLORS.placeholderText}
                    value={metricHeight}
                    onChangeText={onHeightCm}
                    keyboardType="numeric"
                    maxLength={3}
                  />
                </View>
              ) : (
                <View style={styles.rowContainer}>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="5"
                      placeholderTextColor={COLORS.placeholderText}
                      value={ftVal}
                      onChangeText={onFt}
                      keyboardType="numeric"
                      maxLength={1}
                    />
                    <Text style={styles.unitSuffix}>ft</Text>
                  </View>
                  <View style={[styles.inputContainer, { flex: 1 }]}>
                    <TextInput
                      style={styles.input}
                      placeholder="9"
                      placeholderTextColor={COLORS.placeholderText}
                      value={inVal}
                      onChangeText={onIn}
                      keyboardType="numeric"
                      maxLength={2}
                    />
                    <Text style={styles.unitSuffix}>in</Text>
                  </View>
                </View>
              )}
            </View>

            {/* Weight */}
            <View style={styles.inputGroup}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Weight</Text>
                <UnitToggle units={["kg", "lb"]} active={weightUnit} onPick={toggleWeightUnit} />
              </View>
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder={weightUnit === "kg" ? "70" : "154"}
                  placeholderTextColor={COLORS.placeholderText}
                  value={weightUnit === "kg" ? metricWeight : lbVal}
                  onChangeText={weightUnit === "kg" ? onWeightKg : onLb}
                  keyboardType="numeric"
                  maxLength={6}
                />
                <Text style={styles.unitSuffix}>{weightUnit}</Text>
              </View>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.button, (!isComplete || isSaving) && { opacity: 0.6 }]}
            onPress={handleContinue}
            disabled={isSaving}
          >
            {isSaving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.buttonText}>Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
