/* =========================================================================
   views/learn.js — Content views: home, courses, course, lesson, progress, about.
   ========================================================================= */
import { $, $$, esc, mean, fold } from "../core/dom.js";
import { toast, confetti, skeleton } from "../core/ui.js";
import * as store from "../core/state.js";
import { COURSES, findCourse, findLesson, loadCourse } from "../data.js";
import {
  courseCardHTML, wireCourseCards, lessonRowHTML, vocabHTML, dialogHTML, wireSpeak, progRowHTML, notFound,
} from "./partials.js";
import { navigate, rerender } from "../core/router.js";
import { session } from "../auth/session.js";
import { I18N } from "../i18n.js";
import { SCRIPTS } from "../scripts.js";
import {
  ACCENT_KEYS, getAccent, setAccent, getTextScale, setTextScale, getDyslexia, setDyslexia, requestReminder,
} from "../chrome.js";

const t = (...a) => I18N.t(...a);
const GUEST_BANNER_KEY = "jb.guestBanner.dismissed";

/** Small circular progress ring for the daily XP goal. */
function dailyRingHTML(daily) {
  const r = 34,
    circ = 2 * Math.PI * r;
  return `
    <svg class="daily-ring" viewBox="0 0 80 80" aria-hidden="true">
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="8"/>
      <circle cx="40" cy="40" r="${r}" fill="none" stroke="url(#dg)" stroke-width="8" stroke-linecap="round"
        stroke-dasharray="${circ}" stroke-dashoffset="${circ * (1 - daily.pct / 100)}" transform="rotate(-90 40 40)"/>
      <defs><linearGradient id="dg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
      <text x="40" y="46" text-anchor="middle" font-size="16" font-weight="800" fill="var(--text)">${daily.pct}%</text>
    </svg>`;
}

/* =====================================================================
   HOME
   ===================================================================== */
function dayLetter(iso) {
  const wd = store.parseISO(iso).getDay(); // local calendar day — see state.parseISO
  const set = I18N.current === "id" ? ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return set[wd];
}

/* ------------------------------------------------------------ word of the day
   One word for the whole catalogue per calendar day, chosen by hashing the
   date — so it is stable across reloads and devices without storing anything,
   and it rotates at local midnight like every other daily counter.

   The pick is made from the metadata index alone (lesson item counts), so the
   home screen downloads exactly ONE course chunk to show it — not the catalogue. */
function wordOfDayRef() {
  const slots = [];
  let total = 0;
  for (const c of COURSES) {
    for (const l of c.lessons) {
      if (l.dialog) continue; // dialogue lines are sentences, not vocabulary
      const n = l.n ?? l.items.length;
      if (!n) continue;
      slots.push({ c, l, n, start: total });
      total += n;
    }
  }
  if (!total) return null;
  const iso = store.todayISO();
  let h = 2166136261; // FNV-1a over the date
  for (let i = 0; i < iso.length; i++) {
    h ^= iso.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const pick = Math.abs(h) % total;
  const slot = slots.find((s) => pick < s.start + s.n) || slots[slots.length - 1];
  const i = pick - slot.start;
  return { c: slot.c, l: slot.l, i, key: `${slot.c.id}/${slot.l.id}#${i}` };
}

/** Card shell — the word itself arrives when its course chunk lands. */
function wordOfDayHTML(w) {
  if (!w) return "";
  return `
    <section class="card wod" style="margin-top:20px">
      <div class="wod__head">
        <span class="eyebrow">🌟 ${esc(t("wod.title"))}</span>
        <a class="chip" href="#/lesson/${esc(w.c.id)}/${esc(w.l.id)}">${esc(w.c.flag)} ${esc(mean(w.c.name))}</a>
      </div>
      <div class="wod__body" id="wodBody">${skeleton(2)}</div>
    </section>`;
}

/** Fill in the card once the vocabulary is in memory. */
function paintWordOfDay(view, w) {
  const body = $("#wodBody", view);
  const it = w.l.items[w.i];
  if (!body || !it) return;
  const faved = store.isFav(w.key);
  body.innerHTML = `
    <div class="wod__main" style="min-width:0">
      <div class="wod__term ${w.c.cjk ? "cjk" : ""}" dir="${w.c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>
      ${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}
      <div class="wod__mean">${esc(mean(it.m))}</div>
      ${it.ex ? `<div class="vocab__ex">“${esc(it.ex.t)}” — ${esc(mean(it.ex.m))}</div>` : ""}
    </div>
    <div class="wod__actions">
      <button class="speakbtn" data-speak="${esc(it.term)}" aria-label="🔊">🔊</button>
      <button class="favbtn ${faved ? "on" : ""}" data-fav="${esc(w.key)}" aria-label="${esc(t("fav.toggle"))}" aria-pressed="${faved ? "true" : "false"}">${faved ? "★" : "☆"}</button>
    </div>`;
  wireSpeak(body, w.c);
  wireFavButtons(body);
}

/** Star/unstar buttons rendered by any view (delegated per button). */
function wireFavButtons(root) {
  $$("[data-fav]", root).forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      const on = store.favToggle(b.dataset.fav);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "★" : "☆";
    };
  });
}

function guestBannerHTML() {
  if (session.user) return "";
  let dismissed = false;
  try {
    dismissed = localStorage.getItem(GUEST_BANNER_KEY) === "1";
  } catch (e) {}
  if (dismissed) return "";
  return `
    <div class="guest-banner card" id="guestBanner">
      <div class="guest-banner__icon" aria-hidden="true">☁️</div>
      <div class="guest-banner__text">
        <strong>${esc(t("guest.bannerTitle"))}</strong>
        <p>${esc(t("guest.bannerBody"))}</p>
      </div>
      <div class="guest-banner__actions">
        <a class="btn btn--sm" href="#/register">${esc(t("guest.bannerCta"))}</a>
        <button class="btn btn--ghost btn--sm" id="guestBannerDismiss">${esc(t("guest.bannerDismiss"))}</button>
      </div>
    </div>`;
}

