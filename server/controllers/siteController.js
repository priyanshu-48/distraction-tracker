import { getTimeZone } from "../validation/timezone.js";
import * as sites from "../models/siteModel.js";

export async function listSites(req, res) {
  res.json(await sites.listSites(req.user.id, { ...req.validated.query, tz: await getTimeZone(req) }));
}

export async function markSite(req, res) {
  const { domain } = req.validated.params;
  const { marked } = req.body;
  await sites.setMarked(req.user.id, domain, marked);
  res.json({ domain, marked });
}
