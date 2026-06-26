/* =========================================================================
   views/partials.js — Reusable HTML builders + wiring shared across views.
   ========================================================================= */
import { $$, esc, mean, initials } from "../core/dom.js";
import { speak } from "../core/ui.js";
import { courseProgress } from "../core/state.js";
import { navigate } from "../core/router.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);

export function courseCardHTML(c) {
  const p = courseProgress(c);
  const totalWords = c.lessons.reduce((n, l) => n + l.items.length, 0);
  const cta = p.done > 0 ? t("courses.continue") : t("courses.start");
  return `
    <article class="card course-card" data-course="${esc(c.id)}" tabindex="0" role="button" aria-label="${esc(mean(c.name))}">
      <div class="course-card__top">
        <div class="flag">${esc(c.flag)}</div>
        <div>
          <h3>${esc(mean(c.name))}</h3>
          <div class="native" dir="${c.rtl ? "rtl" : "ltr"}">${esc(c.native)}</div>
        </div>
      </div>
      <div class="course-card__body">
        <div class="course-card__meta">
          <span class="chip chip--brand">${c.lessons.length} ${esc(t("courses.lessons"))}</span>
          <span class="chip">${totalWords} ${esc(t("words"))}</span>
        </div>
        <div class="progress"><i style="width:${p.pct}%"></i></div>
        <div class="course-card__foot">
          <small>${p.done}/${p.total} • ${p.pct}%</small>
          <span class="btn btn--sm">${esc(cta)} →</span>
        </div>
      </div>
    </article>`;
}

export function wireCourseCards(root) {
  $$(".course-card", root).forEach((el) => {
    const id = el.dataset.course;
    const open = () => navigate(`#/course/${id}`);
    el.addEventListener("click", open);
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        open();
      }
    });
  });
}

export function lessonRowHTML(c, l, i, state) {
  const done = state.doneLessons[`${c.id}/${l.id}`];
  const best = state.quizScores[`${c.id}/${l.id}`];
  return `
    <div class="lesson-row ${done ? "done" : ""}" data-lesson="${esc(l.id)}" tabindex="0" role="button">
      <div class="lesson-row__num">${done ? "✓" : i + 1}</div>
      <div class="lesson-row__main">
        <h3>${esc(l.icon)} ${esc(mean(l.title))}</h3>
        <p>${l.items.length} ${esc(t("words"))}${best != null ? ` • ${esc(t("lesson.quiz"))} ${best}%` : ""} • ${esc(t("diff." + l.level))}</p>
      </div>
      <div class="lesson-row__arrow">›</div>
    </div>`;
}

export function vocabHTML(c, it) {
  return `
    <div class="vocab">
      <div class="vocab__left" style="min-width:0">
        <div class="vocab__term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>
        ${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}
      </div>
      <div class="vocab__mid">
        <div class="vocab__meaning">${esc(mean(it.m))}</div>
        ${it.ex ? `<div class="vocab__ex">“${esc(it.ex.t)}” — ${esc(mean(it.ex.m))}</div>` : ""}
      </div>
      <button class="speakbtn" data-speak="${esc(it.term)}" aria-label="${esc(t("lesson.flashcards"))}">🔊</button>
    </div>`;
}

export function wireSpeak(root, c) {
  $$("[data-speak]", root).forEach((b) => {
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      speak(b.dataset.speak, c.speech);
    });
  });
}

export function progRowHTML(c) {
  const p = courseProgress(c);
  return `
    <a class="lesson-row" href="#/course/${esc(c.id)}" style="text-decoration:none">
      <div class="flag" style="width:42px;height:42px;font-size:1.4rem">${esc(c.flag)}</div>
      <div class="lesson-row__main">
        <h3>${esc(mean(c.name))}</h3>
        <div class="progress" style="margin-top:8px"><i style="width:${p.pct}%"></i></div>
      </div>
      <div style="font-weight:800;color:var(--brand)">${p.pct}%</div>
    </a>`;
}

/** Initials avatar. `name` is user-controlled → escaped here. */
export function avatarHTML(name, extraClass = "") {
  return `<span class="avatar ${extraClass}" aria-hidden="true">${esc(initials(name))}</span>`;
}

export function notFound(view) {
  view.innerHTML = `<div class="empty"><div class="emoji">🧭</div><h2>404</h2><p>Halaman tidak ditemukan / Page not found.</p><a class="btn" href="#/home" style="margin-top:12px">${esc(t("nav.home"))}</a></div>`;
}