export function renderHome(view, _params, ctx) {
  const st = store.getState();
  const lvl = store.levelFromXp(st.xp);
  const last = st.lastCourse ? findCourse(st.lastCourse) : null;
  const popular = COURSES.slice(0, 4);
  // Counts come from the metadata index, so the home screen never waits on data.
  const srsPool = store.srsKeys();
  const srsDue = srsPool.length ? store.srsDue(srsPool).length : 0;
  const daily = store.dailyStatus();
  const mistakes = store.mistakeCount();
  const wod = wordOfDayRef();

  const week = store.lastNDates(7);
  const streakCells = week
    .map((d) => {
      const on = (st.activeDays || []).includes(d);
      return `<span class="${on ? "on" : ""}" title="${esc(d)}">${dayLetter(d)}</span>`;
    })
    .join("");

  view.innerHTML = `
    ${guestBannerHTML()}
    <section class="hero">
      <div class="hero__row">
        <div>
          <span class="eyebrow" style="color:#ffe2b8">${esc(t("home.eyebrow"))}</span>
          <h1>${esc(t("home.title"))}</h1>
          <p>${esc(t("home.subtitle"))}</p>
          <div class="hero__cta">
            <button class="btn btn--accent" id="ctaStart">🚀 ${esc(t("home.start"))}</button>
            <a class="btn btn--ghost" href="#/courses">${esc(t("home.browse"))}</a>
          </div>
        </div>
        <div class="streak-card">
          <div style="display:flex;align-items:center;gap:10px">
            <span style="font-size:2rem">🔥</span>
            <div><div class="big">${st.streak}</div><div style="opacity:.9;font-weight:700">${esc(t("home.streak"))}</div></div>
            ${store.getFreezes() ? `<div style="margin-left:auto;text-align:center" title="${esc(t("stats.freezes"))}"><div style="font-size:1.3rem">🧊</div><div style="font-weight:800">×${store.getFreezes()}</div></div>` : ""}
          </div>
          <div class="streak-grid">${streakCells}</div>
        </div>
      </div>
    </section>

    <div class="stats">
      <div class="card stat"><div class="num"><span class="ico">⭐</span>${st.xp}</div><div class="lbl">${esc(t("stat.xp"))}</div></div>
      <div class="card stat"><div class="num"><span class="ico">🎓</span>${store.doneCount()}<span style="color:var(--text-faint);font-size:1rem;font-weight:600">/${store.totalLessons()}</span></div><div class="lbl">${esc(t("stat.lessons"))}</div></div>
      <div class="card stat"><div class="num"><span class="ico">📖</span>${store.wordsLearned()}</div><div class="lbl">${esc(t("stat.words"))}</div></div>
      <div class="card stat"><div class="num"><span class="ico">🏅</span>${lvl}</div><div class="lbl">${esc(t("stat.level"))}</div></div>
    </div>

    <div class="card daily-card" style="margin-top:20px">
      ${dailyRingHTML(daily)}
      <div class="daily-card__txt">
        <strong>🎯 ${esc(t("daily.title"))}</strong>
        <span>${daily.xp} / ${daily.goal} XP${daily.hit ? " · " + esc(t("daily.hit")) : ""}</span>
      </div>
      <div class="daily-card__actions">
        <a class="btn btn--sm btn--accent" href="#/mix" aria-label="${esc(t("mix.sub"))}">${esc(t("mix.go"))}</a>
        ${mistakes ? `<a class="btn btn--sm" href="#/mistakes" aria-label="${esc(t("mistakes.count", mistakes))}">${esc(t("mistakes.go"))} · ${mistakes}</a>` : ""}
      </div>
    </div>

    ${wordOfDayHTML(wod)}

    ${srsPool.length ? `
    <a class="card review-cta" href="#/review" style="margin-top:20px">
      <div class="review-cta__ico" aria-hidden="true">🔁</div>
      <div class="review-cta__txt"><strong>${esc(t("home.review"))}</strong><span>${esc(srsDue ? t("home.reviewDue", srsDue) : t("review.none"))}</span></div>
      <span class="btn btn--sm">${esc(t("home.reviewGo"))} →</span>
    </a>` : ""}

    ${last ? `
    <section style="margin-top:26px">
      <div class="section-head"><div><span class="eyebrow">${esc(t("home.continue"))}</span></div></div>
      ${courseCardHTML(last)}
    </section>` : ""}

    <section style="margin-top:26px">
      <div class="section-head">
        <div><h2>${esc(t("home.popular"))}</h2><p>${esc(t("home.popular.sub"))}</p></div>
        <a href="#/courses" style="color:var(--brand);font-weight:700;white-space:nowrap">${esc(t("home.viewall"))}</a>
      </div>
      <div class="grid cols-auto" id="popularGrid">${popular.map(courseCardHTML).join("")}</div>
    </section>
  `;

  $("#ctaStart").onclick = () => navigate(last ? `#/course/${last.id}` : "#/courses");
  const dismiss = $("#guestBannerDismiss");
  if (dismiss) {
    dismiss.onclick = () => {
      try {
        localStorage.setItem(GUEST_BANNER_KEY, "1");
      } catch (e) {}
      const b = $("#guestBanner");
      if (b) b.remove();
    };
  }
  if (wod) {
    // Fetch just this word's course in the background — the rest of the home
    // screen is already interactive.
    loadCourse(wod.c.id)
      .then(() => {
        if (!(ctx && ctx.signal && ctx.signal.aborted)) paintWordOfDay(view, wod);
      })
      .catch(() => {});
  }
  wireCourseCards(view);
}

