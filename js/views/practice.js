/* =========================================================================
   views/practice.js — Flashcards & Quiz.
   Keyboard handlers attach to the route's AbortSignal so they are cleaned up
   automatically on navigation (no listener stacking).
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { confetti, toast, speak, stopSpeak, liveStatus } from "../core/ui.js";
import { findScript } from "../scripts.js";
import { shuffle } from "../core/random.js";
import * as store from "../core/state.js";
import { COURSES, findCourse, findLesson } from "../data.js";
import { wireSpeak, notFound } from "./partials.js";
import { navigate } from "../core/router.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);

/** Announce the outcome of a multiple-choice answer. Colour and position carry
 *  that information visually; screen-reader users need it spoken. */
function announceResult(ok, answer) {
  liveStatus(ok ? t("mode.correct") : `${t("mode.wrong")} — ${t("mode.answer")}: ${answer}`);
}

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
      <div class="flashcard" id="fcard" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(t("flash.tap"))}">
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
    card.setAttribute("aria-pressed", "false");
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
    card.setAttribute("aria-pressed", flipped ? "true" : "false");
    // The face swap is a CSS 3D flip; announce what is now showing.
    liveStatus(flipped ? mean(l.items[i].m) : l.items[i].term);
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
          <div class="progress" aria-hidden="true"><i style="width:${(qi / questions.length) * 100}%"></i></div>
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
        const mkey = `${c.id}/${l.id}#${l.items.indexOf(q.it)}`;
        announceResult(correct, mean(q.it.m));
        store.recordAttempt("quiz", correct);
        if (correct) {
          score++;
          store.clearMistake(mkey);
        } else {
          store.recordMistake(mkey);
        }
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
    if (pct === 100) store.bumpCounter("perfect", 1);
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
          <div class="progress" aria-hidden="true"><i style="width:${(idx / queue.length) * 100}%"></i></div>
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
  l.items.forEach((it, i) => {
    if (!it.ex) return;
    const blanked = blankOut(it.term, it.ex.t);
    if (!blanked) return;
    const others = shuffle(l.items.filter((x) => x !== it));
    if (others.length < 3) return;
    built.push({ it, blanked, key: `${c.id}/${l.id}#${i}`, opts: shuffle([it, ...others.slice(0, 3)]) });
  });
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
          <div class="progress" aria-hidden="true"><i style="width:${(qi / qs.length) * 100}%"></i></div>
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
        // Feed the same accuracy stats + mistakes deck as every other mode.
        announceResult(correct, q.it.term);
        store.recordAttempt("cloze", correct);
        if (correct) {
          score++;
          store.clearMistake(q.key);
          speak(q.it.term, c.speech);
        } else {
          store.recordMistake(q.key);
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

/* =====================================================================
   SHARED HELPERS for the new modes (type / listen / match / mix / mistakes)
   ===================================================================== */
/** Normalize a string for lenient typed comparison: strip Latin diacritics,
 *  lowercase, drop punctuation, collapse whitespace. Romanizations with macrons
 *  (ō, ā) fold to plain letters so "shiyō" and "shiyo" both match. */
function norm(s) {
  return String(s)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[.,!?¡¿;:"'“”«»…()–—-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
/** What the learner is expected to type: the romanization for non-Latin scripts,
 *  otherwise the term itself (so typing works without an IME for any language). */
function expected(it) {
  return it.reading || it.term;
}

function emptyState(emoji, msg, href, label) {
  return `<div class="empty"><div class="emoji">${emoji}</div><p>${esc(msg)}</p><a class="btn" href="${href}" style="margin-top:12px">${esc(label)}</a></div>`;
}

/** Ring result screen shared by type / listen / mix / mistakes sessions. */
function sessionResult(view, score, total, backHash, backLabel, onRetry) {
  const pct = total ? Math.round((score / total) * 100) : 0;
  const verdict = pct === 100 ? t("quiz.perfect") : pct >= 60 ? t("quiz.good") : t("quiz.keepgoing");
  const circ = 2 * Math.PI * 54;
  view.innerHTML = `
    <div class="quiz-wrap"><div class="card quiz-result">
      <svg class="ring" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
        <circle cx="60" cy="60" r="54" fill="none" stroke="url(#sg)" stroke-width="11" stroke-linecap="round"
          stroke-dasharray="${circ}" stroke-dashoffset="${circ - (pct / 100) * circ}" transform="rotate(-90 60 60)"/>
        <defs><linearGradient id="sg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
        <text x="60" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${pct}%</text>
      </svg>
      <h2>${esc(verdict)}</h2>
      <div class="scoreline">${score} / ${total} ${esc(t("quiz.correct"))}</div>
      <div class="practice-bar" style="justify-content:center;margin-top:18px">
        ${onRetry ? `<button class="btn btn--ghost" id="sRetry">↻ ${esc(t("quiz.retry"))}</button>` : ""}
        <button class="btn" id="sBack">${esc(backLabel)}</button>
      </div>
    </div></div>`;
  if (pct === 100) confetti();
  const rb = $("#sRetry", view);
  if (rb && onRetry) rb.onclick = onRetry;
  $("#sBack", view).onclick = () => navigate(backHash);
}

/** Pick `need` wrong-answer items whose meanings differ from `entry`, preferring
 *  the current deck, then falling back to the whole catalogue for tiny decks. */
function distractorItems(entry, need, primary) {
  const seen = new Set([mean(entry.it.m)]);
  const out = [];
  const consider = (it) => {
    const m = mean(it.m);
    if (m && !seen.has(m)) {
      seen.add(m);
      out.push(it);
    }
  };
  for (const e of shuffle(primary.slice())) {
    if (out.length >= need) break;
    consider(e.it);
  }
  if (out.length < need) {
    for (const c of COURSES) {
      for (const l of c.lessons) {
        for (const it of l.items) {
          consider(it);
          if (out.length >= need) break;
        }
        if (out.length >= need) break;
      }
      if (out.length >= need) break;
    }
  }
  return out.slice(0, need);
}

/** Generic multiple-choice session over a deck of {c, it, key}. Correct answers
 *  clear the item from the mistakes deck; wrong answers add it. */
function mcSession(view, deck, ctx, opts) {
  const signal = ctx && ctx.signal;
  const questions = shuffle(deck.slice()).map((entry) => ({ entry, opts: shuffle([entry.it, ...distractorItems(entry, 3, deck)]) }));
  let qi = 0,
    score = 0,
    locked = false,
    advTimer = null;
  if (signal) signal.addEventListener("abort", () => clearTimeout(advTimer), { once: true });

  function finish() {
    store.srsReviewed(score);
    if (opts.counter) store.bumpCounter(opts.counter, score);
    sessionResult(view, score, questions.length, opts.backHash, opts.backLabel, opts.onRetry);
  }

  function paint() {
    if (qi >= questions.length) return finish();
    const q = questions[qi];
    const it = q.entry.it,
      c = q.entry.c;
    view.innerHTML = `
      <nav class="crumb"><a href="${opts.backHash}">‹ ${esc(opts.backLabel)}</a></nav>
      <div class="quiz-wrap">
        <h2 class="visually-hidden">${esc(opts.title || opts.backLabel)}</h2>
        <div class="quiz-top">
          <div class="progress" aria-hidden="true"><i style="width:${(qi / questions.length) * 100}%"></i></div>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${questions.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">${esc(opts.ask || t("quiz.q"))}</div>
          ${opts.audioOnly
            ? `<button class="speakbtn" data-speak="${esc(it.term)}" style="margin:8px auto 0;width:60px;height:60px;font-size:1.7rem">🔊</button>`
            : `<div class="term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}<button class="speakbtn" data-speak="${esc(it.term)}" style="margin:10px auto 0">🔊</button>`}
        </div>
        <div class="quiz-options">
          ${q.opts.map((o, k) => `<button class="quiz-opt" data-k="${k}">${esc(mean(o.m))}</button>`).join("")}
        </div>
      </div>`;
    wireSpeak(view, c);
    speak(it.term, c.speech);
    locked = false;
    $$(".quiz-opt", view).forEach((btn) => {
      btn.onclick = () => {
        if (locked) return;
        locked = true;
        const chosen = q.opts[+btn.dataset.k];
        const correct = chosen === it;
        $$(".quiz-opt", view).forEach((b) => {
          b.disabled = true;
          const o = q.opts[+b.dataset.k];
          if (o === it) b.classList.add("correct");
          else if (b === btn) b.classList.add("wrong");
        });
        announceResult(correct, mean(it.m));
        store.recordAttempt(opts.mode || "mix", correct);
        if (correct) {
          score++;
          store.clearMistake(q.entry.key);
        } else {
          store.recordMistake(q.entry.key);
        }
        advTimer = setTimeout(() => {
          if (signal && signal.aborted) return;
          qi++;
          paint();
        }, correct ? 650 : 1150);
      };
    });
  }
  paint();
}

/* =====================================================================
   TYPING — see the meaning, type the word (active recall / production).
   ===================================================================== */
export function renderType(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const deck = shuffle(l.items.map((it, i) => ({ it, key: `${c.id}/${l.id}#${i}` })));
  const back = `#/lesson/${c.id}/${l.id}`;
  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0;

  function paint() {
    if (qi >= deck.length) {
      store.srsReviewed(score);
      store.bumpCounter("typed", score);
      return sessionResult(view, score, deck.length, back, mean(l.title), () => renderType(view, [cid, lid], ctx));
    }
    const { it, key } = deck[qi];
    const exp = expected(it);
    let answered = false;
    view.innerHTML = `
      <nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="quiz-wrap">
        <h2 class="visually-hidden">${esc(t("type.title"))}</h2>
        <div class="quiz-top">
          <div class="progress" aria-hidden="true"><i style="width:${(qi / deck.length) * 100}%"></i></div>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${deck.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">${esc(t("type.prompt"))}</div>
          <div class="term">${esc(mean(it.m))}</div>
          <button class="speakbtn" data-speak="${esc(it.term)}" style="margin:8px auto 0">🔊</button>
        </div>
        <form class="type-form" id="typeForm" autocomplete="off">
          <input class="type-input ${c.cjk ? "cjk" : ""}" id="typeInput" dir="${c.rtl ? "rtl" : "ltr"}"
            placeholder="${esc(t("type.placeholder"))}" aria-label="${esc(t("type.prompt"))}"
            autocapitalize="none" autocorrect="off" spellcheck="false" />
          <div class="type-feedback" id="typeFb" role="status" hidden></div>
          <div class="practice-bar" style="justify-content:center;margin-top:14px">
            <button type="button" class="btn btn--ghost" id="typeSkip">${esc(t("mode.skip"))}</button>
            <button type="submit" class="btn btn--accent" id="typeCheck">${esc(t("mode.check"))}</button>
          </div>
        </form>
      </div>`;
    wireSpeak(view, c);
    const input = $("#typeInput", view);
    input.focus();

    function reveal(ok) {
      answered = true;
      store.recordAttempt("type", ok);
      if (ok) {
        score++;
        store.clearMistake(key);
        speak(it.term, c.speech);
      } else {
        store.recordMistake(key);
      }
      const fb = $("#typeFb", view);
      fb.hidden = false;
      fb.className = "type-feedback " + (ok ? "ok" : "no");
      fb.innerHTML = ok
        ? `✅ ${esc(t("mode.correct"))}`
        : `❌ ${esc(t("mode.wrong"))} · <strong>${esc(t("mode.answer"))}:</strong> <span class="${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</span>${it.reading ? ` <em>(${esc(it.reading)})</em>` : ""}`;
      input.disabled = true;
      const skip = $("#typeSkip", view);
      if (skip) skip.hidden = true;
      $("#typeCheck", view).textContent = qi >= deck.length - 1 ? t("flash.done") : t("mode.continue");
    }
    function onSubmit() {
      if (answered) {
        qi++;
        return paint();
      }
      const v = input.value;
      reveal(norm(v) !== "" && norm(v) === norm(exp));
    }
    $("#typeForm", view).onsubmit = (e) => {
      e.preventDefault();
      onSubmit();
    };
    $("#typeSkip", view).onclick = () => {
      if (!answered) reveal(false);
    };
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Enter") {
        const f = $("#typeForm", view);
        if (f) {
          e.preventDefault();
          f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event("submit", { cancelable: true }));
        }
      }
    },
    { signal }
  );
  paint();
}

/* =====================================================================
   LISTENING — hear the word (TTS), choose the meaning (term hidden).
   ===================================================================== */
export function renderListen(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const deck = l.items.map((it, i) => ({ c, it, key: `${c.id}/${l.id}#${i}` }));
  const back = `#/lesson/${c.id}/${l.id}`;
  mcSession(view, deck, ctx, {
    audioOnly: true,
    ask: t("listen.prompt"),
    title: t("listen.title"),
    backHash: back,
    backLabel: mean(l.title),
    counter: "listened",
    mode: "listen",
    onRetry: () => renderListen(view, [cid, lid], ctx),
  });
}

/* =====================================================================
   DICTATION — hear the word (TTS only) and type what you heard.
   The hardest recall drill in the app: no text prompt at all, so it trains
   listening and spelling together. Non-Latin scripts expect the romanization
   (same rule as the typing mode), so no IME is ever required.
   ===================================================================== */
export function renderDictation(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const back = `#/lesson/${c.id}/${l.id}`;
  const deck = shuffle(l.items.map((it, i) => ({ it, key: `${c.id}/${l.id}#${i}` })));
  const signal = ctx && ctx.signal;
  const SLOW = 0.6;
  let qi = 0,
    score = 0;
  if (signal) signal.addEventListener("abort", stopSpeak, { once: true });

  function paint() {
    if (qi >= deck.length) {
      store.srsReviewed(score);
      store.bumpCounter("dictated", score);
      return sessionResult(view, score, deck.length, back, mean(l.title), () => renderDictation(view, [cid, lid], ctx));
    }
    const { it, key } = deck[qi];
    const exp = expected(it);
    let answered = false;
    view.innerHTML = `
      <nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="quiz-wrap">
        <h2 class="visually-hidden">${esc(t("dictation.title"))}</h2>
        <div class="quiz-top">
          <div class="progress" aria-hidden="true"><i style="width:${(qi / deck.length) * 100}%"></i></div>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${deck.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">${esc(t("dictation.prompt"))}</div>
          <div class="dictation-play">
            <button class="speakbtn dictation-big" id="dicPlay" aria-label="${esc(t("dictation.replay"))}">🔊</button>
            <button class="btn btn--sm" id="dicSlow">🐢 ${esc(t("dictation.slow"))}</button>
          </div>
        </div>
        <form class="type-form" id="dicForm" autocomplete="off">
          <input class="type-input ${c.cjk ? "cjk" : ""}" id="dicInput" dir="${c.rtl ? "rtl" : "ltr"}"
            placeholder="${esc(t("dictation.placeholder"))}" aria-label="${esc(t("dictation.prompt"))}"
            autocapitalize="none" autocorrect="off" spellcheck="false" />
          <div class="type-feedback" id="dicFb" role="status" hidden></div>
          <div class="practice-bar" style="justify-content:center;margin-top:14px">
            <button type="button" class="btn btn--ghost" id="dicSkip">${esc(t("mode.skip"))}</button>
            <button type="submit" class="btn btn--accent" id="dicCheck">${esc(t("mode.check"))}</button>
          </div>
        </form>
      </div>`;
    const input = $("#dicInput", view);
    const play = (rate) => speak(it.term, c.speech, rate);
    $("#dicPlay", view).onclick = () => play();
    $("#dicSlow", view).onclick = () => play(SLOW);
    play();
    input.focus();

    function reveal(ok) {
      answered = true;
      store.recordAttempt("dictation", ok);
      if (ok) {
        score++;
        store.clearMistake(key);
      } else {
        store.recordMistake(key);
      }
      const fb = $("#dicFb", view);
      fb.hidden = false;
      fb.className = "type-feedback " + (ok ? "ok" : "no");
      fb.innerHTML =
        `${ok ? "✅ " + esc(t("mode.correct")) : "❌ " + esc(t("mode.wrong"))} · ` +
        `<span class="${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}"><strong>${esc(it.term)}</strong></span>` +
        `${it.reading ? ` <em>(${esc(it.reading)})</em>` : ""} — ${esc(mean(it.m))}`;
      input.disabled = true;
      const skip = $("#dicSkip", view);
      if (skip) skip.hidden = true;
      $("#dicCheck", view).textContent = qi >= deck.length - 1 ? t("flash.done") : t("mode.continue");
    }
    $("#dicForm", view).onsubmit = (e) => {
      e.preventDefault();
      if (answered) {
        qi++;
        return paint();
      }
      const v = input.value;
      reveal(norm(v) !== "" && norm(v) === norm(exp));
    };
    $("#dicSkip", view).onclick = () => {
      if (!answered) reveal(false);
    };
  }
  paint();
}

/* =====================================================================
   MATCH — tap a word then its meaning; clear all pairs against the clock.
   ===================================================================== */
export function renderMatch(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const back = `#/lesson/${c.id}/${l.id}`;
  const picks = shuffle(l.items.slice()).slice(0, Math.min(6, l.items.length));
  if (picks.length < 3) {
    view.innerHTML = emptyState("🔗", t("match.tooFew"), back, t("cloze.back"));
    return;
  }
  const left = shuffle(picks.map((it, i) => ({ it, id: i })));
  const right = shuffle(picks.map((it, i) => ({ it, id: i })));
  const signal = ctx && ctx.signal;
  let selected = null,
    matched = 0;
  const start = Date.now();

  view.innerHTML = `
    <nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>
    <div class="section-head"><div><span class="eyebrow">🔗 ${esc(t("match.title"))}</span><p style="margin:0">${esc(t("match.prompt"))}</p></div>
      <span class="chip" id="mTime">${esc(t("match.time"))} 0.0s</span></div>
    <div class="match-grid">
      <div class="match-col">${left.map((x) => `<button class="match-cell ${c.cjk ? "cjk" : ""}" data-side="l" data-id="${x.id}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(x.it.term)}</button>`).join("")}</div>
      <div class="match-col">${right.map((x) => `<button class="match-cell" data-side="r" data-id="${x.id}">${esc(mean(x.it.m))}</button>`).join("")}</div>
    </div>`;

  const timer = setInterval(() => {
    const el = $("#mTime", view);
    if (el) el.textContent = `${t("match.time")} ${((Date.now() - start) / 1000).toFixed(1)}s`;
  }, 100);
  const stop = () => clearInterval(timer);
  if (signal) signal.addEventListener("abort", stop, { once: true });

  function win() {
    stop();
    const secs = ((Date.now() - start) / 1000).toFixed(1);
    store.srsReviewed(picks.length);
    store.bumpCounter("matched", 1);
    view.innerHTML = `
      <div class="quiz-wrap"><div class="card quiz-result">
        <div class="emoji" style="font-size:3rem">🎉</div>
        <h2>${esc(t("match.win"))}</h2>
        <div class="scoreline">${esc(t("match.time"))} ${secs}s · ${picks.length} ${esc(t("quiz.correct"))}</div>
        <div class="practice-bar" style="justify-content:center;margin-top:18px">
          <button class="btn btn--ghost" id="mAgain">↻ ${esc(t("quiz.retry"))}</button>
          <button class="btn" id="mBack">${esc(mean(l.title))}</button>
        </div>
      </div></div>`;
    confetti();
    $("#mAgain", view).onclick = () => renderMatch(view, [cid, lid], ctx);
    $("#mBack", view).onclick = () => navigate(back);
  }

  function clearSel() {
    if (selected) selected.el.classList.remove("sel");
    selected = null;
  }

  $$(".match-cell", view).forEach((cell) => {
    cell.onclick = () => {
      if (cell.classList.contains("done")) return;
      const side = cell.dataset.side,
        id = +cell.dataset.id;
      if (!selected) {
        selected = { side, id, el: cell };
        cell.classList.add("sel");
        if (side === "l") speak(picks[id].it.term, c.speech);
        return;
      }
      if (selected.el === cell) return clearSel();
      if (selected.side === side) {
        // re-pick on the same column
        clearSel();
        selected = { side, id, el: cell };
        cell.classList.add("sel");
        if (side === "l") speak(picks[id].it.term, c.speech);
        return;
      }
      // opposite columns — check the pair
      if (selected.id === id) {
        selected.el.classList.remove("sel");
        // .done hides the pair visually — take it out of the tab order too.
        for (const el of [selected.el, cell]) {
          el.classList.add("done");
          el.disabled = true;
        }
        selected = null;
        matched++;
        speak(picks[id].it.term, c.speech);
        liveStatus(`${t("mode.correct")} — ${matched}/${picks.length}`);
        if (matched === picks.length) win();
      } else {
        const a = selected.el;
        a.classList.add("bad");
        cell.classList.add("bad");
        liveStatus(t("mode.wrong"));
        clearSel();
        setTimeout(() => {
          a.classList.remove("bad");
          cell.classList.remove("bad");
        }, 500);
      }
    };
  });
}

/* =====================================================================
   QUICK MIX — 10 mixed questions across the words you've learned
   (seeded with starter words so brand-new users can still play).
   ===================================================================== */
function mixedPool() {
  let pool = store.srsPool();
  if (pool.length < 4) {
    for (const c of COURSES) {
      const l = c.lessons[0];
      if (l) l.items.slice(0, 4).forEach((it, i) => pool.push({ key: `${c.id}/${l.id}#${i}`, c, l, it }));
      if (pool.length > 60) break;
    }
  }
  return pool;
}
export function renderDailyMix(view, _params, ctx) {
  const deck = shuffle(mixedPool()).slice(0, 10);
  if (!deck.length) {
    view.innerHTML = emptyState("🎲", t("mix.empty"), "#/courses", t("home.browse"));
    return;
  }
  mcSession(view, deck, ctx, {
    ask: t("quiz.q"),
    backHash: "#/home",
    backLabel: t("nav.home"),
    mode: "mix",
    onRetry: () => renderDailyMix(view, _params, ctx),
  });
}

