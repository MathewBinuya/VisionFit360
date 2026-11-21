import { StyleSheet } from "react-native";
import COLORS from "../../../constants/colors";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: COLORS.button,
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: COLORS.black, fontFamily: "GeneralSans-Variable" },
  headerSub: { fontSize: 12, color: COLORS.placeholderText, fontFamily: "GeneralSans-Variable" },

  messages: { flex: 1 },
  loadingRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 20, justifyContent: "center" },
  loadingText: { color: COLORS.placeholderText, fontSize: 13, fontFamily: "GeneralSans-Variable" },

  bubble: {
    maxWidth: "85%",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  coachBubble: {
    backgroundColor: COLORS.cards,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignSelf: "flex-start",
    borderTopLeftRadius: 4,
  },
  userBubble: {
    backgroundColor: COLORS.button,
    alignSelf: "flex-end",
    borderTopRightRadius: 4,
  },
  coachText: { fontSize: 14, color: COLORS.black, lineHeight: 20, fontFamily: "GeneralSans-Variable" },
  userText: { fontSize: 14, color: COLORS.white, lineHeight: 20, fontFamily: "GeneralSans-Variable" },

  // Suggested-question chips strip (above the input bar). Pill chips reuse the
  // app's input background, border and button colour so they read as native.
  suggestionBar: {
    flexGrow: 0,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  suggestionBarContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
  },
  suggestionChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    backgroundColor: COLORS.inputBackground,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 20,
  },
  suggestionChipText: {
    fontSize: 13,
    color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.background,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    backgroundColor: COLORS.inputBackground,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 10,
    fontSize: 14,
    color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: COLORS.button,
    justifyContent: "center",
    alignItems: "center",
  },
});

export default styles;