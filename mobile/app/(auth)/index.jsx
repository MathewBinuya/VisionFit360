import { View, Text, StyleSheet, Image, Dimensions, TextInput, KeyboardAvoidingView, ActivityIndicator, TouchableOpacity, Platform, ScrollView } from 'react-native'
import { showAlert } from '../../components/AppAlert'
import { Link } from 'expo-router'        
import { router } from "expo-router";
import React, { useState } from 'react'
import { Ionicons } from "@expo/vector-icons"
import styles from '../../assets/styles/authStyle/login.style'
import COLORS from '../../constants/colors'
import FadeInView from '../../components/FadeInView'
import PressableScale from '../../components/PressableScale'

import {useAuthStore} from "../../store/authStore"

export default function Login() {

            // login setup
const [email,setEmail] = useState("");
const [password,setPassword] = useState("");
const [showPassword, setShowPassword] = useState(false);
const [focused, setFocused] = useState(null); // which field is focused (for highlight)

const {isLoading, login, isCheckingAuth} = useAuthStore();

const handleLogin = async () => {
  const result = await login(email,password);
  if(!result.success) {
    // not verified yet -> take them to the verification screen instead of a dead-end alert
    if (result.needsVerification) {
      showAlert("Verify your email", result.error, [
        { text: "Cancel", style: "cancel" },
        {
          text: "Verify now",
          onPress: () => router.push({ pathname: "/(auth)/verify-email", params: { email: result.email || email.trim() } }),
        },
      ]);
      return;
    }
    showAlert("Error", result.error);
    return;
  }

  const user = useAuthStore.getState().user;
  if (user?.onBoardingComplete) {
    router.replace("/(tabs)/home");          
  } else {
    router.replace("/(onBoarding)/profile"); 
  }

};

 if(isCheckingAuth) return null;
   
  return (
     <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >  
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Login Image */}
       <View style={styles.topIllustration}>
          <Image
          source={require('../../assets/images/login-image.png')}
          style={styles.illustrationImage}
          resizeMode='contain'
       />
       </View>
               {/* Login Page */}
       <FadeInView style={styles.card}>
        <Text style={styles.brand}>VISIONFIT360</Text>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Log in to continue your journey</Text>
       <View style={styles.formContainer}>
                  {/* Email */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Email</Text>
            <View style={[styles.inputContainer, focused === "email" && { borderColor: COLORS.button, borderWidth: 1.5 }]}>
              <Ionicons
                name="mail"
                size={20}
                color={focused === "email" ? COLORS.button : COLORS.black}
                style={styles.inputIcon}
              />
              <TextInput
                style={styles.input}
                placeholder="Enter your email"
                placeholderTextColor={COLORS.placeholderText}
                value={email}
                onChangeText={setEmail}
                onFocus={() => setFocused("email")}
                onBlur={() => setFocused(null)}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>
            </View>
                 {/* Password */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Password</Text>
                 <View style={[styles.inputContainer, focused === "password" && { borderColor: COLORS.button, borderWidth: 1.5 }]}>
                  <Ionicons
                    name="lock-closed"
                    size={20}
                    color={focused === "password" ? COLORS.button : COLORS.black}
                    style={styles.inputIcon}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Enter your password"
                    placeholderTextColor={COLORS.placeholderText}
                    value={password}
                    onChangeText={setPassword}
                    onFocus={() => setFocused("password")}
                    onBlur={() => setFocused(null)}
                    secureTextEntry={!showPassword}
                  />
                   <TouchableOpacity
                     onPress={() =>  setShowPassword(!showPassword)}
                     style={styles.eyeIcon} 
                   >
                    <Ionicons 
                      name={showPassword ? "eye" : "eye-off"}
                      size={20}
                      color={COLORS.black}
                    />
                   </TouchableOpacity>
                 </View>
              </View>
            </View>
            <PressableScale style={[styles.button, { flexDirection: "row", gap: 8 }]} onPress={handleLogin} disabled={isLoading}>
                  {isLoading ? (
                      <ActivityIndicator color="#fff" />
                    ) : (
                      <>
                        <Text style={styles.buttonText}>Login</Text>
                        <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
                      </>
                    )}
            </PressableScale>

             <TouchableOpacity
                  onPress={() => router.push("/(auth)/forgot-password")}
                  style={styles.forgotPasswordContainer}
                >
                  <Text style={styles.forgotPasswordText}>Forgot password?</Text>
              </TouchableOpacity>
            
                {/* Footer */}
            <View style={styles.footer}> 
              <Text style={styles.footerText}>{"Don't have an account?"}</Text>
              <Link href="/signup" asChild>
                  <TouchableOpacity>
                    <Text style={styles.link}>Sign up</Text>
                  </TouchableOpacity>
              </Link>
            </View>
       </FadeInView>
    </ScrollView>
    </KeyboardAvoidingView>
  );
}


