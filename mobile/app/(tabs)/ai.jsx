import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, ActivityIndicator, BackHandler, Share, Modal } from 'react-native'
import { showAlert } from '../../components/AppAlert'
import { useState, useEffect, useRef } from 'react'
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from '@react-native-async-storage/async-storage'
import COLORS from "../../constants/colors"
import styles from '../../assets/styles/tabStyle/ai.style'
import api from '../../lib/axios'
import { useAuthStore } from '../../store/authStore'
import Celebration from '../../components/Celebration'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

const formatRecommendationText = (rec) => {
  const exerciseLines = rec.exercises.map((ex) => {
    const uniform = ex.sets.length > 1 && ex.sets.every(
      (s) => s.reps === ex.sets[0].reps && s.weightKg === ex.sets[0].weightKg
    );
    const summary = uniform
      ? `${ex.sets.length} sets x ${ex.sets[0].reps} reps${ex.sets[0].weightKg ? ` @ ${ex.sets[0].weightKg}kg` : ""}`
      : ex.sets.map((s, i) => `Set ${i + 1}: ${s.reps} reps${s.weightKg ? ` @ ${s.weightKg}kg` : ""}`).join(", ");
    return `• ${ex.name} — ${summary}`;
  }).join("\n");

  return `${rec.intro}\n\n${rec.title}\n${exerciseLines}`;
};

