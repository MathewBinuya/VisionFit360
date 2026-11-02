import { StyleSheet } from "react-native";
import COLORS from "../../constants/colors";

const FONT = "GeneralSans-Variable";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  headerTitle: { fontSize: 18, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  scroll: { padding: 16, paddingBottom: 40 },
  center: { marginTop: 60, alignItems: "center", paddingHorizontal: 24 },
  muted: { color: COLORS.placeholderText, fontSize: 13, textAlign: "center", fontFamily: FONT },

  card: {
    backgroundColor: COLORS.cards, borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
    padding: 16, marginBottom: 14,
  },
  cardTitle: { fontSize: 12, color: COLORS.placeholderText, fontFamily: FONT, letterSpacing: 0.3 },
  cardSub: { fontSize: 12, color: COLORS.black, fontFamily: FONT, marginTop: 4, lineHeight: 16 },

  // friendlier card header: small icon + sentence-case title (replaces loud ALL-CAPS)
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  cardHeadIcon: {
    width: 26, height: 26, borderRadius: 8, backgroundColor: COLORS.inputBackground,
    alignItems: "center", justifyContent: "center",
  },
  cardTitleText: { fontSize: 14, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  heroRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", marginTop: 6, marginBottom: 14 },
  hero: { fontSize: 26, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  heroFrom: { fontSize: 15, color: COLORS.placeholderText, fontWeight: "400" },
  heroUnit: { fontSize: 13, color: COLORS.placeholderText, fontWeight: "400" },
  changeBadge: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, backgroundColor: COLORS.inputBackground,
  },
  changeText: { fontSize: 12, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  // plain-language week-over-week sentence under the hero (replaces the raw "%")
  changeSentence: { fontSize: 12.5, color: COLORS.black, fontFamily: FONT, marginTop: -6, marginBottom: 12, lineHeight: 17 },
  caption: { fontSize: 11, color: COLORS.placeholderText, fontFamily: FONT, marginTop: 2 },

  chart: { flexDirection: "row", alignItems: "flex-end", height: 120, gap: 6 },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" },
  bar: { width: "70%", maxWidth: 28, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  baseline: { height: 1, backgroundColor: COLORS.border, marginTop: 0 },
  axisRow: { flexDirection: "row", gap: 6, marginTop: 6 },
  axisLabel: { flex: 1, fontSize: 9, color: COLORS.placeholderText, textAlign: "center", fontFamily: FONT },
  readout: {
    marginTop: 12, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
  },
  readoutText: { fontSize: 12, color: COLORS.black, fontFamily: FONT },

  statGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14, gap: 8 },
  statCell: {
    flexBasis: "48%", flexGrow: 1, borderRadius: 10, padding: 10, backgroundColor: COLORS.inputBackground,
  },
  statValue: { fontSize: 15, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  statLabel: { fontSize: 11, color: COLORS.placeholderText, fontFamily: FONT, marginTop: 2 },

  insightRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8 },
  insightText: { flex: 1, fontSize: 13, lineHeight: 19, color: COLORS.black, fontFamily: FONT },
  divider: { height: 1, backgroundColor: COLORS.border },

  recordRow: { paddingVertical: 12 },
  recordTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  recordName: { fontSize: 14, fontWeight: "600", color: COLORS.black, fontFamily: FONT, flex: 1 },
  recordKg: { fontSize: 16, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  recordSub: { fontSize: 12, color: COLORS.placeholderText, fontFamily: FONT, marginTop: 3 },

  liftRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  liftRowBorder: { borderTopWidth: 1, borderTopColor: COLORS.border },
  liftName: { fontSize: 13, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  liftSub: { fontSize: 11, color: COLORS.placeholderText, fontFamily: FONT, marginTop: 1 },
  liftGain: { fontSize: 11, color: COLORS.black, fontFamily: FONT, opacity: 0.55 },
  liftKg: { fontSize: 14, fontWeight: "600", color: COLORS.black, fontFamily: FONT, minWidth: 52, textAlign: "right" },
  showMore: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginTop: 12, paddingVertical: 11,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    backgroundColor: COLORS.inputBackground,
  },
  showMoreText: { fontSize: 13, fontWeight: "600", color: COLORS.black, fontFamily: FONT },

  footnote: { fontSize: 11, color: COLORS.placeholderText, textAlign: "center", alignSelf: "center", marginTop: 4, fontFamily: FONT },

  guideOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 20,
  },
  guideCard: { backgroundColor: COLORS.white, borderRadius: 20, padding: 20, maxHeight: "85%" },
  guideTitle: { fontSize: 18, fontWeight: "700", color: COLORS.black, fontFamily: FONT, marginBottom: 14 },
  guideRow: { flexDirection: "row", gap: 12, marginBottom: 14 },
  guideIcon: {
    width: 34, height: 34, borderRadius: 10, backgroundColor: COLORS.inputBackground,
    alignItems: "center", justifyContent: "center",
  },
  guideStepTitle: { fontSize: 14, fontWeight: "600", color: COLORS.black, fontFamily: FONT },
  guideStepText: { fontSize: 12, lineHeight: 18, color: "#555555", fontFamily: FONT, marginTop: 2 },
  guideBtn: { backgroundColor: COLORS.button, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 6 },
  guideBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "700", fontFamily: FONT },
});

export default styles;
