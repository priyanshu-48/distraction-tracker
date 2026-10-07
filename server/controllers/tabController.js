import { insertIntervals } from "../models/tabModel.js";

export async function ingestIntervals(req, res) {
  const { intervals } = req.body;
  const { stored, rejected, clamped } = await insertIntervals(req.user.id, intervals);
  // `rejected`: visits that started outside any tracking session. `clamped`: stored but cut to fit a session.
  res.status(200).json({ success: true, received: intervals.length, stored, rejected, clamped });
}
