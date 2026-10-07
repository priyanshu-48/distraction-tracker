import { isTracking, logSessionStart, logSessionEnd } from "../models/trackingModel.js";
import { takeUndeliveredAlerts } from "../models/alertModel.js";

export async function startTracking(req, res) {
  await logSessionStart(req.user.id);
  res.json({ success: true });
};

export async function stopTracking(req, res) {
  await logSessionEnd(req.user.id);
  res.json({ success: true });
};

export async function is_Tracking(req, res) {
  const [tracking, alerts] = await Promise.all([isTracking(req.user.id), takeUndeliveredAlerts(req.user.id)]);
  // `alerts` is only present when there are some, so the answer for everyone else keeps its original shape.
  res.json({ isTracking: tracking, ...(alerts.length ? { alerts } : {}) });
};
