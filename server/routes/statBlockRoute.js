import express from "express";
import authenticate from "../middleware/auth.js";
import { getTimeZone } from "../validation/timezone.js";
import { todayCount, todaySession } from "../models/analyticsModel.js";

const router = express.Router();

router.get("/today-count", authenticate, async (req, res) => {
  res.json(await todayCount(req.user.id, getTimeZone(req)));
});

router.get("/today-session", authenticate, async (req, res) => {
  res.json(await todaySession(req.user.id, getTimeZone(req)));
});

export default router;
