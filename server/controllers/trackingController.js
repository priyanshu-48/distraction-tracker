import { isTracking, logSessionStart, logSessionEnd } from "../models/trackingModel.js";

export async function startTracking(req, res) {
  await logSessionStart(req.user.id);
  res.json({ success: true });
};

export async function stopTracking(req, res) {
  await logSessionEnd(req.user.id);
  res.json({ success: true });
};

export async function is_Tracking(req, res) {
  res.json({ isTracking: await isTracking(req.user.id) });
};
