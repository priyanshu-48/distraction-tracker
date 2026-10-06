import express from "express";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { rangeQuerySchema } from "../validation/schemas.js";
import { rangeSummary } from "../controllers/rangeController.js";

const router = express.Router();

router.get("/range", authenticate, validate(rangeQuerySchema, "query"), rangeSummary);

export default router;
