import { insertStartData, updateEndTime } from "../models/tabModel.js";

export async function startTab(req, res) {
  try {
    await insertStartData(req.body);
    res.status(200).send("Start logged");
  } catch (err) {
    res.status(500).send("Failed to log start");
  }
}

export async function endTab(req, res) {
  try {
    const { url, endedAt } = req.body;
    console.log("Received end request with:", url, endedAt);
    await updateEndTime(req.body);
    res.status(200).send("End logged");
  } catch (err) {
    res.status(500).send("Failed to log end");
  }
}
