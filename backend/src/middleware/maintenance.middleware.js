import { getSetting } from "../lib/maintenance.js";

// Gate for the user-facing API. When maintenance mode is on, every request here
// is turned away with 503 so no client can use the app while the backend is
// being updated. Mounted only on the user route groups — the admin API is left
// open so the switch can always be turned back off.
const maintenanceGate = async (req, res, next) => {
  try {
    const setting = await getSetting();
    if (setting?.maintenanceMode) {
      return res.status(503).json({
        maintenance: true,
        message:
          setting.maintenanceMessage ||
          "VisionFIT360 is down for maintenance. Please check back shortly.",
      });
    }
  } catch {
    // If the flag can't be read, fail open so a DB blip doesn't lock everyone out.
  }
  next();
};

export default maintenanceGate;
