import { insertIntervals } from "../models/tabModel.js";

export async function ingestIntervals(req, res) {
  try {
    const { intervals } = req.body;
    const stored = await insertIntervals(req.user.id, intervals);
    res.status(200).json({ success: true, received: intervals.length, stored });
  } catch (err) {
    console.error("ingestIntervals error:", err);
    res.status(500).json({ error: "Failed to store intervals" });
  }
}
