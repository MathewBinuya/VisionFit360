import { StyleSheet } from "react-native";
import COLORS from "../../../constants/colors";


const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 20,
    backgroundColor: COLORS.background,
  },
  card: {
    width: "100%", maxWidth: 480, alignSelf: "center",
    backgroundColor: COLORS.cards,
    borderRadius: 22,
    padding: 28,
    // soft, elevated "floating card" shadow (matches login/signup)
    shadowColor: "#1A1D24",
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.12,
    shadowRadius: 32,
    elevation: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  step: { fontSize: 14, marginBottom: 8, color: COLORS.button, fontFamily: "GeneralSans-Variable", },
  title: { fontSize: 20, fontFamily: "GeneralSans-Variable", color: COLORS.black, marginBottom: 8, },
  resultCard: {
    backgroundColor: COLORS.inputBackground,
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginVertical: 20,
  },
  resultLabel: { fontSize: 14, color: COLORS.black, fontFamily: "GeneralSans-Variable", },
  resultValue: {
    fontSize: 42,
    fontWeight: "600",
    marginVertical: 6,
    fontFamily: "GeneralSans-Variable",
  },
  category: { fontSize: 15, fontWeight: "600", fontFamily: "GeneralSans-Variable", },
  recap: {
    marginTop: 16,
    width: "100%",
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  recapRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3, },
  recapLabel: { fontSize: 13, color: COLORS.black, fontFamily: "GeneralSans-Variable", },
  recapValue: { fontSize: 13, color: COLORS.black, fontFamily: "GeneralSans-Variable", },
  empty: {
    color: COLORS.placeholderText,
    textAlign: "center",
    marginVertical: 40,
    fontFamily: "GeneralSans-Variable",
  },
  infoBox: {
    backgroundColor: COLORS.inputBackground,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.black,
    marginBottom: 12,
    fontFamily: "GeneralSans-Variable",
  },
  infoText: {
    fontSize: 13,
    color: COLORS.black,
    opacity: 0.75,
    lineHeight: 19,
    fontFamily: "GeneralSans-Variable",
  },
  rangeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 5,
  },
  rangeLabelWrap: { flexDirection: "row", alignItems: "center" },
  rangeDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  rangeLabel: { fontSize: 13, color: COLORS.black, opacity: 0.75, fontFamily: "GeneralSans-Variable" },
  rangeValue: { fontSize: 13, color: COLORS.black, opacity: 0.75, fontFamily: "GeneralSans-Variable" },
  rangeLabelCurrent: { opacity: 1, fontWeight: "700" },
  button: {
    backgroundColor: COLORS.button,
    borderRadius: 12,
    height: 50,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  buttonText: {
    fontFamily: "GeneralSans-Variable",
    color: COLORS.white,
    fontSize: 16,
    fontWeight: "600",
  },
});

export default styles;