/* =====================================================================
   FIX MISTAKES — focused review of words you've answered wrong.
   ===================================================================== */
export function renderMistakes(view, _params, ctx) {
  const deck = store.mistakePool();
  if (!deck.length) {
    view.innerHTML = emptyState("🎉", t("mistakes.empty"), "#/progress", t("review.back"));
    return;
  }
  mcSession(view, deck, ctx, {
    ask: t("quiz.q"),
    backHash: "#/progress",
    backLabel: t("mistakes.title"),
    mode: "mistakes",
    onRetry: () => renderMistakes(view, _params, ctx),
  });
}

/* =====================================================================
   SPEAKING — say the word out loud; the browser's speech recogniser scores it.
   Chrome/Edge only; degrades to a friendly notice elsewhere.
   ===================================================================== */
export function renderSpeak(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const back = `#/lesson/${c.id}/${l.id}`;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    view.innerHTML =
      `<nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>` +
      emptyState("🎤", t("speak.unsupported"), back, t("cloze.back"));
    return;
  }
  const deck = shuffle(l.items.slice());
  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0,
    rec = null,
    busy = false;
  const stopRec = () => {
    try {
      if (rec) {
        rec.onresult = rec.onerror = rec.onend = null;
        rec.abort();
      }
    } catch (e) {}
    rec = null;
    busy = false;
  };
  if (signal) signal.addEventListener("abort", stopRec, { once: true });

  function paint() {
    if (qi >= deck.length) {
      store.srsReviewed(score);
      store.bumpCounter("spoken", score);
      return sessionResult(view, score, deck.length, back, mean(l.title), () => renderSpeak(view, [cid, lid], ctx));
    }
    const it = deck[qi];
    let gotIt = false;
    view.innerHTML = `
      <nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="quiz-wrap">
        <div class="quiz-top">
          <div class="progress" aria-hidden="true"><i style="width:${(qi / deck.length) * 100}%"></i></div>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${deck.length}</span>
        </div>
        <div class="card quiz-q">
          <div class="ask">${esc(t("speak.prompt"))}</div>
          <div class="term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>
          ${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}
          <div class="vocab__meaning" style="margin-top:6px;color:var(--text-dim)">${esc(mean(it.m))}</div>
          <button class="speakbtn" data-speak="${esc(it.term)}" style="margin:10px auto 0">🔊</button>
        </div>
        <div class="speak-zone">
          <button class="mic-btn" id="micBtn" aria-label="${esc(t("speak.tap"))}">🎤</button>
          <div class="speak-hint" id="micHint">${esc(t("speak.tap"))}</div>
          <div class="type-feedback" id="micFb" role="status" hidden></div>
        </div>
        <div class="practice-bar" style="justify-content:center">
          <button class="btn btn--ghost" id="spkSkip">${esc(t("mode.skip"))}</button>
          <button class="btn btn--accent" id="spkNext" disabled>${qi >= deck.length - 1 ? esc(t("flash.done")) : esc(t("mode.continue"))}</button>
        </div>
      </div>`;
    wireSpeak(view, c);
    const micBtn = $("#micBtn", view),
      hint = $("#micHint", view),
      fb = $("#micFb", view),
      nextBtn = $("#spkNext", view);

    micBtn.onclick = () => {
      if (busy) return;
      busy = true;
      micBtn.classList.add("listening");
      hint.textContent = t("speak.listening");
      rec = new SR();
      rec.lang = c.speech || "en-US";
      rec.interimResults = false;
      rec.maxAlternatives = 4;
      rec.onresult = (e) => {
        const alts = [];
        for (let k = 0; k < e.results[0].length; k++) alts.push(e.results[0][k].transcript);
        const heard = alts[0] || "";
        const nt = norm(it.term),
          nr = norm(expected(it));
        const ok = alts.some((a) => {
          const na = norm(a);
          return na && (na === nt || na === nr || na.includes(nt) || nt.includes(na));
        });
        if (ok && !gotIt) {
          gotIt = true;
          score++;
          store.clearMistake(`${c.id}/${l.id}#${l.items.indexOf(it)}`);
        }
        store.recordAttempt("speak", ok);
        fb.hidden = false;
        fb.className = "type-feedback " + (ok ? "ok" : "no");
        fb.innerHTML = ok
          ? `✅ ${esc(t("mode.correct"))} · <em>${esc(t("speak.heard"))}: ${esc(heard)}</em>`
          : `❌ ${esc(t("speak.tryAgain"))} · <em>${esc(t("speak.heard"))}: ${esc(heard || "—")}</em>`;
        nextBtn.disabled = false;
      };
      rec.onerror = (e) => {
        fb.hidden = false;
        fb.className = "type-feedback no";
        fb.textContent = e && e.error === "not-allowed" ? t("speak.noMic") : t("speak.tryAgain");
        nextBtn.disabled = false;
      };
      rec.onend = () => {
        busy = false;
        micBtn.classList.remove("listening");
        hint.textContent = t("speak.tap");
      };
      try {
        rec.start();
      } catch (e) {
        busy = false;
        micBtn.classList.remove("listening");
      }
    };
    $("#spkSkip", view).onclick = () => {
      stopRec();
      qi++;
      paint();
    };
    nextBtn.onclick = () => {
      stopRec();
      qi++;
      paint();
    };
  }
  paint();
}

