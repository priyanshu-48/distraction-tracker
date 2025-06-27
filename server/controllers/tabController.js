import jwt from "jsonwebtoken";
import { insertStartData, updateEndTime } from "../models/tabModel.js";

export async function startTab(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send("No token provided");

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.userId;
    
    const tabData = {
      ...req.body,
      userId 
    };

    await insertStartData(tabData);
    res.status(200).send("Start logged");
  } catch (err) {
    console.error("startTab error:", err);
    res.status(500).send("Failed to log start");
  }
}

export async function endTab(req, res) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).send("No token provided");

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const userId = decoded.id || decoded.userId;

    const tabData = {
      ...req.body,
      userId
    };

    await updateEndTime(tabData);
    res.status(200).send("End logged");
  } catch (err) {
    console.error("endTab error:", err);
    res.status(500).send("Failed to log end");
  }
}

