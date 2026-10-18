// `node --test test/` from extension/. Tests the script that builds the extension for another API and dashboard address.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildExtension, configureSources, DEFAULTS } from "../configure.mjs";

const read = (name) => readFileSync(fileURLToPath(new URL(`../${name}`, import.meta.url)), "utf8");
const files = () => ({ background: read("background.js"), manifest: read("manifest.json") });
const custom = { api: "https://api.example.com/api", dashboard: "https://app.example.com" };

describe("configureSources", () => {
  it("with the built-in addresses changes nothing, which proves the lines it looks for are really there", () => {
    const before = files();
    const after = configureSources(DEFAULTS, before);
    assert.equal(after.background, before.background);
    assert.deepEqual(JSON.parse(after.manifest), JSON.parse(before.manifest));
  });

  it("points the code at the new API and dashboard", () => {
    const { background } = configureSources(custom, files());
    assert.match(background, /^const API = "https:\/\/api\.example\.com\/api";$/m);
    assert.match(background, /^const DASHBOARD_ORIGIN = "https:\/\/app\.example\.com";$/m);
    assert.doesNotMatch(background, /localhost:(3000|5173)/);
  });

  it("changes only the two permissions in the manifest: the API may be called, the dashboard may send messages", () => {
    const before = JSON.parse(files().manifest);
    const after = JSON.parse(configureSources(custom, files()).manifest);
    assert.deepEqual(after.host_permissions, ["https://api.example.com/*"]);
    assert.deepEqual(after.externally_connectable.matches, ["https://app.example.com/*"]);
    const { host_permissions: _a, externally_connectable: _b, ...restBefore } = before;
    const { host_permissions: _c, externally_connectable: _d, ...restAfter } = after;
    assert.deepEqual(restAfter, restBefore); // name, version, permissions, icons and the rest are untouched
  });

  it("produces code that still parses", () => {
    assert.doesNotThrow(() => new Function(configureSources(custom, files()).background));
  });

  it("tidies the addresses: no trailing slash on the API, and the dashboard reduced to its origin", () => {
    const { background, manifest } = configureSources({ api: "https://api.example.com/api/", dashboard: "https://app.example.com/some/page" }, files());
    assert.match(background, /const API = "https:\/\/api\.example\.com\/api";/);
    assert.match(background, /const DASHBOARD_ORIGIN = "https:\/\/app\.example\.com";/);
    assert.deepEqual(JSON.parse(manifest).externally_connectable.matches, ["https://app.example.com/*"]);
  });

  it("keeps a port, and accepts plain http for this computer only", () => {
    const { manifest } = configureSources({ api: "http://127.0.0.1:4000/api", dashboard: "http://localhost:8080" }, files());
    assert.deepEqual(JSON.parse(manifest).host_permissions, ["http://127.0.0.1:4000/*"]);
    assert.deepEqual(JSON.parse(manifest).externally_connectable.matches, ["http://localhost:8080/*"]);
  });

  for (const [what, bad, message] of [
    ["a remote API over plain http (the token would travel unencrypted)", { ...custom, api: "http://api.example.com/api" }, /must use https/],
    ["a remote dashboard over plain http", { ...custom, dashboard: "http://app.example.com" }, /must use https/],
    ["something that is not a web address", { ...custom, api: "not a url" }, /not a web address/],
    ["an address with another scheme", { ...custom, api: "ftp://api.example.com/api" }, /must start with https/],
    ["credentials in the address", { ...custom, api: "https://user:secret@api.example.com/api" }, /plain address/],
    ["a query string", { ...custom, api: "https://api.example.com/api?x=1" }, /plain address/],
    ["a fragment", { ...custom, dashboard: "https://app.example.com/#top" }, /plain address/],
  ]) {
    it(`refuses ${what}`, () => {
      assert.throws(() => configureSources(bad, files()), message);
    });
  }

  it("says so, instead of silently doing nothing, when the lines it expects have been edited", () => {
    const edited = { ...files(), background: files().background.replace('const API = "http://localhost:3000/api";', "const API = 'http://localhost:3000/api';") };
    assert.throws(() => configureSources(custom, edited), /API address was not found/);
  });
});

describe("buildExtension", () => {
  const scratch = () => mkdtempSync(join(tmpdir(), "dt-configure-"));

  it("writes a loadable copy: the two changed files, everything else as it was, and no tests", () => {
    const out = join(scratch(), "built");
    try {
      buildExtension({ ...custom, out });
      assert.match(readFileSync(join(out, "background.js"), "utf8"), /const API = "https:\/\/api\.example\.com\/api";/);
      assert.deepEqual(JSON.parse(readFileSync(join(out, "manifest.json"), "utf8")).host_permissions, ["https://api.example.com/*"]);
      for (const name of ["popup.html", "popup.js", "popup.css", "assets/ext-icon.png"]) assert.ok(existsSync(join(out, name)), `${name} is copied`);
      assert.equal(readFileSync(join(out, "popup.js"), "utf8"), read("popup.js"));
      assert.ok(!existsSync(join(out, "test")), "the tests are not part of the build");
      assert.ok(!existsSync(join(out, "configure.mjs")), "the build script is not part of the build");
    } finally {
      rmSync(join(out, ".."), { recursive: true, force: true });
    }
  });

  it("can be run again over its own earlier output", () => {
    const out = join(scratch(), "built");
    try {
      buildExtension({ ...custom, out });
      buildExtension({ api: "https://api.other.example/api", dashboard: "https://other.example", out });
      assert.match(readFileSync(join(out, "background.js"), "utf8"), /api\.other\.example/);
      assert.doesNotMatch(readFileSync(join(out, "background.js"), "utf8"), /api\.example\.com/);
    } finally {
      rmSync(join(out, ".."), { recursive: true, force: true });
    }
  });

  it("will not wipe a folder that is not an earlier build", () => {
    const dir = scratch();
    try {
      mkdirSync(join(dir, "precious"));
      writeFileSync(join(dir, "precious", "notes.txt"), "keep me");
      assert.throws(() => buildExtension({ ...custom, out: join(dir, "precious") }), /does not look like a previous build/);
      assert.equal(readFileSync(join(dir, "precious", "notes.txt"), "utf8"), "keep me");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("will not use the extension's own folder as the output", () => {
    assert.throws(() => buildExtension({ ...custom, out: fileURLToPath(new URL("..", import.meta.url)) }), /cannot be the extension folder/);
  });
});
