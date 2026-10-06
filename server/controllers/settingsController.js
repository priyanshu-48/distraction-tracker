import { getDailyBudget, setDailyBudget } from "../models/settingsModel.js";

export async function getSettings(req, res) {
  res.json({ dailyBudgetSeconds: await getDailyBudget(req.user.id) });
}

export async function updateSettings(req, res) {
  const dailyBudgetSeconds = await setDailyBudget(req.user.id, req.body.dailyBudgetSeconds);
  res.json({ dailyBudgetSeconds });
}
