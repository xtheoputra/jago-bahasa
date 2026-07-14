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

/* =====================================================================
   SRS REVIEW — spaced-repetition over words from completed lessons.
   ===================================================================== */
export function renderReview(view, _params, ctx) {
  const pool = store.srsPool();
  if (!pool.length) {
    view.innerHTML = `
      <div class="section-head"><div><span class="eyebrow">🔁 ${esc(t("review.title"))}</span><h2>${esc(t("review.title"))}</h2><p>${esc(t("review.sub"))}</p></div></div>
      <div class="empty"><div class="emoji">🌱</div><p>${esc(t("review.empty"))}</p><a class="btn" href="#/courses" style="margin-top:12px">${esc(t("review.browse"))}</a></div>`;
    return;
  }
  const due = store.srsDue(pool);
  if (!due.length) {
    view.innerHTML = `
      <div class="section-head"><div><span class="eyebrow">🔁 ${esc(t("review.title"))}</span><h2>${esc(t("review.title"))}</h2></div></div>
      <div class="empty"><div class="emoji">🎉</div><p>${esc(t("review.none"))}</p>
        <button class="btn" id="aheadBtn" style="margin-top:12px">${esc(t("review.ahead"))}</button></div>`;
    $("#aheadBtn", view).onclick = () => runReviewSession(view, shuffle(pool).slice(0, 10), ctx);
    return;
  }
  runReviewSession(view, shuffle(due), ctx);
}

function runReviewSession(view, queue, ctx) {
  let idx = 0,
    reviewed = 0,
    revealed = false;

  function finish() {
    store.srsReviewed(reviewed);
    view.innerHTML = `
      <div class="quiz-wrap"><div class="card quiz-result">
        <div class="emoji" style="font-size:3rem">🎉</div>
        <h2>${esc(t("review.done"))}</h2>
        <div class="scoreline">${esc(t("review.reviewed", reviewed))}</div>
        <div class="practice-bar" style="justify-content:center;margin-top:18px">
          <button class="btn btn--ghost" id="rvAgain">↻ ${esc(t("review.title"))}</button>
          <button class="btn" id="rvBack">${esc(t("review.back"))}</button>
        </div>
      </div></div>`;
    confetti();
    $("#rvAgain", view).onclick = () => renderReview(view, [], ctx);
    $("#rvBack", view).onclick = () => navigate("#/progress");
  }

  function paint() {
    if (idx >= queue.length) return finish();
    const { c, it } = queue[idx];
    revealed = false;
    view.innerHTML = `
      <nav class="crumb"><a href="#/progress">‹ ${esc(t("review.back"))}</a></nav>
      <div class="review-wrap">
        <div class="review-top">
          <div class="progress"><i style="width:${(idx / queue.length) * 100}%"></i></div>
          <span class="chip">${idx + 1} / ${queue.length}</span>
        </div>
        <div class="card review-card">
          <div class="review-term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>
          ${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}
          <button class="speakbtn" data-speak="${esc(it.term)}" style="margin:8px auto 0">🔊</button>
          <div class="review-answer" id="rvAns" hidden>
            <div class="review-mean">${esc(mean(it.m))}</div>
            ${it.ex ? `<div class="vocab__ex" style="text-align:center">“${esc(it.ex.t)}” — ${esc(mean(it.ex.m))}</div>` : ""}
          </div>
        </div>
        <div class="review-actions" id="rvActions"><button class="btn btn--accent" id="rvShow">${esc(t("review.show"))}</button></div>
        <div class="review-grades" id="rvGrades" hidden>
          <button class="btn grade grade--again" data-g="again">${esc(t("review.again"))}</button>
          <button class="btn grade grade--hard" data-g="hard">${esc(t("review.hard"))}</button>
          <button class="btn grade grade--good" data-g="good">${esc(t("review.good"))}</button>
          <button class="btn grade grade--easy" data-g="easy">${esc(t("review.easy"))}</button>
        </div>
      </div>`;
    wireSpeak(view, c);
    speak(it.term, c.speech);
    $("#rvShow", view).onclick = () => {
      revealed = true;
      $("#rvAns", view).hidden = false;
      $("#rvActions", view).hidden = true;
      $("#rvGrades", view).hidden = false;
    };
    $$(".grade", view).forEach((b) => {
      b.onclick = () => {
        if (!revealed) return;
        const g = b.dataset.g;
        store.srsGrade(queue[idx].key, g);
        reviewed++;
        if (g === "again") queue.push(queue[idx]); // see it again later this session
        idx++;
        paint();
      };
    });
  }

  document.addEventListener(
    "keydown",
    (e) => {
      const grades = $("#rvGrades", view);
      if (!grades) return;
      if (grades.hidden) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          const s = $("#rvShow", view);
          if (s) s.click();
        }
      } else {
        const map = { 1: "again", 2: "hard", 3: "good", 4: "easy" };
        const g = map[e.key];
        if (g) {
          e.preventDefault();
          const b = $(`.grade[data-g="${g}"]`, view);
          if (b) b.click();
        }
      }
    },
    { signal: ctx && ctx.signal }
  );

  paint();
}

