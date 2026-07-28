/* =========================================================================
   tests/state.test.mjs — progress, streaks, SRS scheduling and the daily goal.
   core/state.js only touches localStorage, so a five-line stub is enough to
   exercise the real module under Node — no browser, no framework.
   ========================================================================= */
import test from "node:test";
import assert from "node:assert/strict";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};

const store = await import("../js/core/state.js");

const isoOf = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shiftISO = (iso, n) => {
  const d = store.parseISO(iso);
  d.setDate(d.getDate() + n);
  return isoOf(d);
};

test.beforeEach(() => store.reset());

/* ------------------------------------------------------------------ dates */
test("parseISO reads a calendar date in the LOCAL timezone", () => {
  // new Date("2026-07-23") is UTC midnight; west of UTC its local getters land
  // on the 22nd. parseISO must be timezone-proof — this is the regression that
  // shifted SRS due dates, streak weekday letters and heatmap columns.
  const d = store.parseISO("2026-07-23");
  assert.equal(d.getFullYear(), 2026);
  assert.equal(d.getMonth(), 6);
  assert.equal(d.getDate(), 23);
  assert.equal(d.getDay(), 4, "2026-07-23 is a Thursday");
});

test("todayISO round-trips through parseISO", () => {
  assert.equal(isoOf(store.parseISO(store.todayISO())), store.todayISO());
});

test("lastNDates is contiguous, ascending and ends today", () => {
  const days = store.lastNDates(10);
  assert.equal(days.length, 10);
  assert.equal(days.at(-1), store.todayISO());
  for (let i = 1; i < days.length; i++) {
    const gap = Math.round((store.parseISO(days[i]) - store.parseISO(days[i - 1])) / 86400000);
    assert.equal(gap, 1, `gap between ${days[i - 1]} and ${days[i]}`);
  }
});

/* -------------------------------------------------------------------- SRS */
test("a 'good' grade on a new card schedules it for tomorrow, not today", () => {
  store.srsGrade("a/b#0", "good");
  assert.equal(store.getState().srs["a/b#0"].due, shiftISO(store.todayISO(), 1));
  assert.equal(store.srsDue([{ key: "a/b#0" }]).length, 0, "card should not be due again today");
});

test("'again' keeps the card due today and costs ease", () => {
  store.srsGrade("a/b#1", "good");
  const easeAfterGood = store.getState().srs["a/b#1"].ease;
  store.srsGrade("a/b#1", "again");
  const s = store.getState().srs["a/b#1"];
  assert.equal(s.due, store.todayISO());
  assert.equal(s.reps, 0);
  assert.equal(s.lapses, 1);
  assert.ok(s.ease < easeAfterGood);
});

test("intervals grow across repeated 'good' grades", () => {
  const key = "a/b#2";
  const seen = [];
  for (let i = 0; i < 4; i++) {
    store.srsGrade(key, "good");
    seen.push(store.getState().srs[key].interval);
  }
  assert.deepEqual(seen.slice(0, 2), [1, 3]);
  for (let i = 1; i < seen.length; i++) assert.ok(seen[i] > seen[i - 1], `intervals: ${seen}`);
});

test("ease never drops below the SM-2 floor of 1.3", () => {
  const key = "a/b#3";
  for (let i = 0; i < 20; i++) store.srsGrade(key, "again");
  assert.ok(store.getState().srs[key].ease >= 1.3);
});

test("cards with no schedule yet are due immediately", () => {
  assert.equal(store.srsDue([{ key: "never/seen#0" }]).length, 1);
});

/* ------------------------------------------------------------ daily goal */
test("the daily goal is credited once per day", () => {
  store.setDailyGoal(20);
  store.addXp(25);
  assert.equal(store.dailyStatus().hit, true);
  assert.equal(store.counter("goalDays"), 1);
  store.addXp(25);
  assert.equal(store.counter("goalDays"), 1, "must not double-credit the same day");
});

test("setDailyGoal only accepts the offered presets", () => {
  store.setDailyGoal(20);
  store.setDailyGoal(999);
  assert.equal(store.dailyStatus().goal, 20);
});

