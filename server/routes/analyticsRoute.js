import express from "express";
import authenticate from "../middleware/auth.js";
import { getTimeZone } from "../validation/timezone.js";
import * as analytics from "../models/analyticsModel.js";

const router = express.Router();

const handle = (query) => async (req, res) =>
  res.json(await query(req.user.id, getTimeZone(req)));

router.get("/time-spent-daily", authenticate, handle(analytics.timeSpentDaily));
router.get("/tab-switches-daily", authenticate, handle(analytics.tabSwitchesDaily));
router.get("/most-visited-today", authenticate, handle(analytics.mostVisitedToday));
router.get("/time-spent-today", authenticate, handle(analytics.timeSpentToday));
router.get("/total-switches-today", authenticate, async (req, res) => {
  res.json({ total_switches: await analytics.totalSwitchesToday(req.user.id, getTimeZone(req)) });
});

export default router;
