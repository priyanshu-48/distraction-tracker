import express from "express";
import rateLimit from "express-rate-limit";
import { register } from "../controllers/registerController.js";
import { loginController } from "../controllers/loginController.js";
import { dashboardController } from "../controllers/dashboardController.js";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { registerSchema, loginSchema } from "../validation/schemas.js";

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: parseInt(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests", message: "Try again in a few minutes" },
});

router.post("/register", authLimiter, validate(registerSchema), register);
router.post("/login", authLimiter, validate(loginSchema), loginController);

router.get("/dashboard", authenticate, dashboardController);

export default router;
