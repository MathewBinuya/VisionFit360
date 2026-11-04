import mongoose from "mongoose";

// Global app settings live in a single document (key "app"). Right now it only
// carries the maintenance switch, but it's a settings doc so other site-wide
// flags can hang off it later without another collection.
const settingSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "app" },

    // Maintenance mode: when on, the user-facing API is sealed off (503) so the
    // backend can be updated without clients hitting half-deployed state. The
    // admin API is never blocked, so the switch can always be turned back off.
    maintenanceMode: { type: Boolean, default: false },
    maintenanceMessage: {
      type: String,
      default: "VisionFIT360 is down for maintenance. Please check back shortly.",
    },
    maintenanceStartedAt: { type: Date, default: null },
    maintenanceUpdatedBy: { type: String, default: null }, // admin email
  },
  { timestamps: true }
);

const Setting = mongoose.model("Setting", settingSchema);
export default Setting;
