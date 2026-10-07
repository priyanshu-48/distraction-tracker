import express from "express";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { notificationSettingsSchema } from "../validation/schemas.js";
import { getSettings, updateSettings } from "../controllers/notificationController.js";

const router = express.Router();

// Full user token only: the extension's limited token has no business reading or changing these.
router.get("/notifications/settings", authenticate, getSettings);
router.put("/notifications/settings", authenticate, validate(notificationSettingsSchema), updateSettings);

export default router;