/* =====================================================================
   COURSES
   ===================================================================== */
export function renderCourses(view) {
  view.innerHTML = `
    <div class="section-head"><div><h2>${esc(t("courses.title"))}</h2><p>${esc(t("courses.sub"))}</p></div>
      <span class="chip" id="courseCount" aria-live="polite">${COURSES.length} ${esc(t("courses.languages"))}</span>
    </div>
    <div class="course-filter card">
      <input type="search" id="courseQ" class="dict-search" placeholder="${esc(t("courses.filter"))}"
        autocomplete="off" spellcheck="false" aria-label="${esc(t("courses.filter"))}" />
    </div>
    <div class="grid cols-auto" id="courseGrid">${COURSES.map(courseCardHTML).join("")}</div>
    <p class="dict-count" id="courseNone" hidden>${esc(t("search.none"))}</p>
  `;
  wireCourseCards(view);

  // Live filter — hides cards in place, so their click/keyboard wiring survives.
  const q = $("#courseQ", view),
    cards = $$(".course-card", view),
    countEl = $("#courseCount", view),
    noneEl = $("#courseNone", view);
  q.addEventListener("input", () => {
    const nq = fold(q.value).trim();
    let shown = 0;
    cards.forEach((el) => {
      const ok = !nq || (el.dataset.search || "").includes(nq);
      el.hidden = !ok;
      if (ok) shown++;
    });
    countEl.textContent = `${shown} ${t("courses.languages")}`;
    noneEl.hidden = shown > 0;
  });
}

/* =====================================================================
   COURSE DETAIL
   ===================================================================== */
export function renderCourse(view, [cid]) {
  const c = findCourse(cid);
  if (!c) return notFound(view);
  store.setLastCourse(c.id);
  const st = store.getState();
  const p = store.courseProgress(c);
  const script = SCRIPTS.find((s) => s.lang === c.id);

  view.innerHTML = `
    <nav class="crumb"><a href="#/courses">${esc(t("course.back"))}</a><span class="sep">/</span><span>${esc(mean(c.name))}</span></nav>
    <div class="card course-header">
      <div class="flag">${esc(c.flag)}</div>
      <div style="flex:1 1 220px">
        <h1>${esc(mean(c.name))} <span style="font-weight:600;color:var(--text-faint);font-size:1rem" dir="${c.rtl ? "rtl" : "ltr"}">${esc(c.native)}</span></h1>
        <p>${esc(mean(c.tagline))}</p>
      </div>
      <div class="progress-wrap">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;font-weight:700;color:var(--text-dim);margin-bottom:6px"><span>${p.done}/${p.total}</span><span>${p.pct}%</span></div>
        <div class="progress" aria-hidden="true"><i style="width:${p.pct}%"></i></div>
      </div>
    </div>
    ${script ? `
    <a class="card review-cta" href="#/script/${script.id}" style="margin-bottom:6px">
      <div class="review-cta__ico" aria-hidden="true">🔡</div>
      <div class="review-cta__txt"><strong>${esc(t("script.title"))}</strong><span>${esc(t("script.sub"))}</span></div>
      <span class="btn btn--sm">${esc(t("home.reviewGo"))} →</span>
    </a>` : ""}
    <div class="section-head"><div><h2 style="font-size:1.2rem">${esc(t("course.lessons"))}</h2></div></div>
    <div class="grid" style="gap:12px">
      ${c.lessons.map((l, i) => lessonRowHTML(c, l, i, st)).join("")}
    </div>
  `;

  $$(".lesson-row", view).forEach((el) => {
    const lid = el.dataset.lesson;
    el.onclick = () => navigate(`#/lesson/${c.id}/${lid}`);
    el.onkeydown = (e) => {
      if (e.key === "Enter") navigate(`#/lesson/${c.id}/${lid}`);
    };
  });
}

/* =====================================================================
   LESSON (vocabulary)
   ===================================================================== */
