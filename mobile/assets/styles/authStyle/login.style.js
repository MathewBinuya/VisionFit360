import { StyleSheet, Dimensions } from "react-native";
import COLORS from "../../../constants/colors";

const { width, height } = Dimensions.get("window");

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: COLORS.background,
  },
  scrollViewStyle: { alignItems: "center", backgroundColor: COLORS.background, },
  topIllustration: { alignItems: "center", width: "100%", marginBottom: 8, },
  illustrationImage: { width: width * 0.6, height: height * 0.28, maxWidth: 320, maxHeight: 240 },
  card: {
    width: "100%", maxWidth: 480, alignSelf: "center",
    backgroundColor: COLORS.cards,
    borderRadius: 22,
    padding: 28,
    // soft, elevated "floating card" shadow
    shadowColor: COLORS.black,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.13,
    shadowRadius: 30,
    elevation: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  header: { alignItems: "center", marginBottom: 24,},
  brand: {
    fontSize: 12,
    letterSpacing: 2,
    fontWeight: "700",
    color: COLORS.placeholderText,
    textAlign: "center",
    marginBottom: 10,
    fontFamily: "GeneralSans-Variable",
  },
  title: {
    fontSize: 26,
    fontFamily: "GeneralSans-Variable",
    color: COLORS.black,
    textAlign: "center",
    marginBottom: 4,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.placeholderText,
    textAlign: "center",
    marginBottom: 24,
    fontFamily: "GeneralSans-Variable",
  },
  formContainer: { marginBottom: 8, },
  inputGroup: { marginBottom: 16, },
  label: { fontSize: 14, marginBottom: 8, color: COLORS.black, fontFamily: "GeneralSans-Variable", },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 14,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    height: 50,
    color: COLORS.black,
    fontSize: 15,
    fontFamily: "GeneralSans-Variable",
  },
  eyeIcon: {
    padding: 8,
  },
  button: {
    backgroundColor: COLORS.button,
    borderRadius: 12,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: COLORS.button,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },

  forgotPasswordContainer: {
    alignSelf: "center",
    marginTop: 10,
    paddingVertical: 4,
  },
  forgotPasswordText: {
    color: COLORS.button,
    fontSize: 13,
    fontWeight: "600",
    fontFamily: "GeneralSans-Variable",
  },

  buttonText: {
    fontFamily: "GeneralSans-Variable",
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24, },
  footerText: { color: COLORS.placeholderText, marginRight: 5, fontFamily: "GeneralSans-Variable", },
  link: { color: COLORS.button, fontWeight: "600", fontFamily: "GeneralSans-Variable", },
});

export default styles;