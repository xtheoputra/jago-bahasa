/* =========================================================================
   views/practice.js — Flashcards & Quiz.
   Keyboard handlers attach to the route's AbortSignal so they are cleaned up
   automatically on navigation (no listener stacking).
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { confetti, toast, speak } from "../core/ui.js";
import { shuffle } from "../core/random.js";
import * as store from "../core/state.js";
import { findCourse, findLesson } from "../data.js";
import { wireSpeak, notFound } from "./partials.js";
import { navigate } from "../core/router.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);

/* =====================================================================
   FLASHCARDS
   ===================================================================== */
export function renderFlashcards(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);

  let i = 0,
    flipped = false;
  const total = l.items.length;

  view.innerHTML = `
    <nav class="crumb"><a href="#/lesson/${c.id}/${l.id}">‹ ${esc(mean(l.title))}</a></nav>
    <div class="flash-wrap">
      <div class="flash-count" id="fcount"></div>
      <div class="flashcard" id="fcard" tabindex="0" role="button" aria-label="${esc(t("flash.tap"))}">
        <div class="flashcard__inner">
          <div class="flashcard__face flashcard__front">
            <div class="big ${c.cjk ? "cjk" : ""}" id="fterm" dir="${c.rtl ? "rtl" : "ltr"}"></div>
            <div class="vocab__reading" id="fread"></div>
            <div class="flashcard__hint">${esc(t("flash.tap"))}</div>
          </div>
          <div class="flashcard__face flashcard__back">
            <div class="big" id="fmean"></div>
            <div class="flashcard__hint" style="color:rgba(255,255,255,.8)" id="fex"></div>
          </div>
        </div>
      </div>
      <div class="flash-actions">
        <button class="btn btn--ghost" id="fprev">‹ ${esc(t("flash.prev"))}</button>
        <button class="btn" id="fspeak" aria-label="🔊">🔊</button>
        <button class="btn btn--accent" id="fnext">${esc(t("flash.next"))} ›</button>
      </div>
    </div>
  `;

  const card = $("#fcard");
  function paint() {
    const it = l.items[i];
    flipped = false;
    card.classList.remove("flipped");
    $("#fcount").textContent = `${i + 1} / ${total}`;
    $("#fterm").textContent = it.term;
    $("#fread").textContent = it.reading || "";
    $("#fmean").textContent = mean(it.m);
    $("#fex").textContent = it.ex ? `“${it.ex.t}”` : "";
    $("#fnext").textContent = i === total - 1 ? t("flash.done") : t("flash.next") + " ›";
  }
  const flip = () => {
    flipped = !flipped;
    card.classList.toggle("flipped", flipped);
  };
  card.onclick = flip;
  $("#fprev").onclick = () => {
    if (i > 0) {
      i--;
      paint();
    }
  };
  $("#fnext").onclick = () => {
    if (i < total - 1) {
      i++;
      paint();
    } else {
      const r = store.completeLesson(c, l, null);
      if (r.first) confetti();
      toast(t("toast.lessonDone", r.gain));
      navigate(`#/lesson/${c.id}/${l.id}`);
    }
  };
  $("#fspeak").onclick = () => speak(l.items[i].term, c.speech);

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "ArrowRight") $("#fnext").click();
      else if (e.key === "ArrowLeft") $("#fprev").click();
      else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        flip();
      }
    },
    { signal: ctx && ctx.signal }
  );
  paint();
}

/* =====================================================================
   QUIZ
   ===================================================================== */
export function renderQuiz(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);

  const pool = l.items;
  const questions = shuffle(pool).map((it) => {
    const wrong = shuffle(pool.filter((x) => x !== it)).slice(0, 3);
    const opts = shuffle([it, ...wrong]);
    return { it, opts };
  });

  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0,
    locked = false,
    advTimer = null;
  // Cancel any pending advance/finish timer when the route is torn down.
  if (signal) signal.addEventListener("abort", () => clearTimeout(advTimer), { once: true });

  function paint() {
    if (qi >= questions.length) return finish();
    const q = questions[qi];
    view.innerHTML = `
      <nav class="crumb"><a href="#/lesson/${c.id}/${l.id}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="quiz-wrap">
        <div class="quiz-top">
          <div class="progress"><i style="width:${(qi / questions.length) * 100}%"></i></div>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${questions.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">${esc(t("quiz.q"))}</div>
          <div class="term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(q.it.term)}</div>
          ${q.it.reading ? `<div class="vocab__reading">${esc(q.it.reading)}</div>` : ""}
          <button class="speakbtn" data-speak="${esc(q.it.term)}" style="margin:10px auto 0">🔊</button>
        </div>
        <div class="quiz-options">
          ${q.opts.map((o, k) => `<button class="quiz-opt" data-k="${k}">${esc(mean(o.m))}</button>`).join("")}
        </div>
      </div>`;
    wireSpeak(view, c);
    speak(q.it.term, c.speech);
    locked = false;
    $$(".quiz-opt", view).forEach((btn) => {
      btn.onclick = () => {
        if (locked) return;
        locked = true;
        const chosen = q.opts[+btn.dataset.k];
        const correct = chosen === q.it;
        $$(".quiz-opt", view).forEach((b) => {
          b.disabled = true;
          const o = q.opts[+b.dataset.k];
          if (o === q.it) b.classList.add("correct");
          else if (b === btn) b.classList.add("wrong");
        });
        if (correct) score++;
        advTimer = setTimeout(() => {
          if (signal && signal.aborted) return;
          qi++;
          paint();
        }, correct ? 650 : 1150);
      };
    });
  }

  function finish() {
    const pct = Math.round((score / questions.length) * 100);
    const key = `${c.id}/${l.id}`;
    const prevBest = store.getState().quizScores[key] ?? -1;
    const r = store.completeLesson(c, l, pct);
    // Award the quiz bonus only when this beats the previous best (no retry farming).
    const bonus = pct > prevBest ? (pct === 100 ? 40 : 15) : 0;
    if (bonus) store.addXp(bonus);
    toast(t("toast.lessonDone", r.gain + bonus));

    const verdict = pct === 100 ? t("quiz.perfect") : pct >= 60 ? t("quiz.good") : t("quiz.keepgoing");
    const circ = 2 * Math.PI * 54;
    view.innerHTML = `
      <div class="quiz-wrap">
        <div class="card quiz-result">
          <svg class="ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="url(#qg)" stroke-width="11" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ - (pct / 100) * circ}" transform="rotate(-90 60 60)"/>
            <defs><linearGradient id="qg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
            <text x="60" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${pct}%</text>
          </svg>
          <h2>${esc(verdict)}</h2>
          <div class="scoreline">${score} / ${questions.length} ${esc(t("quiz.correct"))}</div>
          <div class="xp-pop">+${r.gain + bonus} XP⭐</div>
          <div class="practice-bar" style="justify-content:center;margin-top:18px">
            <button class="btn btn--ghost" id="qretry">↻ ${esc(t("quiz.retry"))}</button>
            <button class="btn" id="qback">${esc(t("quiz.back"))}</button>
          </div>
        </div>
      </div>`;
    if (pct === 100) confetti();
    $("#qretry").onclick = () => renderQuiz(view, [cid, lid], ctx);
    $("#qback").onclick = () => navigate(`#/lesson/${c.id}/${l.id}`);
  }

  paint();
}
