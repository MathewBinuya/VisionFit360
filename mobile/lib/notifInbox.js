import AsyncStorage from "@react-native-async-storage/async-storage";

// In-app notification feed (the bell). Because reminders fire through the OS on a
// schedule we generate ourselves, we keep the feed reliable WITHOUT depending on
// background listeners: scheduleProgressNotifications() records the plan (setPlanned),
// and reconcileInbox() — called whenever the user opens the dashboard or the inbox —
// moves any planned reminder whose fire time has passed into the stored feed, with the
// exact time/date it was due. logNotification() handles one-off items (e.g. the test).

const INBOX_KEY = "notifInbox_v1";    // [{ id, title, body, at }] — delivered/seen items
const PLANNED_KEY = "notifPlanned_v1"; // [{ id, title, body, at }] — future scheduled items
const READ_KEY = "notifInboxReadAt_v1"; // ms timestamp the feed was last viewed
const MAX_ENTRIES = 100;

const read = async (key, fallback) => {
  try { const r = await AsyncStorage.getItem(key); return r ? JSON.parse(r) : fallback; } catch (_e) { return fallback; }
};
const write = async (key, val) => { try { await AsyncStorage.setItem(key, JSON.stringify(val)); } catch (_e) {} };

const byNewest = (a, b) => b.at - a.at;

export const getInbox = async () => (await read(INBOX_KEY, [])).sort(byNewest);

// Record the deterministic schedule so fired reminders can later enter the feed.
export const setPlanned = async (planned) => { await write(PLANNED_KEY, Array.isArray(planned) ? planned : []); };

// Move planned reminders whose time has passed into the feed (dedup by id).
export const reconcileInbox = async (nowMs = Date.now()) => {
  const planned = await read(PLANNED_KEY, []);
  if (!planned.length) return getInbox();
  const inbox = await read(INBOX_KEY, []);
  const have = new Set(inbox.map((e) => e.id));
  const stillFuture = [];
  for (const p of planned) {
    if (p.at <= nowMs) { if (!have.has(p.id)) { inbox.push(p); have.add(p.id); } }
    else stillFuture.push(p);
  }
  const trimmed = inbox.sort(byNewest).slice(0, MAX_ENTRIES);
  await write(INBOX_KEY, trimmed);
  await write(PLANNED_KEY, stillFuture);
  return trimmed;
};

// Add one item immediately (test notification, or a foreground receipt).
export const logNotification = async ({ id, title, body, at } = {}) => {
  const inbox = await read(INBOX_KEY, []);
  const key = id || `${title || "n"}_${at || Date.now()}`;
  if (inbox.some((e) => e.id === key)) return;
  inbox.push({ id: key, title: title || "Notification", body: body || "", at: at || Date.now() });
  await write(INBOX_KEY, inbox.sort(byNewest).slice(0, MAX_ENTRIES));
};

export const unreadCount = async () => {
  const [inbox, readAt] = await Promise.all([getInbox(), read(READ_KEY, 0)]);
  return inbox.filter((e) => e.at > (readAt || 0)).length;
};

export const markAllRead = async () => { await write(READ_KEY, Date.now()); };

export const clearInbox = async () => { await write(INBOX_KEY, []); };

// Remove a single delivered item (long-press → delete on one notification).
// Returns the remaining feed, newest first.
export const removeFromInbox = async (id) => {
  const inbox = await read(INBOX_KEY, []);
  const next = inbox.filter((e) => e.id !== id);
  await write(INBOX_KEY, next.sort(byNewest));
  return next;
};

// Wipe the entire feed (delivered + planned + read marker). Used when the
// signed-in account changes on a shared device.
export const resetInbox = async () => {
  await Promise.all([write(INBOX_KEY, []), write(PLANNED_KEY, []), write(READ_KEY, 0)]);
};

// The feed lives in device storage, so tie it to one account. If the signed-in
// user differs from the feed's recorded owner, start that account with a clean
// feed. Returns true when it reset (i.e. the account actually changed), so the
// caller can also cancel any OS-scheduled reminders from the previous account.
const OWNER_KEY = "notifInboxOwner_v1";
export const ensureInboxOwner = async (userId) => {
  const id = userId == null ? "" : String(userId);
  let owner = "";
  try { owner = (await AsyncStorage.getItem(OWNER_KEY)) || ""; } catch (_e) {}
  if (owner === id) return false;
  await resetInbox();
  try { await AsyncStorage.setItem(OWNER_KEY, id); } catch (_e) {}
  return true;
};

// Forget the owner so the next sign-in is treated as a fresh account.
export const clearInboxOwner = async () => { try { await AsyncStorage.removeItem(OWNER_KEY); } catch (_e) {} };
