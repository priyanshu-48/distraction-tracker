import { CSV_COLUMNS, csvRow, exportVisit, visitCsvRow } from "../domain/exportFormat.js";
import { deleteAccount, deleteHistory, getAccountSnapshot, passwordMatches, visitBatches } from "../models/accountModel.js";

// Waits for the client to catch up when its connection is full, so a slow download cannot make the server buffer it all.
const write = (res, chunk) => res.write(chunk) || new Promise((resolve) => res.once("drain", resolve));

/**
 * Sends everything we hold about the user as a download. JSON has all of it; CSV has the visits only, for a spreadsheet.
 * The visits are streamed in batches, so a long history does not have to fit in memory.
 */
export async function exportData(req, res) {
  const { format } = req.validated.query;
  const userId = req.user.id;
  const now = new Date();

  res.setHeader("Content-Type", format === "csv" ? "text/csv; charset=utf-8" : "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="distraction-tracker-${now.toISOString().slice(0, 10)}.${format}"`);
  res.setHeader("Cache-Control", "no-store");

  try {
    if (format === "csv") {
      await write(res, csvRow(CSV_COLUMNS));
      for await (const batch of visitBatches(userId)) {
        if (res.destroyed) return;
        await write(res, batch.map((row) => visitCsvRow(exportVisit(row))).join(""));
      }
    } else {
      const { email, createdAt, dailyBudgetSeconds, distractionSites, sessions } = await getAccountSnapshot(userId);
      const head = JSON.stringify({
        exportedAt: now.toISOString(),
        account: { email, createdAt },
        settings: { dailyBudgetSeconds },
        distractionSites,
        sessions,
      });
      // reopen the object to append the visits array without holding it in memory
      await write(res, `${head.slice(0, -1)},"visits":[`);
      let first = true;
      for await (const batch of visitBatches(userId)) {
        if (res.destroyed) return;
        const json = batch.map((row) => JSON.stringify(exportVisit(row))).join(",");
        await write(res, (first ? "" : ",") + json);
        first = false;
      }
      await write(res, "]}");
    }
    res.end();
  } catch (error) {
    // Headers are already out, so a clean error response is impossible; cut the connection so the file reads as broken.
    req.log.error({ err: error }, "export failed");
    res.destroy(error);
  }
}

/** True if the password in the body is the account's. Otherwise answers 403 (a 401 would sign the dashboard out). */
async function confirmed(req, res) {
  if (await passwordMatches(req.user.id, req.body.password)) return true;
  res.status(403).json({ error: "Password incorrect", message: "That password is not correct" });
  return false;
}

export async function deleteHistoryHandler(req, res) {
  if (!(await confirmed(req, res))) return;
  const deleted = await deleteHistory(req.user.id);
  req.log.info({ userId: req.user.id, ...deleted }, "history deleted");
  res.json({ success: true, ...deleted });
}

export async function deleteAccountHandler(req, res) {
  if (!(await confirmed(req, res))) return;
  await deleteAccount(req.user.id);
  req.log.info({ userId: req.user.id }, "account deleted");
  res.status(204).end();
}
