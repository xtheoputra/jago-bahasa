/* =========================================================================
   views/exam.js — the stage exam and the certificate it earns.

     #/exam/:lang/:band   15 questions drawn from the whole stage
     #/cert/:lang         the certificate, printable to paper or PDF

   Deliberately unlike every other mode in the app: nothing is revealed while
   you sit the paper. Instant feedback is what practice is for; an exam has to
   let you be wrong and find out afterwards, which is also why the result
   screen ends with the list of what you missed.
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { toast, confetti, liveStatus } from "../core/ui.js";
import * as store from "../core/state.js";
import { COURSES, findCourse } from "../data.js";
import { BANDS, BAND_INFO, getLexicon } from "../lexicon.js";
import { buildExam, PASS_PCT, EXAM_QUESTIONS } from "../core/exam.js";
import { navigate } from "../core/router.js";
import { session } from "../auth/session.js";
import { notFound } from "./partials.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);
const tri = (a) => (Array.isArray(a) ? a[["id", "en", "es"].indexOf(I18N.current)] || a[0] : a || "");

/* =====================================================================
   #/exam/:lang/:band
   ===================================================================== */
export function renderExam(view, [lang, band], ctx) {
  const c = findCourse(lang);
  const book = getLexicon(lang);
  if (!c || !BANDS.includes(band)) return notFound(view);

  const paper = buildExam(c, book, band, EXAM_QUESTIONS);
  if (!paper) {
    view.innerHTML = `<div class="empty"><div class="emoji">🎓</div><h2>${esc(t("exam.empty"))}</h2>
      <a class="btn" href="#/path/${esc(c.id)}" style="margin-top:12px">${esc(t("path.cta"))}</a></div>`;
    return;
  }

  const signal = ctx && ctx.signal;
  let qi = 0,
    score = 0,
    locked = false,
    advTimer = null;
  const wrong = [];
  if (signal) signal.addEventListener("abort", () => clearTimeout(advTimer), { once: true });

  const ASK = { mean: "exam.askMean", term: "exam.askTerm", gap: "exam.askGap" };

  function paint() {
    if (qi >= paper.length) return finish();
    const q = paper[qi];
    view.innerHTML = `
      <h2 class="visually-hidden">${esc(t("exam.title"))}</h2>
      <nav class="crumb"><a href="#/path/${esc(c.id)}">‹ ${esc(t("path.cta"))}</a></nav>
      <div class="quiz-wrap">
        <div class="quiz-top">
          <div class="progress" aria-hidden="true"><i style="width:${(qi / paper.length) * 100}%"></i></div>
          <span class="chip chip--band chip--band-${esc(band)}">${esc(band)}</span>
          <span class="chip">${qi + 1} ${esc(t("quiz.of"))} ${paper.length}</span>
        </div>
        <div class="card quiz-q exam-q">
          <div class="ask">${esc(t(ASK[q.type]))}</div>
          <div class="exam-prompt ${q.type === "mean" ? "drill-def" : ""} ${q.type !== "term" ? "" : c.cjk ? "cjk" : ""}"
               dir="${q.type === "term" && c.rtl ? "rtl" : "ltr"}">${esc(q.prompt)}</div>
          ${q.sub ? `<div class="drill-gloss">${esc(q.sub)}</div>` : ""}
        </div>
        <div class="quiz-options">
          ${q.options.map((o, k) => `<button class="quiz-opt ${q.script && c.cjk ? "cjk" : ""}"
             dir="${q.script && c.rtl ? "rtl" : "ltr"}" data-k="${k}">${esc(o)}</button>`).join("")}
        </div>
        <p class="exam-note">${esc(t("exam.noReveal"))}</p>
      </div>`;

    locked = false;
    $$(".quiz-opt", view).forEach((btn) => {
      btn.onclick = () => {
        if (locked) return;
        locked = true;
        const chosen = q.options[+btn.dataset.k];
        const correct = chosen === q.answer;
        // No .correct/.wrong classes here on purpose — under exam conditions
        // the paper only acknowledges that an answer was recorded.
        $$(".quiz-opt", view).forEach((b) => {
          b.disabled = true;
          if (b === btn) b.classList.add("chosen");
        });
        liveStatus(`${qi + 1}/${paper.length} — ${t("exam.recorded")}`);
        store.recordAttempt("exam", correct);
        // An exam question is still a review: it schedules the word it asked
        // about, exactly as the drill and the lessons do.
        if (q.key) {
          store.srsGrade(q.key, correct ? "good" : "again");
          if (correct) store.clearMistake(q.key);
          else store.recordMistake(q.key);
        }
        if (correct) score++;
        else wrong.push(q);
        advTimer = setTimeout(() => {
          if (signal && signal.aborted) return;
          qi++;
          paint();
        }, 420);
      };
    });
  }

  function finish() {
    const pct = Math.round((score / paper.length) * 100);
    const res = store.recordExam(c.id, band, pct);
    if (res.gain) toast(t("toast.lessonDone", res.gain));
    const circ = 2 * Math.PI * 54;
    const info = BAND_INFO[band];

    view.innerHTML = `
      <div class="quiz-wrap">
        <div class="card quiz-result ${res.passed ? "exam-result--pass" : ""}">
          <svg class="ring" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="var(--surface-3)" stroke-width="11"/>
            <circle cx="60" cy="60" r="54" fill="none" stroke="url(#eg1)" stroke-width="11" stroke-linecap="round"
              stroke-dasharray="${circ}" stroke-dashoffset="${circ - (pct / 100) * circ}" transform="rotate(-90 60 60)"/>
            <defs><linearGradient id="eg1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6d5efc"/><stop offset="1" stop-color="#ff9f43"/></linearGradient></defs>
            <text x="60" y="68" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${pct}%</text>
          </svg>
          <h2>${res.passed ? `🎓 ${esc(t("exam.passed"))}` : esc(t("exam.failed"))}</h2>
          <div class="scoreline">${score} / ${paper.length} ${esc(t("quiz.correct"))} · ${esc(t("exam.passMark", PASS_PCT))}</div>
          ${res.gain ? `<div class="xp-pop">+${res.gain} XP⭐</div>` : ""}
          <p class="exam-verdict">${esc(res.passed
            ? t("exam.verdictPass", `${band} — ${tri(info.name)}`)
            : t("exam.verdictFail"))}</p>

          ${wrong.length ? `
          <div class="exam-review">
            <h3>${esc(t("exam.review"))}</h3>
            <ul class="exam-misses">
              ${wrong.map((q) => `<li>
                <a href="#/entry/${encodeURIComponent(c.id)}/${encodeURIComponent(q.term)}"
                   class="${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(q.term)}</a>
                <span>${esc(q.type === "term" ? q.answer : q.prompt)}</span>
              </li>`).join("")}
            </ul>
          </div>` : ""}

          <div class="practice-bar" style="justify-content:center;margin-top:18px;flex-wrap:wrap">
            ${res.passed ? `<a class="btn" href="#/cert/${esc(c.id)}">📜 ${esc(t("cert.open"))}</a>` : ""}
            <button class="btn btn--ghost" id="eretry">↻ ${esc(t("exam.retry"))}</button>
            ${res.passed ? "" : `<a class="btn btn--ghost btn--sm" href="#/drill/${esc(c.id)}/${esc(band)}">📖 ${esc(t("drill.go"))}</a>`}
            <button class="btn ${res.passed ? "btn--ghost" : ""}" id="eback">${esc(t("path.cta"))}</button>
          </div>
        </div>
      </div>`;
    if (res.passed) confetti();
    $("#eretry").onclick = () => renderExam(view, [lang, band], ctx);
    $("#eback").onclick = () => navigate(`#/path/${c.id}`);
  }

  paint();
}

