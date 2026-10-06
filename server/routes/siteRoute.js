import express from "express";
import authenticate from "../middleware/auth.js";
import validate from "../validation/validate.js";
import { listSitesQuerySchema, markSiteSchema, siteParamsSchema } from "../validation/schemas.js";
import { listSites, markSite } from "../controllers/siteController.js";

const router = express.Router();

router.get("/sites", authenticate, validate(listSitesQuerySchema, "query"), listSites);
router.put(
  "/sites/:domain",
  authenticate,
  validate(siteParamsSchema, "params"),
  validate(markSiteSchema),
  markSite
);

export default router;