test("dailyStatus percentage is clamped to 100", () => {
  store.setDailyGoal(20);
  store.addXp(500);
  assert.equal(store.dailyStatus().pct, 100);
});

/* ------------------------------------------------------------- retention */
test("xpHistory keeps more days than the 182-day heatmap draws", () => {
  assert.ok(store.HISTORY_DAYS > 182, `HISTORY_DAYS is ${store.HISTORY_DAYS}`);
  const st = store.getState();
  for (const iso of store.lastNDates(store.HISTORY_DAYS + 40)) st.xpHistory[iso] = 1;
  store.addXp(1); // triggers the prune
  const kept = Object.keys(store.getState().xpHistory).length;
  assert.equal(kept, store.HISTORY_DAYS);
  assert.ok(kept >= 182, "the heatmap window must survive the prune");
});

test("importing a backup keeps the full active-day history", () => {
  // Regression: the merge used to truncate activeDays to 60, silently erasing
  // most of the heatmap on sign-in, import, or a cloud pull.
  const days = store.lastNDates(300);
  const res = store.importData(JSON.stringify({ progress: { xp: 10, activeDays: days } }));
  assert.equal(res.ok, true);
  assert.ok(store.getState().activeDays.length > 182, `kept ${store.getState().activeDays.length}`);
});

test("importData rejects junk without touching progress", () => {
  store.addXp(40);
  assert.equal(store.importData("not json").ok, false);
  assert.equal(store.importData(JSON.stringify({ nothing: true })).ok, false);
  assert.equal(store.getState().xp, 40);
});

test("export → import round-trips XP and finished lessons", () => {
  const c = { id: "en", lessons: [] };
  const l = { id: "greet", items: [{}, {}, {}] };
  store.completeLesson(c, l, 80);
  const bundle = store.exportData();
  store.reset();
  assert.equal(store.getState().xp, 0);
  assert.equal(store.importData(bundle).ok, true);
  assert.equal(store.getState().doneLessons["en/greet"], true);
  assert.equal(store.getState().quizScores["en/greet"], 80);
  assert.ok(store.getState().xp >= 30);
});

/* ---------------------------------------------------- mistakes/favourites */
test("mistakes are added and cleared by key", () => {
  store.recordMistake("en/greet#1");
  assert.equal(store.mistakeCount(), 1);
  store.clearMistake("en/greet#1");
  assert.equal(store.mistakeCount(), 0);
});

test("favourites toggle and report their state", () => {
  assert.equal(store.favToggle("en/greet#0"), true);
  assert.equal(store.isFav("en/greet#0"), true);
  assert.equal(store.favCount(), 1);
  assert.equal(store.favToggle("en/greet#0"), false);
  assert.equal(store.favCount(), 0);
});

/* ------------------------------------------------------------- accuracy */
test("per-mode accuracy is tracked for every practice mode", () => {
  for (const mode of ["quiz", "type", "listen", "dictation", "cloze", "speak", "build", "mix", "mistakes", "fav"]) {
    store.recordAttempt(mode, true);
    store.recordAttempt(mode, false);
    assert.equal(store.accuracy(mode).pct, 50, `mode ${mode}`);
  }
  assert.equal(store.accuracy("never-played"), null);
});

/* -------------------------------------------------------- account buckets */
test("switching users isolates progress", () => {
  store.addXp(100);
  store.switchUser("user-a");
  assert.equal(store.getState().xp, 0, "a fresh account must not inherit guest XP");
  store.addXp(7);
  store.switchUser("guest");
  assert.equal(store.getState().xp, 100);
  store.switchUser("user-a");
  assert.equal(store.getState().xp, 7);
  store.switchUser("guest");
});

/* This file never loads a dictionary volume, which makes it the right place to
   pin down what the decks must do while a chunk is still on its way. */
test("a dictionary card is skipped, never pruned, while its volume is unloaded", () => {
  store.reset();
  const key = "lex/es/casa";
  store.favToggle(key);
  assert.deepEqual(store.favPool(), [], "an unloaded volume yields no card…");
  assert.ok(store.isFav(key), "…but the star must survive to be resolved later");
  assert.equal(store.resolveCard(key), undefined, "unloaded resolves to 'skip', not 'delete'");
  store.reset();
});

