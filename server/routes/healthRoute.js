import express from "express";
import db from "../db.js";
import logger from "../logger.js";

const router = express.Router();

// Liveness and readiness in one: 200 only if the database answers within 2s.
router.get("/healthz", async (req, res) => {
  try {
    await db.query({ text: "SELECT 1", query_timeout: 2000 });
    res.json({ status: "ok", db: "up" });
  } catch (err) {
    logger.warn({ err }, "health check: database unreachable");
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

export default router;
