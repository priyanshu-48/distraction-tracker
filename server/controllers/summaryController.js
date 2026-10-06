import { earliestDate, todayIn } from "../domain/dates.js";
import { getDaySummary } from "../models/summaryModel.js";
import { getTimeZone } from "../validation/timezone.js";

export async function daySummary(req, res) {
  const tz = await getTimeZone(req);
  const { date } = req.validated.query;

  // The user's own "today" decides what is in the future, and the history window decides how far back to go.
  const today = todayIn(tz);
  if (date > today || date < earliestDate(today)) {
    return res.status(400).json({
      error: "Validation failed",
      message: `date must be between ${earliestDate(today)} and ${today}`,
    });
  }
  res.json(await getDaySummary(req.user.id, date, tz));
}