export function renderLesson(view, [cid, lid]) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const done = store.getState().doneLessons[`${c.id}/${l.id}`];

  view.innerHTML = `
    <nav class="crumb">
      <a href="#/courses">${esc(t("course.back"))}</a><span class="sep">/</span>
      <a href="#/course/${c.id}">${esc(mean(c.name))}</a><span class="sep">/</span>
      <span>${esc(mean(l.title))}</span>
    </nav>
    <div class="section-head">
      <div><span class="eyebrow">${esc(t(l.dialog ? "lesson.convo" : "lesson.vocab"))}</span><h2>${esc(l.icon)} ${esc(mean(l.title))}</h2><p>${esc(t(l.dialog ? "lesson.dialogIntro" : "lesson.intro"))}</p></div>
    </div>

    ${l.dialog
      ? dialogHTML(c, l)
      : `<div class="vocab-list">
      ${l.items.map((it, i) => vocabHTML(c, it, `${c.id}/${l.id}#${i}`, store.isFav(`${c.id}/${l.id}#${i}`))).join("")}
    </div>`}

    <div class="practice-bar">
      <button class="btn" id="goFlash">🃏 ${esc(t("lesson.flashcards"))}</button>
      <button class="btn btn--accent" id="goQuiz">🧠 ${esc(t("lesson.quiz"))}</button>
      <button class="btn" id="goListen">👂 ${esc(t("lesson.listen"))}</button>
      <button class="btn" id="goMatch">🔗 ${esc(t("lesson.match"))}</button>
      <button class="btn" id="goAudio">🎧 ${esc(t("lesson.audio"))}</button>
      ${!l.dialog ? `<button class="btn" id="goType">⌨️ ${esc(t("lesson.type"))}</button>` : ""}
      ${!l.dialog ? `<button class="btn" id="goDictation">📝 ${esc(t("lesson.dictation"))}</button>` : ""}
      ${!l.dialog ? `<button class="btn" id="goSpeak">🎤 ${esc(t("lesson.speak"))}</button>` : ""}
      ${!l.dialog && !c.cjk && c.id !== "th" && l.items.some((it) => it.ex) ? `<button class="btn" id="goBuild">🧩 ${esc(t("lesson.build"))}</button>` : ""}
      ${l.items.some((it) => it.ex) ? `<button class="btn" id="goCloze">✍️ ${esc(t("lesson.cloze"))}</button>` : ""}
      <button class="btn btn--ghost" id="markDone" ${done ? "disabled" : ""}>${done ? "✓ " + esc(t("lesson.done")) : esc(t("lesson.done"))}</button>
    </div>
  `;

  wireSpeak(view, c);
  wireFavButtons(view);
  $("#goFlash").onclick = () => navigate(`#/flashcards/${c.id}/${l.id}`);
  $("#goQuiz").onclick = () => navigate(`#/quiz/${c.id}/${l.id}`);
  $("#goListen").onclick = () => navigate(`#/listen/${c.id}/${l.id}`);
  $("#goMatch").onclick = () => navigate(`#/match/${c.id}/${l.id}`);
  $("#goAudio").onclick = () => navigate(`#/audio/${c.id}/${l.id}`);
  const typeBtn = $("#goType");
  if (typeBtn) typeBtn.onclick = () => navigate(`#/type/${c.id}/${l.id}`);
  const dictationBtn = $("#goDictation");
  if (dictationBtn) dictationBtn.onclick = () => navigate(`#/dictation/${c.id}/${l.id}`);
  const speakBtn = $("#goSpeak");
  if (speakBtn) speakBtn.onclick = () => navigate(`#/speak/${c.id}/${l.id}`);
  const buildBtn = $("#goBuild");
  if (buildBtn) buildBtn.onclick = () => navigate(`#/build/${c.id}/${l.id}`);
  const clozeBtn = $("#goCloze");
  if (clozeBtn) clozeBtn.onclick = () => navigate(`#/cloze/${c.id}/${l.id}`);
  $("#markDone").onclick = () => {
    const r = store.completeLesson(c, l, null);
    if (r.first) confetti();
    toast(t("toast.lessonDone", r.gain));
    rerender();
  };
}

/* =====================================================================
   PROGRESS
   ===================================================================== */
const ACHIEVEMENTS = [
  { id: "first", emoji: "🌱", name: { id: "Langkah Pertama", en: "First Step", es: "Primer paso" }, desc: { id: "Selesaikan 1 pelajaran", en: "Finish 1 lesson", es: "Termina 1 lección" }, test: () => store.doneCount() >= 1 },
  { id: "five", emoji: "🔥", name: { id: "Pemanasan", en: "Warming Up", es: "Calentando" }, desc: { id: "Selesaikan 5 pelajaran", en: "Finish 5 lessons", es: "Termina 5 lecciones" }, test: () => store.doneCount() >= 5 },
  { id: "done25", emoji: "🎓", name: { id: "Rajin Belajar", en: "Dedicated", es: "Dedicado" }, desc: { id: "Selesaikan 25 pelajaran", en: "Finish 25 lessons", es: "Termina 25 lecciones" }, test: () => store.doneCount() >= 25 },
  { id: "poly", emoji: "🌍", name: { id: "Poliglot", en: "Polyglot", es: "Políglota" }, desc: { id: "Coba 3 bahasa berbeda", en: "Try 3 languages", es: "Prueba 3 idiomas" }, test: () => store.languagesTouched() >= 3 },
  { id: "poly5", emoji: "🗺️", name: { id: "Penjelajah", en: "Explorer", es: "Explorador" }, desc: { id: "Coba 5 bahasa berbeda", en: "Try 5 languages", es: "Prueba 5 idiomas" }, test: () => store.languagesTouched() >= 5 },
  { id: "streak3", emoji: "📅", name: { id: "Konsisten", en: "Consistent", es: "Constante" }, desc: { id: "Beruntun 3 hari", en: "3-day streak", es: "Racha de 3 días" }, test: () => store.getState().streak >= 3 },
  { id: "streak7", emoji: "🗓️", name: { id: "Seminggu Penuh", en: "Full Week", es: "Semana completa" }, desc: { id: "Beruntun 7 hari", en: "7-day streak", es: "Racha de 7 días" }, test: () => store.getState().streak >= 7 },
  { id: "streak30", emoji: "🏔️", name: { id: "Sebulan Kokoh", en: "Month Strong", es: "Un mes fuerte" }, desc: { id: "Beruntun 30 hari", en: "30-day streak", es: "Racha de 30 días" }, test: () => store.getState().streak >= 30 },
  { id: "words50", emoji: "📚", name: { id: "Kutu Buku", en: "Bookworm", es: "Ratón de biblioteca" }, desc: { id: "Pelajari 50 kata", en: "Learn 50 words", es: "Aprende 50 palabras" }, test: () => store.wordsLearned() >= 50 },
  { id: "words250", emoji: "📖", name: { id: "Perbendaharaan", en: "Vocabulary Vault", es: "Léxico rico" }, desc: { id: "Pelajari 250 kata", en: "Learn 250 words", es: "Aprende 250 palabras" }, test: () => store.wordsLearned() >= 250 },
  { id: "lvl5", emoji: "🏆", name: { id: "Sang Juara", en: "Champion", es: "Campeón" }, desc: { id: "Capai Level 5", en: "Reach Level 5", es: "Alcanza nivel 5" }, test: () => store.levelFromXp(store.getState().xp) >= 5 },
  { id: "lvl10", emoji: "👑", name: { id: "Legenda", en: "Legend", es: "Leyenda" }, desc: { id: "Capai Level 10", en: "Reach Level 10", es: "Alcanza nivel 10" }, test: () => store.levelFromXp(store.getState().xp) >= 10 },
  { id: "perfect", emoji: "💯", name: { id: "Nilai Sempurna", en: "Perfect Score", es: "Puntuación perfecta" }, desc: { id: "Raih 100% di sebuah kuis", en: "Score 100% on a quiz", es: "Saca 100% en un cuestionario" }, test: () => store.counter("perfect") >= 1 },
  { id: "typist", emoji: "⌨️", name: { id: "Juru Ketik", en: "Typist", es: "Mecanógrafo" }, desc: { id: "Ketik 50 kata dengan benar", en: "Type 50 words correctly", es: "Escribe 50 palabras" }, test: () => store.counter("typed") >= 50 },
  { id: "matcher", emoji: "🔗", name: { id: "Ahli Jodoh", en: "Matchmaker", es: "Emparejador" }, desc: { id: "Menangkan 5 game Jodohkan", en: "Win 5 Match games", es: "Gana 5 juegos de emparejar" }, test: () => store.counter("matched") >= 5 },
  { id: "goalDays", emoji: "🎯", name: { id: "Disiplin", en: "Disciplined", es: "Disciplinado" }, desc: { id: "Capai target harian 5 hari", en: "Hit your daily goal 5 days", es: "Cumple tu meta diaria 5 días" }, test: () => store.counter("goalDays") >= 5 },
  { id: "dictated", emoji: "📝", name: { id: "Telinga Tajam", en: "Sharp Ear", es: "Oído fino" }, desc: { id: "Tulis 30 kata dari dikte", en: "Write 30 words from dictation", es: "Escribe 30 palabras al dictado" }, test: () => store.counter("dictated") >= 30 },
  { id: "poly10", emoji: "🧭", name: { id: "Warga Dunia", en: "World Citizen", es: "Ciudadano del mundo" }, desc: { id: "Coba 10 bahasa berbeda", en: "Try 10 languages", es: "Prueba 10 idiomas" }, test: () => store.languagesTouched() >= 10 },
];

