import express from 'express';
import { startTracking, stopTracking, is_Tracking } from '../controllers/trackingController.js';
import authenticate from '../middleware/auth.js';

const router = express.Router();

router.post("/start-tracking",authenticate,startTracking);
router.post("/stop-tracking",authenticate,stopTracking);
router.get("/is-tracking",is_Tracking);

export default router;
