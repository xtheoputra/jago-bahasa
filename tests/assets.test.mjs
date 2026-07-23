/* =========================================================================
   tests/assets.test.mjs — the offline shell.
   A module that exists on disk but is missing from the service worker's
   precache list works online and 404s offline, which is the worst possible
   failure mode for a PWA. These tests keep sw.js honest.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

const sw = read("sw.js");
const precached = new Set(
  (sw.match(/const ASSETS = \[([\s\S]*?)\];/)?.[1] || "")
    .split(",")
    .map((s) => s.trim().replace(/^"|"$/g, ""))
    .filter((s) => s.startsWith("./"))
);

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) walk(rel, out);
    else out.push(rel);
  }
  return out;
}

test("the service worker version is bumped in the documented format", () => {
  const v = sw.match(/const VERSION = "(jb-v[\d.]+)"/);
  assert.ok(v, "VERSION constant not found");
  assert.match(v[1], /^jb-v\d+\.\d+\.\d+$/);
});

test("every front-end ES module is precached", () => {
  const modules = walk("js").filter((p) => p.endsWith(".js"));
  const missing = modules.filter((p) => !precached.has(`./${p}`));
  assert.deepEqual(missing, [], `not in sw.js ASSETS: ${missing.join(", ")}`);
  assert.ok(modules.length >= 20, `only found ${modules.length} modules`);
});

test("the precache list has no dead entries", () => {
  const dead = [...precached].filter((p) => p !== "./" && !fs.existsSync(path.join(ROOT, p)));
  assert.deepEqual(dead, [], `listed but missing on disk: ${dead.join(", ")}`);
});

test("shell, stylesheet, manifest and icons are precached", () => {
  for (const p of ["./", "./index.html", "./manifest.webmanifest", "./css/styles.css"]) {
    assert.ok(precached.has(p), `${p} is not precached`);
  }
  const icons = [...precached].filter((p) => p.startsWith("./icons/"));
  assert.ok(icons.length >= 4, `only ${icons.length} icons precached`);
});

test("the API is never served from the cache", () => {
  // The guard is written as a regex literal (/\/api\//), so unescape before matching.
  assert.ok(sw.replace(/\\/g, "").includes("/api/"), "sw.js must special-case /api/");
  assert.ok(sw.includes('req.mode === "navigate"'), "navigations need a network-first branch");
});

test("the manifest is valid and matches the shell", () => {
  const man = JSON.parse(read("manifest.webmanifest"));
  assert.ok(man.name && man.short_name, "manifest needs a name and short_name");
  assert.equal(man.display, "standalone");
  assert.ok(man.icons.length >= 3, "at least three icon sizes");
  for (const i of man.icons) {
    assert.ok(fs.existsSync(path.join(ROOT, i.src.replace(/^\.?\//, ""))), `icon missing on disk: ${i.src}`);
  }
  assert.ok(man.icons.some((i) => (i.purpose || "").includes("maskable")), "needs a maskable icon");
});

test("index.html loads the app as a module and keeps its CSP", () => {
  const html = read("index.html");
  assert.match(html, /<script type="module" src="js\/app\.js">/);
  assert.match(html, /Content-Security-Policy/);
  assert.match(html, /object-src 'none'/);
  // The inline framebuster is authorised by a CSP hash — if the script changes,
  // the hash must change with it, so flag any second inline script.
  const inline = html.match(/<script(?![^>]*src=)[^>]*>/g) || [];
  assert.equal(inline.length, 1, "only the hashed framebuster may be inline");
});