export function renderProgress(view) {
  const st = store.getState();
  const lvl = store.levelFromXp(st.xp);
  const into = store.xpIntoLevel(st.xp);
  const any = store.doneCount() > 0 || st.xp > 0;

  const srsPool = store.srsKeys(); // counts only — no vocabulary needed
  const srsDue = srsPool.length ? store.srsDue(srsPool).length : 0;
  const daily = store.dailyStatus();
  const mistakes = store.mistakeCount();
  const favs = store.favCount();
  const rem = store.getReminder();
  const unlocked = ACHIEVEMENTS.filter((a) => a.test()).length;

  view.innerHTML = `
    <div class="section-head"><div><h2>${esc(t("progress.title"))}</h2><p>${esc(t("progress.sub"))}</p></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <a class="btn" href="#/stats" style="white-space:nowrap">📊 ${esc(t("stats.title"))}</a>
        ${srsPool.length ? `<a class="btn btn--accent" href="#/review" style="white-space:nowrap">🔁 ${esc(t("review.title"))}${srsDue ? ` · ${srsDue}` : ""}</a>` : ""}
      </div>
    </div>

    <div class="card" style="padding:22px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:1.6rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-700))">${lvl}</div>
        <div style="flex:1 1 240px">
          <div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:6px"><span>${esc(t("level"))} ${lvl}</span><span style="color:var(--text-dim)">${into} / 200 XP</span></div>
          <div class="progress" aria-hidden="true"><i style="width:${(into / 200) * 100}%"></i></div>
        </div>
      </div>
      <div class="stats" style="margin-top:18px">
        <div class="card stat" style="background:var(--surface-2)"><div class="num">⭐ ${st.xp}</div><div class="lbl">${esc(t("stat.xp"))}</div></div>
        <div class="card stat" style="background:var(--surface-2)"><div class="num">🔥 ${st.streak}</div><div class="lbl">${esc(t("home.streak"))}</div></div>
        <div class="card stat" style="background:var(--surface-2)"><div class="num">🎓 ${store.doneCount()}</div><div class="lbl">${esc(t("stat.lessons"))}</div></div>
        <div class="card stat" style="background:var(--surface-2)"><div class="num">📖 ${store.wordsLearned()}</div><div class="lbl">${esc(t("stat.words"))}</div></div>
      </div>
    </div>

    <div class="card daily-card" style="margin-bottom:20px">
      ${dailyRingHTML(daily)}
      <div class="daily-card__txt">
        <strong>🎯 ${esc(t("daily.title"))}</strong>
        <span>${daily.xp} / ${daily.goal} XP${daily.hit ? " · " + esc(t("daily.hit")) : ""}</span>
        <div class="goal-picker" id="goalPicker">
          <button class="goal-opt ${daily.goal === 20 ? "on" : ""}" data-goal="20">${esc(t("daily.relaxed"))} · 20</button>
          <button class="goal-opt ${daily.goal === 50 ? "on" : ""}" data-goal="50">${esc(t("daily.normal"))} · 50</button>
          <button class="goal-opt ${daily.goal === 100 ? "on" : ""}" data-goal="100">${esc(t("daily.serious"))} · 100</button>
        </div>
      </div>
      <div class="daily-card__actions">
        <a class="btn btn--sm btn--accent" href="#/mix" aria-label="${esc(t("mix.sub"))}">${esc(t("mix.go"))}</a>
        ${mistakes ? `<a class="btn btn--sm" href="#/mistakes" aria-label="${esc(t("mistakes.count", mistakes))}">${esc(t("mistakes.go"))} · ${mistakes}</a>` : ""}
        ${favs ? `<a class="btn btn--sm" href="#/favorites">⭐ ${esc(t("fav.title"))} · ${favs}</a>` : ""}
      </div>
    </div>

    ${any ? `
    <div class="section-head"><h2 style="font-size:1.2rem">${esc(t("progress.byLang"))}</h2></div>
    <div class="grid" style="gap:12px;margin-bottom:24px">
      ${COURSES.filter((c) => store.courseProgress(c).done > 0).map(progRowHTML).join("") || `<p style="color:var(--text-dim)">${esc(t("progress.none"))}</p>`}
    </div>` : `<div class="empty"><div class="emoji">🚀</div><p>${esc(t("progress.none"))}</p><a class="btn" href="#/courses" style="margin-top:12px">${esc(t("home.browse"))}</a></div>`}

    <div class="section-head"><h2 style="font-size:1.2rem">${esc(t("progress.ach"))} <span style="color:var(--text-faint);font-weight:700;font-size:.95rem">${unlocked}/${ACHIEVEMENTS.length}</span></h2></div>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map((a) => {
        const ok = a.test();
        return `<div class="card ach ${ok ? "unlocked" : ""}"><div class="emoji">${a.emoji}</div><h4>${esc(mean(a.name))}</h4><p>${esc(mean(a.desc))}</p></div>`;
      }).join("")}
    </div>

    <div class="section-head" style="margin-top:26px"><h2 style="font-size:1.2rem">${esc(t("settings.title"))}</h2></div>
    <div class="card" style="padding:6px 18px">
      <div class="set-row">
        <span>🎨 ${esc(t("settings.accent"))}</span>
        <div class="accent-swatches" id="accentPick">
          ${ACCENT_KEYS.map((k) => `<button class="accent-sw accent-sw--${k} ${getAccent() === k ? "on" : ""}" data-accent="${k}" aria-label="${k}"></button>`).join("")}
        </div>
      </div>
      <div class="set-row">
        <span>🔠 ${esc(t("settings.textSize"))}</span>
        <div class="seg" id="textSizePick">
          <button class="seg-opt ${getTextScale() === "normal" ? "on" : ""}" data-size="normal">${esc(t("settings.normal"))}</button>
          <button class="seg-opt ${getTextScale() === "large" ? "on" : ""}" data-size="large">${esc(t("settings.large"))}</button>
        </div>
      </div>
      <div class="set-row">
        <span>🔤 ${esc(t("settings.dyslexia"))}</span>
        <label class="switch"><input type="checkbox" id="dysToggle" ${getDyslexia() ? "checked" : ""}><span class="switch__track"></span></label>
      </div>
      <div class="set-row">
        <span>🔔 ${esc(t("settings.reminder"))}<br><small style="color:var(--text-faint);font-weight:600">${esc(t("settings.reminderNote"))}</small></span>
        <div style="display:flex;gap:8px;align-items:center">
          <input type="time" id="remTime" value="${esc(rem.time)}" class="time-input">
          <label class="switch"><input type="checkbox" id="remToggle" ${rem.enabled ? "checked" : ""}><span class="switch__track"></span></label>
        </div>
      </div>
    </div>

    <div class="section-head" style="margin-top:26px"><h2 style="font-size:1.2rem">${esc(t("data.title"))}</h2></div>
    <div class="card" style="padding:18px">
      <p style="color:var(--text-dim);margin:0 0 12px">${esc(t("data.sub"))}</p>
      <div class="practice-bar" style="margin:0">
        <button class="btn btn--sm" id="exportBtn">${esc(t("data.export"))}</button>
        <button class="btn btn--sm" id="importBtn">${esc(t("data.import"))}</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden />
      </div>
    </div>

    <div style="margin-top:30px;text-align:center">
      <button class="btn btn--ghost btn--sm" id="resetBtn">🗑️ ${esc(t("progress.reset"))}</button>
    </div>
  `;

  $$("#goalPicker .goal-opt", view).forEach((b) => {
    b.onclick = () => {
      store.setDailyGoal(+b.dataset.goal);
      rerender();
    };
  });

  // appearance + reminder settings
  $$("#accentPick .accent-sw", view).forEach((b) => {
    b.onclick = () => {
      setAccent(b.dataset.accent);
      $$("#accentPick .accent-sw", view).forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  $$("#textSizePick .seg-opt", view).forEach((b) => {
    b.onclick = () => {
      setTextScale(b.dataset.size);
      $$("#textSizePick .seg-opt", view).forEach((x) => x.classList.toggle("on", x === b));
    };
  });
  $("#dysToggle", view).onchange = (e) => setDyslexia(e.target.checked);
  const remToggle = $("#remToggle", view),
    remTime = $("#remTime", view);
  async function updateReminder() {
    const res = await requestReminder(remToggle.checked, remTime.value);
    if (remToggle.checked && !res.enabled) {
      remToggle.checked = false;
      toast(t("settings.reminderDenied"));
    } else if (res.enabled) {
      toast(t("settings.reminderOn"));
    }
  }
  remToggle.onchange = updateReminder;
  remTime.onchange = () => {
    if (remToggle.checked) updateReminder();
  };

  $("#exportBtn").onclick = () => {
    const blob = new Blob([store.exportData()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "jago-bahasa-progress.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast(t("data.exported"));
  };
  const importFile = $("#importFile");
  $("#importBtn").onclick = () => importFile.click();
  importFile.onchange = () => {
    const file = importFile.files && importFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const res = store.importData(String(reader.result));
      toast(res.ok ? t("data.imported") : t("data.importErr"));
      if (res.ok) rerender();
    };
    reader.onerror = () => toast(t("data.importErr"));
    reader.readAsText(file);
  };

  $("#resetBtn").onclick = () => {
    if (confirm(t("progress.resetConfirm"))) {
      store.reset();
      toast(t("toast.reset"));
      rerender();
    }
  };
}

/* =====================================================================
   STATS & INSIGHTS
   ===================================================================== */
export function renderStats(view) {
  const st = store.getState();
  const hist = st.xpHistory || {};

  // Activity heatmap — last 26 weeks, coloured by XP earned that day.
  const DAYS = 182;
  const dates = store.lastNDates(DAYS);
  const bucket = (xp) => (xp <= 0 ? 0 : xp < 20 ? 1 : xp < 50 ? 2 : xp < 100 ? 3 : 4);
  const firstDow = store.parseISO(dates[0]).getDay();
  const cells = [];
  for (let b = 0; b < firstDow; b++) cells.push(`<span class="hm-cell hm-blank"></span>`);
  for (const d of dates) {
    const xp = hist[d] || 0;
    cells.push(`<span class="hm-cell hm-${bucket(xp)}" title="${esc(d)} · ${xp} XP"></span>`);
  }
  const activeCount = dates.filter((d) => (st.activeDays || []).includes(d)).length;
  // 182 individual cells would be read out one by one; expose one summary instead.
  const heatmapLabel = `${t("stats.heatmap")} — ${t("stats.activeDays")}: ${activeCount}/${DAYS}`;

  // XP trend — last 14 days as bars.
  const trend = store.xpTrend(14);
  const maxT = Math.max(1, ...trend.map((d) => d.xp));

  // Accuracy per practice mode.
  const MODES = [
    ["quiz", "🧠", "lesson.quiz"], ["type", "⌨️", "lesson.type"], ["listen", "👂", "lesson.listen"],
    ["dictation", "📝", "lesson.dictation"], ["cloze", "✍️", "lesson.cloze"],
    ["speak", "🎤", "lesson.speak"], ["build", "🧩", "lesson.build"], ["mix", "🎲", "mix.title"],
    ["mistakes", "🧯", "mistakes.title"], ["fav", "⭐", "fav.title"],
  ];
  const accRows = MODES.map(([m, e, k]) => ({ e, k, a: store.accuracy(m) })).filter((r) => r.a);

  // Words per language.
  const wbc = store.wordsByCourse();
  const langRows = COURSES.filter((c) => wbc[c.id]).sort((a, b) => wbc[b.id] - wbc[a.id]);
  const maxW = Math.max(1, ...langRows.map((c) => wbc[c.id]));

  const anyData = activeCount > 0 || st.xp > 0;

  view.innerHTML = `
    <nav class="crumb"><a href="#/progress">‹ ${esc(t("progress.title"))}</a></nav>
    <div class="section-head"><div><span class="eyebrow">📊 ${esc(t("stats.title"))}</span><h2>${esc(t("stats.title"))}</h2><p>${esc(t("stats.sub"))}</p></div></div>

    ${!anyData ? `<div class="empty"><div class="emoji">📊</div><p>${esc(t("progress.none"))}</p><a class="btn" href="#/courses" style="margin-top:12px">${esc(t("home.browse"))}</a></div>` : ""}

    <div class="stats" style="margin-bottom:20px">
      <div class="card stat"><div class="num">🏆 ${store.getBestStreak()}</div><div class="lbl">${esc(t("stats.best"))}</div></div>
      <div class="card stat"><div class="num">🧊 ${store.getFreezes()}</div><div class="lbl">${esc(t("stats.freezes"))}</div></div>
      <div class="card stat"><div class="num">📅 ${activeCount}</div><div class="lbl">${esc(t("stats.activeDays"))}</div></div>
      <div class="card stat"><div class="num">💯 ${store.counter("perfect")}</div><div class="lbl">${esc(t("stats.perfect"))}</div></div>
    </div>

    <div class="card" style="padding:18px;margin-bottom:20px;overflow-x:auto">
      <h3 style="font-size:1.05rem;margin:0 0 12px">🗓️ ${esc(t("stats.heatmap"))}</h3>
      <div class="heatmap" role="img" aria-label="${esc(heatmapLabel)}">${cells.join("")}</div>
      <div class="hm-legend" aria-hidden="true">${esc(t("stats.less"))} <span class="hm-cell hm-0"></span><span class="hm-cell hm-1"></span><span class="hm-cell hm-2"></span><span class="hm-cell hm-3"></span><span class="hm-cell hm-4"></span> ${esc(t("stats.more"))}</div>
    </div>

    <div class="card" style="padding:18px;margin-bottom:20px">
      <h3 style="font-size:1.05rem;margin:0 0 12px">📈 ${esc(t("stats.trend"))}</h3>
      <div class="trend" role="img" aria-label="${esc(t("stats.trend"))}">${trend.map((d) => `<div class="trend-bar" title="${esc(d.date)} · ${d.xp} XP"><i style="height:${Math.round((d.xp / maxT) * 100)}%"></i></div>`).join("")}</div>
    </div>

    ${accRows.length ? `
    <div class="card" style="padding:18px;margin-bottom:20px">
      <h3 style="font-size:1.05rem;margin:0 0 12px">🎯 ${esc(t("stats.accuracy"))}</h3>
      ${accRows.map((r) => `
        <div class="bar-row">
          <span class="bar-row__lbl">${r.e} ${esc(t(r.k))}</span>
          <div class="progress" style="flex:1" aria-hidden="true"><i style="width:${r.a.pct}%"></i></div>
          <span class="bar-row__val">${r.a.pct}% <small>(${r.a.ok}/${r.a.tries})</small></span>
        </div>`).join("")}
    </div>` : ""}

    ${langRows.length ? `
    <div class="card" style="padding:18px;margin-bottom:20px">
      <h3 style="font-size:1.05rem;margin:0 0 12px">🌍 ${esc(t("stats.byLang"))}</h3>
      ${langRows.map((c) => `
        <div class="bar-row">
          <span class="bar-row__lbl">${esc(c.flag)} ${esc(mean(c.name))}</span>
          <div class="progress" style="flex:1" aria-hidden="true"><i style="width:${Math.round((wbc[c.id] / maxW) * 100)}%"></i></div>
          <span class="bar-row__val">${wbc[c.id]}</span>
        </div>`).join("")}
    </div>` : ""}
  `;
}

/* =====================================================================
   ABOUT
   ===================================================================== */
export function renderAbout(view) {
  const features = [
    { e: "📡", t: { id: "Bekerja Offline", en: "Works Offline", es: "Funciona sin conexión" }, d: { id: "Dipasang sebagai aplikasi (PWA) dan tetap berfungsi tanpa internet.", en: "Installable PWA that keeps working without internet.", es: "PWA instalable que funciona sin internet." } },
    { e: "🔊", t: { id: "Pelafalan Audio", en: "Audio Pronunciation", es: "Pronunciación de audio" }, d: { id: "Dengarkan setiap kata dengan text-to-speech native.", en: "Hear every word with native text-to-speech.", es: "Escucha cada palabra con voz nativa." } },
    { e: "🃏", t: { id: "Flashcard & Kuis", en: "Flashcards & Quizzes", es: "Tarjetas y cuestionarios" }, d: { id: "Belajar aktif dengan kartu balik dan kuis interaktif.", en: "Active recall with flip cards and interactive quizzes.", es: "Recuerdo activo con tarjetas y cuestionarios." } },
    { e: "🏅", t: { id: "Gamifikasi", en: "Gamification", es: "Gamificación" }, d: { id: "XP, level, hari beruntun, dan pencapaian membuat belajar seru.", en: "XP, levels, streaks and achievements keep you motivated.", es: "XP, niveles, rachas y logros te motivan." } },
    { e: "🌍", t: { id: `${COURSES.length} Bahasa Dunia`, en: `${COURSES.length} World Languages`, es: `${COURSES.length} idiomas del mundo` }, d: { id: "Inggris, Spanyol, Prancis, Jerman, Jepang, Korea, Mandarin, Arab, Italia, Portugis, Rusia, Hindi, Melayu, Belanda, Swedia, Turki, Tagalog, Vietnam, Polandia, Thai, Yunani, Ukraina, Swahili.", en: "English, Spanish, French, German, Japanese, Korean, Mandarin, Arabic, Italian, Portuguese, Russian, Hindi, Malay, Dutch, Swedish, Turkish, Tagalog, Vietnamese, Polish, Thai, Greek, Ukrainian, Swahili.", es: "Inglés, español, francés, alemán, japonés, coreano, mandarín, árabe, italiano, portugués, ruso, hindi, malayo, neerlandés, sueco, turco, tagalo, vietnamita, polaco, tailandés, griego, ucraniano, suajili." } },
    { e: "🔐", t: { id: "Akun Aman (Opsional)", en: "Secure Accounts (Optional)", es: "Cuentas seguras (opcional)" }, d: { id: "Kata sandi di-hash (PBKDF2), tidak pernah disimpan apa adanya. Buat akun untuk menyimpan & menyinkronkan progres, atau tetap sebagai tamu.", en: "Passwords are hashed (PBKDF2), never stored as text. Create an account to save & sync progress, or stay a guest.", es: "Las contraseñas se procesan con hash (PBKDF2), nunca se guardan como texto. Crea una cuenta para guardar y sincronizar, o sigue como invitado." } },
  ];
  view.innerHTML = `
    <div class="section-head"><div><span class="eyebrow">Jago Bahasa</span><h2>${esc(t("about.title"))}</h2></div></div>
    <div class="prose">
      <p>${esc(I18N.current === "id"
        ? "Jago Bahasa adalah platform media pembelajaran bahasa dunia yang dirancang profesional, ringan, dan dapat diakses siapa saja. Dibangun sebagai Progressive Web App (PWA), aplikasi ini dapat dipasang di ponsel maupun komputer dan tetap berjalan tanpa koneksi internet."
        : I18N.current === "es"
        ? "Jago Bahasa es una plataforma de aprendizaje de idiomas del mundo, diseñada de forma profesional, ligera y accesible para todos. Creada como una Progressive Web App (PWA), se puede instalar y funciona sin conexión."
        : "Jago Bahasa is a world-language learning platform — professional, lightweight, and accessible to everyone. Built as a Progressive Web App (PWA), it installs on phone or desktop and keeps working offline.")}</p>
    </div>
    <div class="feature-grid" style="margin-top:22px">
      ${features.map((f) => `<div class="card feature"><div class="emoji">${f.e}</div><h3>${esc(mean(f.t))}</h3><p>${esc(mean(f.d))}</p></div>`).join("")}
    </div>
    <div class="card feature" style="margin-top:18px">
      <h3>📲 ${esc(t("install.title"))}</h3>
      <p>${esc(I18N.current === "id"
        ? "Buka menu browser dan pilih “Pasang aplikasi” / “Add to Home Screen”, atau gunakan tombol Pasang yang muncul di pojok layar."
        : I18N.current === "es"
        ? "Abre el menú del navegador y elige “Instalar app” / “Añadir a pantalla de inicio”, o usa el botón Instalar en la esquina."
        : "Open your browser menu and choose “Install app” / “Add to Home Screen”, or use the Install button in the corner.")}</p>
    </div>
    <p style="text-align:center;color:var(--text-faint);margin-top:30px;font-size:.85rem">Jago Bahasa • PWA • © 2026</p>
  `;
}
