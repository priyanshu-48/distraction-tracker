// Breaks the nudge feature one way at a time and checks that its tests fail. Restores every file.
//   node scripts/mutate-nudges.mjs [label-regex]        (run from server/; needs the DB_* settings in .env, like npm test)
// A change whose text is no longer in the source is reported as NOT APPLIED, never as caught.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const server = join(dirname(fileURLToPath(import.meta.url)), "..");
const root = join(server, "..");
const SERVER_TESTS = ["vitest", "run", "test/nudgesDomain.test.js", "test/nudges.test.js", "test/range.test.js", "test/session.test.js"];
const EXT_TESTS = ["node", "--test", "test/background.test.mjs"];
const E2E = ["vitest", "run", "test/extensionFlow.test.js"];

// [file, label, from, to, command, cwd]
const M = [
  ["server/domain/nudges.js", "exactly at the budget no longer counts as over", "distractedSeconds >= budgetSeconds", "distractedSeconds > budgetSeconds", SERVER_TESTS],
  ["server/domain/nudges.js", "the cooldown is gone", "if (lastNudgeAt && now.getTime()", "if (false && now.getTime()", SERVER_TESTS],
  ["server/domain/nudges.js", "the holdout is inverted (held-out shown, others hidden)", "shown: holdoutRoll(visitId) >= NUDGE.HOLDOUT_RATE", "shown: holdoutRoll(visitId) < NUDGE.HOLDOUT_RATE", SERVER_TESTS],
  ["server/domain/nudges.js", "a budget of 0 counts as always over", "budgetSeconds > 0 && distractedSeconds", "distractedSeconds", SERVER_TESTS],
  ["server/domain/nudges.js", "the repeat threshold is off by one", "opensInWindow >= NUDGE.REPEAT_OPENS", "opensInWindow > NUDGE.REPEAT_OPENS", SERVER_TESTS],
  ["server/domain/nudges.js", "shown and held-out are swapped in the summary", "    if (row.shown) {\n      out.shown += 1;", "    if (!row.shown) {\n      out.shown += 1;", SERVER_TESTS],
  ["server/models/nudgeModel.js", "sites are matched by raw text, not site_key", "domain = site_key($2) LIMIT 1", "domain = $2 LIMIT 1", SERVER_TESTS],
  ["server/models/nudgeModel.js", "the cooldown ignores held-out rows", "WHERE user_id = $1 AND site = site_key($2)\", [userId, site]);\n  return rows[0]", "WHERE user_id = $1 AND shown AND site = site_key($2)\", [userId, site]);\n  return rows[0]", SERVER_TESTS],
  ["server/controllers/nudgeController.js", "no open-session check", "if (!(await isTracking(userId))) return none();", "", SERVER_TESTS],
  ["server/controllers/nudgeController.js", "unmarked sites are nudged too", "if (!(await isMarkedSite(userId, site))) return none();", "", SERVER_TESTS],
  ["server/controllers/nudgeController.js", "a repeated visit id is decided again", "if (await nudgeExists(client, userId, visit)) return null;", "", SERVER_TESTS],
  ["server/models/accountModel.js", "erasing history leaves the nudges", "n AS (DELETE FROM nudges WHERE user_id = $1 RETURNING 1),", "n AS (SELECT 1),", SERVER_TESTS],
  ["server/routes/nudgeRoute.js", "the extension's token cannot ask for a nudge", "router.post(\"/nudges\", authenticateIngest,", "router.post(\"/nudges\", authenticate,", SERVER_TESTS, "import { authenticateIngest } from \"../middleware/auth.js\";", "import authenticate from \"../middleware/auth.js\";"],
  ["extension/background.js", "any truthy value switches nudges on", ".nudgesEnabled !== true) return;", ".nudgesEnabled) return;", EXT_TESTS, "extension"],
  ["extension/background.js", "no stale-visit guard: an old answer is shown", "if (current?.clientEventId !== visitId) return;", "", EXT_TESTS, "extension"],
  ["extension/background.js", "the badge is not cleared when the visit ends", "if (current.nudged) await clearNudge(current.clientEventId);", "", EXT_TESTS, "extension"],
  ["extension/background.js", "the nudge request sends the page address", "visit: visit.clientEventId", "visit: visit.clientEventId, url: visit.url", EXT_TESTS, "extension"],
  ["extension/background.js", "the extension asks the wrong route", "`${API}/nudges", "`${API}/nudge", E2E],
];

const LF = String.fromCharCode(10), CRLF = String.fromCharCode(13, 10);
for (const [rel, label, rawFrom, rawTo, cmd, ...extra] of M) {
  if (process.argv[2] && !new RegExp(process.argv[2], "i").test(label)) continue;
  const inExt = extra[0] === "extension";
  const cwd = inExt ? join(root, "extension") : server;
  const path = join(root, rel);
  const src = readFileSync(path, "utf8");
  const fit = (t) => (src.includes(CRLF) ? t.replaceAll(LF, CRLF) : t);
  const [from, to] = [fit(rawFrom), fit(rawTo)];
  if (!src.includes(from)) { console.log("NOT APPLIED:", label); continue; }
  let mutated = src.replace(from, to);
  if (extra.length === 2) mutated = mutated.replace(fit(extra[0]), fit(extra[1]));
  writeFileSync(path, mutated);
  let r;
  try {
    r = spawnSync(cmd[0] === "node" ? "node" : "npx", cmd[0] === "node" ? cmd.slice(1) : cmd, { cwd, encoding: "utf8", shell: true });
  } finally {
    writeFileSync(path, src);
  }
  const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, "");
  const line = out.split("\n").filter((l) => /^\s*(Tests|ℹ fail)/.test(l)).pop() ?? "no result";
  console.log(r.status !== 0 ? "caught   " : "SURVIVED ", label.padEnd(58), "->", line.trim());
}
