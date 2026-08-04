/* =========================================================================
   core/router.js — Hash router with route guards, View Transitions,
   per-route listener cleanup (AbortController), and a11y announcements.
   Views are registered by app.js, so the router never imports views
   (keeps the dependency graph acyclic).
   ========================================================================= */
import { $, $$, focusMain } from "./dom.js";
import { liveStatus, markMuteButtons, whenVoicesReady } from "./ui.js";
import { COURSES } from "../data.js";
import { I18N } from "../i18n.js";
import { session } from "../auth/session.js";

const routes = {}; // name -> { render, guard }
let routeAbort = null;

const NAV_MAP = {
  home: "home", courses: "courses", course: "courses", lesson: "courses",
  flashcards: "courses", quiz: "courses", cloze: "courses",
  type: "courses", listen: "courses", match: "courses", dictation: "courses",
  speak: "courses", audio: "courses", build: "courses", script: "courses",
  mix: "home", mistakes: "progress", favorites: "progress", stats: "progress",
  lists: "progress", list: "progress", listquiz: "progress", listlisten: "progress",
  search: "search", dict: "search", entry: "search", guide: "search",
  path: "courses", drill: "courses",
  review: "progress", progress: "progress", about: "about",
  login: null, register: null, account: null,
};

export function registerRoutes(map) {
  Object.assign(routes, map);
}

export function parseHash() {
  const raw = (location.hash || "#/home").replace(/^#\/?/, "");
  const [pathPart, queryPart] = raw.split("?");
  const parts = pathPart.split("/").filter(Boolean);
  return {
    name: parts[0] || "home",
    params: parts.slice(1).map((p) => decodeURIComponent(p)),
    query: new URLSearchParams(queryPart || ""),
  };
}

export const navigate = (hash) => {
  location.hash = hash;
};

/** Only allow internal hash targets for ?next= redirects (no open redirects). */
export function safeNext(next) {
  if (!next) return null;
  let v;
  try {
    v = decodeURIComponent(next);
  } catch (e) {
    return null;
  }
  return /^#\/[A-Za-z0-9/_?=&%.-]*$/.test(v) ? v : null;
}

/** Abort signal for the currently rendered route (auto-aborted on navigation). */
export function routeSignal() {
  return routeAbort ? routeAbort.signal : undefined;
}

function syncNav(name) {
  const active = NAV_MAP[name] || "";
  $$("[data-route-link]").forEach((a) => a.classList.toggle("is-active", a.dataset.routeLink === active));
}

/* --------------------------------------------------------- audio buttons
   Marking the 🔊 buttons once per route is not enough: the quiz, the drill
   and the flashcards all rewrite their own innerHTML between questions, which
   throws the marks away. Rather than teach twenty render functions to
   remember, watch the subtree — markMuteButtons only touches classes and
   attributes, and this observer only listens for added nodes, so it cannot
   re-trigger itself. */
function watchSpeech(main, lang, signal) {
  // Typing practice rewrites the view on every keystroke; coalesce the bursts
  // so one re-render costs one scan, not one per mutation record.
  let queued = false;
  const mark = () => {
    if (queued || signal.aborted) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!signal.aborted) markMuteButtons(main, lang);
    });
  };
  markMuteButtons(main, lang);
  // The voice list is populated asynchronously; re-check when it lands.
  whenVoicesReady(mark);
  // Held in a local, not a module-level slot: the observer must belong to the
  // route that made it, or a late teardown would silence its successor.
  const obs = new MutationObserver(mark);
  obs.observe(main, { childList: true, subtree: true });
  signal.addEventListener("abort", () => obs.disconnect(), { once: true });
}

function render() {
  const { name, params, query } = parseHash();
  const route = routes[name] || routes.notFound;

  // Route guard: gated routes require an authenticated user.
  if (route && route.guard === "auth" && !session.user) {
    navigate(`#/login?next=${encodeURIComponent(location.hash)}`);
    return;
  }

  // Tear down the previous route's event listeners.
  if (routeAbort) routeAbort.abort();
  routeAbort = new AbortController();
  const signal = routeAbort.signal;

  const main = $("#main");
  /* Nearly every language-scoped route names its course first (#/lesson/es/…,
     #/drill/ja/A1, #/entry/uk/…), so the router can tell the audio buttons
     which language they are about to be asked to speak — no view has to.
     Views that mix languages tag their own buttons with data-speech. */
  const speechOfRoute = () => {
    const c = COURSES.find((x) => x.id === params[0]);
    return c ? c.speech : null;
  };
  const swap = () => {
    main.innerHTML = "";
    const view = document.createElement("div");
    view.className = "view";
    main.appendChild(view);
    (route ? route.render : routes.home.render)(view, params, { query, name, signal });
    syncNav(name);
    watchSpeech(main, speechOfRoute(), signal);
  };

  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (document.startViewTransition && !reduce) {
    const vt = document.startViewTransition(swap);
    vt.ready.then(focusMain, focusMain);
  } else {
    swap();
    focusMain();
  }

  window.scrollTo({ top: 0, behavior: "instant" });
  liveStatus(I18N.t(name === "home" ? "nav.home" : NAV_MAP[name] ? "nav." + NAV_MAP[name] : "nav.home"));
}

/** Re-render the current route (e.g. after sign-in changes progress). */
export const rerender = render;

export function startRouter() {
  window.addEventListener("hashchange", render);
  if (!location.hash) location.hash = "#/home";
  render();
}
