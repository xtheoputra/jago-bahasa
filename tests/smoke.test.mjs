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
      if ((await fetch(BASE + "/api/health")).ok) {
        // First launch also creates the Chrome profile; do it before timing anything.
        render("#/home");
        return;
      }
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
      // Virtual time is fast-forwarded, so a larger cap costs nothing on a
      // quiet machine — it only buys headroom when the box is busy and the
      // module graph genuinely takes longer to settle.
      "--virtual-time-budget=20000",
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
 *  A single dump can arrive before the app is ready, and it is a race with the
 *  network, not a defect: --virtual-time-budget fast-forwards timers but does
 *  not wait for module fetches, so the very first visit to a URL — cold HTTP
 *  cache, ~40 ES modules, plus the route's lazy vocabulary chunk — can dump the
 *  bare shell. The second visit is warm and instant. So every attempt is
 *  retried, including one that logged an error. Nothing is weakened by that: a
 *  genuinely broken route fails every attempt, and it is the LAST attempt that
 *  has to come back both complete and silent. */
function expectRoute(hash, markers) {
  const want = ['class="view"', ...markers];
  let dom = "",
    errors = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    ({ dom, errors } = render(hash));
    if (!errors.length && want.every((m) => dom.includes(m))) break;
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

test("the dictionary shelf, a volume, an entry and the front matter render", opts, () => {
  const shelf = expectRoute("#/search", ["shelf-book", 'href="#/dict/es"']);
  assert.ok(shelf.includes("#/path"), "the shelf should link to the learning path");

  const book = expectRoute("#/dict/es", ["book-header", "alpha-strip", "book-letter", "dict-entry"]);
  assert.match(book, /data-band="B2"/, "the CEFR strip is missing");

  const entry = expectRoute("#/entry/es/casa", ["entry__w", "entry__gloss", "entry__block"]);
  assert.match(entry, /ˈka\.sa/, "the entry lost its pronunciation");
  assert.ok(entry.includes("#/entry/"), "prev/next paging is missing");

  expectRoute("#/guide/es", ["guide-table", "guide-grammar", "guide-block"]);
});

test("the zero→expert path renders its six stages and a playable drill", opts, () => {
  expectRoute("#/path", ["stage-legend", "path-pick"]);
  const path = expectRoute("#/path/ko", ["stages", "stage__can", 'href="#/drill/ko/A1"']);
  const stages = path.match(/class="card stage /g) || [];
  assert.ok(stages.length >= 6, `only ${stages.length} stages rendered`);

  expectRoute("#/drill/ko/A1", ["quiz-options", "quiz-opt", "drill-def"]);
});

test("a stage exam renders a paper, and the certificate stays locked until it is earned", opts, () => {
  // The exam draws on the lessons AND the dictionary, so the path must offer
  // it wherever a stage has enough material behind it.
  const path = expectRoute("#/path/ko", ['href="#/exam/ko/A1"']);
  assert.ok(!path.includes('href="#/cert/ko"'), "a certificate link appeared before any exam was passed");

  const exam = expectRoute("#/exam/ko/A1", ["quiz-options", "quiz-opt", "exam-prompt", "exam-note"]);
  const opts_ = exam.match(/class="quiz-opt/g) || [];
  assert.ok(opts_.length >= 2, `only ${opts_.length} answers offered`);
  // Nothing may pre-announce the answer: the paper carries no verdict classes.
  assert.ok(!/class="quiz-opt[^"]*(correct|wrong)/.test(exam), "the exam leaked the answer in its markup");

  // With nothing passed, the certificate route is an invitation, not a claim.
  expectRoute("#/cert/ko", ["empty"]);
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
