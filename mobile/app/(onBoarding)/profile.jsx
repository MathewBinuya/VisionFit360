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
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/onBoardingStyle/profile.style';
import { router } from "expo-router";
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import { useAlert } from '../../components/AppAlert';
import DateField from '../../components/DateField';
import StepProgress from '../../components/StepProgress';
import { ageFromDob, isValidDob, maxBirthDate, minBirthDate, MIN_AGE, MAX_AGE } from '../../lib/age';

const GENDER_OPTIONS = ["male", "female"];
const USERNAME_RE = /^[a-zA-Z0-9_]{3,30}$/;

// Module-scope so its identity is stable across renders (a component defined
// inside Account would remount every keystroke and drop the input's focus).
const Field = ({ label, children, hint }) => (
  <View style={styles.inputGroup}>
    <View style={styles.labelRow}>
      <Text style={styles.label}>{label}</Text>
      {hint ? <Text style={styles.unitSuffix}>{hint}</Text> : null}
    </View>
    {children}
  </View>
);

export default function Account() {
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const alert = useAlert();

  const [form, setForm] = useState({
    username: "", firstName: "", lastName: "", middleName: "", bio: "", gender: "",
  });
  const [dob, setDob] = useState(null); // date of birth (we store DOB, derive age)
  const [isSaving, setIsSaving] = useState(false);

  // Pre-fill the username with any handle the account already has (e.g. an older
  // account). Blank for brand-new accounts — they choose one here.
  useEffect(() => {
    if (user?.username) setForm((f) => (f.username ? f : { ...f, username: user.username }));
  }, [user?.username]);

  const setField = (k) => (v) => setForm((f) => ({ ...f, [k]: v }));
  const onUsername = (t) => setForm((f) => ({ ...f, username: t.replace(/[^a-zA-Z0-9_]/g, "") }));

  // required: username (valid) + first/last name + gender + date of birth.
  // Middle name and bio are optional.
  const isComplete =
    USERNAME_RE.test(form.username) &&
    form.firstName.trim() !== "" &&
    form.lastName.trim() !== "" &&
    GENDER_OPTIONS.includes(form.gender) &&
    isValidDob(dob);

  const validate = () => {
    if (!form.username.trim()) return "Please choose a username";
    if (!USERNAME_RE.test(form.username))
      return "Username must be 3–30 characters: letters, numbers or underscores";
    if (!form.firstName.trim()) return "Please enter your first name";
    if (!form.lastName.trim()) return "Please enter your last name";
    if (!GENDER_OPTIONS.includes(form.gender)) return "Please select your gender";
    if (!dob) return "Please select your date of birth";
    if (!isValidDob(dob)) return `Please enter a valid date of birth (age ${MIN_AGE}–${MAX_AGE})`;
    return null;
  };

  const handleContinue = async () => {
    const error = validate();
    if (error) { alert("Hold on", error); return; }

    setIsSaving(true);
    try {
      const res = await api.put("/profile", {
        username: form.username.trim(),
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        middleName: form.middleName.trim(),
        bio: form.bio.trim(),
        gender: form.gender,
        dateOfBirth: dob.toISOString(),
      });
      // refresh the local user so later steps + the dashboard reflect the entries
      if (res?.data) await setUser(res.data);
      router.push("/(onBoarding)/body");
    } catch (error) {
      alert("Error", error.response?.data?.message || "Failed to save");
    } finally {
      setIsSaving(false);
    }
  };

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
          <StepProgress current={1} total={4} />
          <Text style={styles.title}>Set up your account</Text>
          <Text style={[styles.subtitle, { marginBottom: 4 }]}>Your username, name and basics.</Text>

          <View style={styles.formContainer}>
            {/* Username — the @handle + name shown in the app */}
            <Field label="Username" hint="your @handle">
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. john_doe"
                  placeholderTextColor={COLORS.placeholderText}
                  value={form.username}
                  onChangeText={onUsername}
                  autoCapitalize="none"
                  autoCorrect={false}
                  maxLength={30}
                />
              </View>
            </Field>

            {/* First / Last name (required) */}
            <Field label="First name">
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="First name"
                  placeholderTextColor={COLORS.placeholderText}
                  value={form.firstName}
                  onChangeText={setField("firstName")}
                  maxLength={40}
                  autoCapitalize="words"
                />
              </View>
            </Field>
            <Field label="Last name">
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Last name"
                  placeholderTextColor={COLORS.placeholderText}
                  value={form.lastName}
                  onChangeText={setField("lastName")}
                  maxLength={40}
                  autoCapitalize="words"
                />
              </View>
            </Field>
            <Field label="Middle name (optional)">
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="Middle name"
                  placeholderTextColor={COLORS.placeholderText}
                  value={form.middleName}
                  onChangeText={setField("middleName")}
                  maxLength={40}
                  autoCapitalize="words"
                />
              </View>
            </Field>

            {/* Gender (required) */}
            <Field label="Gender">
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((option) => (
                  <TouchableOpacity
                    key={option}
                    style={[styles.genderPill, form.gender === option && styles.genderPillActive]}
                    onPress={() => setForm({ ...form, gender: option })}
                  >
                    <Text style={[styles.genderText, form.gender === option && styles.genderTextActive]}>
                      {option.charAt(0).toUpperCase() + option.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </Field>

            {/* Date of birth (required) — drives age-appropriate AI recommendations */}
            <Field label="Date of birth" hint={dob && isValidDob(dob) ? `Age ${ageFromDob(dob)}` : null}>
              <DateField
                value={dob}
                onChange={setDob}
                placeholder="Select your date of birth"
                maximumDate={maxBirthDate()}
                minimumDate={minBirthDate()}
              />
            </Field>

            {/* Bio (optional) */}
            <Field label="Bio (optional)">
              <View style={styles.inputContainer}>
                <TextInput
                  style={styles.input}
                  placeholder="A little about you"
                  placeholderTextColor={COLORS.placeholderText}
                  value={form.bio}
                  onChangeText={setField("bio")}
                  maxLength={150}
                />
              </View>
            </Field>
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
