// Builds a copy of the extension that talks to your own API and dashboard instead of localhost.
//
//   node configure.mjs --api https://api.example.com/api --dashboard https://app.example.com [--out dist]
//
// Then load the output folder at chrome://extensions ("Load unpacked"). The addresses are fixed when the copy is built,
// on purpose: if a web page could tell the extension where to send visits and its token, a compromised page could point it
// at its own server. Needs only Node; the extension itself still has no build step for local use.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** What the extension is built with when it is loaded straight from this folder. */
export const DEFAULTS = { api: "http://localhost:3000/api", dashboard: "http://localhost:5173" };

/** Checks one address. Plain http is only accepted for this computer; anything else must be https. */
function address(value, flag, { keepPath }) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${flag} is not a web address: ${value}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new Error(`${flag} must start with https:// (got ${url.protocol}//)`);
  if (url.protocol === "http:" && !LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`${flag} must use https: the extension sends a login token, and plain http is only allowed for localhost (${value})`);
  }
  if (url.username || url.password || url.search || url.hash) throw new Error(`${flag} must be a plain address, without credentials, a query or a #fragment: ${value}`);
  return { origin: url.origin, href: keepPath ? url.origin + url.pathname.replace(/\/+$/, "") : url.origin };
}

function replaceOnce(text, from, to, what) {
  if (!text.includes(from)) throw new Error(`${what} was not found in the extension's source, so it cannot be changed (expected: ${from})`);
  return text.replace(from, to);
}

/**
 * The extension's two files that name an address, rewritten for the given addresses. Pure: text in, text out.
 * `api` keeps its path (for example /api); `dashboard` is reduced to its origin.
 */
export function configureSources({ api, dashboard }, { background, manifest }) {
  const apiAddress = address(api, "--api", { keepPath: true });
  const dashboardAddress = address(dashboard, "--dashboard", { keepPath: false });

  let source = replaceOnce(background, `const API = ${JSON.stringify(DEFAULTS.api)};`, `const API = ${JSON.stringify(apiAddress.href)};`, "the API address");
  source = replaceOnce(source, `const DASHBOARD_ORIGIN = ${JSON.stringify(DEFAULTS.dashboard)};`, `const DASHBOARD_ORIGIN = ${JSON.stringify(dashboardAddress.origin)};`, "the dashboard address");

  const parsed = JSON.parse(manifest);
  parsed.host_permissions = [`${apiAddress.origin}/*`];
  parsed.externally_connectable = { ...parsed.externally_connectable, matches: [`${dashboardAddress.origin}/*`] };
  return { background: source, manifest: `${JSON.stringify(parsed, null, 2)}\n` };
}

/** Copies the extension (without its tests) into `out` and rewrites the two files. Returns the folder written. */
export function buildExtension({ api, dashboard, out = join(here, "dist") }) {
  const target = resolve(out);
  if (target === here) throw new Error("--out cannot be the extension folder itself");
  // Only replace a folder that is empty or is an earlier build, never an unrelated one.
  if (existsSync(target) && readdirSync(target).length > 0 && !existsSync(join(target, "manifest.json"))) {
    throw new Error(`${target} is not empty and does not look like a previous build; choose another --out`);
  }

  const files = configureSources({ api, dashboard }, {
    background: readFileSync(join(here, "background.js"), "utf8"),
    manifest: readFileSync(join(here, "manifest.json"), "utf8"),
  });

  rmSync(target, { recursive: true, force: true });
  mkdirSync(target, { recursive: true });
  const skip = new Set(["test", "dist", "node_modules", "configure.mjs"]);
  for (const name of readdirSync(here)) {
    if (!skip.has(name)) cpSync(join(here, name), join(target, name), { recursive: true });
  }
  writeFileSync(join(target, "background.js"), files.background);
  writeFileSync(join(target, "manifest.json"), files.manifest);
  return target;
}

function flag(args, name) {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const api = flag(args, "api");
  const dashboard = flag(args, "dashboard");
  if (!api || !dashboard) {
    console.error("usage: node configure.mjs --api https://api.example.com/api --dashboard https://app.example.com [--out dist]");
    process.exit(1);
  }
  try {
    const out = buildExtension({ api, dashboard, out: flag(args, "out") });
    console.log(`Built ${out}`);
    console.log(`  API        ${api}`);
    console.log(`  dashboard  ${dashboard}`);
    console.log("Next: load that folder at chrome://extensions (Developer mode, Load unpacked), then put the extension's ID in the");
    console.log("dashboard's VITE_EXTENSION_ID and rebuild the dashboard.");
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