/* =====================================================================
   HANDS-FREE AUDIO — autoplay a lesson's words with adjustable TTS speed.
   ===================================================================== */
export function renderAudio(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const back = `#/lesson/${c.id}/${l.id}`;
  const items = l.items;
  const signal = ctx && ctx.signal;
  const RATES = [0.7, 0.9, 1.1];
  let i = 0,
    playing = false,
    ri = 1;
  if (signal)
    signal.addEventListener(
      "abort",
      () => {
        playing = false;
        stopSpeak();
      },
      { once: true }
    );

  function paint() {
    const it = items[i];
    view.innerHTML = `
      <nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="section-head"><div><span class="eyebrow">🎧 ${esc(t("audio.title"))}</span><p style="margin:0">${esc(t("audio.sub"))}</p></div>
        <span class="chip">${i + 1} / ${items.length}</span></div>
      <div class="card audio-card">
        <div class="audio-term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>
        ${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}
        <div class="audio-mean">${esc(mean(it.m))}</div>
      </div>
      <div class="audio-controls">
        <button class="btn btn--ghost" id="auPrev" aria-label="prev">⏮</button>
        <button class="btn btn--accent" id="auPlay">${playing ? "⏸ " + esc(t("audio.pause")) : "▶ " + esc(t("audio.play"))}</button>
        <button class="btn btn--ghost" id="auNext" aria-label="next">⏭</button>
        <button class="btn" id="auRate" title="${esc(t("audio.speed"))}">${RATES[ri]}×</button>
      </div>`;
    $("#auPrev", view).onclick = () => {
      stopSpeak();
      i = (i - 1 + items.length) % items.length;
      refresh();
    };
    $("#auNext", view).onclick = () => {
      stopSpeak();
      i = (i + 1) % items.length;
      refresh();
    };
    $("#auRate", view).onclick = () => {
      ri = (ri + 1) % RATES.length;
      stopSpeak();
      refresh();
    };
    $("#auPlay", view).onclick = () => {
      playing = !playing;
      paint();
      if (playing) playCurrent();
      else stopSpeak();
    };
  }
  function refresh() {
    paint();
    if (playing) playCurrent();
  }
  function playCurrent() {
    const it = items[i];
    speak(it.term, c.speech, RATES[ri], () => {
      if (!playing) return;
      setTimeout(() => {
        if (!playing) return;
        if (i < items.length - 1) {
          i++;
          paint();
          playCurrent();
        } else {
          playing = false;
          store.bumpCounter("audioDone", 1);
          paint();
        }
      }, 650);
    });
  }
  paint();
}

