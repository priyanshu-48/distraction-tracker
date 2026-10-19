import { todayIn } from "../domain/dates.js";
import { decideNudge, NUDGE } from "../domain/nudges.js";
import { distractionSitesForDay } from "../models/alertModel.js";
import { countRecentOpens, insertNudge, isMarkedSite, lastNudgeAt, nudgeExists, withNudgeLock } from "../models/nudgeModel.js";
import { getDailyBudget } from "../models/settingsModel.js";
import { isTracking } from "../models/trackingModel.js";
import { getTimeZone } from "../validation/timezone.js";

/**
 * The extension asks, as a visit to `site` begins, whether to nudge (decisions.md, D-48). The answer is { nudge: null } for
 * everything that is not a nudge to show: not tracking, not a marked site, no trigger, the cooldown, a held-out visit, a
 * visit already decided. That keeps the answer from saying much to anyone who is only probing with a copied token.
 * Only the site name and numbers ever leave this function in text.
 */
export async function createNudge(req, res) {
  const userId = req.user.id;
  const { site, visit } = req.body;
  const none = () => res.json({ nudge: null });

  // Cheap checks first, with no lock: most requests are for sites that are not marked at all.
  if (!(await isTracking(userId))) return none();
  if (!(await isMarkedSite(userId, site))) return none();

  const tz = await getTimeZone(req);
  const now = new Date();

  const decision = await withNudgeLock(userId, async (client) => {
    if (await nudgeExists(client, userId, visit)) return null;

    const [budgetSeconds, sites, opens, last] = await Promise.all([
      getDailyBudget(userId),
      distractionSitesForDay(userId, todayIn(tz, now), tz),
      countRecentOpens(userId, site, new Date(now.getTime() - NUDGE.REPEAT_WINDOW_MINUTES * 60_000)),
      lastNudgeAt(client, userId, site),
    ]);
    const decided = decideNudge({
      site,
      distractedSeconds: sites.reduce((total, row) => total + Number(row.seconds), 0),
      budgetSeconds,
      opensInWindow: opens + 1, // the visit that is starting has not reached the server yet
      lastNudgeAt: last,
      now,
      visitId: visit,
    });
    if (decided) await insertNudge(client, userId, { visit, site, kind: decided.kind, shown: decided.shown });
    return decided;
  });

  if (!decision?.shown) return none();
  req.log.info({ kind: decision.kind }, "nudge shown");
  res.json({ nudge: { kind: decision.kind, title: decision.title, body: decision.body } });
}
