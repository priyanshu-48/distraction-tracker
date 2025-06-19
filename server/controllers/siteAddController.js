import { addSite } from "../models/siteAddModel.js";

export async function siteAddController(req, res) {
    const userId = req.user.id;
    const { domain } = req.body;
    if (!domain) {
        return res.status(400).json({ error: "Domain is required" });
    }
    try {
        const newSite = await addSite(userId, domain);
        res.status(201).json(newSite);
    } catch {
        res.status(500).json({ error: 'Internal server error' });
    }
}