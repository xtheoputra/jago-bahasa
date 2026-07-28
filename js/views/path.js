/* =========================================================================
   views/path.js — "Nol → Ahli": the six-stage road through a language.

   The catalogue already knows which lessons sit at which difficulty tier, and
   the dictionary already tags every headword with a CEFR band. This view lines
   the two up: for each stage it shows what you will be able to *do*, the
   lessons that get you there, the dictionary words of that band, and a drill
   that checks whether the words actually stuck.

     #/path            pick a language
     #/path/:lang      the six stages, with live progress
     #/drill/:lang/:band   10 questions from that stage's dictionary entries
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { toast, confetti, speak, liveStatus } from "../core/ui.js";
import { shuffle } from "../core/random.js";
import * as store from "../core/state.js";
import { COURSES, findCourse } from "../data.js";
import { BANDS, BAND_INFO, BAND_LEVEL, getLexicon, lexiconSize } from "../lexicon.js";
import { navigate } from "../core/router.js";
import { notFound } from "./partials.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);
const tri = (a) => (Array.isArray(a) ? a[["id", "en", "es"].indexOf(I18N.current)] || a[0] : a || "");

/* =====================================================================
   #/path — pick a language
   ===================================================================== */
export function renderPathIndex(view) {
  const cards = COURSES.map((c) => {
    const p = store.courseProgress(c);
    return `
      <a class="card path-pick" href="#/path/${esc(c.id)}">
        <span class="flag">${esc(c.flag)}</span>
        <span class="path-pick__main">
          <strong>${esc(mean(c.name))}</strong>
          <span class="progress" aria-hidden="true"><i style="width:${p.pct}%"></i></span>
        </span>
        <span class="path-pick__pct">${p.pct}%</span>
      </a>`;
  }).join("");

  view.innerHTML = `
    <div class="section-head"><div>
      <span class="eyebrow">🧭 ${esc(t("path.cta"))}</span>
      <h2>${esc(t("path.title"))}</h2><p>${esc(t("path.sub"))}</p>
    </div></div>
    <div class="card stage-legend">
      ${BANDS.map((b) => `
        <div class="stage-legend__row">
          <span class="chip chip--band chip--band-${esc(b)}">${esc(b)}</span>
          <span aria-hidden="true">${esc(BAND_INFO[b].icon)}</span>
          <span>${esc(tri(BAND_INFO[b].name))}</span>
        </div>`).join("")}
    </div>
    <div class="section-head" style="margin-top:22px"><div><h2 style="font-size:1.15rem">${esc(t("path.pick"))}</h2></div></div>
    <div class="path-picks">${cards}</div>
  `;
}

/* =====================================================================
   #/path/:lang — the ladder
   ===================================================================== */
