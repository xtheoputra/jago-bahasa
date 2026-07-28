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

/** Resolve once a spawned process has really exited (or after a grace period).
 *  Killing is asynchronous: without this the next test file starts while a
 *  headless Chrome is still tearing down, and its own renders lose the race. */
const ended = (p) =>
  !p || p.exitCode !== null || p.signalCode
    ? Promise.resolve()
    : new Promise((res) => {
        const done = () => res();
        p.once("exit", done);
        setTimeout(done, 4000);
      });

after(async () => {
  try { ws?.close(); } catch (e) {}
  chrome?.kill();
  server?.kill();
  await Promise.all([ended(chrome), ended(server)]);
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

test("starring a headword puts it in the review rotation, not in limbo", opts, async () => {
  exceptions = [];
  await evalJS(`localStorage.removeItem('jb.progress.v1::guest')`);
  await send("Page.navigate", { url: BASE + "/#/entry/es/casa" });
  await sleep(2500);
  await evalJS(`document.querySelector('[data-fav]').click()`);
  await sleep(300);

  // The star has to be findable again in the Kamus…
  await go("#/search", 2800);
  assert.ok(await evalJS(`document.body.textContent.includes('casa')`), "starred headword is not listed on the shelf");

  // …countable on Progress, with a deck behind the number…
  await go("#/progress");
  assert.ok(await evalJS(`!!document.querySelector('a[href="#/favorites"]')`), "no Favourites deck for a starred headword");
  await go("#/favorites", 2600);
  assert.ok(await evalJS(`document.body.textContent.includes('casa')`), "the Favourites deck cannot play the starred headword");

  // …and, the point of the whole feature, it must be a due review card even
  // though the learner has never finished a single lesson.
  await go("#/review", 2800);
  assert.ok(await evalJS(`!!document.querySelector('.review-card')`), "starred headword never reached Daily Review");
  assert.ok(await evalJS(`document.querySelector('.review-term')?.textContent.includes('casa')`),
    "the review card is not showing the starred headword");
  assert.deepEqual(exceptions, [], `starring flow threw: ${exceptions.join(" | ")}`);
});

test("an exam can be sat to the end, and grades what it asked about", opts, async () => {
  exceptions = [];
  await evalJS(`localStorage.removeItem('jb.progress.v1::guest')`);
  await send("Page.navigate", { url: BASE + "/#/exam/es/A1" });
  await sleep(3000);
  assert.ok(await evalJS(`!!document.querySelector('.quiz-opt')`), "the exam never handed out a paper");

  // Answer every question with the first option — a real sitting, mostly wrong.
  await evalJS(`document.querySelector('.quiz-opt:not([disabled])').click()`);
  await sleep(120);
  assert.equal(
    await evalJS(`!!document.querySelector('.quiz-opt.correct, .quiz-opt.wrong')`),
    false,
    "the exam revealed the answer mid-paper — that is what practice modes are for"
  );
  for (let i = 0; i < 20; i++) {
    const done = await evalJS(`!!document.querySelector('.quiz-result')`);
    if (done) break;
    await evalJS(`document.querySelector('.quiz-opt:not([disabled])')?.click()`);
    await sleep(560);
  }
  assert.ok(await evalJS(`!!document.querySelector('.quiz-result')`), "the paper never reached a result screen");

  const recorded = await evalJS(`(() => {
    const st = JSON.parse(localStorage.getItem('jb.progress.v1::guest') || '{}');
    return JSON.stringify({ rec: (st.exams || {})['es/A1'] || null, srs: Object.keys(st.srs || {}).length });
  })()`);
  const { rec, srs } = JSON.parse(recorded);
  assert.ok(rec, "sitting an exam left no record at all");
  assert.equal(rec.tries, 1, "one sitting must count as one attempt");
  assert.ok(rec.best >= 0 && rec.best <= 100, `nonsense score recorded: ${rec.best}`);
  assert.ok(srs >= 10, `an exam of 15 questions scheduled only ${srs} cards`);
  assert.deepEqual(exceptions, [], `the exam threw: ${exceptions.join(" | ")}`);
});

test("a passed stage is sealed on the path and printed on a certificate", opts, async () => {
  exceptions = [];
  await evalJS(`localStorage.setItem('jb.progress.v1::guest', JSON.stringify({
    xp: 400, exams: { 'es/A1': { best: 93, passed: true, at: '2026-07-28', tries: 2 } }
  }))`);
  // The state module reads storage at import time, so this needs a real reload.
  await send("Page.navigate", { url: BASE + "/#/cert/es" });
  await sleep(400);
  await send("Page.reload", { ignoreCache: true });
  await sleep(3000);

  const cert = await evalJS(`document.querySelector('.cert')?.textContent || ""`);
  assert.ok(cert.includes("A1"), "the certificate does not name the band it certifies");
  assert.ok(cert.includes("93%"), "the certificate does not show the score behind it");
  assert.ok(await evalJS(`!!document.querySelector('#cprint')`), "a certificate you cannot print or save");

  // Printing must yield the certificate, not the whole app around it.
  await send("Emulation.setEmulatedMedia", { media: "print" });
  // A hidden ancestor does not change a child's own computed display, so ask
  // the only question that matters on paper: is the box actually laid out?
  const hidden = await evalJS(`(() => {
    const painted = (s) => { const el = document.querySelector(s); return !!el && el.getClientRects().length > 0; };
    return JSON.stringify({ bar: painted('.appbar'), nav: painted('.bottomnav'),
                            btn: painted('#cprint'), cert: painted('.cert') });
  })()`);
  const print = JSON.parse(hidden);
  await send("Emulation.setEmulatedMedia", { media: "" });
  assert.ok(!print.bar && !print.nav && !print.btn, `app chrome would be printed onto the certificate: ${hidden}`);
  assert.ok(print.cert, "the certificate itself would not print");

  await go("#/path/es", 2600);
  assert.ok(await evalJS(`!!document.querySelector('.chip--pass')`), "the passed stage carries no seal");
  assert.ok(await evalJS(`!!document.querySelector('a[href="#/cert/es"]')`), "the path hides the certificate it earned");
  assert.deepEqual(exceptions, [], `the certificate flow threw: ${exceptions.join(" | ")}`);
});

test("a dictionary drill schedules the words it actually asked about", opts, async () => {
  exceptions = [];
  await evalJS(`localStorage.removeItem('jb.progress.v1::guest')`);
  await send("Page.navigate", { url: BASE + "/#/drill/ja/A1" });
  await sleep(2800);
  for (let i = 0; i < 3; i++) {
    await evalJS(`document.querySelector('.quiz-opt:not([disabled])')?.click()`);
    await sleep(1400);
  }
  const scheduled = await evalJS(`(() => {
    const srs = JSON.parse(localStorage.getItem('jb.progress.v1::guest') || '{}').srs || {};
    const keys = Object.keys(srs).filter(k => k.startsWith('lex/ja/'));
    return JSON.stringify({ n: keys.length, sample: srs[keys[0]] || null });
  })()`);
  const { n, sample } = JSON.parse(scheduled);
  assert.ok(n >= 2, `a drilled band left only ${n} cards in the rotation`);
  assert.ok(sample && sample.due, "a scheduled card must carry a due date");
  assert.deepEqual(exceptions, [], `the drill threw: ${exceptions.join(" | ")}`);
});