export default function AICoach() {
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const scrollRef = useRef(null);

  const [menuMessage, setMenuMessage] = useState(null);
  const [addingToTracker, setAddingToTracker] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

  //  FIRST-TIME GUIDE 
  const [showGuide, setShowGuide] = useState(false);
  const guideKey = `hasSeenAICoachGuide:${user?.id || 'unknown'}`;

  useEffect(() => {
    getInitialRecommendation();
    checkFirstVisit();
  }, []);

  const checkFirstVisit = async () => {
    try {
      const seen = await AsyncStorage.getItem(guideKey);
      if (!seen) setShowGuide(true);
    } catch (e) {
      // not critical — just skip the guide if storage fails
    }
  };

  const dismissGuide = async () => {
    setShowGuide(false);
    try {
      await AsyncStorage.setItem(guideKey, 'true');
    } catch (e) {}
  };

  //  ANDROID HARDWARE BACK BUTTON 
  useEffect(() => {
    const backAction = () => {
      if (showGuide) { dismissGuide(); return true; }
      if (menuMessage) { setMenuMessage(null); return true; }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => sub.remove();
  }, [menuMessage, showGuide]);

  const getInitialRecommendation = async () => {
    try {
      const res = await api.post("/ai/recommend");
      const rec = res.data.recommendation;
      setMessages([{
        role: "model",
        text: formatRecommendationText(rec),
        workoutData: { title: rec.title, exercises: rec.exercises },
      }]);
    } catch (error) {
      setMessages([{ role: "model", text: "Hi! I'm your AI coach. Ask me anything about your workouts." }]);
    } finally {
      setInitialLoading(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg = { role: "user", text };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      const res = await api.post("/ai/chat", { messages: newMessages });
      const { reply, workout } = res.data;

      if (workout) {
        const displayText = formatRecommendationText({ intro: reply, title: workout.title, exercises: workout.exercises });
        setMessages([...newMessages, {
          role: "model",
          text: displayText,
          workoutData: { title: workout.title, exercises: workout.exercises },
        }]);
      } else {
        setMessages([...newMessages, { role: "model", text: reply }]);
      }
    } catch (error) {
      setMessages([...newMessages, { role: "model", text: "Sorry, I couldn't respond right now. Try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const handleShare = async () => {
    if (menuMessage) {
      try {
        await Share.share({ message: menuMessage.message.text });
      } catch (error) {}
    }
    setMenuMessage(null);
  };

  const handleDeleteMessage = () => {
    const index = menuMessage?.index;
    setMenuMessage(null);
    if (index === undefined) return;
    showAlert(
      "Delete message",
      "Remove this message from the conversation?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => setMessages((prev) => prev.filter((_, i) => i !== index)),
        },
      ]
    );
  };

  const handleSetToTracker = async () => {
    if (!menuMessage?.message?.workoutData) return;
    setAddingToTracker(true);
    try {
      const { title, exercises } = menuMessage.message.workoutData;
      await api.post("/workouts", {
        title: title || "AI Recommended Workout",
        date: new Date().toISOString(),
        exercises,
      });
      setMenuMessage(null);
      setCelebrate(true); // 🎉 celebrate the conversion
    } catch (error) {
      showAlert("Error", error.response?.data?.message || "Failed to add to tracker");
    } finally {
      setAddingToTracker(false);
    }
  };

  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
  }, [messages, loading]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 90 : 30}
    >
      {/* header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="sparkles" size={20} color={COLORS.white} />
        </View>
        <View>
          <Text style={styles.headerTitle}>Smart Plan</Text>
          <Text style={styles.headerSub}>Your personal fitness guide</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowGuide(true)}
          hitSlop={10}
          style={{ marginLeft: 'auto', padding: 4 }}
        >
          <Ionicons name="help-circle-outline" size={22} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* messages */}
      <ScrollView
        ref={scrollRef}
        style={styles.messages}
        contentContainerStyle={{ padding: 16 }}
      >
        {initialLoading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color={COLORS.button} />
            <Text style={styles.loadingText}>Building your recommendation...</Text>
          </View>
        ) : (
          messages.map((m, i) => (
            <View key={i} style={{ marginBottom: 4 }}>
              {m.role === "model" ? (
                <TouchableOpacity
                  activeOpacity={0.7}
                  delayLongPress={350}
                  onLongPress={() => setMenuMessage({ index: i, message: m })}
                  style={[styles.bubble, styles.coachBubble]}
                >
                  <Text style={styles.coachText}>{m.text}</Text>
                </TouchableOpacity>
              ) : (
                <View style={[styles.bubble, styles.userBubble]}>
                  <Text style={styles.userText}>{m.text}</Text>
                </View>
              )}
            </View>
          ))
        )}

        {loading && (
          <View style={[styles.bubble, styles.coachBubble]}>
            <ActivityIndicator color={COLORS.button} size="small" />
          </View>
        )}
      </ScrollView>

      {/*  THREE DOTS MENU — Modal so the dim backdrop covers the whole screen uniformly  */}
      <Modal visible={!!menuMessage} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setMenuMessage(null)}>
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }}
            activeOpacity={1}
            onPress={() => setMenuMessage(null)}
          >
            <View style={{
              position: 'absolute', bottom: Math.max(insets.bottom, 12) + 12, left: 24, right: 24,
              backgroundColor: COLORS.white, borderRadius: 16, borderWidth: 1,
              borderColor: COLORS.border, overflow: 'hidden',
            }}>
              <TouchableOpacity
                onPress={handleShare}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border }}
              >
                <Ionicons name="share-outline" size={20} color={COLORS.button} />
                <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.button }}>Share</Text>
              </TouchableOpacity>

              {menuMessage?.message?.workoutData && (
                <TouchableOpacity
                  onPress={handleSetToTracker}
                  disabled={addingToTracker}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderBottomWidth: 1, borderBottomColor: COLORS.border, opacity: addingToTracker ? 0.6 : 1 }}
                >
                  {addingToTracker ? (
                    <ActivityIndicator size="small" color={COLORS.button} />
                  ) : (
                    <Ionicons name="barbell-outline" size={20} color={COLORS.button} />
                  )}
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.button }}>Set to workout tracker</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                onPress={handleDeleteMessage}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 }}
              >
                <Ionicons name="trash-outline" size={20} color="#E24B4A" />
                <Text style={{ fontSize: 15, fontWeight: '600', color: '#E24B4A' }}>Delete</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
      </Modal>


      {/*  FIRST-TIME GUIDE — Modal so the dim backdrop covers the whole screen uniformly  */}
      <Modal visible={showGuide && !initialLoading} transparent animationType="fade" statusBarTranslucent onRequestClose={dismissGuide}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
            <View style={{ backgroundColor: COLORS.white, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400 }}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.button, justifyContent: 'center', alignItems: 'center', marginBottom: 12 }}>
                  <Ionicons name="sparkles" size={26} color={COLORS.white} />
                </View>
                <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.black, textAlign: 'center' }}>
                  Meet your AI Coach
                </Text>
              </View>

              <View style={{ marginBottom: 14, flexDirection: 'row', gap: 10 }}>
                <Ionicons name="chatbubble-ellipses-outline" size={20} color={COLORS.button} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 14, color: COLORS.gray, lineHeight: 20 }}>
                  {"Your coach gives you a workout automatically, and you can ask it anything — try \"give me a leg day\"."}
                </Text>
              </View>

              <View style={{ marginBottom: 22, flexDirection: 'row', gap: 10 }}>
                <Ionicons name="barbell-outline" size={20} color={COLORS.button} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 14, color: COLORS.gray, lineHeight: 20 }}>
                  Long-press any workout message to set it to your workout tracker, share it, or delete it.
                </Text>
              </View>

              <TouchableOpacity
                style={{ backgroundColor: COLORS.button, borderRadius: 12, padding: 14, alignItems: 'center' }}
                onPress={dismissGuide}
              >
                <Text style={{ color: COLORS.white, fontSize: 15, fontWeight: '700' }}>Got it</Text>
              </TouchableOpacity>
            </View>
          </View>
      </Modal>

      {/* input */}
      <View style={styles.inputBar}>
        <TextInput
          style={styles.input}
          placeholder="Ask your coach..."
          placeholderTextColor={COLORS.black}
          value={input}
          onChangeText={setInput}
          multiline
        />
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || loading) && { opacity: 0.5 }]}
          onPress={sendMessage}
          disabled={!input.trim() || loading}
        >
          <Ionicons name="send" size={18} color={COLORS.white} />
        </TouchableOpacity>
      </View>

      {/* celebration when an AI workout is converted to the tracker */}
      <Celebration
        visible={celebrate}
        title="Added to your tracker! 🎉"
        message="Your AI workout is ready in the Workout Tracker."
        onClose={() => setCelebrate(false)}
      />
    </KeyboardAvoidingView>
  );
}