/* =====================================================================
   #/cert/:lang — what the exams add up to
   ===================================================================== */
export function renderCertificate(view, [lang]) {
  const c = findCourse(lang) || COURSES.find((x) => x.id === lang);
  if (!c) return notFound(view);
  const bands = store.certifiedBands(c.id);
  const top = bands.length ? bands[bands.length - 1] : null;

  if (!top) {
    view.innerHTML = `<div class="empty"><div class="emoji">📜</div><h2>${esc(t("cert.none"))}</h2>
      <p>${esc(t("cert.noneSub"))}</p>
      <a class="btn" href="#/path/${esc(c.id)}" style="margin-top:12px">${esc(t("path.cta"))}</a></div>`;
    return;
  }

  const user = session.user;
  const learner = (user && (user.name || user.email)) || t("cert.learner");
  const rec = store.examResult(c.id, top) || {};
  const info = BAND_INFO[top];

  view.innerHTML = `
    <nav class="crumb no-print"><a href="#/path/${esc(c.id)}">‹ ${esc(t("path.cta"))}</a></nav>
    <section class="cert" aria-label="${esc(t("cert.title"))}">
      <div class="cert__inner">
        <div class="cert__seal" aria-hidden="true">🎓</div>
        <p class="cert__eyebrow">${esc(t("cert.of"))}</p>
        <h1 class="cert__lang">${esc(c.flag)} ${esc(mean(c.name))}</h1>
        <p class="cert__awarded">${esc(t("cert.awarded"))}</p>
        <p class="cert__name">${esc(learner)}</p>
        <p class="cert__for">${esc(t("cert.for"))}</p>
        <p class="cert__band"><span class="chip chip--band chip--band-${esc(top)}">${esc(top)}</span> ${esc(tri(info.name))}</p>
        <ul class="cert__can">${info.can.map((k) => `<li>${esc(tri(k))}</li>`).join("")}</ul>
        <div class="cert__meta">
          <div><small>${esc(t("cert.stages"))}</small><strong>${bands.map(esc).join(" · ")}</strong></div>
          <div><small>${esc(t("cert.best"))}</small><strong>${rec.best || 0}%</strong></div>
          <div><small>${esc(t("cert.date"))}</small><strong>${esc(rec.at || store.todayISO())}</strong></div>
        </div>
        <p class="cert__foot">Jago Bahasa · ${esc(t("cert.selfIssued"))}</p>
      </div>
    </section>
    <div class="practice-bar no-print" style="justify-content:center;margin-top:16px;flex-wrap:wrap">
      <button class="btn" id="cprint">🖨️ ${esc(t("cert.print"))}</button>
      <a class="btn btn--ghost" href="#/path/${esc(c.id)}">${esc(t("path.cta"))}</a>
    </div>`;

  $("#cprint").onclick = () => {
    try {
      window.print();
    } catch (e) {
      toast(t("cert.printFail"));
    }
  };
}
