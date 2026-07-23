/* =========================================================================
   core/state.js — Learning progress + gamification, namespaced per account.
   Each user (and "guest") gets an isolated bucket: jb.progress.v1::<uid|guest>.
   When signed in with the cloud backend, saves are debounced-pushed via a
   pluggable `remote` adapter; on login, server progress is merged in.
   ========================================================================= */
import { COURSES, courseLoaded } from "../data.js";

const KEY_BASE = "jb.progress.v1";
const nsKey = (uid) => `${KEY_BASE}::${uid || "guest"}`;

/** How many days of daily history to retain (must exceed the 182-day heatmap). */
export const HISTORY_DAYS = 200;
/** Cap on the retained active-day list (shared by touchStreak and mergeInto). */
const ACTIVE_DAYS_CAP = 400;

export function defaultState() {
  return {
    xp: 0,
    doneLessons: {}, // "courseId/lessonId": true
    learnedWords: {}, // "courseId/lessonId": count
    quizScores: {}, // "courseId/lessonId": bestPercent
    streak: 0,
    lastActive: null, // YYYY-MM-DD
    activeDays: [], // recent ISO dates
    lastCourse: null,
    srs: {}, // "courseId/lessonId#index": { due, interval, ease, reps, lapses }
    dailyGoal: 50, // XP target per day
    daily: { date: null, xp: 0, credited: false }, // today's XP toward the goal
    mistakes: {}, // "courseId/lessonId#index": { at: YYYY-MM-DD }
    counters: {}, // named lifetime counters (typed, listened, matched, perfect, goalDays…)
    favorites: {}, // "courseId/lessonId#index": true — starred words
    freezes: 0, // streak-freeze tokens (protect the streak for one missed day)
    bestStreak: 0, // longest streak ever reached
    xpHistory: {}, // "YYYY-MM-DD": xp earned that day (for the trend chart)
    tally: {}, // per-mode { tries, ok } for accuracy insights
    reminder: { enabled: false, time: "19:00" }, // local study reminder
    updatedAt: 0,
  };
}

/* One-time migration of the original flat key into the guest namespace. */
(function migrateLegacy() {
  try {
    const old = localStorage.getItem(KEY_BASE);
    if (old) {
      if (!localStorage.getItem(nsKey("guest"))) localStorage.setItem(nsKey("guest"), old);
      localStorage.removeItem(KEY_BASE);
    }
  } catch (e) {}
})();

function load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return Object.assign(defaultState(), JSON.parse(raw));
  } catch (e) {}
  return defaultState();
}

let activeKey = nsKey("guest");
let state = load(activeKey);
let remote = null; // { push(snapshot) }
let pushTimer = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch (e) {}
  });
}

function schedulePush() {
  if (!remote) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    try {
      remote.push(snapshot());
    } catch (e) {}
  }, 250);
}

function persist() {
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(activeKey, JSON.stringify(state));
  } catch (e) {}
  schedulePush();
  notify();
}

/* --------------------------------------------------------------- dates
   All progress dates are *calendar* dates in the learner's own timezone.
   `new Date("YYYY-MM-DD")` parses as UTC midnight, so reading local components
   off it lands on the previous day everywhere west of UTC — which shifted SRS
   due dates, streak weekday labels and the heatmap by one. parseISO() builds
   the date from its parts instead, which is always local. */
export function parseISO(iso) {
  const [y, m, d] = String(iso || "").split("-").map(Number);
  return new Date(y || 1970, (m || 1) - 1, d || 1);
}
const fmtISO = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function todayISO() {
  return fmtISO(new Date());
}
function daysBetween(a, b) {
  return Math.round((parseISO(b) - parseISO(a)) / 86400000);
}
export function lastNDates(n) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(fmtISO(d));
  }
  return out;
}
function addDaysISO(iso, n) {
  const d = parseISO(iso);
  d.setDate(d.getDate() + n);
  return fmtISO(d);
}

function touchStreak() {
  const today = todayISO();
  if (state.lastActive === today) return;
  if (state.lastActive) {
    const gap = daysBetween(state.lastActive, today);
    if (gap === 1) {
      state.streak += 1;
    } else if (gap === 2 && (state.freezes || 0) > 0) {
      // exactly one missed day, protected by a streak-freeze token
      state.freezes -= 1;
      state.streak += 1;
    } else {
      state.streak = 1;
    }
  } else {
    state.streak = 1;
  }
  // earn a freeze token at each 7-day milestone (capped at 3)
  if (state.streak > 0 && state.streak % 7 === 0) {
    state.freezes = Math.min((state.freezes || 0) + 1, 3);
  }
  state.bestStreak = Math.max(state.bestStreak || 0, state.streak);
  state.lastActive = today;
  state.activeDays = Array.from(new Set([...(state.activeDays || []), today])).slice(-ACTIVE_DAYS_CAP);
}

