// Deliberate-break check for the login and authorization logic.
// For each mutation: change one thing in the source, run the related tests, require at least one failure, restore the file.
//   node scripts/mutate-auth.mjs            (run from server/; needs the DB_* settings in .env, like npm test)
// A mutation whose text is no longer in the source is reported as NOT APPLIED, never as caught.
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const TESTS = ["test/session.test.js", "test/sessionDomain.test.js", "test/account.test.js", "test/intervals.test.js", "test/auth.test.js"];
const A = "middleware/auth.js", S = "domain/session.js", C = "controllers/sessionController.js";

const MUTATIONS = [
  [A, "token version is not compared (logout does not revoke)", "if ((decoded.v ?? 0) !== rows[0].token_version) return deny(res, 'Session ended');", ""],
  [A, "a token with no version is rejected (older tokens break)", "(decoded.v ?? 0) !== rows[0]", "decoded.v !== rows[0]"],
  [A, "scope is not checked", "if (!allowed.includes(scope)) {", "if (false) {"],
  [A, "every route accepts the extension's token", "export default requireAuth([SCOPES.user]);", "export default requireAuth([SCOPES.user, SCOPES.ingest]);"],
  [A, "a token without a scope is treated as the limited one", "decoded.scope ?? SCOPES.user", "decoded.scope ?? SCOPES.ingest"],
  [A, "no CSRF check", "if (via === 'cookie' && !SAFE_METHODS.has(req.method) && req.headers[CSRF_HEADER] !== CSRF_VALUE) {", "if (false) {"],
  [A, "CSRF header demanded of bearer requests too", "if (via === 'cookie' && !SAFE_METHODS.has(req.method)", "if (!SAFE_METHODS.has(req.method)"],
  [A, "CSRF header demanded on reads too", "if (via === 'cookie' && !SAFE_METHODS.has(req.method)", "if (via === 'cookie'"],
  [A, "the cookie wins over the bearer header", "const token = fromHeader ?? parseCookies(req.headers.cookie)[COOKIE_NAME];", "const token = parseCookies(req.headers.cookie)[COOKIE_NAME] ?? fromHeader;"],
  [A, "a deleted account is not noticed", "if (rows.length === 0) return deny(res, 'Account not found');", ""],
  [S, "the cookie is readable by scripts", "httpOnly: true, sameSite", "httpOnly: false, sameSite"],
  [S, "the cookie is SameSite=Lax", 'sameSite: "strict"', 'sameSite: "lax"'],
  [S, "the cookie is sent on every path", 'path: "/api",', 'path: "/",'],
  [S, "Secure is never set", 'env.NODE_ENV === "production";', "false;"],
  [C, "logout does not revoke", 'await db.query("UPDATE users SET token_version = token_version + 1 WHERE id = $1", [req.user.id]);', ""],
  [C, "logout does not clear the cookie", '  res.clearCookie(COOKIE_NAME, clearCookieOptions());\n  req.log.info({ userId: req.user.id }, "signed out");', '  req.log.info({ userId: req.user.id }, "signed out");'],
  [C, "the extension token is a full token", "tokenClaims(rows[0], SCOPES.ingest)", "tokenClaims(rows[0], SCOPES.user)"],
  [C, "the extension token expires in a day", "expiresIn: EXTENSION_TOKEN_SECONDS,", "expiresIn: 86400,"],
  ["controllers/loginController.js", "sign-in sets no cookie", "  res.cookie(COOKIE_NAME, result.token, cookieOptions());\n", ""],
  ["controllers/accountController.js", "deleting the account leaves the cookie", "  res.clearCookie(COOKIE_NAME, clearCookieOptions());\n", ""],
  ["models/loginModel.js", "the internal token version is sent to the client", "    delete user.token_version; // internal: not for the client\n", ""],
  ["routes/tabRoute.js", "the extension cannot upload", 'router.post("/intervals", authenticateIngest,', 'router.post("/intervals", authenticate,'],
  ["app.js", "CORS does not allow credentials", "cors({ origin: origins, credentials: true })", "cors({ origin: origins })"],
];

const LF = String.fromCharCode(10);
const CRLF = String.fromCharCode(13, 10);

function runTests() {
  const r = spawnSync("npx", ["vitest", "run", ...TESTS], { cwd: root, encoding: "utf8", shell: true });
  const out = `${r.stdout}\n${r.stderr}`;
  const summary = out.split("\n").map((l) => l.trim()).filter((l) => l.startsWith("Tests")).pop() ?? "no result";
  return { summary, failed: /\d+ failed/.test(summary), out };
}

const original = new Map();
const rows = [];
try {
  for (const [file, label, rawFrom, rawTo] of MUTATIONS) {
    const path = join(root, file);
    const src = original.get(file) ?? readFileSync(path, "utf8");
    original.set(file, src);
    // Windows checkouts use CRLF; the patterns above are written with LF.
    const fit = (text) => (src.includes(CRLF) ? text.replaceAll(LF, CRLF) : text);
    const [from, to] = [fit(rawFrom), fit(rawTo)];
    if (!src.includes(from)) {
      rows.push({ label, file, verdict: "NOT APPLIED (text not found)", summary: "" });
      console.log(`NOT APPLIED: ${label}`);
      continue;
    }
    let mutated = src.replace(from, to);
    // the one-line route change needs the default import to exist for the mutated line to run
    if (file === "routes/tabRoute.js") {
      mutated = mutated.replace('import { authenticateIngest } from "../middleware/auth.js";', 'import authenticate, { authenticateIngest } from "../middleware/auth.js";');
    }
    writeFileSync(path, mutated);
    const result = runTests();
    writeFileSync(path, src);
    rows.push({ label, file, verdict: result.failed ? "caught" : "SURVIVED", summary: result.summary });
    console.log(`${result.failed ? "caught   " : "SURVIVED "} ${label} -> ${result.summary}`);
  }
} finally {
  for (const [file, src] of original) writeFileSync(join(root, file), src);
}

const baseline = runTests();
const caught = rows.filter((r) => r.verdict === "caught").length;
const notApplied = rows.filter((r) => r.verdict.startsWith("NOT")).length;
console.log(`\nunmutated baseline -> ${baseline.summary}`);
console.log(`${caught} of ${rows.length} mutations caught, ${rows.length - caught - notApplied} survived, ${notApplied} not applied`);
process.exitCode = caught === rows.length && !baseline.failed ? 0 : 1;
