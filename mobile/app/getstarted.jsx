import { View, Text, Image, StyleSheet, useWindowDimensions, ScrollView } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import COLORS from "../constants/colors"
import PressableScale from "../components/PressableScale"
import FadeInView from "../components/FadeInView"

export default function GetStarted() {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // responsive hero: shrink on short phones so the buttons always stay on screen
  const heroHeight = Math.min(240, Math.round(height * 0.3));

  // mark that the user has seen this, then route
  const go = async (path) => {
    await AsyncStorage.setItem("hasSeenGetStarted", "true");
    router.replace(path);
  };

  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={[styles.container, { paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
      bounces={false}
    >
      <FadeInView style={styles.content}>
        <Text style={styles.brand}>VISIONFIT360</Text>
        <Text style={styles.title}>Start your{"\n"}journey</Text>
        <Text style={styles.subtitle}>
          AI coaching, AR rep counting and progress tracking — in one app.
        </Text>

        <Image
          source={require('../assets/images/new-hero-image.png')}
          style={[styles.image, { height: heroHeight }]}
          resizeMode="contain"
        />

        <View style={styles.buttons}>
          <PressableScale style={styles.primaryBtn} onPress={() => go("/(auth)/signup")}>
            <Text style={styles.primaryText}>Get started</Text>
            <Ionicons name="arrow-forward" size={18} color={COLORS.white} />
          </PressableScale>

          <PressableScale style={styles.secondaryBtn} onPress={() => go("/(auth)")}>
            <Text style={styles.secondaryText}>I already have an account</Text>
          </PressableScale>
        </View>
      </FadeInView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { width: "100%", maxWidth: 480, alignSelf: "center" },
  scroll: { flex: 1, backgroundColor: COLORS.background },
  container: {
    flexGrow: 1,            // centers when content fits, scrolls when it doesn't
    backgroundColor: COLORS.background,
    padding: 24,
    justifyContent: "center",
  },
  brand: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700",
    color: COLORS.placeholderText,
    textAlign: "center",
    marginBottom: 14,
    fontFamily: "GeneralSans-Variable",
  },
  title: {
    fontSize: 32,
    fontWeight: "700",
    color: COLORS.black,
    textAlign: "center",
    marginBottom: 10,
    fontFamily: "GeneralSans-Variable",
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.placeholderText,
    textAlign: "center",
    marginBottom: 28,
    paddingHorizontal: 8,
    fontFamily: "GeneralSans-Variable",
  },
  image: {
    width: "100%",
    height: 240,
    marginBottom: 32,
  },
  buttons: { gap: 12 },
  primaryBtn: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: COLORS.button,
    borderRadius: 14,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.button,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryText: { color: COLORS.white, fontSize: 16, fontWeight: "600", fontFamily: "GeneralSans-Variable" },
  secondaryBtn: {
    borderRadius: 14,
    height: 54,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cards,
  },
  secondaryText: { color: COLORS.black, fontSize: 15, fontWeight: "600", fontFamily: "GeneralSans-Variable" },
});
