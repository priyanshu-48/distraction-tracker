// Breaks the extension or the API one way at a time and checks that test/extensionFlow.test.js fails. Restores every file.
//   node scripts/mutate-extension-flow.mjs        (run from server/; needs the DB_* settings in .env, like npm test)
// A change whose text is no longer in the source is reported as NOT APPLIED, never as caught.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const server = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(server, "..");
const T = "test/extensionFlow.test.js";

const M = [
  // the extension's side of the contract
  ["extension/background.js", "the upload goes to the wrong route", "`${API}/intervals`", "`${API}/interval`"],
  ["extension/background.js", "the upload carries no login", 'headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },', 'headers: { "Content-Type": "application/json" },'],
  ["extension/background.js", "the poll carries no login", "{ headers: { Authorization: `Bearer ${token}` } }", "{}"],
  ["extension/background.js", "uploaded visits are never removed from the queue", "await chrome.storage.local.set({ queue: latest.filter((i) => !sent.has(i.clientEventId)) });", ""],
  ["extension/background.js", "the visit has no id (the server would reject it)", "      clientEventId: crypto.randomUUID(),\n", ""],
  ["extension/background.js", "a rejected login throws the queue away", "  await chrome.storage.local.remove(\"token\");\n  await chrome.storage.local.set({ authState: \"logged_out\" });", "  await chrome.storage.local.remove([\"token\", \"queue\"]);\n  await chrome.storage.local.set({ authState: \"logged_out\" });"],
  ["extension/background.js", "a lost answer drops the visit instead of keeping it", 'return console.warn("Upload failed, will retry:", err.message); // offline/server down: keep queue', 'await chrome.storage.local.set({ queue: [] }); return;'],
  ["extension/background.js", "the extension ignores the stop and keeps the visit open", "if (was && !tracking) await closeCurrent();", ""],
  // the API's side
  ["server/models/tabModel.js", "a repeated visit is no longer ignored", "ON CONFLICT (user_id, client_event_id) DO NOTHING", ""],
  ["server/routes/tabRoute.js", "the extension's token cannot upload", 'router.post("/intervals", authenticateIngest,', 'router.post("/intervals", authenticate,'],
  ["server/routes/trackingRoute.js", "the extension's token cannot read the tracking state", "router.get(\"/is-tracking\",authenticateIngest,is_Tracking);", "router.get(\"/is-tracking\",authenticate,is_Tracking);"],
  ["server/models/tabModel.js", "time after the session's end is kept", "LEAST(p.ended_at, COALESCE(p.session_end, p.ended_at)) AS e2", "p.ended_at AS e2"],
  ["server/controllers/sessionController.js", "logging out does not end the extension's token", 'await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);', ""],
];

const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
for (const [rel, label, rawFrom, rawTo] of M) {
  const path = join(root, rel);
  const src = readFileSync(path, "utf8");
  const fit = (t) => (src.includes(CRLF) ? t.replaceAll(LF, CRLF) : t);
  const [from, to] = [fit(rawFrom), fit(rawTo)];
  if (!src.includes(from)) { console.log("NOT APPLIED:", label); continue; }
  let mutated = src.replace(from, to);
  if (rel === "server/routes/tabRoute.js") mutated = mutated.replace('import { authenticateIngest } from "../middleware/auth.js";', 'import authenticate, { authenticateIngest } from "../middleware/auth.js";');
  if (rel === "server/routes/trackingRoute.js" && !/import authenticate\b/.test(mutated)) console.log("  (note: trackingRoute has no default authenticate import)");
  writeFileSync(path, mutated);
  const r = spawnSync("npx", ["vitest", "run", T], { cwd: server, encoding: "utf8", shell: true });
  writeFileSync(path, src);
  const line = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "").split("\n").filter((l) => l.trim().startsWith("Tests")).pop() ?? "no result";
  console.log(/failed/.test(line) ? "caught   " : "SURVIVED ", label.padEnd(58), "->", line.trim());
}
