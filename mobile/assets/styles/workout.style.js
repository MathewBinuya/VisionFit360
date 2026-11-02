import { StyleSheet } from "react-native";
import COLORS from "../../constants/colors";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  headerTitle: { fontSize: 17, fontWeight: "600", color: COLORS.black, fontFamily: "GeneralSans-Variable" },

  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.button,
    borderRadius: 12,
    height: 52,
    marginBottom: 20,
  },
  addBtnText: { color: COLORS.white, fontSize: 15, fontWeight: "600", marginLeft: 6, fontFamily: "GeneralSans-Variable" },

  sectionTitle: { fontSize: 14, fontWeight: "600", color: COLORS.black, marginBottom: 10, fontFamily: "GeneralSans-Variable" },
  empty: { color: COLORS.placeholderText, textAlign: "center", marginTop: 12, fontFamily: "GeneralSans-Variable" },

  workoutCard: {
    backgroundColor: COLORS.cards,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  workoutTitle: { fontSize: 15, fontWeight: "600", color: COLORS.black, marginBottom: 6, fontFamily: "GeneralSans-Variable" },
  workoutExercise: { fontSize: 13, color: COLORS.placeholderText, marginBottom: 2, fontFamily: "GeneralSans-Variable" },
  workoutDate: { fontSize: 12, color: COLORS.placeholderText, fontFamily: "GeneralSans-Variable" },

  exerciseBlock: { marginBottom: 8 },
  exerciseName: { fontSize: 14, fontWeight: "600", color: COLORS.black, marginBottom: 2, fontFamily: "GeneralSans-Variable" },
  setLine: { fontSize: 12, color: COLORS.placeholderText, marginBottom: 1, fontFamily: "GeneralSans-Variable" },

  // compact collapsed summary row (exercise/set counts + progress + chevron)
  cardSummary: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 4 },
  cardSummaryText: { fontSize: 13, color: COLORS.placeholderText, fontFamily: "GeneralSans-Variable" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: COLORS.inputBackground, marginTop: 7, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2, backgroundColor: COLORS.button },

  // tappable "set done" checkbox row on each workout card
  setCheckRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 4 },
  setCheckText: { flex: 1, fontSize: 12, color: COLORS.placeholderText, fontFamily: "GeneralSans-Variable" },
  setCheckTextDone: { textDecorationLine: "line-through", color: COLORS.gray },

  // "Mark Complete" button on each workout card
  completeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.button,
    borderRadius: 10,
    height: 44,
    marginTop: 12,
    gap: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  completeText: { color: COLORS.white, fontSize: 14, fontWeight: "700", fontFamily: "GeneralSans-Variable" },

  // Routine Name / Exercise name / Sets / Reps / Weight fields (Add Workout form)
  inputLabel: {
    fontSize: 13,
    fontWeight: "600",
    color: COLORS.gray,
    marginTop: 12,
    marginBottom: 6,
    fontFamily: "GeneralSans-Variable",
  },
  input: {
    backgroundColor: COLORS.inputBackground,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 15,
    fontWeight: "600",
    color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
  },

  doneBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: COLORS.button,
    borderRadius: 8,
    paddingVertical: 10,
    marginTop: 10,
  },
  doneText: { color: COLORS.white, fontSize: 13, fontWeight: "600", marginLeft: 4, fontFamily: "GeneralSans-Variable" },

  // modal
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: { fontSize: 18, fontWeight: "600", color: COLORS.black, fontFamily: "GeneralSans-Variable" },

  titleInput: {
    backgroundColor: COLORS.inputBackground,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 15,
    color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
    marginBottom: 14,
  },
  exerciseCard: {
    backgroundColor: COLORS.cards,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 14,
    marginBottom: 10,
  },
  exerciseHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 10,
  },
  exerciseNameInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: "600",
    color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
    marginRight: 8,
  },
  setRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  setLabel: { fontSize: 12, color: COLORS.placeholderText, width: 38, fontFamily: "GeneralSans-Variable" },
  setInput: {
    flex: 1,
    backgroundColor: COLORS.inputBackground,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 13,
    color: COLORS.black,
    fontFamily: "GeneralSans-Variable",
  },
  times: { fontSize: 13, color: COLORS.placeholderText, fontFamily: "GeneralSans-Variable" },
  addSetBtn: { flexDirection: "row", alignItems: "center", marginTop: 4 },
  addSetText: { fontSize: 12, color: COLORS.button, marginLeft: 4, fontFamily: "GeneralSans-Variable" },
  addExerciseBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderStyle: "dashed",
    borderRadius: 8,
    padding: 12,
    marginBottom: 14,
  },
  addExerciseText: { fontSize: 13, color: COLORS.placeholderText, marginLeft: 4, fontFamily: "GeneralSans-Variable" },
  saveBtn: {
    backgroundColor: COLORS.button,
    borderRadius: 12,
    height: 52,
    justifyContent: "center",
    alignItems: "center",
    marginTop: 8,
  },
  saveText: { color: COLORS.white, fontSize: 15, fontWeight: "600", fontFamily: "GeneralSans-Variable" },
});

export default styles;