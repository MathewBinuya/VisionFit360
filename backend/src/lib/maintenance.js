import Setting from "../models/setting.model.js";

// The maintenance gate runs on every user-facing request, so we don't want a DB
// read each time. We cache the settings doc in memory for a few seconds and
// refresh lazily; toggling the switch busts the cache immediately so the block
// takes effect at once across this process.
const CACHE_TTL_MS = 5000;
let cache = null;
let cachedAt = 0;

// Find the singleton settings doc, creating it on first use.
const loadSetting = () =>
  Setting.findOneAndUpdate(
    { key: "app" },
    { $setOnInsert: { key: "app" } },
    { returnDocument: "after", upsert: true }
  );

// Current settings, served from the short-lived cache when fresh. Falls back to
// a safe "maintenance off" default if the DB is unreachable, so a transient DB
// blip can't accidentally lock everyone out.
export const getSetting = async () => {
  if (cache && Date.now() - cachedAt < CACHE_TTL_MS) return cache;
  try {
    cache = await loadSetting();
    cachedAt = Date.now();
  } catch {
    if (!cache) cache = { maintenanceMode: false };
  }
  return cache;
};

// Flip maintenance on/off and refresh the cache right away.
export const setMaintenance = async ({ enabled, message, updatedBy }) => {
  const update = {
    maintenanceMode: !!enabled,
    maintenanceStartedAt: enabled ? new Date() : null,
    maintenanceUpdatedBy: updatedBy || null,
  };
  if (typeof message === "string" && message.trim()) {
    update.maintenanceMessage = message.trim();
  }
  cache = await Setting.findOneAndUpdate(
    { key: "app" },
    { $set: update, $setOnInsert: { key: "app" } },
    { returnDocument: "after", upsert: true }
  );
  cachedAt = Date.now();
  return cache;
};
