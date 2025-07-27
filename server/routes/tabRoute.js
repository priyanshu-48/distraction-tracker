import express from "express";
import { startTab, endTab } from "../controllers/tabController.js";
import authenticate from "../middleware/auth.js";

const router = express.Router();

router.post("/start-tab", authenticate, startTab);
router.post("/end-tab", authenticate, endTab);

export default router;
