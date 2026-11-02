import { View,
         Text,
         TouchableOpacity,
         ActivityIndicator,
         ScrollView,
        } from 'react-native'
import { useState, useEffect } from 'react'
import { router } from 'expo-router'
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/onBoardingStyle/bmi.style'
import api from '../../lib/axios'
import { useAuthStore } from '../../store/authStore'
import { useAlert } from '../../components/AppAlert'
import {
  BMI_CATEGORIES,
  categoryInfo,
  colorForCategory,
  BMI_INTERPRETATION,
  BMI_LIMITATIONS,
  BMI_NEUTRAL_NOTE,
} from '../../lib/bmi'


export default function BMI() {
  const user = useAuthStore((s) => s.user);
  const alert = useAlert();
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    calculate();
  }, []);

  const calculate = async () => {
    try {
      // height & weight were saved in the profile step,
      // so the backend pulls them from the user's profile
      const res = await api.post("/bmi", {});
      setResult(res.data);
    } catch (error) {
      alert("Error", error.response?.data?.message || "Could not calculate BMI");
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    // last step (fitness goal) finishes onboarding
    router.push("/(onBoarding)/goal");
  };

  // Adult categories apply to 18+. We only hide the category when we KNOW the
  // person is under 18; unknown age shows the adult category (per product choice).
  const dob = user?.dateOfBirth ? new Date(user.dateOfBirth) : null;
  let age = null;
  if (dob && !isNaN(dob.getTime())) {
    age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
  }
  const knownUnder18 = age != null && age < 18;
  const showCategory = !knownUnder18;

  const info = result ? categoryInfo(result.category) : null;

  return (
    // FIX: layout props (justifyContent, padding, flexGrow) live in styles.container,
    // so it must go in contentContainerStyle. `style` only gets sizing/background.
    <ScrollView
      style={{ flex: 1, backgroundColor: COLORS.background }}
      contentContainerStyle={[styles.container, { paddingBottom: 40 }]}
    >
      <View style={styles.card}>
        <Text style={styles.step}>3 of 4</Text>
        <Text style={styles.title}>Your body composition</Text>

        {loading ? (
          <ActivityIndicator size="large" color={COLORS.button} style={{ marginVertical: 40 }} />
        ) : result ? (
          <>
            <View style={styles.resultCard}>
              <Text style={styles.resultLabel}>Your BMI</Text>
              <Text style={[styles.resultValue, { color: showCategory ? colorForCategory(result.category) : COLORS.black }]}>
                {result.bmi}
              </Text>

              {showCategory ? (
                <Text style={[styles.category, { color: colorForCategory(result.category) }]}>
                  {info?.label || result.category}
                </Text>
              ) : (
                <Text style={[styles.category, { color: COLORS.placeholderText }]}>
                  Category not shown
                </Text>
              )}

              <View style={styles.recap}>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Height</Text>
                  <Text style={styles.recapValue}>{result.heightCm} cm</Text>
                </View>
                <View style={styles.recapRow}>
                  <Text style={styles.recapLabel}>Weight</Text>
                  <Text style={styles.recapValue}>{result.weightKg} kg</Text>
                </View>
              </View>
            </View>

            {/* standard adult reference range */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>Adult reference range</Text>
              {BMI_CATEGORIES.map((c) => {
                const isCurrent = showCategory && info?.key === c.key;
                return (
                  <View key={c.key} style={styles.rangeRow}>
                    <View style={styles.rangeLabelWrap}>
                      <View style={[styles.rangeDot, { backgroundColor: c.color }]} />
                      <Text style={[styles.rangeLabel, isCurrent && styles.rangeLabelCurrent]}>
                        {c.label}
                      </Text>
                    </View>
                    <Text style={[styles.rangeValue, isCurrent && styles.rangeLabelCurrent]}>
                      {c.range}
                    </Text>
                  </View>
                );
              })}
            </View>

            {/* what it means + limitations */}
            <View style={styles.infoBox}>
              <Text style={styles.infoTitle}>What this means</Text>
              <Text style={styles.infoText}>{BMI_INTERPRETATION}</Text>
              <Text style={[styles.infoText, { marginTop: 10 }]}>{BMI_LIMITATIONS}</Text>
              {!showCategory && (
                <Text style={[styles.infoText, { marginTop: 10, fontStyle: "italic" }]}>
                  {BMI_NEUTRAL_NOTE}
                </Text>
              )}
            </View>
          </>
        ) : (
          <Text style={styles.empty}>Add your height and weight to see your BMI.</Text>
        )}

        <TouchableOpacity style={styles.button} onPress={handleContinue}>
          <Text style={styles.buttonText}>Continue</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}