/* ---------------------------------------------------------- gamification */
export const levelFromXp = (xp) => Math.floor(xp / 200) + 1;
export const xpIntoLevel = (xp) => xp % 200;

export const DAILY_GOALS = [20, 50, 100];

/** Add XP to today's daily bucket (resets at midnight) and, the first time the
 *  goal is reached on a given day, credit a "goalDays" counter for achievements. */
function bumpDaily(n) {
  const today = todayISO();
  if (!state.daily || state.daily.date !== today) state.daily = { date: today, xp: 0, credited: false };
  state.daily.xp += n;
  state.xpHistory = state.xpHistory || {};
  state.xpHistory[today] = (state.xpHistory[today] || 0) + n;
  // Keep more days than the 26-week (182-day) heatmap needs, otherwise its
  // oldest columns can never light up.
  const hd = Object.keys(state.xpHistory).sort();
  if (hd.length > HISTORY_DAYS) for (const d of hd.slice(0, hd.length - HISTORY_DAYS)) delete state.xpHistory[d];
  if (!state.daily.credited && state.daily.xp >= (state.dailyGoal || 50)) {
    state.daily.credited = true;
    state.counters = state.counters || {};
    state.counters.goalDays = (state.counters.goalDays || 0) + 1;
  }
}
/** Single funnel for every XP gain, so daily-goal tracking is never bypassed. */
function award(n) {
  state.xp += n;
  bumpDaily(n);
}

/* ----------------------------------------------------------- aggregates */
export const getState = () => state;
export function totalLessons() {
  return COURSES.reduce((n, c) => n + c.lessons.length, 0);
}
export function doneCount() {
  return Object.keys(state.doneLessons).length;
}
export function wordsLearned() {
  return Object.values(state.learnedWords).reduce((n, v) => n + (v || 0), 0);
}
export function languagesTouched() {
  return new Set(Object.keys(state.doneLessons).map((k) => k.split("/")[0])).size;
}
export function courseProgress(course) {
  const done = course.lessons.filter((l) => state.doneLessons[`${course.id}/${l.id}`]).length;
  return { done, total: course.lessons.length, pct: Math.round((done / course.lessons.length) * 100) };
}

/* -------------------------------------------------------------- mutators */
export function setLastCourse(id) {
  if (state.lastCourse === id) return;
  state.lastCourse = id;
  persist();
}

export function completeLesson(c, l, quizPct) {
  const key = `${c.id}/${l.id}`;
  const first = !state.doneLessons[key];
  state.doneLessons[key] = true;
  // `n` comes from the metadata index, so this works even before the words load.
  state.learnedWords[key] = l.n ?? l.items.length;
  if (quizPct != null && (state.quizScores[key] == null || quizPct > state.quizScores[key])) {
    state.quizScores[key] = quizPct;
  }
  const gain = first ? 30 : 5;
  award(gain);
  touchStreak();
  persist();
  return { first, gain };
}

export function addXp(n) {
  award(n);
  persist();
}

/* --------------------------------------------------- spaced repetition (SRS)
   Cards are drawn from lessons the user has completed. Scheduling is an
   SM-2-lite: each grade adjusts the interval and ease; a "due" card is one
   whose next-review date has arrived (new cards are due immediately). */
export function srsPool() {
  const out = [];
  for (const key of Object.keys(state.doneLessons)) {
    const [cid, lid] = key.split("/");
    const c = COURSES.find((x) => x.id === cid);
    const l = c && c.lessons.find((x) => x.id === lid);
    if (!c || !l) continue;
    l.items.forEach((it, i) => out.push({ key: `${cid}/${lid}#${i}`, c, l, it }));
  }
  return out;
}

/** Card keys only, derived from the metadata index — no vocabulary needed.
 *  Views that just want a "n cards due" badge use this instead of srsPool(),
 *  so the home screen never has to download a course to draw a number. */
