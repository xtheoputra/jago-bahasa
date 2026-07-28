/* =========================================================================
   app.js — Bootstrap. Wires i18n, chrome, routes, auth, and the PWA.
   The learning UI renders immediately (as guest); auth resolves lazily and
   upgrades the session in the background, so nothing blocks on the network.
   ========================================================================= */
import { I18N } from "./i18n.js";
import { warmVoices, skeleton } from "./core/ui.js";
import { COURSES, courseLoaded, loadCourses } from "./data.js";
import { registerRoutes, startRouter, rerender } from "./core/router.js";
import { session } from "./auth/session.js";
import { getAuth } from "./auth/index.js";
import * as store from "./core/state.js";
import {
  initTheme, initLangSwitcher, applyStaticI18n, initAccountMenu, initInstall, initNetwork,
  initAppearance, initReminder,
} from "./chrome.js";
import { registerSW } from "./pwa.js";
import { renderHome, renderCourses, renderCourse, renderLesson, renderProgress, renderStats, renderAbout } from "./views/learn.js";
import {
  renderFlashcards, renderQuiz, renderReview, renderCloze,
  renderType, renderListen, renderMatch, renderDailyMix, renderMistakes,
  renderSpeak, renderAudio, renderBuild, renderScript, renderFavorites,
  renderDictation,
} from "./views/practice.js";
import { renderDictionary, renderBook, renderEntry, renderGuide, resetDictionaryIndex } from "./views/dictionary.js";
import { renderPathIndex, renderPath, renderDrill } from "./views/path.js";
import { renderExam, renderCertificate } from "./views/exam.js";
import { loadLexicons, loadAllLexicons, lexiconLoaded } from "./lexicon.js";
import { renderLogin, renderRegister, renderAccount } from "./views/auth.js";
import { notFound } from "./views/partials.js";

/* ------------------------------------------------- lazy vocabulary loading
   data.js ships only the catalogue index; the words for a course arrive on
   demand. Rather than making every view async, routes are wrapped here: the
   wrapper shows a skeleton, awaits exactly the chunks that route needs, and
   bails out if the learner has already navigated somewhere else. */
function awaitData(render, pick) {
  return (view, params, ctx) => {
    const ids = pick(params);
    if (!ids.length || ids.every(courseLoaded)) return render(view, params, ctx);
    view.innerHTML = skeleton(4);
    loadCourses(ids)
      .then(() => {
        if (!(ctx && ctx.signal && ctx.signal.aborted)) render(view, params, ctx);
      })
      .catch(() => render(view, params, ctx));
  };
}
/** Routes shaped #/thing/:courseId/:lessonId — one course is enough. */
const needsCourse = (render) => awaitData(render, ([cid]) => (cid ? [cid] : []));
/** Decks drawn from progress (review, mistakes, favourites, quick mix).
 *  These decks mix lesson words with dictionary headwords, so both kinds of
 *  chunk have to land before the deck can resolve itself. */
const needsProgress = (render) => (view, params, ctx) => {
  const courseIds = store.progressCourseIds();
  // A brand-new learner has no progress; Quick Mix seeds from the first few
  // courses instead, so make sure those are available.
  const courses = courseIds.length ? courseIds : COURSES.slice(0, 6).map((c) => c.id);
  const lexicons = store.progressLexiconIds();
  if (courses.every(courseLoaded) && lexicons.every(lexiconLoaded)) return render(view, params, ctx);
  view.innerHTML = skeleton(4);
  Promise.all([loadCourses(courses), loadLexicons(lexicons)])
    .then(() => {
      resetDictionaryIndex();
      if (!(ctx && ctx.signal && ctx.signal.aborted)) render(view, params, ctx);
    })
    .catch(() => render(view, params, ctx));
};
/* ------------------------------------------------ lazy dictionary loading
   The reference volumes (js/lexicon/<id>.js) load the same way the course
   chunks do. Routes that show a book wait for exactly one of them; the
   cross-language search waits for all of them, once. */
