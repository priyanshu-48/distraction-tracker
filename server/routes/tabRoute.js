import express from "express";
import { ingestIntervals } from "../controllers/tabController.js";
import { authenticateIngest } from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { intervalsSchema } from "../validation/schemas.js";

const router = express.Router();

router.post("/intervals", authenticateIngest, validate(intervalsSchema), ingestIntervals);

export default router;