export function srsKeys() {
  const out = [];
  for (const key of Object.keys(state.doneLessons)) {
    const [cid, lid] = key.split("/");
    const c = COURSES.find((x) => x.id === cid);
    const l = c && c.lessons.find((x) => x.id === lid);
    if (!c || !l) continue;
    const n = l.n ?? l.items.length;
    for (let i = 0; i < n; i++) out.push({ key: `${cid}/${lid}#${i}` });
  }
  return out;
}

/** Every course id this learner has touched — what the review/mistake/favourite
 *  sessions need to load before they can resolve their decks. */
export function progressCourseIds() {
  const ids = new Set();
  for (const k of Object.keys(state.doneLessons)) ids.add(k.split("/")[0]);
  for (const k of Object.keys(state.mistakes || {})) ids.add(k.split("/")[0]);
  for (const k of Object.keys(state.favorites || {})) ids.add(k.split("/")[0]);
  return [...ids];
}
export function srsDue(pool) {
  const today = todayISO();
  return pool.filter((p) => {
    const s = state.srs[p.key];
    return !s || s.due <= today;
  });
}
export function srsGrade(key, grade) {
  const today = todayISO();
  const s = state.srs[key] || { due: today, interval: 0, ease: 2.5, reps: 0, lapses: 0 };
  let { interval, ease, reps } = s;
  let lapses = s.lapses || 0;
  if (grade === "again") {
    reps = 0;
    interval = 0;
    ease = Math.max(1.3, ease - 0.2);
    lapses += 1;
  } else if (grade === "hard") {
    interval = reps === 0 ? 1 : Math.max(1, Math.round(interval * 1.2));
    reps += 1;
    ease = Math.max(1.3, ease - 0.15);
  } else if (grade === "easy") {
    interval = reps === 0 ? 2 : Math.round(Math.max(1, interval) * ease * 1.3);
    reps += 1;
    ease += 0.1;
  } else {
    // good
    interval = reps === 0 ? 1 : reps === 1 ? 3 : Math.round(Math.max(1, interval) * ease);
    reps += 1;
  }
  state.srs[key] = { due: addDaysISO(today, interval), interval, ease, reps, lapses };
  persist();
}
/** Reward a finished practice session with XP + streak (capped to curb farming). */
export function srsReviewed(n) {
  if (n <= 0) return;
  award(Math.min(n, 20) * 2);
  touchStreak();
  persist();
}

/* ------------------------------------------------------------- daily goal */
export function setDailyGoal(n) {
  if (!DAILY_GOALS.includes(n)) return;
  state.dailyGoal = n;
  persist();
}
/** Today's progress toward the daily XP goal. */
export function dailyStatus() {
  const today = todayISO();
  const xp = state.daily && state.daily.date === today ? state.daily.xp : 0;
  const goal = state.dailyGoal || 50;
  return { goal, xp, pct: Math.min(100, Math.round((xp / goal) * 100)), hit: xp >= goal };
}

/* --------------------------------------------------------- mistakes deck
   Wrong answers from quiz/typing/listening are collected here and turned into a
   focused review deck; a card is removed as soon as it is answered correctly. */
export function recordMistake(key) {
  if (!key) return;
  state.mistakes = state.mistakes || {};
  state.mistakes[key] = { at: todayISO() };
  persist();
}
export function clearMistake(key) {
  if (state.mistakes && state.mistakes[key]) {
    delete state.mistakes[key];
    persist();
  }
}
export function mistakeCount() {
  return Object.keys(state.mistakes || {}).length;
}
/** Resolve mistake keys into live {c,l,it} entries, pruning any that no longer exist.
 *  Entries whose course hasn't been loaded yet are skipped, never pruned — an
 *  unloaded course has no items, which is not the same as a deleted word. */
export function mistakePool() {
  const out = [];
  let pruned = false;
  for (const key of Object.keys(state.mistakes || {})) {
    const [path, idx] = key.split("#");
    const [cid, lid] = (path || "").split("/");
    const c = COURSES.find((x) => x.id === cid);
    const l = c && c.lessons.find((x) => x.id === lid);
    const it = l && l.items[+idx];
    if (c && l && it) out.push({ key, c, l, it });
    else if (c && !courseLoaded(cid)) continue;
    else {
      delete state.mistakes[key];
      pruned = true;
    }
  }
  if (pruned) persist();
  return out;
}

/* ----------------------------------------------------------- counters */
export function bumpCounter(name, n = 1) {
  state.counters = state.counters || {};
  state.counters[name] = (state.counters[name] || 0) + n;
  persist();
}
export function counter(name) {
  return (state.counters && state.counters[name]) || 0;
}

