/* =========================================================================
   app.js — Bootstrap. Wires i18n, chrome, routes, auth, and the PWA.
   The learning UI renders immediately (as guest); auth resolves lazily and
   upgrades the session in the background, so nothing blocks on the network.
   ========================================================================= */
import { I18N } from "./i18n.js";
import { warmVoices } from "./core/ui.js";
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
} from "./views/practice.js";
import { renderDictionary } from "./views/dictionary.js";
import { renderLogin, renderRegister, renderAccount } from "./views/auth.js";
import { notFound } from "./views/partials.js";

/* ----------------------------------------------------------------- routes */
registerRoutes({
  home: { render: renderHome },
  courses: { render: renderCourses },
  search: { render: renderDictionary },
  course: { render: renderCourse },
  lesson: { render: renderLesson },
  flashcards: { render: renderFlashcards },
  quiz: { render: renderQuiz },
  cloze: { render: renderCloze },
  type: { render: renderType },
  listen: { render: renderListen },
  match: { render: renderMatch },
  speak: { render: renderSpeak },
  audio: { render: renderAudio },
  build: { render: renderBuild },
  script: { render: renderScript },
  mix: { render: renderDailyMix },
  mistakes: { render: renderMistakes },
  favorites: { render: renderFavorites },
  review: { render: renderReview },
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
