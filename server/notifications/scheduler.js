import logger from "../logger.js";
import { addDays, timeOfDayIn, todayIn } from "../domain/dates.js";
import { STREAK_MILESTONES, currentRun, streakAlert, streakMilestoneReached, weeklyAlert, weeklySummaryDue } from "../domain/scheduledAlerts.js";
import { alertExists } from "../models/alertModel.js";
import { optedInUsers } from "../models/notificationSettingsModel.js";
import { STREAK_DAYS, getDailyTotals, getRangeSummary } from "../models/rangeModel.js";
import { getDailyBudget } from "../models/settingsModel.js";
import { getNotifier } from "./notifier.js";
import { raiseAlert } from "./raise.js";

/** Streaks are only checked from this local time, so nobody is told about yesterday at 3 a.m. */
const STREAK_FROM = "09:00:00";

// What has already been looked at this run, so a check every 15 minutes does not repeat queries all day. It is only an
// optimisation: the alert row's unique key is what actually prevents a repeat, including after a restart.
const lookedAt = new Set();

function eachDate(from, to) {
  const dates = [];
  for (let date = from; date <= to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

/** The weekly summary of the week just ended, if it is due for this user and has not been sent. Returns how many were raised. */
async function weeklySummary(userId, { timeZone, today, time, now, notifier }) {
  const weekStart = weeklySummaryDue(today, time);
  if (!weekStart) return 0;
  const dedupeKey = `weekly:${weekStart}`;
  if (lookedAt.has(`${userId}:${dedupeKey}`)) return 0;
  lookedAt.add(`${userId}:${dedupeKey}`);
  if (await alertExists(userId, dedupeKey)) return 0;

  const summary = await getRangeSummary(userId, "week", weekStart, timeZone, now);
  if (summary.totals.daysTracked === 0) return 0; // nothing tracked that week: nothing to say
  const alert = weeklyAlert({ totals: summary.totals, previous: summary.previous, budgetSeconds: summary.budgetSeconds, topSite: summary.topSites[0] });
  // The summary is worth an email too (it only goes out if the notification service has a real email provider).
  return (await raiseAlert(userId, { dedupeKey, ...alert, channels: ["in_app", "email"] }, notifier)) ? 1 : 0;
}

/** A streak milestone reached by yesterday, if any. Returns how many were raised. */
async function streakMilestone(userId, { timeZone, today, time, notifier }) {
  if (time < STREAK_FROM) return 0;
  if (lookedAt.has(`${userId}:streak:${today}`)) return 0;
  lookedAt.add(`${userId}:streak:${today}`);

  // Only finished days count: a streak announced in the morning must not be undone by the evening.
  const yesterday = addDays(today, -1);
  const [budgetSeconds, rows] = await Promise.all([getDailyBudget(userId), getDailyTotals(userId, addDays(today, -STREAK_DAYS), yesterday, timeZone)]);
  const byDay = new Map(rows.map((row) => [row.day, row]));
  const days = eachDate(addDays(today, -STREAK_DAYS), yesterday).map((date) => ({
    date,
    trackedSeconds: Math.round(Number(byDay.get(date)?.trackedSeconds ?? 0)),
    distractedSeconds: Math.round(Number(byDay.get(date)?.distractedSeconds ?? 0)),
  }));
  const milestone = streakMilestoneReached(currentRun(days, budgetSeconds), yesterday);
  if (milestone === null) return 0;
  return (await raiseAlert(userId, { dedupeKey: `streak:${milestone}:${yesterday}`, ...streakAlert(milestone, budgetSeconds) }, notifier)) ? 1 : 0;
}

/**
 * One pass over every user who switched notifications on. Each user is handled on their own clock (their saved time zone), and
 * a failure for one user is logged and does not stop the others. Returns how many alerts were raised.
 */
export async function runScheduledNotifications({ now = new Date(), notifier = getNotifier(), log = logger } = {}) {
  if (!notifier.enabled) return 0;
  let raised = 0;
  for (const { userId, timeZone } of await optedInUsers()) {
    const context = { timeZone, today: todayIn(timeZone, now), time: timeOfDayIn(timeZone, now), now, notifier };
    try {
      raised += await weeklySummary(userId, context);
      raised += await streakMilestone(userId, context);
    } catch (err) {
      log.warn({ err }, "scheduled notifications failed for one user");
    }
  }
  return raised;
}

/** Runs once at startup and then every 15 minutes. Does nothing unless the server is connected to a notification service. */
export function startScheduler({ intervalMs = 15 * 60 * 1000, notifier = getNotifier(), log = logger } = {}) {
  if (!notifier.enabled) return null;
  const run = () =>
    runScheduledNotifications({ notifier, log })
      .then((raised) => raised && log.info({ raised }, "scheduled notifications raised"))
      .catch((err) => log.warn({ err }, "scheduled notifications run failed"));
  run();
  return setInterval(run, intervalMs).unref();
}

export { STREAK_MILESTONES };
/** Forget what this process has already looked at (tests start from a clean slate). */
export const resetScheduler = () => lookedAt.clear();