/* ------------------------------------------------------------- favorites */
export function favToggle(key) {
  state.favorites = state.favorites || {};
  const now = !state.favorites[key];
  if (now) state.favorites[key] = true;
  else delete state.favorites[key];
  persist();
  return now;
}
export function isFav(key) {
  return !!(state.favorites && state.favorites[key]);
}
export function favCount() {
  return Object.keys(state.favorites || {}).length;
}
/** Resolve favorite keys into live {key,c,l,it} entries, pruning stale ones.
 *  Same rule as mistakePool(): an unloaded course is skipped, not pruned. */
export function favPool() {
  const out = [];
  let pruned = false;
  for (const key of Object.keys(state.favorites || {})) {
    const [path, idx] = key.split("#");
    const [cid, lid] = (path || "").split("/");
    const c = COURSES.find((x) => x.id === cid);
    const l = c && c.lessons.find((x) => x.id === lid);
    const it = l && l.items[+idx];
    if (c && l && it) out.push({ key, c, l, it });
    else if (c && !courseLoaded(cid)) continue;
    else {
      delete state.favorites[key];
      pruned = true;
    }
  }
  if (pruned) persist();
  return out;
}

/* ------------------------------------------------- accuracy tally per mode */
export function recordAttempt(mode, ok) {
  state.tally = state.tally || {};
  const t = (state.tally[mode] = state.tally[mode] || { tries: 0, ok: 0 });
  t.tries += 1;
  if (ok) t.ok += 1;
  persist();
}
export function accuracy(mode) {
  const t = state.tally && state.tally[mode];
  if (!t || !t.tries) return null;
  return { tries: t.tries, ok: t.ok, pct: Math.round((t.ok / t.tries) * 100) };
}

/* ------------------------------------------------------ streak / insights */
export const getFreezes = () => state.freezes || 0;
export const getBestStreak = () => Math.max(state.bestStreak || 0, state.streak || 0);
/** XP earned per day for the last n days (oldest → newest). */
export function xpTrend(n) {
  return lastNDates(n).map((d) => ({ date: d, xp: (state.xpHistory && state.xpHistory[d]) || 0 }));
}
/** Words learned per course, for the insights breakdown. */
export function wordsByCourse() {
  const by = {};
  for (const [key, count] of Object.entries(state.learnedWords || {})) {
    const cid = key.split("/")[0];
    by[cid] = (by[cid] || 0) + (count || 0);
  }
  return by;
}

/* ------------------------------------------------------------- reminder */
export function setReminder(enabled, time) {
  state.reminder = { enabled: !!enabled, time: time || (state.reminder && state.reminder.time) || "19:00" };
  persist();
}
export function getReminder() {
  return state.reminder || { enabled: false, time: "19:00" };
}

/* -------------------------------------------------------- export / import */
export function exportData() {
  return JSON.stringify(
    { app: "jago-bahasa", schema: 1, exportedAt: new Date().toISOString(), progress: snapshot() },
    null,
    2
  );
}
/** Merge an exported bundle (or a raw progress object) into the active bucket. */
export function importData(text) {
  let obj;
  try {
    obj = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: "parse" };
  }
  const p = obj && (obj.progress || (typeof obj.xp === "number" ? obj : null));
  if (!p || typeof p !== "object") return { ok: false, error: "shape" };
  mergeInto(state, p);
  // carry over goal + counters that mergeInto doesn't touch
  if (typeof p.dailyGoal === "number" && DAILY_GOALS.includes(p.dailyGoal)) state.dailyGoal = p.dailyGoal;
  if (p.counters && typeof p.counters === "object") {
    state.counters = state.counters || {};
    for (const k of Object.keys(p.counters)) state.counters[k] = Math.max(state.counters[k] || 0, p.counters[k] || 0);
  }
  if (p.mistakes && typeof p.mistakes === "object") {
    state.mistakes = Object.assign(state.mistakes || {}, p.mistakes);
  }
  persist();
  return { ok: true };
}

export function reset() {
  state = defaultState();
  persist();
}

/* ---------------------------------------------------- account switching */
function isMeaningful(st) {
  return !!st && (st.xp > 0 || Object.keys(st.doneLessons || {}).length > 0);
}

