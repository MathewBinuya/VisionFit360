import { StyleSheet, Dimensions } from "react-native";
import COLORS from "../../../constants/colors";


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.white, padding: 24, width: "100%", maxWidth: 520, alignSelf: "center" },
  header: { marginBottom: 8 },
  backBtn: { width: 40, height: 40, justifyContent: 'center' },
  titleWrap: { marginBottom: 32 },
  iconBadge: {
    width: 56, height: 56, borderRadius: 16,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 18,
  },
  title: { fontSize: 28, fontWeight: '800', color: COLORS.black, letterSpacing: -0.5, marginBottom: 8, fontFamily: 'GeneralSans-Variable' },
  subtitle: { fontSize: 15, color: COLORS.gray, lineHeight: 22, fontFamily: 'GeneralSans-Variable' },
  form: { gap: 4 },
  label: { fontSize: 13, fontWeight: '600', color: COLORS.gray, marginBottom: 6, marginTop: 14, fontFamily: 'GeneralSans-Variable' },
  inputWrap: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, backgroundColor: COLORS.inputBackground, paddingHorizontal: 14, height: 52 },
  inputIcon: { marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: COLORS.black, fontFamily: 'GeneralSans-Variable' },
  eyeBtn: { padding: 4 },
  btn: {
    backgroundColor: COLORS.button, borderRadius: 12, height: 52,
    justifyContent: 'center', alignItems: 'center', marginTop: 24,
    shadowColor: COLORS.button, shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18, shadowRadius: 8, elevation: 3,
  },
  btnText: { color: COLORS.white, fontSize: 16, fontWeight: '700', fontFamily: 'GeneralSans-Variable' },
  linkWrap: { alignItems: 'center', marginTop: 16 },
  link: { fontSize: 14, color: COLORS.black, fontWeight: '600', fontFamily: 'GeneralSans-Variable' },
  hint: { fontSize: 12, color: COLORS.gray, marginTop: 8, lineHeight: 18, fontFamily: 'GeneralSans-Variable' },
});


export default styles;