import express from "express";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { settingsSchema } from "../validation/schemas.js";
import { getSettings, updateSettings } from "../controllers/settingsController.js";

const router = express.Router();

router.get("/settings", authenticate, getSettings);
router.put("/settings", authenticate, validate(settingsSchema), updateSettings);

export default router;
