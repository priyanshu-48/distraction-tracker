import express from "express";
import { startTab, endTab } from "../controllers/tabController.js";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { startTabSchema, endTabSchema } from "../validation/schemas.js";

const router = express.Router();

router.post("/start-tab", authenticate, validate(startTabSchema), startTab);
router.post("/end-tab", authenticate, validate(endTabSchema), endTab);

export default router;
