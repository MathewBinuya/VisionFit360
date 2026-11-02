import { View, Text, TouchableOpacity, Switch } from 'react-native'
import { showAlert } from '../components/AppAlert'
import { useState, useEffect } from 'react'
import { goBack } from '../lib/nav'
import { Ionicons } from "@expo/vector-icons"
import AsyncStorage from "@react-native-async-storage/async-storage"
import COLORS from "../constants/colors"
import styles from '../assets/styles/notifications.style'
import {
  requestPermission,
  scheduleProgressNotifications,
  cancelAllNotifications,
  // sendTestNotification, // test button hidden for now
  NOTIF_SETTINGS_KEY,
  MORNING,
  EVENING,
  TIMEZONE,
} from '../lib/notifications'

export default function NotificationsScreen() {
  const [enabled, setEnabled] = useState(false);

  // load saved setting
  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(NOTIF_SETTINGS_KEY);
      if (saved) {
        const s = JSON.parse(saved);
        setEnabled(s.enabled);
      }
    })();
  }, []);

  // reminder times are fixed by the app (8 AM / 8 PM Manila), not the user
  const persist = async (isEnabled) => {
    await AsyncStorage.setItem(NOTIF_SETTINGS_KEY, JSON.stringify({
      enabled: isEnabled,
      morningHour: MORNING.hour, morningMinute: MORNING.minute,
      eveningHour: EVENING.hour, eveningMinute: EVENING.minute,
      timezone: TIMEZONE,
    }));
  };

  const toggleEnabled = async (value) => {
    if (value) {
      const granted = await requestPermission();
      if (!granted) {
        showAlert("Permission needed", "Enable notifications in your phone settings to get reminders.");
        return;
      }
      setEnabled(true);
      await persist(true);
      await scheduleProgressNotifications();
    } else {
      setEnabled(false);
      await cancelAllNotifications();
      await persist(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => goBack()}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={{ padding: 16 }}>
        {/* master toggle */}
        <View style={styles.row}>
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={styles.rowTitle}>Daily reminders</Text>
            <Text style={styles.rowSub}>Helpful nudges to keep your workouts on track</Text>
          </View>
          <Switch
            value={enabled}
            onValueChange={toggleEnabled}
            trackColor={{ true: COLORS.button }}
            thumbColor={COLORS.white}
          />
        </View>

        {/* test button — hidden for now
        <TouchableOpacity style={styles.testBtn} onPress={sendTestNotification}>
          <Ionicons name="notifications-outline" size={18} color={COLORS.button} />
          <Text style={styles.testText}>Send test notification</Text>
        </TouchableOpacity>
        */}
      </View>
    </View>
  );
}