test("a dictionary key that can never resolve is pruned", () => {
  store.reset();
  store.favToggle("lex/zz/nonsense"); // no such dictionary
  assert.equal(store.resolveCard("lex/zz/nonsense"), null);
  assert.deepEqual(store.favPool(), []);
  assert.equal(store.isFav("lex/zz/nonsense"), false, "a key with no possible home is dropped");
  store.reset();
});

test("the review badge counts dictionary cards without downloading them", () => {
  store.reset();
  store.favToggle("lex/es/casa");
  const keys = store.srsKeys().map((k) => k.key);
  assert.ok(keys.includes("lex/es/casa"), "srsKeys() works off state alone");
  assert.deepEqual(store.progressLexiconIds(), ["es"], "…and says which volume to fetch");
  store.reset();
});

/* ------------------------------------------------------------ stage exams */
test("a stage is certified only at the pass mark, and never uncertified after", () => {
  store.reset();
  const fail = store.recordExam("es", "A1", 73);
  assert.equal(fail.passed, false);
  assert.equal(store.examPassed("es", "A1"), false, "73% must not certify anything");

  const pass = store.recordExam("es", "A1", 87);
  assert.equal(pass.passed, true);
  assert.equal(pass.first, true, "the first pass has to announce itself");
  assert.equal(store.examPassed("es", "A1"), true);

  // A shaky re-sit is a worse score, not a lost certificate.
  store.recordExam("es", "A1", 40);
  assert.equal(store.examPassed("es", "A1"), true, "a bad re-sit revoked the certificate");
  assert.equal(store.examResult("es", "A1").best, 87, "the best score must survive a bad re-sit");
  assert.equal(store.examResult("es", "A1").tries, 3);
  store.reset();
});

test("the big XP award is paid once, no matter how often you re-sit", () => {
  store.reset();
  const first = store.recordExam("es", "A1", 100);
  const xpAfterFirst = store.getState().xp;
  assert.ok(first.gain >= 50, "earning a stage should be worth real XP");
  const again = store.recordExam("es", "A1", 100);
  assert.ok(again.gain < first.gain, "a re-sit must not pay the full award again");
  assert.ok(store.getState().xp > xpAfterFirst, "a re-sit still pays something");
  assert.equal(store.getState().counters.exams, 1, "one stage passed, counted once");
  store.reset();
});

test("certificates report the highest band, in ladder order", () => {
  store.reset();
  store.recordExam("es", "B1", 90);
  store.recordExam("es", "A1", 90);
  assert.deepEqual(store.certifiedBands("es"), ["A1", "B1"], "bands must read lowest → highest");
  assert.equal(store.certifiedBand("es"), "B1", "the certificate shows the highest band earned");
  assert.equal(store.certifiedBand("fr"), null, "an untouched language certifies nothing");
  store.recordExam("fr", "A1", 85);
  assert.deepEqual(store.certifiedLanguages().sort(), ["es", "fr"]);
  assert.equal(store.examsPassed(), 3);
  store.reset();
});

test("a certificate survives an import from another device", () => {
  store.reset();
  store.recordExam("es", "A1", 95);
  const backup = store.exportData();
  store.reset();
  assert.equal(store.examPassed("es", "A1"), false, "reset really cleared it");
  store.recordExam("es", "A1", 60); // this device only ever failed
  assert.equal(store.importData(backup).ok, true);
  assert.equal(store.examPassed("es", "A1"), true, "the imported pass must win");
  assert.equal(store.examResult("es", "A1").best, 95, "and bring its best score with it");
  store.reset();
});

test("levels follow the 200-XP ladder", () => {
  assert.equal(store.levelFromXp(0), 1);
  assert.equal(store.levelFromXp(199), 1);
  assert.equal(store.levelFromXp(200), 2);
  assert.equal(store.xpIntoLevel(250), 50);
});
