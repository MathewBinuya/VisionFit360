import { StyleSheet } from "react-native";
import COLORS from "../../../constants/colors";

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    // soft gray backdrop so the white card reads as elevated
    backgroundColor: "#F2F3F5",
  },
  scrollViewStyle: { alignItems: "center", backgroundColor: COLORS.background, },
  card: {
    width: "100%", maxWidth: 480, alignSelf: "center",
    backgroundColor: COLORS.cards,
    borderRadius: 22,
    padding: 28,
    // soft, elevated "floating card" shadow
    shadowColor: "#1A1D24",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  header: {
    alignItems: "center",
    marginBottom: 24,
  },
  title: {
    fontFamily: "GeneralSans-Variable",
    fontSize: 26,
    color: COLORS.black,
    textAlign: "center",
    marginBottom: 4,
    fontWeight: "600",
  },
  subtitle: {
    fontFamily: "GeneralSans-Variable",
    fontSize: 14,
    color: COLORS.placeholderText,
    textAlign: "center",
    marginBottom: 20,
  },
  formContainer: { marginTop: 20, marginBottom: 8, },
  inputGroup: { marginBottom: 16, },
  label: {
    fontFamily: "GeneralSans-Variable",
    fontSize: 14,
    marginBottom: 8,
    color: COLORS.black,
    fontWeight: "500",
  },
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
    fontFamily: "GeneralSans-Variable",
    flex: 1,
    height: 50,
    fontSize: 15,
    color: COLORS.black,
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
    marginTop: 8,
    shadowColor: COLORS.button,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  buttonText: {
    fontFamily: "GeneralSans-Variable",
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
  footer: { flexDirection: "row", justifyContent: "center", marginTop: 24, },
  footerText: { fontFamily: "GeneralSans-Variable", color: COLORS.placeholderText, marginRight: 5, },
  link: { fontFamily: "GeneralSans-Variable", color: COLORS.button, fontWeight: "600", },
});

export default styles;