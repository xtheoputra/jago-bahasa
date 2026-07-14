/* =========================================================================
   core/state.js — Learning progress + gamification, namespaced per account.
   Each user (and "guest") gets an isolated bucket: jb.progress.v1::<uid|guest>.
   When signed in with the cloud backend, saves are debounced-pushed via a
   pluggable `remote` adapter; on login, server progress is merged in.
   ========================================================================= */
import { COURSES } from "../data.js";

const KEY_BASE = "jb.progress.v1";
const nsKey = (uid) => `${KEY_BASE}::${uid || "guest"}`;

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

/* --------------------------------------------------------------- dates */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysBetween(a, b) {
  return Math.round((new Date(b) - new Date(a)) / 86400000);
}
export function lastNDates(n) {
  const out = [];
  const base = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(base);
    d.setDate(base.getDate() - i);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }
  return out;
}
function addDaysISO(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function touchStreak() {
  const today = todayISO();
  if (state.lastActive === today) return;
  if (state.lastActive) {
    const gap = daysBetween(state.lastActive, today);
    state.streak = gap === 1 ? state.streak + 1 : 1;
  } else {
    state.streak = 1;
  }
  state.lastActive = today;
  state.activeDays = Array.from(new Set([...(state.activeDays || []), today])).slice(-60);
}

/* ---------------------------------------------------------- gamification */
export const levelFromXp = (xp) => Math.floor(xp / 200) + 1;
export const xpIntoLevel = (xp) => xp % 200;

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
  state.learnedWords[key] = l.items.length;
  if (quizPct != null && (state.quizScores[key] == null || quizPct > state.quizScores[key])) {
    state.quizScores[key] = quizPct;
  }
  const gain = first ? 30 : 5;
  state.xp += gain;
  touchStreak();
  persist();
  return { first, gain };
}

export function addXp(n) {
  state.xp += n;
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
  state.xp += Math.min(n, 20) * 2;
  touchStreak();
  persist();
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
  target.activeDays = Array.from(new Set([...(target.activeDays || []), ...(src.activeDays || [])]))
    .sort()
    .slice(-60);
  if (!target.lastActive || (src.lastActive && src.lastActive > target.lastActive)) {
    target.lastActive = src.lastActive || target.lastActive;
  }
  target.lastCourse = target.lastCourse || src.lastCourse || null;
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
