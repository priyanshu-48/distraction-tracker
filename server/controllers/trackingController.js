import { logSessionStart, logSessionEnd } from "../models/trackingModel.js";
import { endAllTabs } from "../models/tabModel.js";

let isTracking = false;

export async function startTracking(req, res) {
  try {
    isTracking = true;
    const userId = req.user.id;
    const startTime = req.body.time;
    console.log(startTime);
    await logSessionStart(userId,startTime);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send("Failed to start tracking");
  }
};

export async function stopTracking(req, res) {
  try {
    isTracking = false;
    const userId = req.user.id;
    const endTime = req.body.time;
    await logSessionEnd(userId,endTime);
    await endAllTabs(userId, endTime);
    res.json({ success: true });
  } catch (err) {
    res.status(500).send("Failed to stop tracking");
  }
};

export async function is_Tracking(req, res) {
  res.json({ isTracking });
};
