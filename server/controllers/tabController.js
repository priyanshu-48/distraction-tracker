import { insertStartData, updateEndTime } from "../models/tabModel.js";

export async function startTab(req, res) {
  try {
    const userId = req.user.id;
    
    const tabData = {
      ...req.body, 
      userId 
    };

    await insertStartData(tabData);
    res.status(200).json({ success: true, message: "Start logged" });
  } catch (err) {
    console.error("startTab error:", err);
    res.status(500).json({ error: "Failed to log start" });
  }
}

export async function endTab(req, res) {
  try {
    const userId = req.user.id;

    const tabData = {
      ...req.body,
      userId
    };

    await updateEndTime(tabData);
    res.status(200).json({ success: true, message: "End logged" });
  } catch (err) {
    console.error("endTab error:", err);
    res.status(500).json({ error: "Failed to log end" });
  }
}

