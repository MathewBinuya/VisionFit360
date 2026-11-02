import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, ScrollView, Platform } from 'react-native'
import { showAlert } from '../../components/AppAlert'
import { useState } from 'react'
import { router } from 'expo-router'
import { Ionicons } from "@expo/vector-icons"
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/authStyle/forgot-password.style'
import { API_URL } from '../../lib/api'
import FadeInView from '../../components/FadeInView'
import PressableScale from '../../components/PressableScale'
import StepProgress from '../../components/StepProgress'

// live password-requirement row (green check once met)
const CheckRow = ({ ok, text }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
    <Ionicons name={ok ? "checkmark-circle" : "ellipse-outline"} size={14} color={ok ? "#1D9E75" : COLORS.gray} />
    <Text style={{ fontSize: 12, color: COLORS.gray, fontFamily: 'GeneralSans-Variable' }}>{text}</Text>
  </View>
);

export default function ForgotPassword() {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focused, setFocused] = useState(null); // which field is focused (for highlight)

  const fx = (name) => [styles.inputWrap, focused === name && { borderColor: COLORS.button, borderWidth: 1.5 }];

  // live new-password checks (step 2)
  const hasMinLength = newPassword.length >= 8;
  const hasLetter = /[a-zA-Z]/.test(newPassword);
  const hasNumber = /[0-9]/.test(newPassword);
  const passwordsMatch = confirmPassword.length > 0 && newPassword === confirmPassword;
 
  const requestCode = async () => {
    if (!email.trim()) return showAlert("Missing", "Please enter your email address");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return showAlert("Invalid", "Please enter a valid email address");
 
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
     
      if (!res.ok) throw new Error(data.message || "Something went wrong");
        // replace the if (data.resetCode) block with this:
      showAlert(
        "Code Sent!",
        "A reset code has been sent to your email. Check your inbox.",
        [{ text: "Got it", onPress: () => setStep(2) }]
      );
        
  
    } catch (error) {
      showAlert("Error", error.message || "Failed to send reset code");
    } finally {
      setLoading(false);
    }
  };
 
  const resetPassword = async () => {
    if (!resetCode.trim()) return showAlert("Missing", "Please enter your reset code");
    if (!newPassword) return showAlert("Missing", "Please enter a new password");
    if (newPassword !== confirmPassword) return showAlert("Mismatch", "Passwords do not match");
    if (newPassword.length < 8) return showAlert("Too short", "Password must be at least 8 characters");
    if (!/[a-zA-Z]/.test(newPassword)) return showAlert("Weak password", "Password must include at least one letter");
    if (!/[0-9]/.test(newPassword)) return showAlert("Weak password", "Password must include at least one number");
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), resetCode: resetCode.trim(), newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Something went wrong");
      showAlert("Password Reset", "Your password has been updated. Please log in.", [{ text: "Log in", onPress: () => router.replace("/(auth)") }]);
    } catch (error) {
      showAlert("Error", error.message || "Failed to reset password");
    } finally {
      setLoading(false);
    }
  };
 
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => step === 2 ? setStep(1) : router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
      </View>
 
      <StepProgress current={step} total={2} />

      <View style={styles.titleWrap}>
        <View style={styles.iconBadge}>
          <Ionicons name={step === 1 ? "mail-open-outline" : "shield-checkmark-outline"} size={26} color={COLORS.button} />
        </View>
        <Text style={styles.title}>{step === 1 ? 'Forgot Password' : 'Reset Password'}</Text>
        <Text style={styles.subtitle}>
          {step === 1 ? "Enter your email and we'll send you a reset code." : 'Enter the code from your email and set a new password.'}
        </Text>
      </View>
 
      {step === 1 && (
        <FadeInView style={styles.form}>
          <Text style={styles.label}>Email Address</Text>
          <View style={fx("email")}>
            <Ionicons name="mail-outline" size={18} color={focused === "email" ? COLORS.button : COLORS.gray} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Enter your email" placeholderTextColor={COLORS.placeholderText} value={email} onChangeText={setEmail} onFocus={() => setFocused("email")} onBlur={() => setFocused(null)} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          </View>
          <PressableScale style={[styles.btn, loading && { opacity: 0.6 }]} onPress={requestCode} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.btnText}>Send Reset Code</Text>}
          </PressableScale>
          <TouchableOpacity onPress={() => setStep(2)} style={styles.linkWrap}>
            <Text style={styles.link}>Already have a code?</Text>
          </TouchableOpacity>
        </FadeInView>
      )}
 
      {step === 2 && (
        <FadeInView style={styles.form}>
          <Text style={styles.label}>Reset Code</Text>
          <View style={fx("code")}>
            <Ionicons name="keypad-outline" size={18} color={focused === "code" ? COLORS.button : COLORS.gray} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="6-digit code from email" placeholderTextColor={COLORS.placeholderText} value={resetCode} onChangeText={setResetCode} onFocus={() => setFocused("code")} onBlur={() => setFocused(null)} keyboardType="number-pad" maxLength={6} />
          </View>

          <Text style={styles.label}>New Password</Text>
          <View style={fx("new")}>
            <Ionicons name="lock-closed-outline" size={18} color={focused === "new" ? COLORS.button : COLORS.gray} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="New password" placeholderTextColor={COLORS.placeholderText} value={newPassword} onChangeText={setNewPassword} onFocus={() => setFocused("new")} onBlur={() => setFocused(null)} secureTextEntry={!showPassword} autoCapitalize="none" />
            <TouchableOpacity onPress={() => setShowPassword(!showPassword)} style={styles.eyeBtn}>
              <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={18} color={COLORS.gray} />
            </TouchableOpacity>
          </View>

          <Text style={styles.label}>Confirm Password</Text>
          <View style={fx("confirm")}>
            <Ionicons name="lock-closed-outline" size={18} color={focused === "confirm" ? COLORS.button : COLORS.gray} style={styles.inputIcon} />
            <TextInput style={styles.input} placeholder="Confirm new password" placeholderTextColor={COLORS.placeholderText} value={confirmPassword} onChangeText={setConfirmPassword} onFocus={() => setFocused("confirm")} onBlur={() => setFocused(null)} secureTextEntry={!showPassword} autoCapitalize="none" />
          </View>

          {confirmPassword.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
              <Ionicons name={passwordsMatch ? "checkmark-circle" : "close-circle"} size={14} color={passwordsMatch ? "#1D9E75" : "#E24B4A"} />
              <Text style={{ fontSize: 12, color: passwordsMatch ? "#1D9E75" : "#E24B4A", fontFamily: 'GeneralSans-Variable' }}>
                {passwordsMatch ? "Passwords match" : "Passwords don't match"}
              </Text>
            </View>
          )}

          {newPassword.length > 0 ? (
            <View style={{ marginTop: 10, gap: 4 }}>
              <CheckRow ok={hasMinLength} text="At least 8 characters" />
              <CheckRow ok={hasLetter} text="Contains a letter" />
              <CheckRow ok={hasNumber} text="Contains a number" />
            </View>
          ) : (
            <Text style={styles.hint}>8+ characters, at least one letter and one number.</Text>
          )}

          <PressableScale style={[styles.btn, loading && { opacity: 0.6 }]} onPress={resetPassword} disabled={loading}>
            {loading ? <ActivityIndicator size="small" color={COLORS.white} /> : <Text style={styles.btnText}>Reset Password</Text>}
          </PressableScale>

          <TouchableOpacity onPress={() => setStep(1)} style={styles.linkWrap}>
            <Text style={styles.link}>← Back to enter email</Text>
          </TouchableOpacity>
        </FadeInView>
      )}
    </View>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}