export function renderPath(view, [lang]) {
  const c = findCourse(lang);
  if (!c) return notFound(view);
  const book = getLexicon(lang);
  const st = store.getState();
  const overall = store.courseProgress(c);

  const stageHTML = (band) => {
    const info = BAND_INFO[band];
    const level = BAND_LEVEL[band];
    const lessons = c.lessons.filter((l) => l.level === level);
    const done = lessons.filter((l) => st.doneLessons[`${c.id}/${l.id}`]).length;
    const pct = lessons.length ? Math.round((done / lessons.length) * 100) : 0;
    const words = book ? book.entries.filter((e) => e.cefr === band) : [];

    return `
      <section class="card stage ${done && done === lessons.length ? "stage--done" : ""}">
        <header class="stage__head">
          <span class="stage__icon" aria-hidden="true">${esc(info.icon)}</span>
          <div style="flex:1 1 200px;min-width:0">
            <h2>${esc(tri(info.name))} <span class="chip chip--band chip--band-${esc(band)}">${esc(band)}</span></h2>
            <div class="progress" aria-hidden="true"><i style="width:${pct}%"></i></div>
            <small>${done}/${lessons.length} ${esc(t("courses.lessons"))} · ${pct}%</small>
          </div>
          ${done && done === lessons.length && lessons.length ? `<span class="chip chip--brand">${esc(t("path.stageDone"))}</span>` : ""}
        </header>

        <h3 class="stage__sub">${esc(t("path.canDo"))}</h3>
        <ul class="stage__can">${info.can.map((k) => `<li>${esc(tri(k))}</li>`).join("")}</ul>

        <h3 class="stage__sub">${esc(t("path.lessons"))}</h3>
        ${lessons.length
          ? `<div class="stage__lessons">${lessons
              .map((l) => {
                const isDone = !!st.doneLessons[`${c.id}/${l.id}`];
                return `<a class="chip chip--tap ${isDone ? "chip--brand" : ""}" href="#/lesson/${esc(c.id)}/${esc(l.id)}">${isDone ? "✓ " : ""}${esc(l.icon)} ${esc(mean(l.title))}</a>`;
              })
              .join("")}</div>`
          : `<p class="stage__empty">${esc(t("path.noLessons"))}</p>`}

        ${words.length ? `
        <h3 class="stage__sub">${esc(t("path.words"))}</h3>
        <div class="stage__lessons">
          <a class="chip chip--tap" href="#/dict/${esc(c.id)}/${esc(band)}">📖 ${esc(t("dict.entries", words.length))}</a>
          ${words.slice(0, 6).map((e) => `<a class="chip chip--tap" href="#/entry/${encodeURIComponent(e.lang)}/${encodeURIComponent(e.w)}">${esc(e.w)}</a>`).join("")}
        </div>
        ${words.length >= 4 ? `<a class="btn btn--sm stage__drill" href="#/drill/${esc(c.id)}/${esc(band)}">📖 ${esc(t("drill.go"))} →</a>` : ""}` : ""}
      </section>`;
  };

  view.innerHTML = `
    <nav class="crumb"><a href="#/courses">${esc(t("course.back"))}</a><span class="sep">/</span>
      <a href="#/course/${esc(c.id)}">${esc(mean(c.name))}</a><span class="sep">/</span><span>${esc(t("path.cta"))}</span></nav>

    <div class="card course-header">
      <div class="flag">${esc(c.flag)}</div>
      <div style="flex:1 1 220px;min-width:0">
        <h1>${esc(t("path.title"))}</h1>
        <p>${esc(mean(c.name))} · ${esc(t("dict.entries", lexiconSize(c.id)))} · ${esc(t("path.sub"))}</p>
      </div>
      <div class="progress-wrap">
        <div style="display:flex;justify-content:space-between;font-size:.82rem;font-weight:700;color:var(--text-dim);margin-bottom:6px">
          <span>${esc(t("path.overall"))}</span><span>${overall.pct}%</span>
        </div>
        <div class="progress" aria-hidden="true"><i style="width:${overall.pct}%"></i></div>
      </div>
    </div>

    <div class="path-links">
      <a class="btn btn--ghost btn--sm" href="#/dict/${esc(c.id)}">📖 ${esc(t("dict.open"))}</a>
      <a class="btn btn--ghost btn--sm" href="#/guide/${esc(c.id)}">📐 ${esc(t("guide.title"))}</a>
      <a class="btn btn--ghost btn--sm" href="#/course/${esc(c.id)}">📚 ${esc(t("course.lessons"))}</a>
    </div>

    <div class="stages">${BANDS.map(stageHTML).join("")}</div>
  `;
}

/* =====================================================================
   #/drill/:lang/:band — check that the stage's words really stuck
   ===================================================================== */
const QUESTIONS = 10;

