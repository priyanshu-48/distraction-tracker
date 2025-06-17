import express from "express";
import { startTab, endTab } from "../controllers/tabController.js";

const router = express.Router();

router.post("/start-tab", startTab);
router.post("/end-tab", endTab);

export default router;
