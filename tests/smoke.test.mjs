/* =========================================================================
   tests/smoke.test.mjs — does the app actually render in a browser?
   Unit tests can't catch a broken import, a missing route or a null lookup in
   a view. This boots the real server, renders a handful of routes in headless
   Chrome and asserts both the expected markup and a clean console.
   Skipped automatically when Chrome isn't installed (set CHROME_PATH to point
   at a specific binary).
   ========================================================================= */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5800 + (process.pid % 190);
const BASE = `http://127.0.0.1:${PORT}`;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  return candidates.find((p) => fs.existsSync(p)) || null;
}

const CHROME = findChrome();
const opts = CHROME ? {} : { skip: "Chrome not found — set CHROME_PATH to run render smoke tests" };

let child, dataDir, profileDir;

before(async () => {
  if (!CHROME) return;
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jb-smoke-data-"));
  profileDir = fs.mkdtempSync(path.join(os.tmpdir(), "jb-smoke-prof-"));
  child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(BASE + "/api/health")).ok) return;
    } catch (e) {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});

after(() => {
  if (child) child.kill();
  for (const d of [dataDir, profileDir]) if (d) fs.rmSync(d, { recursive: true, force: true });
});

/** Render one hash route and return { dom, consoleErrors }. */
function render(hash) {
  const res = spawnSync(
    CHROME,
    [
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      `--user-data-dir=${profileDir}`,
      "--enable-logging=stderr",
      "--v=0",
      "--virtual-time-budget=7000",
      "--dump-dom",
      BASE + hash,
    ],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 60_000 }
  );
  const errors = String(res.stderr || "")
    .split("\n")
    .filter((l) => /ERROR:CONSOLE|Uncaught|SyntaxError|TypeError|is not defined|Failed to load resource/i.test(l))
    .filter((l) => !/favicon|Fontconfig|GPU|gpu_|dbus|Vulkan|voice|speech/i.test(l));
  return { dom: String(res.stdout || ""), errors };
}

/** Assert a route renders, contains every marker, and logs nothing.
 *  The router mounts `<div class="view">`; when the test files run in parallel
 *  a loaded machine can occasionally dump the DOM before the modules have
 *  executed, so retry until the view is actually mounted. */
function expectRoute(hash, markers) {
  let dom = "",
    errors = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    ({ dom, errors } = render(hash));
    if (dom.includes('class="view"')) break;
  }
  assert.deepEqual(errors, [], `${hash} logged console errors`);
  assert.ok(dom.includes('class="view"'), `${hash} never mounted a view (${dom.length} bytes)`);
  for (const m of markers) assert.ok(dom.includes(m), `${hash} is missing "${m}"`);
  return dom;
}

test("home renders the hero, stats and word of the day", opts, () => {
  const dom = expectRoute("#/home", ['class="hero"', 'class="card wod"', "daily-card", 'id="ctaStart"']);
  assert.match(dom, /wod__term/, "word of the day has no term");
});

test("the language catalogue lists every course and offers the filter", opts, () => {
  const dom = expectRoute("#/courses", ['id="courseQ"', 'id="courseCount"', 'data-search=']);
  const cards = dom.match(/class="card course-card"/g) || [];
  assert.ok(cards.length >= 23, `only ${cards.length} course cards rendered`);
});

test("a course page lists its lessons and its script trainer", opts, () => {
  expectRoute("#/course/el", ["course-header", 'href="#/script/greek"', 'class="lesson-row ']);
});

test("a lesson page offers every practice mode", opts, () => {
  expectRoute("#/lesson/el/greet", ['id="goFlash"', 'id="goQuiz"', 'id="goType"', 'id="goDictation"', 'id="goListen"', 'id="goCloze"']);
});

test("a dialogue lesson renders chat bubbles and hides typing modes", opts, () => {
  const dom = expectRoute("#/lesson/sw/convo3", ["dialog__turn", "dialog__bubble"]);
  assert.ok(!dom.includes('id="goDictation"'), "dictation must be hidden for dialogue lessons");
  assert.ok(!dom.includes('id="goType"'), "typing must be hidden for dialogue lessons");
});

test("the dictation mode renders its audio-only prompt", opts, () => {
  const dom = expectRoute("#/dictation/uk/greet", ['id="dicPlay"', 'id="dicInput"', 'id="dicSlow"']);
  assert.ok(!dom.includes("dictation-term"), "dictation must not show the written term up front");
});

test("quiz, dictionary, progress and stats all render", opts, () => {
  expectRoute("#/quiz/el/num", ["quiz-options", "quiz-opt"]);
  expectRoute("#/search", ['id="dictQ"', 'id="dictResults"']);
  expectRoute("#/progress", ["ach-grid", 'id="goalPicker"', 'id="exportBtn"']);
  expectRoute("#/stats", ["heatmap", "hm-cell"]);
});

test("an unknown route shows the 404 view", opts, () => {
  assert.ok(expectRoute("#/definitely-not-a-route", ["404"]));
});

test("practice views carry the accessibility affordances they claim", opts, () => {
  // A flashcard is a toggle button; its pressed state must be exposed.
  const flash = expectRoute("#/flashcards/el/num", ['id="fcard"', 'aria-pressed="false"']);
  assert.match(flash, /role="button"/);

  // Typed feedback is injected after the answer — it needs a live region.
  const type = expectRoute("#/type/sw/color", ['id="typeFb"', 'role="status"']);
  assert.match(type, /class="visually-hidden">[^<]+<\/h2>/, "typing view has no heading");

  // Duplicated progress bars are hidden so screen readers hear the "n of m" chip once.
  assert.match(type, /class="progress" aria-hidden="true"/);

  // The 182-cell heatmap is one labelled image, not 182 announcements.
  const stats = expectRoute("#/stats", ['class="heatmap" role="img"']);
  assert.match(stats, /aria-label="[^"]+"/);
});
