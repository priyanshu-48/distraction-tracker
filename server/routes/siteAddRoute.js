import express from "express";
import { siteAddController } from "../controllers/siteAddController.js";
import authenticate from "../middleware/auth.js";

const router = express.Router();

router.post("/distraction-sites",authenticate,siteAddController);

export default router;