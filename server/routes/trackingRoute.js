import express from 'express';
import { startTracking, stopTracking, is_Tracking } from '../controllers/trackingController.js';
import authenticate, { authenticateIngest } from '../middleware/auth.js';

const router = express.Router();

router.post("/start-tracking",authenticate,startTracking);
router.post("/stop-tracking",authenticate,stopTracking);
router.get("/is-tracking",authenticateIngest,is_Tracking); // the extension polls this with its limited token

export default router;
