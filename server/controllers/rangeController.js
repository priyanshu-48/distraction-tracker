import { earliestDate, todayIn } from "../domain/dates.js";
import { getRangeSummary } from "../models/rangeModel.js";
import { getTimeZone } from "../validation/timezone.js";

export async function rangeSummary(req, res) {
  const tz = await getTimeZone(req);
  const { view, date } = req.validated.query;

  // Same window as the Day view: the user's own today decides the future, and the history window decides how far back.
  const today = todayIn(tz);
  if (date > today || date < earliestDate(today)) {
    return res.status(400).json({
      error: "Validation failed",
      message: `date must be between ${earliestDate(today)} and ${today}`,
    });
  }
  res.json(await getRangeSummary(req.user.id, view, date, tz));
}
