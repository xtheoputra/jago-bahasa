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

test("levels follow the 200-XP ladder", () => {
  assert.equal(store.levelFromXp(0), 1);
  assert.equal(store.levelFromXp(199), 1);
  assert.equal(store.levelFromXp(200), 2);
  assert.equal(store.xpIntoLevel(250), 50);
});