/* =====================================================================
   CLOZE — fill the blank in a lesson's example sentences.
   ===================================================================== */
function blankOut(term, sentence) {
  const cands = [term];
  const m = /^to\s+/i.exec(term);
  if (m) cands.push(term.slice(m[0].length));
  for (const cand of cands) {
    const cand2 = cand.trim();
    if (!cand2) continue;
    const i = sentence.toLowerCase().indexOf(cand2.toLowerCase());
    if (i >= 0) return sentence.slice(0, i) + "_____" + sentence.slice(i + cand2.length);
  }
  return null;
}

export function renderCloze(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);

  const built = [];
  for (const it of l.items) {
    if (!it.ex) continue;
    const blanked = blankOut(it.term, it.ex.t);
    if (!blanked) continue;
    const others = shuffle(l.items.filter((x) => x !== it));
    if (others.length < 3) continue;
    built.push({ it, blanked, opts: shuffle([it, ...others.slice(0, 3)]) });
  }
  if (!built.length) {
    view.innerHTML = `
      <nav class="crumb"><a href="#/lesson/${c.id}/${l.id}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="empty"><div class="emoji">✍️</div><p>${esc(t("cloze.none"))}</p>
        <a class="btn" href="#/lesson/${c.id}/${l.id}" style="margin-top:12px">${esc(t("cloze.back"))}</a></div>`;
    return;
  }

  const qs = shuffle(built);
  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0,
    locked = false,
    advTimer = null;
  if (signal) signal.addEventListener("abort", () => clearTimeout(advTimer), { once: true });

  function paint() {
    if (qi >= qs.length) return finish();
    const q = qs[qi];
    view.innerHTML = `
      <nav class="crumb"><a href="#/lesson/${c.id}/${l.id}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="quiz-wrap">
        <div class="quiz-top">
          <div class="progress"><i style="width:${(qi / qs.length) * 100}%"></i></div>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${qs.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">✍️ ${esc(t("lesson.cloze"))} · ${esc(mean(q.it.m))}</div>
          <div class="cloze-sentence ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(q.blanked)}</div>
        </div>
        <div class="quiz-options">
          ${q.opts.map((o, k) => `<button class="quiz-opt ${c.cjk ? "cjk" : ""}" data-k="${k}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(o.term)}</button>`).join("")}
        </div>
      </div>`;
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
        if (correct) {
          score++;
          speak(q.it.term, c.speech);
        }
        advTimer = setTimeout(() => {
          if (signal && signal.aborted) return;
          qi++;
          paint();
        }, correct ? 700 : 1200);
      };
    });
  }

  function finish() {
    const pct = Math.round((score / qs.length) * 100);
    store.srsReviewed(score);
    const verdict = pct === 100 ? t("quiz.perfect") : pct >= 60 ? t("quiz.good") : t("quiz.keepgoing");
    const circ = 2 * Math.PI * 54;
    view.innerHTML = `
      <div class="quiz-wrap"><div class="card quiz-result">
        <svg class="ring" viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
          <circle cx="60" cy="60" r="54" fill="none" stroke="url(#cg)" stroke-width="11" stroke-linecap="round"
            stroke-dasharray="${circ}" stroke-dashoffset="${circ - (pct / 100) * circ}" transform="rotate(-90 60 60)"/>
          <defs><linearGradient id="cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
          <text x="60" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${pct}%</text>
        </svg>
        <h2>${esc(verdict)}</h2>
        <div class="scoreline">${score} / ${qs.length} ${esc(t("quiz.correct"))}</div>
        <div class="practice-bar" style="justify-content:center;margin-top:18px">
          <button class="btn btn--ghost" id="czRetry">↻ ${esc(t("quiz.retry"))}</button>
          <button class="btn" id="czBack">${esc(t("cloze.back"))}</button>
        </div>
      </div></div>`;
    if (pct === 100) confetti();
    $("#czRetry", view).onclick = () => renderCloze(view, [cid, lid], ctx);
    $("#czBack", view).onclick = () => navigate(`#/lesson/${c.id}/${l.id}`);
  }

  paint();
}
