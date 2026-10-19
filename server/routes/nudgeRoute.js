import express from "express";
import { createNudge } from "../controllers/nudgeController.js";
import { authenticateIngest } from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { nudgeSchema } from "../validation/schemas.js";

const router = express.Router();

// The extension's limited token may call this, like POST /intervals: it only ever answers with text about the visit it is
// shown for, and the sites it can be asked about are checked on the server.
router.post("/nudges", authenticateIngest, validate(nudgeSchema), createNudge);

export default router;
