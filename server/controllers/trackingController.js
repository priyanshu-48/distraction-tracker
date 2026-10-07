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
  // Only the extension asks for alerts (`?alerts=1`). The dashboard asks the same question to show Start/Stop, and if it
  // took them too it would swallow alerts the extension was meant to show: whoever polls first would win.
  const wantsAlerts = req.query.alerts === "1";
  const [tracking, alerts] = await Promise.all([isTracking(req.user.id), wantsAlerts ? takeUndeliveredAlerts(req.user.id) : []]);
  if (alerts.length) req.log.info({ count: alerts.length }, "alerts handed to the extension");
  // `alerts` is only present when there are some, so the answer for everyone else keeps its original shape.
  res.json({ isTracking: tracking, ...(alerts.length ? { alerts } : {}) });
};
