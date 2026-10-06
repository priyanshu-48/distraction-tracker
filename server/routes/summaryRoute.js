import express from "express";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { summaryQuerySchema } from "../validation/schemas.js";
import { daySummary } from "../controllers/summaryController.js";

const router = express.Router();

router.get("/summary", authenticate, validate(summaryQuerySchema, "query"), daySummary);

export default router;
