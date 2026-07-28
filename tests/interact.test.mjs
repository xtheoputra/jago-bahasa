/* =========================================================================
   tests/interact.test.mjs — does the app still work when you *click* it?

   The render smoke test proves a route mounts; it cannot prove a button does
   what it says. That gap hid a real one: Match rendered perfectly, yet every
   tap threw, and the game could never be won. This file drives real Chrome
   over the DevTools protocol (Node's built-in WebSocket, no dependencies),
   clicks through the flows that broke, and fails on any uncaught exception.

   Skipped automatically when Chrome is missing or WebSocket is unavailable
   (Node < 21); set CHROME_PATH to point at a specific binary.
   ========================================================================= */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 6100 + (process.pid % 150);
const CDP_PORT = 9500 + (process.pid % 150);
const BASE = `http://127.0.0.1:${PORT}`;

function findChrome() {
  return [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find((p) => fs.existsSync(p)) || null;
}

const CHROME = findChrome();
const opts = !CHROME
  ? { skip: "Chrome not found — set CHROME_PATH to run interaction tests" }
  : typeof WebSocket === "undefined"
  ? { skip: "global WebSocket needs Node >= 21" }
  : {};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let server, chrome, ws, dataDir, profileDir;
let msgId = 0;
const pending = new Map();
let exceptions = [];

const send = (method, params = {}) =>
  new Promise((res) => {
    const id = ++msgId;
    pending.set(id, res);
    ws.send(JSON.stringify({ id, method, params }));
  });

/** Evaluate in the page and return the JSON value (awaits promises). */
async function evalJS(expression) {
  const r = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  const thrown = r.result?.exceptionDetails;
  if (thrown) throw new Error(`page threw: ${thrown.exception?.description || thrown.text}`);
  return r.result?.result?.value;
}

/** Navigate by hash and let the router settle. */
async function go(hash, settle = 1600) {
  await evalJS(`location.hash = ${JSON.stringify(hash)}`);
  await sleep(settle);
}

before(async () => {
  if (opts.skip) return;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jb-int-data-"));
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "jb-int-prof-"));
  server = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE + "/api/health")).ok) break;
    } catch (e) { /* not up yet */ }
    await sleep(100);
  }

  chrome = spawn(CHROME, [
    "--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profileDir}`,
    "--disable-gpu", "--no-sandbox", "--no-first-run", "--disable-extensions", "about:blank",
  ], { stdio: "ignore" });

  let wsUrl = null;
  for (let i = 0; i < 120; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page");
      if (page) { wsUrl = page.webSocketDebuggerUrl; break; }
    } catch (e) { /* not up yet */ }
    await sleep(150);
  }
  assert.ok(wsUrl, "Chrome never exposed a debugging target");

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      exceptions.push((d.exception?.description || d.text || "").split("\n")[0]);
    }
  };
  await send("Runtime.enable");
  await send("Page.enable");
  await send("Page.navigate", { url: BASE + "/#/home" });
  await sleep(2500);
});

after(async () => {
  try { ws?.close(); } catch (e) {}
  chrome?.kill();
  server?.kill();
  // Windows keeps the Chrome profile locked for a moment after the process
  // dies; temp-dir housekeeping must never fail the run.
  for (let attempt = 0; attempt < 5; attempt++) {
    await sleep(300);
    let stuck = false;
    for (const d of [dataDir, profileDir]) {
      if (!d || !fs.existsSync(d)) continue;
      try {
        fs.rmSync(d, { recursive: true, force: true });
      } catch (e) {
        stuck = true;
      }
    }
    if (!stuck) return;
  }
});

test("Match can actually be won — every pair matched ends the game", opts, async () => {
  exceptions = [];
  await go("#/match/es/food");
  const cells = await evalJS(`document.querySelectorAll('.match-cell').length`);
  assert.ok(cells >= 6, `only ${cells} cards rendered`);

  // Tap each left card and its partner on the right, by shared data-id.
  await evalJS(`(async () => {
    const ids = [...new Set([...document.querySelectorAll('[data-side="l"]')].map(b => b.dataset.id))];
    for (const i of ids) {
      document.querySelector('[data-side="l"][data-id="' + i + '"]')?.click();
      document.querySelector('[data-side="r"][data-id="' + i + '"]')?.click();
      await new Promise(r => setTimeout(r, 120));
    }
  })()`);
  await sleep(2000);

  assert.deepEqual(exceptions, [], `clicking Match threw: ${exceptions.join(" | ")}`);
  assert.ok(await evalJS(`!!document.querySelector('.quiz-result')`), "matching every pair never reached the win screen");
});

test("a starred headword is reachable again and never inflates the lesson deck", opts, async () => {
  exceptions = [];
  await evalJS(`localStorage.removeItem('jb.progress.v1::guest')`);
  await send("Page.navigate", { url: BASE + "/#/entry/es/casa" });
  await sleep(2500);
  await evalJS(`document.querySelector('[data-fav]').click()`);
  await sleep(300);

  // The Favourites deck can only play lesson words, so its button must not
  // appear for a learner whose only stars are dictionary entries.
  await go("#/progress");
  assert.equal(await evalJS(`!!document.querySelector('a[href="#/favorites"]')`), false,
    "the Favourites deck button appeared although only dictionary entries are starred");
  assert.ok(await evalJS(`!!document.querySelector('a[href="#/search"]')`),
    "no way back to the starred dictionary entries");

  // …and the star itself must still be findable in the Kamus.
  await go("#/search", 2600);
  assert.ok(await evalJS(`document.body.textContent.includes('casa')`), "starred headword is not listed on the shelf");
  assert.deepEqual(exceptions, [], `starring flow threw: ${exceptions.join(" | ")}`);
});