function mergeInto(target, src) {
  if (!src) return target;
  target.xp = Math.max(target.xp || 0, src.xp || 0);
  target.streak = Math.max(target.streak || 0, src.streak || 0);
  for (const k of Object.keys(src.doneLessons || {})) target.doneLessons[k] = true;
  for (const k of Object.keys(src.learnedWords || {})) {
    target.learnedWords[k] = Math.max(target.learnedWords[k] || 0, src.learnedWords[k] || 0);
  }
  for (const k of Object.keys(src.quizScores || {})) {
    target.quizScores[k] = Math.max(target.quizScores[k] || 0, src.quizScores[k] || 0);
  }
  target.srs = target.srs || {};
  for (const k of Object.keys(src.srs || {})) {
    const a = target.srs[k], b = src.srs[k];
    if (!a || (b && (b.reps || 0) > (a.reps || 0))) target.srs[k] = b;
  }
  // Keep the same window as touchStreak — trimming to 60 here used to silently
  // erase most of the heatmap on sign-in, import, or a cloud pull.
  target.activeDays = Array.from(new Set([...(target.activeDays || []), ...(src.activeDays || [])]))
    .sort()
    .slice(-ACTIVE_DAYS_CAP);
  if (!target.lastActive || (src.lastActive && src.lastActive > target.lastActive)) {
    target.lastActive = src.lastActive || target.lastActive;
  }
  target.lastCourse = target.lastCourse || src.lastCourse || null;
  target.counters = target.counters || {};
  for (const k of Object.keys(src.counters || {})) {
    target.counters[k] = Math.max(target.counters[k] || 0, src.counters[k] || 0);
  }
  target.mistakes = Object.assign({}, src.mistakes || {}, target.mistakes || {});
  target.favorites = Object.assign({}, src.favorites || {}, target.favorites || {});
  target.freezes = Math.max(target.freezes || 0, src.freezes || 0);
  target.bestStreak = Math.max(target.bestStreak || 0, src.bestStreak || 0);
  target.xpHistory = target.xpHistory || {};
  for (const d of Object.keys(src.xpHistory || {})) {
    target.xpHistory[d] = Math.max(target.xpHistory[d] || 0, src.xpHistory[d] || 0);
  }
  target.tally = target.tally || {};
  for (const m of Object.keys(src.tally || {})) {
    const a = target.tally[m] || { tries: 0, ok: 0 },
      b = src.tally[m] || { tries: 0, ok: 0 };
    target.tally[m] = { tries: Math.max(a.tries, b.tries), ok: Math.max(a.ok, b.ok) };
  }
  if (src.reminder && !target.reminder) target.reminder = src.reminder;
  if (typeof src.dailyGoal === "number" && DAILY_GOALS.includes(src.dailyGoal) && !target.dailyGoal) {
    target.dailyGoal = src.dailyGoal;
  }
  return target;
}

/** Switch the active progress bucket (loads that user's isolated progress).
 *  Pure switch — never merges, so a boot-restore can't pull stale guest data
 *  into an account. Use mergeGuestIntoActive() for an explicit sign-in merge. */
export function switchUser(uid) {
  activeKey = nsKey(uid);
  state = load(activeKey);
  notify();
}

/** One-time, intentional merge of guest progress into the active account bucket,
 *  called right after an INTERACTIVE sign-in/registration. Consumes the guest
 *  bucket afterwards so it can never bleed into a different account later. */
export function mergeGuestIntoActive() {
  if (activeKey === nsKey("guest")) return { merged: false };
  const guestState = load(nsKey("guest"));
  if (!isMeaningful(guestState)) return { merged: false };
  mergeInto(state, guestState);
  persist();
  try {
    localStorage.removeItem(nsKey("guest"));
  } catch (e) {}
  notify();
  return { merged: true };
}

/** Merge server-side progress into the active bucket (after a remote login). */
export function applyRemoteProgress(serverProgress) {
  if (!serverProgress) return;
  mergeInto(state, serverProgress);
  persist();
}

/* --------------------------------------------------------- remote + io */
/** Remove a user's local progress bucket entirely (used on account deletion). */
export function purgeUser(uid) {
  try {
    localStorage.removeItem(nsKey(uid));
  } catch (e) {}
}

export function setRemote(adapter) {
  remote = adapter || null;
}
export function clearRemote() {
  remote = null;
}
export function snapshot() {
  return JSON.parse(JSON.stringify(state));
}
export function replaceState(obj) {
  state = Object.assign(defaultState(), obj || {});
  persist();
}
export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
