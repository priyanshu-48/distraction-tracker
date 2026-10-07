import { budgetAlert, reachedBudgetLevel } from "../domain/budgetAlerts.js";
import { todayIn } from "../domain/dates.js";
import { distractionSitesForDay, insertAlert } from "../models/alertModel.js";
import { getNotificationSettings, getRecipient } from "../models/notificationSettingsModel.js";
import { getDailyBudget } from "../models/settingsModel.js";
import { getNotifier } from "./notifier.js";

/**
 * Raises the budget alert a user has just earned, if any. Called in the background after an upload is stored.
 *
 * Each level (80%, over budget) is raised at most once per local day: the alert row's unique key is the gate, so two
 * uploads at once or a restart cannot raise it twice, and no in-memory state is needed. The row is also what the
 * extension turns into a Chrome notification, so the pop-up works even when the hosted service cannot be reached.
 *
 * Returns the alert it raised, or null.
 */
export async function checkBudgetAlerts(userId, { now = new Date(), notifier = getNotifier() } = {}) {
  if (!notifier.enabled) return null;
  const settings = await getNotificationSettings(userId);
  if (!settings.enabled) return null;

  const date = todayIn(settings.timeZone, now);
  const [budgetSeconds, sites] = await Promise.all([getDailyBudget(userId), distractionSitesForDay(userId, date, settings.timeZone)]);
  const distractedSeconds = sites.reduce((sum, site) => sum + site.seconds, 0);
  const level = reachedBudgetLevel(distractedSeconds, budgetSeconds);
  if (level === null) return null;

  const alert = budgetAlert(level, { distractedSeconds, budgetSeconds, topSite: sites[0] });
  const dedupeKey = `budget:${date}:${Math.round(level * 100)}`;
  if ((await insertAlert(userId, { dedupeKey, ...alert })) === null) return null; // already raised today

  const recipient = await getRecipient(userId);
  // Not awaited by anyone who matters: a slow or sleeping service must never hold up an upload. The key is per user.
  await notifier.send(
    { id: userId, email: recipient.email },
    { idempotencyKey: `tracker:${userId}:${dedupeKey}`, type: alert.kind, title: alert.title, body: alert.body }
  );
  return alert;
}
