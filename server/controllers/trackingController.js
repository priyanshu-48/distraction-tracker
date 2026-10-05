import { isTracking, logSessionStart, logSessionEnd } from "../models/trackingModel.js";

export async function startTracking(req, res) {
  try {
    await logSessionStart(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error("startTracking error:", err);
    res.status(500).json({ error: "Failed to start tracking" });
  }
};

export async function stopTracking(req, res) {
  try {
    await logSessionEnd(req.user.id);
    res.json({ success: true });
  } catch (err) {
    console.error("stopTracking error:", err);
    res.status(500).json({ error: "Failed to stop tracking" });
  }
};

export async function is_Tracking(req, res) {
  try {
    res.json({ isTracking: await isTracking(req.user.id) });
  } catch (err) {
    console.error("is_Tracking error:", err);
    res.status(500).json({ error: "Failed to read tracking state" });
  }
};
