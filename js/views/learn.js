/* =========================================================================
   views/learn.js — Content views: home, courses, course, lesson, progress, about.
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { toast, confetti } from "../core/ui.js";
import * as store from "../core/state.js";
import { COURSES, findCourse, findLesson } from "../data.js";
import {
  courseCardHTML, wireCourseCards, lessonRowHTML, vocabHTML, wireSpeak, progRowHTML, notFound,
} from "./partials.js";
import { navigate, rerender } from "../core/router.js";
import { session } from "../auth/session.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);
const GUEST_BANNER_KEY = "jb.guestBanner.dismissed";

/* =====================================================================
   HOME
   ===================================================================== */
function dayLetter(iso) {
  const wd = new Date(iso).getDay();
  const set = I18N.current === "id" ? ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  return set[wd];
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

export function renderHome(view) {
  const st = store.getState();
  const lvl = store.levelFromXp(st.xp);
  const last = st.lastCourse ? findCourse(st.lastCourse) : null;
  const popular = COURSES.slice(0, 4);

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
  wireCourseCards(view);
}

/* =====================================================================
   COURSES
   ===================================================================== */
export function renderCourses(view) {
  view.innerHTML = `
    <div class="section-head"><div><h2>${esc(t("courses.title"))}</h2><p>${esc(t("courses.sub"))}</p></div></div>
    <div class="grid cols-auto">${COURSES.map(courseCardHTML).join("")}</div>
  `;
  wireCourseCards(view);
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
        <div class="progress"><i style="width:${p.pct}%"></i></div>
      </div>
    </div>
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
      <div><span class="eyebrow">${esc(t("lesson.vocab"))}</span><h2>${esc(l.icon)} ${esc(mean(l.title))}</h2><p>${esc(t("lesson.intro"))}</p></div>
    </div>

    <div class="vocab-list">
      ${l.items.map((it) => vocabHTML(c, it)).join("")}
    </div>

    <div class="practice-bar">
      <button class="btn" id="goFlash">🃏 ${esc(t("lesson.flashcards"))}</button>
      <button class="btn btn--accent" id="goQuiz">🧠 ${esc(t("lesson.quiz"))}</button>
      <button class="btn btn--ghost" id="markDone" ${done ? "disabled" : ""}>${done ? "✓ " + esc(t("lesson.done")) : esc(t("lesson.done"))}</button>
    </div>
  `;

  wireSpeak(view, c);
  $("#goFlash").onclick = () => navigate(`#/flashcards/${c.id}/${l.id}`);
  $("#goQuiz").onclick = () => navigate(`#/quiz/${c.id}/${l.id}`);
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
  { id: "poly", emoji: "🌍", name: { id: "Poliglot", en: "Polyglot", es: "Políglota" }, desc: { id: "Coba 3 bahasa berbeda", en: "Try 3 languages", es: "Prueba 3 idiomas" }, test: () => store.languagesTouched() >= 3 },
  { id: "streak3", emoji: "📅", name: { id: "Konsisten", en: "Consistent", es: "Constante" }, desc: { id: "Beruntun 3 hari", en: "3-day streak", es: "Racha de 3 días" }, test: () => store.getState().streak >= 3 },
  { id: "words50", emoji: "📚", name: { id: "Kutu Buku", en: "Bookworm", es: "Ratón de biblioteca" }, desc: { id: "Pelajari 50 kata", en: "Learn 50 words", es: "Aprende 50 palabras" }, test: () => store.wordsLearned() >= 50 },
  { id: "lvl5", emoji: "🏆", name: { id: "Sang Juara", en: "Champion", es: "Campeón" }, desc: { id: "Capai Level 5", en: "Reach Level 5", es: "Alcanza nivel 5" }, test: () => store.levelFromXp(store.getState().xp) >= 5 },
];

export function renderProgress(view) {
  const st = store.getState();
  const lvl = store.levelFromXp(st.xp);
  const into = store.xpIntoLevel(st.xp);
  const any = store.doneCount() > 0 || st.xp > 0;

  view.innerHTML = `
    <div class="section-head"><div><h2>${esc(t("progress.title"))}</h2><p>${esc(t("progress.sub"))}</p></div></div>

    <div class="card" style="padding:22px;margin-bottom:20px">
      <div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
        <div style="width:64px;height:64px;border-radius:50%;display:grid;place-items:center;font-size:1.6rem;font-weight:800;color:#fff;background:linear-gradient(135deg,var(--brand),var(--brand-700))">${lvl}</div>
        <div style="flex:1 1 240px">
          <div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:6px"><span>${esc(t("level"))} ${lvl}</span><span style="color:var(--text-dim)">${into} / 200 XP</span></div>
          <div class="progress"><i style="width:${(into / 200) * 100}%"></i></div>
        </div>
      </div>
      <div class="stats" style="margin-top:18px">
        <div class="card stat" style="background:var(--surface-2)"><div class="num">⭐ ${st.xp}</div><div class="lbl">${esc(t("stat.xp"))}</div></div>
        <div class="card stat" style="background:var(--surface-2)"><div class="num">🔥 ${st.streak}</div><div class="lbl">${esc(t("home.streak"))}</div></div>
        <div class="card stat" style="background:var(--surface-2)"><div class="num">🎓 ${store.doneCount()}</div><div class="lbl">${esc(t("stat.lessons"))}</div></div>
        <div class="card stat" style="background:var(--surface-2)"><div class="num">📖 ${store.wordsLearned()}</div><div class="lbl">${esc(t("stat.words"))}</div></div>
      </div>
    </div>

    ${any ? `
    <div class="section-head"><h2 style="font-size:1.2rem">${esc(t("progress.byLang"))}</h2></div>
    <div class="grid" style="gap:12px;margin-bottom:24px">
      ${COURSES.filter((c) => store.courseProgress(c).done > 0).map(progRowHTML).join("") || `<p style="color:var(--text-dim)">${esc(t("progress.none"))}</p>`}
    </div>` : `<div class="empty"><div class="emoji">🚀</div><p>${esc(t("progress.none"))}</p><a class="btn" href="#/courses" style="margin-top:12px">${esc(t("home.browse"))}</a></div>`}

    <div class="section-head"><h2 style="font-size:1.2rem">${esc(t("progress.ach"))}</h2></div>
    <div class="ach-grid">
      ${ACHIEVEMENTS.map((a) => {
        const ok = a.test();
        return `<div class="card ach ${ok ? "unlocked" : ""}"><div class="emoji">${a.emoji}</div><h4>${esc(mean(a.name))}</h4><p>${esc(mean(a.desc))}</p></div>`;
      }).join("")}
    </div>

    <div style="margin-top:30px;text-align:center">
      <button class="btn btn--ghost btn--sm" id="resetBtn">🗑️ ${esc(t("progress.reset"))}</button>
    </div>
  `;

  $("#resetBtn").onclick = () => {
    if (confirm(t("progress.resetConfirm"))) {
      store.reset();
      toast(t("toast.reset"));
      rerender();
    }
  };
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
    { e: "🌍", t: { id: "12 Bahasa Dunia", en: "12 World Languages", es: "12 idiomas del mundo" }, d: { id: "Inggris, Spanyol, Prancis, Jerman, Jepang, Korea, Mandarin, Arab, Italia, Portugis, Rusia, Hindi.", en: "English, Spanish, French, German, Japanese, Korean, Mandarin, Arabic, Italian, Portuguese, Russian, Hindi.", es: "Inglés, español, francés, alemán, japonés, coreano, mandarín, árabe, italiano, portugués, ruso, hindi." } },
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
