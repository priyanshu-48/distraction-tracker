import { dismissPendingAlerts } from "../models/alertModel.js";
import { getNotificationSettings, setNotificationSettings } from "../models/notificationSettingsModel.js";
import { getNotifier } from "../notifications/notifier.js";
import { resolveTimeZone } from "../validation/timezone.js";

// `available` is whether this server is connected to a notification service at all, so the dashboard can hide the switch.
const withAvailability = (settings) => ({ ...settings, available: getNotifier().enabled });

export async function getSettings(req, res) {
  res.json(withAvailability(await getNotificationSettings(req.user.id)));
}

export async function updateSettings(req, res) {
  const { enabled, timeZone } = req.body;
  const saved = await setNotificationSettings(req.user.id, { enabled, timeZone: await resolveTimeZone(timeZone) });
  // Switching off also drops pop-ups that were waiting, so nothing appears after the user said stop.
  if (!enabled) await dismissPendingAlerts(req.user.id);
  res.json(withAvailability(saved));
}