function awaitLexicon(render, pick, alsoCourse) {
  return (view, params, ctx) => {
    const langs = pick(params);
    const jobs = [loadLexicons(langs)];
    // The entry page cross-references the course, so pull that chunk too.
    if (alsoCourse) jobs.push(loadCourses(langs));
    view.innerHTML = skeleton(4);
    Promise.all(jobs)
      .then(() => {
        resetDictionaryIndex(); // a new volume invalidates the search index
        if (!(ctx && ctx.signal && ctx.signal.aborted)) render(view, params, ctx);
      })
      .catch(() => render(view, params, ctx));
  };
}
/** Routes shaped #/thing/:lang — one dictionary is enough. */
const needsBook = (render, alsoCourse = false) =>
  awaitLexicon(render, ([lang]) => (lang ? [lang] : []), alsoCourse);
/** The search spans every language, so it needs every course AND every book. */
const needsEverything = (render) => (view, params, ctx) => {
  view.innerHTML = skeleton(4);
  Promise.all([loadCourses(COURSES.map((c) => c.id)), loadAllLexicons()])
    .then(() => {
      resetDictionaryIndex();
      if (!(ctx && ctx.signal && ctx.signal.aborted)) render(view, params, ctx);
    })
    .catch(() => render(view, params, ctx));
};

/* ----------------------------------------------------------------- routes */
registerRoutes({
  home: { render: renderHome },
  courses: { render: renderCourses },
  search: { render: needsEverything(renderDictionary) },
  dict: { render: needsBook(renderBook) },
  entry: { render: needsBook(renderEntry, true) },
  guide: { render: needsBook(renderGuide) },
  path: { render: (view, params, ctx) => (params[0] ? needsBook(renderPath)(view, params, ctx) : renderPathIndex(view, params, ctx)) },
  drill: { render: needsBook(renderDrill) },
  // The exam samples the lessons *and* the dictionary of a stage, so it waits
  // for both chunks; the certificate reads state only and needs neither.
  exam: { render: needsBook(renderExam, true) },
  cert: { render: renderCertificate },
  course: { render: renderCourse },
  lesson: { render: needsCourse(renderLesson) },
  flashcards: { render: needsCourse(renderFlashcards) },
  quiz: { render: needsCourse(renderQuiz) },
  cloze: { render: needsCourse(renderCloze) },
  type: { render: needsCourse(renderType) },
  listen: { render: needsCourse(renderListen) },
  dictation: { render: needsCourse(renderDictation) },
  match: { render: needsCourse(renderMatch) },
  speak: { render: needsCourse(renderSpeak) },
  audio: { render: needsCourse(renderAudio) },
  build: { render: needsCourse(renderBuild) },
  script: { render: renderScript },
  mix: { render: needsProgress(renderDailyMix) },
  mistakes: { render: needsProgress(renderMistakes) },
  favorites: { render: needsProgress(renderFavorites) },
  review: { render: needsProgress(renderReview) },
  progress: { render: renderProgress },
  stats: { render: renderStats },
  about: { render: renderAbout },
  login: { render: renderLogin },
  register: { render: renderRegister },
  account: { render: renderAccount, guard: "auth" },
  notFound: { render: (view) => notFound(view) },
});

/* ----------------------------- bind auth state to per-user progress + sync */
let lastUid = "guest";
session.onChange((user) => {
  if (user) {
    // Only act when the user actually changes — ignore repeat events from
    // boot-restore, profile renames, and cross-tab broadcasts of the same user.
    if (user.id !== lastUid) {
      store.switchUser(user.id);
      lastUid = user.id;
      if (session.mode === "remote" && session.provider.supportsSync) {
        store.setRemote({ push: (snap) => session.provider.pushProgress(snap, snap.updatedAt) });
        // Pull server progress, merge, then push the reconciled state up (also
        // covers a guest->account merge made before the server had any data).
        Promise.resolve(session.provider.pullProgress())
          .then((res) => {
            if (res && res.progress) store.applyRemoteProgress(res.progress);
          })
          .catch(() => {})
          .finally(() => {
            try {
              const snap = store.snapshot();
              session.provider.pushProgress(snap, snap.updatedAt);
            } catch (e) {}
            rerender();
          });
      }
    }
  } else {
    store.clearRemote();
    if (lastUid !== "guest") {
      store.switchUser("guest");
      lastUid = "guest";
    }
  }
  rerender();
});

/* ------------------------------------------------------------------- boot */
I18N.init();
initTheme();
initAppearance();
initLangSwitcher();
initAccountMenu();
applyStaticI18n();
initInstall();
initNetwork();
initReminder();
warmVoices();
registerSW();

startRouter();

// Resolve the auth provider (probe backend) and restore any existing session.
getAuth().catch(() => {});
