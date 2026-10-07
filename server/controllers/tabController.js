import { insertIntervals } from "../models/tabModel.js";
import { runInBackground } from "../notifications/background.js";
import { checkBudgetAlerts } from "../notifications/budgetAlerts.js";

export async function ingestIntervals(req, res) {
  const { intervals } = req.body;
  const { stored, rejected, clamped } = await insertIntervals(req.user.id, intervals);
  // `rejected`: visits that started outside any tracking session. `clamped`: stored but cut to fit a session.
  // New time may have crossed a budget level. Checked after the response is decided and never awaited: alerts must not
  // slow an upload down or make it fail, whatever state the notification service is in (decisions.md, D-39).
  if (stored > 0) {
    runInBackground(checkBudgetAlerts(req.user.id).catch((err) => req.log.warn({ err }, "budget alert check failed")));
  }
  res.status(200).json({ success: true, received: intervals.length, stored, rejected, clamped });
}
