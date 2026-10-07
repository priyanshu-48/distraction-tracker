import express from "express";
import rateLimit from "express-rate-limit";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { confirmPasswordSchema, exportQuerySchema } from "../validation/schemas.js";
import { deleteAccountHandler, deleteHistoryHandler, exportData } from "../controllers/accountController.js";

const router = express.Router();

// Deleting asks for the password, and a stolen token must not be able to guess it; an export is heavy. Both are rare, so a
// low ceiling costs a real user nothing.
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.ACCOUNT_RATE_LIMIT) || 10,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Try again in a few minutes" },
});

router.get("/account/export", authenticate, accountLimiter, validate(exportQuerySchema, "query"), exportData);
router.delete("/account/data", authenticate, accountLimiter, validate(confirmPasswordSchema), deleteHistoryHandler);
router.delete("/account", authenticate, accountLimiter, validate(confirmPasswordSchema), deleteAccountHandler);

export default router;
