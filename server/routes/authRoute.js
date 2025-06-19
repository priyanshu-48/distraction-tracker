import express from "express";
import { register } from "../controllers/registerController.js";
import { loginController } from "../controllers/loginController.js";
import { dashboardController } from "../controllers/dashboardController.js";
import authenticate from "../middleware/auth.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", loginController);

router.get("/dashboard", authenticate, dashboardController);

export default router;