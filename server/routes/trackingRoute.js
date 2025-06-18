import express from 'express';
import { startTracking, stopTracking, is_Tracking } from '../controllers/trackingController.js';

const router = express.Router();

router.post("/start-tracking",startTracking);
router.post("/stop-tracking",stopTracking);
router.get("/is-tracking",is_Tracking);

export default router;