/* =====================================================================
   SENTENCE BUILDER — reorder scrambled words into the correct sentence.
   Space-separated scripts only (skips CJK / Thai).
   ===================================================================== */
export function renderBuild(view, [cid, lid], ctx) {
  const c = findCourse(cid);
  const l = findLesson(c, lid);
  if (!c || !l) return notFound(view);
  const back = `#/lesson/${c.id}/${l.id}`;
  const crumb = `<nav class="crumb"><a href="${back}">‹ ${esc(mean(l.title))}</a></nav>`;
  if (c.cjk || c.id === "th") {
    view.innerHTML = crumb + emptyState("🧩", t("build.unsupported"), back, t("cloze.back"));
    return;
  }
  const built = l.items
    .filter((it) => it.ex && it.ex.t)
    .map((it) => ({ it, words: it.ex.t.replace(/[.,!?¡¿;:"“”]/g, "").split(/\s+/).filter(Boolean) }))
    .filter((q) => q.words.length >= 3 && q.words.length <= 10);
  if (!built.length) {
    view.innerHTML = crumb + emptyState("🧩", t("build.none"), back, t("cloze.back"));
    return;
  }
  const qs = shuffle(built);
  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0;

  function paint() {
    if (qi >= qs.length) {
      store.srsReviewed(score);
      store.bumpCounter("built", score);
      return sessionResult(view, score, qs.length, back, mean(l.title), () => renderBuild(view, [cid, lid], ctx));
    }
    const q = qs[qi];
    const bank = shuffle(q.words.map((w, idx) => ({ w, idx })));
    let answer = [],
      done = false;
    view.innerHTML = `
      ${crumb}
      <div class="quiz-wrap">
        <div class="quiz-top"><div class="progress" aria-hidden="true"><i style="width:${(qi / qs.length) * 100}%"></i></div><span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${qs.length}</span></div>
        <div class="card quiz-q"><div class="ask">🧩 ${esc(t("build.prompt"))}</div><div class="build-mean">${esc(mean(q.it.ex.m))}</div></div>
        <div class="build-answer" id="buildAns" aria-live="polite"></div>
        <div class="build-bank" id="buildBank"></div>
        <div class="type-feedback" id="buildFb" role="status" hidden></div>
        <div class="practice-bar" style="justify-content:center">
          <button class="btn btn--ghost" id="buildUndo">↶ ${esc(t("build.undo"))}</button>
          <button class="btn btn--accent" id="buildCheck">${esc(t("mode.check"))}</button>
        </div>
      </div>`;
    const ansEl = $("#buildAns", view),
      bankEl = $("#buildBank", view),
      fb = $("#buildFb", view),
      checkBtn = $("#buildCheck", view);
    function renderChips() {
      ansEl.innerHTML =
        answer.map((a, k) => `<button class="chip-word" data-a="${k}">${esc(a.w)}</button>`).join("") ||
        `<span class="build-placeholder">${esc(t("build.placeholder"))}</span>`;
      bankEl.innerHTML = bank
        .map((b) => `<button class="chip-word" data-b="${b.idx}" ${answer.some((a) => a.bidx === b.idx) ? "disabled" : ""}>${esc(b.w)}</button>`)
        .join("");
      $$("[data-b]", bankEl).forEach(
        (btn) =>
          (btn.onclick = () => {
            if (done) return;
            const bidx = +btn.dataset.b;
            answer.push({ w: bank.find((b) => b.idx === bidx).w, bidx });
            renderChips();
          })
      );
      $$("[data-a]", ansEl).forEach(
        (btn) =>
          (btn.onclick = () => {
            if (done) return;
            answer.splice(+btn.dataset.a, 1);
            renderChips();
          })
      );
    }
    renderChips();
    $("#buildUndo", view).onclick = () => {
      if (done || !answer.length) return;
      answer.pop();
      renderChips();
    };
    checkBtn.onclick = () => {
      if (done) {
        qi++;
        return paint();
      }
      const ok = answer.map((a) => a.w).join(" ") === q.words.join(" ");
      done = true;
      store.recordAttempt("build", ok);
      if (ok) {
        score++;
        speak(q.it.ex.t, c.speech);
      }
      fb.hidden = false;
      fb.className = "type-feedback " + (ok ? "ok" : "no");
      fb.innerHTML = ok ? `✅ ${esc(t("mode.correct"))}` : `❌ ${esc(t("mode.wrong"))} · <em>${esc(q.words.join(" "))}</em>`;
      checkBtn.textContent = qi >= qs.length - 1 ? t("flash.done") : t("mode.continue");
      $("#buildUndo", view).hidden = true;
    };
  }
  paint();
}

/* =====================================================================
   SCRIPT TRAINER — flashcards over a writing system (hiragana, hangul…).
   ===================================================================== */
export function renderScript(view, [sid], ctx) {
  const s = findScript(sid);
  if (!s) return notFound(view);
  const chars = s.chars;
  const total = chars.length;
  const signal = ctx && ctx.signal;
  let i = 0,
    flipped = false;

  function paint() {
    const ch = chars[i];
    view.innerHTML = `
      <nav class="crumb"><a href="#/courses">${esc(t("courses.title"))}</a><span class="sep">/</span><span>${esc(mean(s.name))}</span></nav>
      <div class="section-head"><div><span class="eyebrow">🔡 ${esc(t("script.title"))}</span><h2>${esc(s.flag)} ${esc(mean(s.name))}</h2></div></div>
      <div class="flash-wrap">
        <div class="flash-count">${i + 1} / ${total}</div>
        <div class="flashcard" id="scCard" tabindex="0" role="button" aria-label="${esc(t("flash.tap"))}">
          <div class="flashcard__inner">
            <div class="flashcard__face flashcard__front">
              <div class="big ${s.cjk ? "cjk" : ""}" dir="${s.rtl ? "rtl" : "ltr"}" style="font-size:clamp(3.2rem,17vw,5.5rem)">${esc(ch.ch)}</div>
              <div class="flashcard__hint">${esc(t("flash.tap"))}</div>
            </div>
            <div class="flashcard__face flashcard__back">
              <div class="big">${esc(ch.rom)}</div>
            </div>
          </div>
        </div>
        <div class="flash-actions">
          <button class="btn btn--ghost" id="scPrev">‹ ${esc(t("flash.prev"))}</button>
          <button class="btn" id="scSpeak" aria-label="🔊">🔊</button>
          <button class="btn btn--accent" id="scNext">${i === total - 1 ? esc(t("flash.done")) : esc(t("flash.next")) + " ›"}</button>
        </div>
      </div>`;
    const card = $("#scCard", view);
    card.onclick = () => {
      flipped = !flipped;
      card.classList.toggle("flipped", flipped);
    };
    $("#scPrev", view).onclick = () => {
      if (i > 0) {
        i--;
        flipped = false;
        paint();
      }
    };
    $("#scNext", view).onclick = () => {
      if (i < total - 1) {
        i++;
        flipped = false;
        paint();
      } else {
        store.bumpCounter("scriptDone", 1);
        confetti();
        toast(t("script.done"));
        navigate("#/courses");
      }
    };
    $("#scSpeak", view).onclick = () => speak(ch.ch, s.speech);
    speak(ch.ch, s.speech);
  }

  document.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "ArrowRight") {
        const b = $("#scNext", view);
        if (b) b.click();
      } else if (e.key === "ArrowLeft") {
        const b = $("#scPrev", view);
        if (b) b.click();
      } else if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        const card = $("#scCard", view);
        if (card) card.click();
      }
    },
    { signal }
  );
  paint();
}

/* =====================================================================
   FAVORITES — multiple-choice review over your starred words.
   ===================================================================== */
export function renderFavorites(view, _params, ctx) {
  const pool = store.favPool();
  if (!pool.length) {
    view.innerHTML = emptyState("⭐", t("fav.empty"), "#/courses", t("home.browse"));
    return;
  }
  mcSession(view, pool, ctx, {
    ask: t("quiz.q"),
    backHash: "#/progress",
    backLabel: t("fav.title"),
    mode: "fav",
    onRetry: () => renderFavorites(view, _params, ctx),
  });
}
