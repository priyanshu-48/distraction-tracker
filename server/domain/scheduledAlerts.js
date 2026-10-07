import { addDays, periodBounds } from "./dates.js";
import { formatDuration } from "./budgetAlerts.js";

// Pure rules behind the weekly summary and the streak alerts (decisions.md, D-39). They take plain values so each rule is
// tested without a database or a clock.

/** Streak lengths worth a message. They stay within the 30 days the dashboard looks back (STREAK_DAYS). */
export const STREAK_MILESTONES = [3, 7, 14, 30];
/** The summary is sent from this local time on Monday, and for up to two more days if the server was not running then. */
export const WEEKLY_FROM = "09:00:00";
const CATCH_UP_DAYS = 2;

const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday

/**
 * The start (a Monday) of the week to summarise if a summary is due right now, else null. `today` and `timeOfDay` are the
 * user's own local date ("YYYY-MM-DD") and time ("HH:MM:SS"). Due from Monday 09:00 until the end of Wednesday; later than
 * that a summary of "last week" would be stale, so a server that was down for days skips it rather than sending it late.
 */
export function weeklySummaryDue(today, timeOfDay) {
  const sinceMonday = (weekdayOf(today) + 6) % 7;
  if (sinceMonday > CATCH_UP_DAYS) return null;
  if (sinceMonday === 0 && timeOfDay < WEEKLY_FROM) return null;
  return addDays(periodBounds("week", today).start, -7);
}

/**
 * The user's current run of tracked days at or under the budget, over `days` (oldest first, each { date, trackedSeconds,
 * distractedSeconds }). A day with nothing tracked is skipped: it neither extends nor breaks the run. This is the same rule
 * as streaks() in rangeSummary.js (a test keeps them equal); it also says which dates make up the run.
 */
export function currentRun(days, budgetSeconds) {
  let dates = [];
  for (const day of days) {
    if (day.trackedSeconds === 0) continue;
    dates = day.distractedSeconds <= budgetSeconds ? [...dates, day.date] : [];
  }
  return { length: dates.length, dates };
}

/**
 * The milestone the run has JUST reached, or null. Only a run whose latest counted day is `throughDate` (the last finished
 * day) and whose length is exactly a milestone qualifies, so a milestone is announced once, on the day it is reached:
 * a longer streak does not repeat it, and a day with nothing tracked does not announce it again. (If the server is not
 * running at all on that day, the milestone is missed rather than announced late.)
 */
export function streakMilestoneReached(run, throughDate) {
  if (run.dates.at(-1) !== throughDate) return null;
  return STREAK_MILESTONES.includes(run.length) ? run.length : null;
}

/** "17% less than the week before.", or null when there is nothing meaningful to compare with. */
function comparison(current, previous) {
  if (!(previous.daysTracked > 0) || !(previous.distractedSeconds > 0)) return null;
  const change = Math.round(((current - previous.distractedSeconds) / previous.distractedSeconds) * 100);
  if (Math.abs(change) < 5) return "About the same as the week before.";
  return `${Math.abs(change)}% ${change < 0 ? "less" : "more"} than the week before.`;
}

/**
 * The weekly summary: how much time went to the sites the user marked, against the week before, and how many days stayed
 * within the budget. Names only the biggest site and a time, never a URL or a page title.
 */
export function weeklyAlert({ totals, previous, budgetSeconds, topSite }) {
  const spent = totals.distractedSeconds;
  const parts = [
    comparison(spent, previous),
    `${totals.daysUnderBudget} of ${totals.daysTracked} tracked ${totals.daysTracked === 1 ? "day" : "days"} under your daily budget of ${formatDuration(budgetSeconds)}.`,
    spent > 0 && topSite ? `Biggest: ${topSite.domain} (${formatDuration(topSite.seconds)}).` : null,
  ].filter(Boolean);
  return {
    kind: "weekly-summary",
    title: spent > 0 ? `Your week: ${formatDuration(spent)} on distraction sites` : "Your week: no time on distraction sites",
    body: parts.join(" "),
  };
}

export function streakAlert(milestone, budgetSeconds) {
  return {
    kind: "streak",
    title: `${milestone} days in a row under your budget`,
    body: `Every tracked day stayed within ${formatDuration(budgetSeconds)} of distraction time. Keep it going.`,
  };
}
