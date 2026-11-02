import { View, Text, TouchableOpacity, ScrollView } from 'react-native'
import { showAlert } from '../components/AppAlert'
import { useState, useCallback, useMemo } from 'react'
import { router, useFocusEffect } from 'expo-router'
import { goBack } from '../lib/nav'
import { Ionicons } from "@expo/vector-icons"
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import COLORS from "../constants/colors"
import { getInbox, reconcileInbox, markAllRead, clearInbox, removeFromInbox } from '../lib/notifInbox'
import DateField from '../components/DateField'

// "2m ago" / "3h ago" for recent items; otherwise a full date.
const relative = (ms) => {
  const diff = Date.now() - ms;
  const m = Math.round(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
};
// Exact date + time, shown under every item so nothing is ambiguous.
const stamp = (ms) => {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};

// How many items show before the user taps "See more".
const PREVIEW_COUNT = 5;
// A per-day key so notifications from the same calendar day group together.
const dayKey = (ms) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};
export default function NotificationsInbox() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // Collapsed by default (top 5). "See more" expands the full list + date filter.
  const [expanded, setExpanded] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null); // Date, or null = all dates

  // Every time the feed opens: pull any fired reminders into it, show them, mark read.
  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          await reconcileInbox();
          setItems(await getInbox());
          await markAllRead();
        } catch (_e) {}
        setLoading(false);
      })();
    }, [])
  );

  // What actually renders: the top few when collapsed, otherwise the whole feed
  // narrowed to the picked day (or everything when no date is chosen).
  const visibleItems = useMemo(() => {
    if (!expanded) return items.slice(0, PREVIEW_COUNT);
    if (!selectedDate) return items;
    const want = dayKey(selectedDate.getTime());
    return items.filter((n) => dayKey(n.at) === want);
  }, [items, expanded, selectedDate]);

  // Bound the picker to the range that actually has notifications (items are newest
  // first, so the last one is the oldest). Nothing lives in the future.
  const maximumDate = new Date();
  const minimumDate = items.length ? new Date(items[items.length - 1].at) : undefined;

  const collapse = () => {
    setExpanded(false);
    setSelectedDate(null);
  };

  // Long-press one card → confirm → delete just that notification.
  const confirmDeleteOne = (n) => {
    showAlert(
      "Delete notification",
      n?.title ? `Remove "${n.title}"?` : "Remove this notification?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const next = await removeFromInbox(n.id);
            setItems(next.sort((a, b) => b.at - a.at));
          },
        },
      ]
    );
  };

  const confirmClear = () => {
    if (!items.length) return;
    showAlert(
      "Clear notifications",
      "Remove all notifications from this list?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Clear", style: "destructive", onPress: async () => { await clearInbox(); setItems([]); collapse(); } },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{
        flexDirection: "row", alignItems: "center", justifyContent: "space-between",
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
      }}>
        <TouchableOpacity onPress={() => goBack()} hitSlop={10}>
          <Ionicons name="arrow-back" size={24} color={COLORS.black} />
        </TouchableOpacity>
        <Text style={{ fontSize: 17, fontWeight: "600", color: COLORS.black, fontFamily: "GeneralSans-Variable" }}>
          Notifications
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
          <TouchableOpacity onPress={confirmClear} hitSlop={8} disabled={!items.length}>
            <Ionicons name="trash-outline" size={20} color={items.length ? COLORS.black : COLORS.border} />
          </TouchableOpacity>
          {/* reminder settings live on the old screen */}
          <TouchableOpacity onPress={() => router.push("/notifications")} hitSlop={8}>
            <Ionicons name="settings-outline" size={20} color={COLORS.black} />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingTop: 8, paddingBottom: insets.bottom + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {items.length === 0 ? (
          <View style={{ alignItems: "center", marginTop: 80 }}>
            <Ionicons name="notifications-off-outline" size={44} color={COLORS.placeholderText} />
            <Text style={{ color: COLORS.placeholderText, marginTop: 12, fontFamily: "GeneralSans-Variable" }}>
              {loading ? "Loading…" : "No notifications yet"}
            </Text>
            {!loading && (
              <Text style={{ color: COLORS.placeholderText, fontSize: 12, marginTop: 4, textAlign: "center", paddingHorizontal: 24 }}>
                Your workout reminders and progress nudges will show up here.
              </Text>
            )}
          </View>
        ) : (
          <>
            {/* TIP — how to delete one, and (when collapsed) how to reach the date filter */}
            <View style={{
              flexDirection: "row", alignItems: "flex-start", gap: 7,
              backgroundColor: COLORS.inputBackground, borderRadius: 10,
              paddingHorizontal: 12, paddingVertical: 9, marginBottom: 12,
            }}>
              <Ionicons name="bulb-outline" size={15} color={COLORS.button} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: "#555555", fontFamily: "GeneralSans-Variable" }}>
                {expanded
                  ? "Press and hold a notification to delete just that one."
                  : (items.length > PREVIEW_COUNT
                      ? "Press and hold a notification to delete it. Tap “See more” to filter by date."
                      : "Press and hold a notification to delete it.")}
              </Text>
            </View>

            {/* DATE FILTER — only once expanded via "See more" */}
            {expanded && (
              <View style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <DateField
                      value={selectedDate}
                      onChange={setSelectedDate}
                      placeholder="Filter by date"
                      maximumDate={maximumDate}
                      minimumDate={minimumDate}
                    />
                  </View>
                  {selectedDate && (
                    <TouchableOpacity
                      onPress={() => setSelectedDate(null)}
                      activeOpacity={0.7}
                      hitSlop={8}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 4,
                        paddingHorizontal: 12, height: 48, borderRadius: 12,
                        borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cards,
                      }}
                    >
                      <Ionicons name="close" size={16} color={COLORS.placeholderText} />
                      <Text style={{ fontSize: 13, fontWeight: "600", color: COLORS.black, fontFamily: "GeneralSans-Variable" }}>
                        All
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={{ fontSize: 12, lineHeight: 17, color: COLORS.placeholderText, marginTop: 7, paddingHorizontal: 2, fontFamily: "GeneralSans-Variable" }}>
                  {selectedDate
                    ? "Showing only this day. Tap “All” to see every notification again."
                    : "Pick a day to see only that date's notifications."}
                </Text>
              </View>
            )}

            {/* THE ITEMS */}
            {visibleItems.length === 0 ? (
              <Text style={{ color: COLORS.placeholderText, textAlign: "center", marginTop: 24, fontFamily: "GeneralSans-Variable" }}>
                No notifications on this date.
              </Text>
            ) : (
              visibleItems.map((n) => (
                <TouchableOpacity
                  key={n.id}
                  activeOpacity={0.7}
                  onLongPress={() => confirmDeleteOne(n)}
                  delayLongPress={350}
                  style={{
                    flexDirection: "row", gap: 12,
                    backgroundColor: COLORS.cards, borderRadius: 14,
                    borderWidth: 1, borderColor: COLORS.border, padding: 14, marginBottom: 10,
                  }}
                >
                  <View style={{
                    width: 38, height: 38, borderRadius: 19, backgroundColor: COLORS.inputBackground,
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Ionicons name="notifications" size={18} color={COLORS.button} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                      <Text style={{ flex: 1, fontSize: 15, fontWeight: "600", color: COLORS.black, fontFamily: "GeneralSans-Variable" }} numberOfLines={1}>
                        {n.title}
                      </Text>
                      <Text style={{ fontSize: 11, color: COLORS.placeholderText, marginLeft: 8, fontFamily: "GeneralSans-Variable" }}>
                        {relative(n.at)}
                      </Text>
                    </View>
                    {!!n.body && (
                      <Text style={{ fontSize: 13, lineHeight: 18, color: "#555555", marginTop: 3, fontFamily: "GeneralSans-Variable" }}>
                        {n.body}
                      </Text>
                    )}
                    <Text style={{ fontSize: 11, color: COLORS.placeholderText, marginTop: 6, fontFamily: "GeneralSans-Variable" }}>
                      {stamp(n.at)}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {/* SEE MORE / SEE LESS */}
            {!expanded && items.length > PREVIEW_COUNT && (
              <TouchableOpacity
                onPress={() => setExpanded(true)}
                activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 2 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: COLORS.button, fontFamily: "GeneralSans-Variable" }}>
                  See more ({items.length - PREVIEW_COUNT})
                </Text>
                <Ionicons name="chevron-down" size={16} color={COLORS.button} />
              </TouchableOpacity>
            )}
            {expanded && (
              <TouchableOpacity
                onPress={collapse}
                activeOpacity={0.7}
                style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, marginTop: 2 }}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: COLORS.button, fontFamily: "GeneralSans-Variable" }}>
                  See less
                </Text>
                <Ionicons name="chevron-up" size={16} color={COLORS.button} />
              </TouchableOpacity>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}