export function renderDrill(view, [lang, band], ctx) {
  const c = findCourse(lang);
  const book = getLexicon(lang);
  if (!c || !book || !BANDS.includes(band)) return notFound(view);

  const pool = book.entries.filter((e) => e.cefr === band);
  if (pool.length < 4) {
    view.innerHTML = `<div class="empty"><div class="emoji">📖</div><h2>${esc(t("drill.empty"))}</h2>
      <a class="btn" href="#/path/${esc(c.id)}" style="margin-top:12px">${esc(t("path.cta"))}</a></div>`;
    return;
  }

  const questions = shuffle(pool)
    .slice(0, QUESTIONS)
    .map((e) => ({ e, opts: shuffle([e, ...shuffle(pool.filter((x) => x !== e)).slice(0, 3)]) }));

  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0,
    locked = false,
    advTimer = null;
  if (signal) signal.addEventListener("abort", () => clearTimeout(advTimer), { once: true });

  function paint() {
    if (qi >= questions.length) return finish();
    const q = questions[qi];
    view.innerHTML = `
      <h2 class="visually-hidden">${esc(t("drill.title"))}</h2>
      <nav class="crumb"><a href="#/path/${esc(c.id)}">‹ ${esc(t("path.cta"))}</a></nav>
      <div class="quiz-wrap">
        <div class="quiz-top">
          <div class="progress" aria-hidden="true"><i style="width:${(qi / questions.length) * 100}%"></i></div>
          <span class="chip chip--band chip--band-${esc(band)}">${esc(band)}</span>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${questions.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">${esc(t("drill.prompt"))}</div>
          <div class="drill-def">${esc(mean(q.e.d))}</div>
          <div class="drill-gloss">${esc(mean(q.e.g))}</div>
        </div>
        <div class="quiz-options">
          ${q.opts.map((o, k) => `<button class="quiz-opt ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}" data-k="${k}">${esc(o.w)}</button>`).join("")}
        </div>
      </div>`;

    locked = false;
    $$(".quiz-opt", view).forEach((btn) => {
      btn.onclick = () => {
        if (locked) return;
        locked = true;
        const chosen = q.opts[+btn.dataset.k];
        const correct = chosen === q.e;
        $$(".quiz-opt", view).forEach((b) => {
          b.disabled = true;
          const o = q.opts[+b.dataset.k];
          if (o === q.e) b.classList.add("correct");
          else if (b === btn) b.classList.add("wrong");
        });
        liveStatus(`${correct ? t("mode.correct") : t("mode.wrong")} — ${q.e.w}`);
        store.recordAttempt("drill", correct);
        if (correct) score++;
        speak(q.e.w, c.speech);
        advTimer = setTimeout(() => {
          if (signal && signal.aborted) return;
          qi++;
          paint();
        }, correct ? 700 : 1250);
      };
    });
  }

  function finish() {
    const pct = Math.round((score / questions.length) * 100);
    // Dictionary drills are practice, not lesson completion: a flat, modest XP
    // award keeps them from out-earning the lessons themselves.
    const gain = score * 2;
    if (gain) store.addXp(gain);
    toast(t("toast.lessonDone", gain));
    const circ = 2 * Math.PI * 54;
    view.innerHTML = `
      <div class="quiz-wrap">
        <div class="card quiz-result">
          <svg class="ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="url(#dg2)" stroke-width="11" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ - (pct / 100) * circ}" transform="rotate(-90 60 60)"/>
            <defs><linearGradient id="dg2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
            <text x="60" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${pct}%</text>
          </svg>
          <h2>${esc(pct === 100 ? t("quiz.perfect") : pct >= 60 ? t("quiz.good") : t("quiz.keepgoing"))}</h2>
          <div class="scoreline">${score} / ${questions.length} ${esc(t("quiz.correct"))}</div>
          <div class="xp-pop">+${gain} XP⭐</div>
          <div class="practice-bar" style="justify-content:center;margin-top:18px">
            <button class="btn btn--ghost" id="dretry">↻ ${esc(t("quiz.retry"))}</button>
            <button class="btn" id="dback">${esc(t("path.cta"))}</button>
          </div>
        </div>
      </div>`;
    if (pct === 100) confetti();
    $("#dretry").onclick = () => renderDrill(view, [lang, band], ctx);
    $("#dback").onclick = () => navigate(`#/path/${c.id}`);
  }

  paint();
}
