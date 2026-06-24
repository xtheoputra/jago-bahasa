/* =========================================================================
   app.js — SPA router, views, gamification, PWA glue
   ========================================================================= */
(function () {
  "use strict";

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const main = $("#main");
  const t = (...a) => I18N.t(...a);

  /* ---------------------------------------------------------------- state */
  const STORE_KEY = "jb.progress.v1";
  const defaultState = () => ({
    xp: 0,
    doneLessons: {},        // "courseId/lessonId": true
    learnedWords: {},       // "courseId/lessonId": count
    quizScores: {},         // "courseId/lessonId": bestPercent
    streak: 0,
    lastActive: null,       // YYYY-MM-DD
    activeDays: [],         // recent ISO dates
    lastCourse: null,
  });

  let state = loadState();

  function loadState() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return Object.assign(defaultState(), JSON.parse(raw));
    } catch (e) {}
    return defaultState();
  }
  function saveState() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) {}
  }

  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b) - new Date(a)) / 86400000);
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
    saveState();
  }

  const levelFromXp = (xp) => Math.floor(xp / 200) + 1;
  const xpIntoLevel = (xp) => xp % 200;

  /* ---------------------------------------------------------- aggregates */
  function totalLessons() { return COURSES.reduce((n, c) => n + c.lessons.length, 0); }
  function doneCount() { return Object.keys(state.doneLessons).length; }
  function wordsLearned() {
    return Object.values(state.learnedWords).reduce((n, v) => n + (v || 0), 0);
  }
  function courseProgress(course) {
    const done = course.lessons.filter((l) => state.doneLessons[`${course.id}/${l.id}`]).length;
    return { done, total: course.lessons.length, pct: Math.round((done / course.lessons.length) * 100) };
  }

  /* ----------------------------------------------------------------- TTS */
  function speak(text, lang) {
    if (!("speechSynthesis" in window)) { toast("🔇 " + text); return; }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang || "en-US";
      u.rate = 0.92;
      const v = speechSynthesis.getVoices().find((vo) => vo.lang && vo.lang.toLowerCase().startsWith((lang || "en").slice(0, 2)));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* --------------------------------------------------------------- utils */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const mean = (m) => (m && (m[I18N.current] || m.id || m.en)) || "";

  let toastTimer;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 320);
    }, 2600);
  }

  function confetti() {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const wrap = document.createElement("div");
    wrap.className = "confetti";
    const colors = ["#6d5efc", "#ff9f43", "#2dd4a7", "#ff5e7a", "#ffce4a"];
    for (let i = 0; i < 80; i++) {
      const p = document.createElement("i");
      p.style.left = Math.random() * 100 + "vw";
      p.style.background = colors[i % colors.length];
      p.style.animationDuration = 1.6 + Math.random() * 1.6 + "s";
      p.style.animationDelay = Math.random() * 0.4 + "s";
      p.style.transform = `rotate(${Math.random() * 360}deg)`;
      wrap.appendChild(p);
    }
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 3600);
  }

  /* =====================================================================
     ROUTER
     ===================================================================== */
  const routes = {
    home: renderHome,
    courses: renderCourses,
    course: renderCourse,
    lesson: renderLesson,
    flashcards: renderFlashcards,
    quiz: renderQuiz,
    progress: renderProgress,
    about: renderAbout,
  };

  function parseHash() {
    const raw = (location.hash || "#/home").replace(/^#\/?/, "");
    const parts = raw.split("/").filter(Boolean);
    return { name: parts[0] || "home", params: parts.slice(1) };
  }

  function router() {
    const { name, params } = parseHash();
    const fn = routes[name] || renderHome;
    main.innerHTML = "";
    const view = document.createElement("div");
    view.className = "view";
    main.appendChild(view);
    fn(view, params);
    syncNav(name);
    main.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
  }

  function syncNav(name) {
    const map = { home: "home", courses: "courses", course: "courses", lesson: "courses", flashcards: "courses", quiz: "courses", progress: "progress", about: "about" };
    const active = map[name] || "home";
    $$("[data-route-link]").forEach((a) => a.classList.toggle("is-active", a.dataset.routeLink === active));
  }

  const go = (hash) => { location.hash = hash; };

  /* =====================================================================
     VIEW: HOME
     ===================================================================== */
  function renderHome(view) {
    const lvl = levelFromXp(state.xp);
    const last = state.lastCourse ? findCourse(state.lastCourse) : null;
    const popular = COURSES.slice(0, 4);

    const week = lastNDates(7);
    const streakCells = week.map((d) => {
      const on = (state.activeDays || []).includes(d);
      return `<span class="${on ? "on" : ""}" title="${d}">${dayLetter(d)}</span>`;
    }).join("");

    view.innerHTML = `
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
              <div><div class="big">${state.streak}</div><div style="opacity:.9;font-weight:700">${esc(t("home.streak"))}</div></div>
            </div>
            <div class="streak-grid">${streakCells}</div>
          </div>
        </div>
      </section>

      <div class="stats">
        <div class="card stat"><div class="num"><span class="ico">⭐</span>${state.xp}</div><div class="lbl">${esc(t("stat.xp"))}</div></div>
        <div class="card stat"><div class="num"><span class="ico">🎓</span>${doneCount()}<span style="color:var(--text-faint);font-size:1rem;font-weight:600">/${totalLessons()}</span></div><div class="lbl">${esc(t("stat.lessons"))}</div></div>
        <div class="card stat"><div class="num"><span class="ico">📖</span>${wordsLearned()}</div><div class="lbl">${esc(t("stat.words"))}</div></div>
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

    $("#ctaStart").onclick = () => go(last ? `#/course/${last.id}` : "#/courses");
    wireCourseCards(view);
  }

  function dayLetter(iso) {
    const wd = new Date(iso).getDay(); // 0 = Sunday

    const set = I18N.current === "id" ? ["Mg", "Sn", "Sl", "Rb", "Km", "Jm", "Sb"] : ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
    return set[wd];
  }
  function lastNDates(n) {
    const out = [];
    const base = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(base);
      d.setDate(base.getDate() - i);
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }
    return out;
  }

  /* =====================================================================
     VIEW: COURSES
     ===================================================================== */
  function renderCourses(view) {
    view.innerHTML = `
      <div class="section-head"><div><h2>${esc(t("courses.title"))}</h2><p>${esc(t("courses.sub"))}</p></div></div>
      <div class="grid cols-auto">${COURSES.map(courseCardHTML).join("")}</div>
    `;
    wireCourseCards(view);
  }

  function courseCardHTML(c) {
    const p = courseProgress(c);
    const totalWords = c.lessons.reduce((n, l) => n + l.items.length, 0);
    const cta = p.done > 0 ? t("courses.continue") : t("courses.start");
    return `
      <article class="card course-card" data-course="${c.id}" tabindex="0" role="button" aria-label="${esc(mean(c.name))}">
        <div class="course-card__top">
          <div class="flag">${c.flag}</div>
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

  function wireCourseCards(root) {
    $$(".course-card", root).forEach((el) => {
      const id = el.dataset.course;
      const open = () => go(`#/course/${id}`);
      el.addEventListener("click", open);
      el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(); } });
    });
  }

  /* =====================================================================
     VIEW: COURSE DETAIL
     ===================================================================== */
  function renderCourse(view, [cid]) {
    const c = findCourse(cid);
    if (!c) return notFound(view);
    state.lastCourse = c.id; saveState();
    const p = courseProgress(c);

    view.innerHTML = `
      <nav class="crumb"><a href="#/courses">${esc(t("course.back"))}</a><span class="sep">/</span><span>${esc(mean(c.name))}</span></nav>
      <div class="card course-header">
        <div class="flag">${c.flag}</div>
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
        ${c.lessons.map((l, i) => lessonRowHTML(c, l, i)).join("")}
      </div>
    `;

    $$(".lesson-row", view).forEach((el) => {
      const lid = el.dataset.lesson;
      el.onclick = () => go(`#/lesson/${c.id}/${lid}`);
      el.onkeydown = (e) => { if (e.key === "Enter") go(`#/lesson/${c.id}/${lid}`); };
    });
  }

  function lessonRowHTML(c, l, i) {
    const done = state.doneLessons[`${c.id}/${l.id}`];
    const best = state.quizScores[`${c.id}/${l.id}`];
    return `
      <div class="lesson-row ${done ? "done" : ""}" data-lesson="${l.id}" tabindex="0" role="button">
        <div class="lesson-row__num">${done ? "✓" : i + 1}</div>
        <div class="lesson-row__main">
          <h3>${l.icon} ${esc(mean(l.title))}</h3>
          <p>${l.items.length} ${esc(t("words"))}${best != null ? ` • ${t("lesson.quiz")} ${best}%` : ""} • ${esc(t("diff." + l.level))}</p>
        </div>
        <div class="lesson-row__arrow">›</div>
      </div>`;
  }

  /* =====================================================================
     VIEW: LESSON (vocabulary)
     ===================================================================== */
  function renderLesson(view, [cid, lid]) {
    const c = findCourse(cid);
    const l = findLesson(c, lid);
    if (!c || !l) return notFound(view);
    const done = state.doneLessons[`${c.id}/${l.id}`];

    view.innerHTML = `
      <nav class="crumb">
        <a href="#/courses">${esc(t("course.back"))}</a><span class="sep">/</span>
        <a href="#/course/${c.id}">${esc(mean(c.name))}</a><span class="sep">/</span>
        <span>${esc(mean(l.title))}</span>
      </nav>
      <div class="section-head">
        <div><span class="eyebrow">${esc(t("lesson.vocab"))}</span><h2>${l.icon} ${esc(mean(l.title))}</h2><p>${esc(t("lesson.intro"))}</p></div>
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
    $("#goFlash").onclick = () => go(`#/flashcards/${c.id}/${l.id}`);
    $("#goQuiz").onclick = () => go(`#/quiz/${c.id}/${l.id}`);
    $("#markDone").onclick = () => completeLesson(c, l, 0);
  }

  function vocabHTML(c, it) {
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
        <button class="speakbtn" data-speak="${esc(it.term)}" aria-label="Dengarkan pelafalan">🔊</button>
      </div>`;
  }

  function wireSpeak(root, c) {
    $$("[data-speak]", root).forEach((b) => {
      b.onclick = (e) => { e.stopPropagation(); speak(b.dataset.speak, c.speech); };
    });
  }

  function completeLesson(c, l, quizPct) {
    const key = `${c.id}/${l.id}`;
    const first = !state.doneLessons[key];
    state.doneLessons[key] = true;
    state.learnedWords[key] = l.items.length;
    if (quizPct != null && (state.quizScores[key] == null || quizPct > state.quizScores[key])) state.quizScores[key] = quizPct;
    const gain = first ? 30 : 5;
    state.xp += gain;
    touchStreak();
    saveState();
    if (first) { confetti(); }
    toast(t("toast.lessonDone", gain));
  }

  /* =====================================================================
     VIEW: FLASHCARDS
     ===================================================================== */
  function renderFlashcards(view, [cid, lid]) {
    const c = findCourse(cid);
    const l = findLesson(c, lid);
    if (!c || !l) return notFound(view);

    let i = 0, flipped = false;
    const total = l.items.length;

    view.innerHTML = `
      <nav class="crumb"><a href="#/lesson/${c.id}/${l.id}">‹ ${esc(mean(l.title))}</a></nav>
      <div class="flash-wrap">
        <div class="flash-count" id="fcount"></div>
        <div class="flashcard" id="fcard">
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
          <button class="btn" id="fspeak">🔊</button>
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
      $("#fnext").textContent = (i === total - 1 ? t("flash.done") : t("flash.next") + " ›");
    }
    card.onclick = () => { flipped = !flipped; card.classList.toggle("flipped", flipped); };
    $("#fprev").onclick = () => { if (i > 0) { i--; paint(); } };
    $("#fnext").onclick = () => {
      if (i < total - 1) { i++; paint(); }
      else { completeLesson(c, l, null); go(`#/lesson/${c.id}/${l.id}`); }
    };
    $("#fspeak").onclick = () => speak(l.items[i].term, c.speech);
    document.onkeydown = (e) => {
      if (parseHash().name !== "flashcards") { document.onkeydown = null; return; }
      if (e.key === "ArrowRight") $("#fnext").click();
      else if (e.key === "ArrowLeft") $("#fprev").click();
      else if (e.key === " ") { e.preventDefault(); card.click(); }
    };
    paint();
  }

  /* =====================================================================
     VIEW: QUIZ
     ===================================================================== */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      // deterministic-ish but varied: use index-based mix (no Math.random reliance issues)
      const j = Math.floor((Math.sin(i * 99991 + a.length) * 10000 % (i + 1) + (i + 1)) % (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function renderQuiz(view, [cid, lid]) {
    const c = findCourse(cid);
    const l = findLesson(c, lid);
    if (!c || !l) return notFound(view);

    const pool = l.items;
    const questions = shuffle(pool).map((it) => {
      const wrong = shuffle(pool.filter((x) => x !== it)).slice(0, 3);
      const opts = shuffle([it, ...wrong]);
      return { it, opts };
    });

    let qi = 0, score = 0, locked = false;

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
          if (locked) return; locked = true;
          const chosen = q.opts[+btn.dataset.k];
          const correct = chosen === q.it;
          $$(".quiz-opt", view).forEach((b) => {
            b.disabled = true;
            const o = q.opts[+b.dataset.k];
            if (o === q.it) b.classList.add("correct");
            else if (b === btn) b.classList.add("wrong");
          });
          if (correct) score++;
          setTimeout(() => { qi++; paint(); }, correct ? 650 : 1150);
        };
      });
    }

    function finish() {
      const pct = Math.round((score / questions.length) * 100);
      completeLesson(c, l, pct);
      const verdict = pct === 100 ? t("quiz.perfect") : pct >= 60 ? t("quiz.good") : t("quiz.keepgoing");
      const r = pct >= 60 ? 56 : 28;
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
            <div class="xp-pop">+${pct === 100 ? 40 : 15} XP ⭐</div>
            <div class="practice-bar" style="justify-content:center;margin-top:18px">
              <button class="btn btn--ghost" id="qretry">↻ ${esc(t("quiz.retry"))}</button>
              <button class="btn" id="qback">${esc(t("quiz.back"))}</button>
            </div>
          </div>
        </div>`;
      // bonus xp for quiz performance
      state.xp += pct === 100 ? 40 : 15; saveState();
      if (pct === 100) confetti();
      $("#qretry").onclick = () => renderQuiz(view, [cid, lid]);
      $("#qback").onclick = () => go(`#/lesson/${c.id}/${l.id}`);
    }

    paint();
  }

  /* =====================================================================
     VIEW: PROGRESS
     ===================================================================== */
  const ACHIEVEMENTS = [
    { id: "first", emoji: "🌱", name: { id: "Langkah Pertama", en: "First Step", es: "Primer paso" }, desc: { id: "Selesaikan 1 pelajaran", en: "Finish 1 lesson", es: "Termina 1 lección" }, test: () => doneCount() >= 1 },
    { id: "five", emoji: "🔥", name: { id: "Pemanasan", en: "Warming Up", es: "Calentando" }, desc: { id: "Selesaikan 5 pelajaran", en: "Finish 5 lessons", es: "Termina 5 lecciones" }, test: () => doneCount() >= 5 },
    { id: "poly", emoji: "🌍", name: { id: "Poliglot", en: "Polyglot", es: "Políglota" }, desc: { id: "Coba 3 bahasa berbeda", en: "Try 3 languages", es: "Prueba 3 idiomas" }, test: () => languagesTouched() >= 3 },
    { id: "streak3", emoji: "📅", name: { id: "Konsisten", en: "Consistent", es: "Constante" }, desc: { id: "Beruntun 3 hari", en: "3-day streak", es: "Racha de 3 días" }, test: () => state.streak >= 3 },
    { id: "words50", emoji: "📚", name: { id: "Kutu Buku", en: "Bookworm", es: "Ratón de biblioteca" }, desc: { id: "Pelajari 50 kata", en: "Learn 50 words", es: "Aprende 50 palabras" }, test: () => wordsLearned() >= 50 },
    { id: "lvl5", emoji: "🏆", name: { id: "Sang Juara", en: "Champion", es: "Campeón" }, desc: { id: "Capai Level 5", en: "Reach Level 5", es: "Alcanza nivel 5" }, test: () => levelFromXp(state.xp) >= 5 },
  ];
  function languagesTouched() {
    const set = new Set(Object.keys(state.doneLessons).map((k) => k.split("/")[0]));
    return set.size;
  }

  function renderProgress(view) {
    const lvl = levelFromXp(state.xp);
    const into = xpIntoLevel(state.xp);
    const any = doneCount() > 0 || state.xp > 0;

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
          <div class="card stat" style="background:var(--surface-2)"><div class="num">⭐ ${state.xp}</div><div class="lbl">${esc(t("stat.xp"))}</div></div>
          <div class="card stat" style="background:var(--surface-2)"><div class="num">🔥 ${state.streak}</div><div class="lbl">${esc(t("home.streak"))}</div></div>
          <div class="card stat" style="background:var(--surface-2)"><div class="num">🎓 ${doneCount()}</div><div class="lbl">${esc(t("stat.lessons"))}</div></div>
          <div class="card stat" style="background:var(--surface-2)"><div class="num">📖 ${wordsLearned()}</div><div class="lbl">${esc(t("stat.words"))}</div></div>
        </div>
      </div>

      ${any ? `
      <div class="section-head"><h2 style="font-size:1.2rem">${esc(t("progress.byLang"))}</h2></div>
      <div class="grid" style="gap:12px;margin-bottom:24px">
        ${COURSES.filter((c) => courseProgress(c).done > 0).map(progRowHTML).join("") || `<p style="color:var(--text-dim)">${esc(t("progress.none"))}</p>`}
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
        state = defaultState(); saveState(); toast(t("toast.reset")); router();
      }
    };
  }
  function progRowHTML(c) {
    const p = courseProgress(c);
    return `
      <a class="lesson-row" href="#/course/${c.id}" style="text-decoration:none">
        <div class="flag" style="width:42px;height:42px;font-size:1.4rem">${c.flag}</div>
        <div class="lesson-row__main">
          <h3>${esc(mean(c.name))}</h3>
          <div class="progress" style="margin-top:8px"><i style="width:${p.pct}%"></i></div>
        </div>
        <div style="font-weight:800;color:var(--brand)">${p.pct}%</div>
      </a>`;
  }

  /* =====================================================================
     VIEW: ABOUT
     ===================================================================== */
  function renderAbout(view) {
    const features = [
      { e: "📡", t: { id: "Bekerja Offline", en: "Works Offline", es: "Funciona sin conexión" }, d: { id: "Dipasang sebagai aplikasi (PWA) dan tetap berfungsi tanpa internet.", en: "Installable PWA that keeps working without internet.", es: "PWA instalable que funciona sin internet." } },
      { e: "🔊", t: { id: "Pelafalan Audio", en: "Audio Pronunciation", es: "Pronunciación de audio" }, d: { id: "Dengarkan setiap kata dengan text-to-speech native.", en: "Hear every word with native text-to-speech.", es: "Escucha cada palabra con voz nativa." } },
      { e: "🃏", t: { id: "Flashcard & Kuis", en: "Flashcards & Quizzes", es: "Tarjetas y cuestionarios" }, d: { id: "Belajar aktif dengan kartu balik dan kuis interaktif.", en: "Active recall with flip cards and interactive quizzes.", es: "Recuerdo activo con tarjetas y cuestionarios." } },
      { e: "🏅", t: { id: "Gamifikasi", en: "Gamification", es: "Gamificación" }, d: { id: "XP, level, hari beruntun, dan pencapaian membuat belajar seru.", en: "XP, levels, streaks and achievements keep you motivated.", es: "XP, niveles, rachas y logros te motivan." } },
      { e: "🌍", t: { id: "8 Bahasa Dunia", en: "8 World Languages", es: "8 idiomas del mundo" }, d: { id: "Inggris, Spanyol, Prancis, Jerman, Jepang, Korea, Mandarin, Arab.", en: "English, Spanish, French, German, Japanese, Korean, Mandarin, Arabic.", es: "Inglés, español, francés, alemán, japonés, coreano, mandarín, árabe." } },
      { e: "🔒", t: { id: "Privasi Penuh", en: "Full Privacy", es: "Privacidad total" }, d: { id: "Semua progres tersimpan di perangkatmu — tanpa akun, tanpa server.", en: "All progress stays on your device — no account, no server.", es: "Todo tu progreso se queda en tu dispositivo." } },
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

  function notFound(view) {
    view.innerHTML = `<div class="empty"><div class="emoji">🧭</div><h2>404</h2><p>Halaman tidak ditemukan.</p><a class="btn" href="#/home" style="margin-top:12px">${esc(t("nav.home"))}</a></div>`;
  }

  /* =====================================================================
     CHROME: theme, i18n switcher, install, SW
     ===================================================================== */
  function initTheme() {
    let saved;
    try { saved = localStorage.getItem("jb.theme"); } catch (e) {}
    const sys = matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", saved || sys);
    $("#themeBtn").onclick = () => {
      const cur = document.documentElement.getAttribute("data-theme");
      const next = cur === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try { localStorage.setItem("jb.theme", next); } catch (e) {}
    };
  }

  function initLangSwitcher() {
    const btn = $("#uiLangBtn"), menu = $("#uiLangMenu");
    function paintBtn() {
      const m = I18N.langs.find((l) => l.code === I18N.current);
      $("#uiLangFlag").textContent = m.flag;
      $("#uiLangCode").textContent = m.code.toUpperCase();
    }
    function buildMenu() {
      menu.innerHTML = I18N.langs.map((l) =>
        `<button role="option" data-lang="${l.code}" aria-selected="${l.code === I18N.current}"><span class="flag">${l.flag}</span> ${l.label}</button>`
      ).join("");
      $$("button", menu).forEach((b) => {
        b.onclick = () => {
          I18N.setLang(b.dataset.lang);
          paintBtn(); applyStaticI18n(); router(); closeMenu();
        };
      });
    }
    function openMenu() { buildMenu(); menu.hidden = false; btn.setAttribute("aria-expanded", "true"); }
    function closeMenu() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }
    btn.onclick = (e) => { e.stopPropagation(); menu.hidden ? openMenu() : closeMenu(); };
    document.addEventListener("click", (e) => { if (!menu.contains(e.target) && e.target !== btn) closeMenu(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
    paintBtn();
  }

  function applyStaticI18n() {
    $$("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    document.title = I18N.current === "id" ? "Jago Bahasa — Belajar Bahasa Dunia"
      : I18N.current === "es" ? "Jago Bahasa — Aprende idiomas del mundo"
      : "Jago Bahasa — Learn World Languages";
  }

  function initInstall() {
    let deferred = null;
    const fab = $("#installBtn");
    window.addEventListener("beforeinstallprompt", (e) => {
      e.preventDefault(); deferred = e; fab.hidden = false;
    });
    fab.onclick = async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      deferred = null; fab.hidden = true;
    };
    window.addEventListener("appinstalled", () => { fab.hidden = true; toast(t("toast.installed")); });
  }

  function initNetwork() {
    window.addEventListener("offline", () => toast("📴 " + t("toast.offline")));
    window.addEventListener("online", () => toast("✅ " + t("toast.online")));
  }

  function initSW() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }

  /* ------------------------------------------------------------- boot */
  I18N.init();
  initTheme();
  initLangSwitcher();
  applyStaticI18n();
  initInstall();
  initNetwork();
  initSW();
  // warm up voices list for some browsers
  if ("speechSynthesis" in window) { try { speechSynthesis.getVoices(); } catch (e) {} }

  window.addEventListener("hashchange", router);
  if (!location.hash) location.hash = "#/home";
  router();
})();
