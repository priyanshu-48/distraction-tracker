import { addSite } from "../models/siteAddModel.js";

export async function siteAddController(req, res) {
    const userId = req.user.id;
    const { domain } = req.body;
    
    if (!domain) {
        return res.status(400).json({ 
            error: "Validation failed",
            message: "Domain is required" 
        });
    }
    
    if (typeof domain !== 'string' || domain.trim().length === 0) {
        return res.status(400).json({ 
            error: "Validation failed",
            message: "Domain must be a non-empty string" 
        });
    }
    
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{1,61}[a-zA-Z0-9]\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
        return res.status(400).json({ 
            error: "Validation failed",
            message: "Invalid domain format" 
        });
    }
    
    try {
        const newSite = await addSite(userId, domain.trim());
        res.status(201).json({
            success: true,
            message: "Site added successfully",
            data: newSite
        });
    } catch (err) {
        if (err.code === '23505') {
            return res.status(409).json({
                error: "Conflict",
                message: "Site already added"
            });
        }
        throw err;
    }
}