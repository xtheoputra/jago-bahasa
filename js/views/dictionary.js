/* =========================================================================
   views/dictionary.js — the book dictionary.

   Four screens, one book:
     #/search          the shelf + a search that spans every language,
                       both the reference entries and the lesson vocabulary
     #/dict/:lang      one volume: browsed by its own alphabet and by CEFR band
     #/entry/:lang/:w  a single page — pronunciation, senses, example,
                       synonyms, usage note, and where the word shows up in the
                       course
     #/guide/:lang     the front matter: writing system, pronunciation key,
                       grammar essentials, abbreviations
   ========================================================================= */
import { $, $$, esc, mean, fold } from "../core/dom.js";
import { speak } from "../core/ui.js";
import { COURSES, findCourse, loadCourse } from "../data.js";
import { BANDS, BAND_LEVEL, LEXICONS, alphabetOf, getLexicon, findEntry, loadLexicon } from "../lexicon.js";
import * as store from "../core/state.js";
import { randInt } from "../core/random.js";
import { navigate } from "../core/router.js";
import { notFound } from "./partials.js";
import { wireAddList } from "./lists.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);
const RESULT_CAP = 200;

/** Star/unstar buttons for dictionary entries (own key namespace, see state). */
function wireFav(root) {
  $$("[data-fav]", root).forEach((b) => {
    b.onclick = (e) => {
      e.stopPropagation();
      e.preventDefault();
      const on = store.favToggle(b.dataset.fav);
      b.classList.toggle("on", on);
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = on ? "★" : "☆";
    };
  });
}

function wireSpeakButtons(root) {
  root.addEventListener("click", (e) => {
    const b = e.target.closest("[data-speak]");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    speak(b.dataset.speak, b.dataset.speech);
  });
}

/* ------------------------------------------------------------ small parts */
const posChip = (e) => (e.pos ? `<span class="chip chip--pos">${esc(t("pos." + e.pos))}</span>` : "");
const bandChip = (band) => `<span class="chip chip--band chip--band-${esc(band)}">${esc(band)}</span>`;
const genChip = (e) =>
  e.gen ? `<span class="chip chip--gen">${esc(["m", "f", "nt"].includes(e.gen) ? t("gen." + e.gen) : e.gen)}</span>` : "";

const speakBtn = (text, speech) =>
  `<button class="speakbtn" data-speak="${esc(text)}" data-speech="${esc(speech)}" aria-label="🔊">🔊</button>`;

const favBtn = (key) => {
  const on = store.isFav(key);
  return `<button class="favbtn ${on ? "on" : ""}" data-fav="${esc(key)}" aria-label="${esc(t("fav.toggle"))}" aria-pressed="${on ? "true" : "false"}">${on ? "★" : "☆"}</button>`;
};

/** File this word into one of the learner's own lists. Sits beside the star:
 *  the star is the one unnamed bag, this is every named one. */
const listBtn = (key, label) =>
  `<button class="listbtn" data-addlist="${esc(key)}" data-addlabel="${esc(label)}"
     aria-label="${esc(t("lists.addTo"))}">🗂️</button>`;

const entryHref = (e) => `#/entry/${encodeURIComponent(e.lang)}/${encodeURIComponent(e.w)}`;

/** One line in the book — headword, reading/IPA, tags, gloss. */
function entryRowHTML(e, c) {
  return `
    <a class="dict-entry" href="${entryHref(e)}">
      <div class="dict-entry__head">
        <span class="dict-entry__w ${c && c.cjk ? "cjk" : ""}" dir="${c && c.rtl ? "rtl" : "ltr"}">${esc(e.w)}</span>
        ${e.r ? `<span class="dict-entry__r">${esc(e.r)}</span>` : ""}
        ${e.ipa ? `<span class="dict-entry__ipa">/${esc(e.ipa)}/</span>` : ""}
      </div>
      <div class="dict-entry__gloss">${esc(mean(e.g))}</div>
      <div class="dict-entry__tags">${posChip(e)}${genChip(e)}${bandChip(e.cefr)}</div>
      <div class="dict-entry__act">
        ${speakBtn(e.w, c ? c.speech : "")}
        ${favBtn(e.key)}
      </div>
    </a>`;
}

/* =====================================================================
   #/search — the shelf and the cross-language search
   ===================================================================== */

/* The flat search index is built once per session, the first time it is
   needed: every lesson word plus every dictionary entry. */
let INDEX = null;
function buildIndex() {
  if (INDEX) return INDEX;
  INDEX = [];
  for (const c of COURSES) {
    const book = getLexicon(c.id);
    if (book) {
      for (const e of book.entries) INDEX.push({ kind: "book", c, e, hay: e.hay });
    }
    for (const l of c.lessons) {
      for (const it of l.items) {
        const hay = fold(
          [it.term, it.reading, it.m?.id, it.m?.en, it.m?.es, it.ex?.t, it.ex?.m?.id, it.ex?.m?.en, it.ex?.m?.es]
            .filter(Boolean)
            .join(" ")
        );
        INDEX.push({ kind: "lesson", c, l, it, hay });
      }
    }
  }
  return INDEX;
}
/** Dropped when a new dictionary chunk arrives, so the index can be rebuilt. */
export const resetDictionaryIndex = () => (INDEX = null);

function lessonResultHTML(rec) {
  const { c, l, it } = rec;
  return `
    <div class="dict-item">
      <div class="dict-item__head">
        <span class="dict-item__flag" aria-hidden="true">${esc(c.flag)}</span>
        <a class="dict-item__crumb" href="#/lesson/${esc(c.id)}/${esc(l.id)}">${esc(mean(c.name))} · ${esc(mean(l.title))}</a>
        <span class="chip">${esc(t("dict.lesson"))}</span>
        <span class="chip chip--brand dict-item__lvl">${esc(t("diff." + l.level))}</span>
      </div>
      <div class="vocab dict-vocab">
        <div class="vocab__left" style="min-width:0">
          <div class="vocab__term ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(it.term)}</div>
          ${it.reading ? `<div class="vocab__reading">${esc(it.reading)}</div>` : ""}
        </div>
        <div class="vocab__mid">
          <div class="vocab__meaning">${esc(mean(it.m))}</div>
          ${it.ex ? `<div class="vocab__ex">“${esc(it.ex.t)}” — ${esc(mean(it.ex.m))}</div>` : ""}
        </div>
        ${speakBtn(it.term, c.speech)}
      </div>
    </div>`;
}

function bookResultHTML(rec) {
  const { c, e } = rec;
  return `
    <div class="dict-item">
      <div class="dict-item__head">
        <span class="dict-item__flag" aria-hidden="true">${esc(c.flag)}</span>
        <a class="dict-item__crumb" href="#/dict/${esc(c.id)}">${esc(mean(c.name))}</a>
        <span class="chip chip--brand">${esc(t("dict.book"))}</span>
      </div>
      ${entryRowHTML(e, c)}
      ${e.d ? `<p class="dict-item__def">${esc(mean(e.d))}</p>` : ""}
    </div>`;
}

/** Starred headwords, across every language. Without this the stars would be
 *  orphaned: the Favourites deck only drills lesson words, so a dictionary
 *  star had nowhere to be found again. */
function favShelfHTML() {
  const favs = store
    .lexFavKeys()
    .map((f) => ({ e: findEntry(f.lang, f.word), c: findCourse(f.lang) }))
    .filter((x) => x.e && x.c);
  if (!favs.length) return "";
  return `
    <div class="section-head" style="margin-top:26px">
      <div><span class="eyebrow">⭐ ${esc(t("dict.myFav"))}</span><h2 style="font-size:1.2rem">${esc(t("dict.entries", favs.length))}</h2><p>${esc(t("dict.favSrs"))}</p></div>
      <a class="btn btn--ghost btn--sm" href="#/review">🔁 ${esc(t("review.title"))}</a>
    </div>
    <div class="book-list">${favs.map(({ e, c }) => entryRowHTML(e, c)).join("")}</div>`;
}

function shelfHTML() {
  const cards = LEXICONS.map((lx) => {
    const c = findCourse(lx.id);
    if (!c) return "";
    return `
      <a class="card shelf-book" href="#/dict/${esc(c.id)}">
        <span class="shelf-book__flag" aria-hidden="true">${esc(c.flag)}</span>
        <span class="shelf-book__name">${esc(mean(c.name))}</span>
        <span class="shelf-book__native" dir="${c.rtl ? "rtl" : "ltr"}">${esc(c.native)}</span>
        <span class="chip chip--brand">${esc(t("dict.entries", lx.n))}</span>
      </a>`;
  }).join("");
  return `
    <div class="section-head" style="margin-top:26px">
      <div><span class="eyebrow">📚 ${esc(t("dict.shelf"))}</span><h2 style="font-size:1.2rem">${esc(t("dict.shelfSub"))}</h2></div>
      <a class="btn btn--ghost btn--sm" href="#/path">${esc(t("path.cta"))} →</a>
    </div>
    <div class="shelf">${cards}</div>`;
}

/** The order the books are fetched in when the search page opens.
 *  Whatever the learner is actually studying comes first, so the language they
 *  are most likely to search is searchable within one chunk rather than
 *  twenty-three. */
function loadOrder() {
  const st = store.getState();
  const weight = (c) =>
    (st.lastCourse === c.id ? 0 : 2) - (store.courseProgress(c).pct > 0 ? 1 : 0);
  return COURSES.map((c, i) => ({ c, i }))
    .sort((a, b) => weight(a.c) - weight(b.c) || a.i - b.i)
    .map((x) => x.c);
}

export function renderDictionary(view, _params, ctx) {
  const state = { q: "", lang: "all", level: "all", ex: false };

  const langOpts = [`<option value="all">${esc(t("search.allLangs"))}</option>`]
    .concat(COURSES.map((c) => `<option value="${esc(c.id)}">${esc(c.flag)} ${esc(mean(c.name))}</option>`))
    .join("");
  const LEVELS = ["beginner", "elementary", "intermediate", "advanced", "proficient", "expert"];
  const levelOpts = [`<option value="all">${esc(t("search.allLevels"))}</option>`]
    .concat(LEVELS.map((lv) => `<option value="${esc(lv)}">${esc(t("diff." + lv))}</option>`))
    .join("");

  view.innerHTML = `
    <div class="section-head"><div><span class="eyebrow">📖 ${esc(t("nav.search"))}</span><h2>${esc(t("search.title"))}</h2><p>${esc(t("search.sub"))}</p></div></div>
    <div class="dict-controls card">
      <input type="search" id="dictQ" class="dict-search" placeholder="${esc(t("search.placeholder"))}" autocomplete="off" spellcheck="false" aria-label="${esc(t("search.title"))}" />
      <div class="dict-filters">
        <select id="dictLang" class="dict-select" aria-label="${esc(t("search.allLangs"))}">${langOpts}</select>
        <select id="dictLevel" class="dict-select" aria-label="${esc(t("search.allLevels"))}">${levelOpts}</select>
        <label class="check dict-check"><input type="checkbox" id="dictEx" /> ${esc(t("search.withEx"))}</label>
      </div>
    </div>
    <p class="dict-loading" id="dictLoading" aria-live="polite" hidden></p>
    <p class="dict-count" id="dictCount" aria-live="polite"></p>
    <div class="dict-results" id="dictResults"></div>
    <div id="dictShelf">${favShelfHTML()}${shelfHTML()}</div>
  `;

  const qEl = $("#dictQ", view);
  const results = $("#dictResults", view);
  const countEl = $("#dictCount", view);
  const shelf = $("#dictShelf", view);
  const loadingEl = $("#dictLoading", view);

  function run() {
    const nq = fold(state.q).trim();
    const terms = nq ? nq.split(/\s+/) : [];
    const idle = !nq && state.lang === "all" && state.level === "all" && !state.ex;

    shelf.hidden = !idle;
    if (idle) {
      results.innerHTML = "";
      countEl.textContent = t("search.hint");
      return;
    }

    const matches = buildIndex().filter((r) => {
      if (state.lang !== "all" && r.c.id !== state.lang) return false;
      if (state.level !== "all") {
        const level = r.kind === "book" ? BAND_LEVEL[r.e.cefr] : r.l.level;
        if (level !== state.level) return false;
      }
      if (state.ex && !(r.kind === "book" ? r.e.ex : r.it.ex)) return false;
      return terms.every((tk) => r.hay.includes(tk));
    });

    const total = matches.length;
    if (!total) {
      results.innerHTML = "";
      countEl.textContent = t("search.none");
      return;
    }

    // Exact headword hits float to the top, then reference entries (which carry
    // definitions), then lesson vocabulary.
    const rank = (r) => {
      const head = fold(r.kind === "book" ? r.e.w : r.it.term);
      const exact = nq && head === nq ? 0 : nq && head.startsWith(nq) ? 1 : 2;
      return exact * 2 + (r.kind === "book" ? 0 : 1);
    };
    const shown = matches
      .map((r, i) => ({ r, i }))
      .sort((a, b) => rank(a.r) - rank(b.r) || a.i - b.i)
      .slice(0, RESULT_CAP)
      .map((x) => x.r);

    countEl.textContent =
      total > RESULT_CAP ? `${t("search.count", total)} · ${t("search.capped", RESULT_CAP)}` : t("search.count", total);
    results.innerHTML = shown.map((r) => (r.kind === "book" ? bookResultHTML(r) : lessonResultHTML(r))).join("");
    wireFav(results);
  }

  let deb;
  qEl.addEventListener("input", () => {
    state.q = qEl.value;
    clearTimeout(deb);
    deb = setTimeout(run, 120);
  });
  $("#dictLang", view).addEventListener("change", (e) => {
    state.lang = e.target.value;
    run();
  });
  $("#dictLevel", view).addEventListener("change", (e) => {
    state.level = e.target.value;
    run();
  });
  $("#dictEx", view).addEventListener("change", (e) => {
    state.ex = e.target.checked;
    run();
  });

  wireSpeakButtons(view);
  wireFav(shelf); // the starred-entries block carries its own ⭐ buttons

  /* ------------------------------------------------------ progressive load
     The search spans 23 courses and 23 dictionaries — about 1.9 MB of
     JavaScript. Waiting for all of it behind a skeleton meant the search box
     did not exist until the last book landed, which on a phone is seconds of
     a page that cannot be typed into. So the page is built first and the
     books arrive behind it, each one widening the search as it lands. */
  const signal = ctx && ctx.signal;
  const books = loadOrder();
  let arrived = 0;
  let rerunTimer = null;

  const showProgress = () => {
    const done = arrived >= books.length;
    loadingEl.hidden = done;
    if (!done) loadingEl.textContent = t("search.loading", `${arrived}/${books.length}`);
  };

  const onArrival = () => {
    arrived++;
    resetDictionaryIndex(); // a new volume invalidates the index
    if (signal && signal.aborted) return;
    showProgress();
    // Twenty-three arrivals must not mean twenty-three full re-renders.
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(run, 120);
  };

  showProgress();
  for (const c of books) {
    Promise.all([loadCourse(c.id), loadLexicon(c.id)]).then(onArrival, onArrival);
  }
  if (signal) signal.addEventListener("abort", () => clearTimeout(rerunTimer), { once: true });
  run();
  qEl.focus();
}

/* =====================================================================
   #/dict/:lang — one volume
   ===================================================================== */
export function renderBook(view, [lang, band]) {
  const c = findCourse(lang);
  const book = getLexicon(lang);
  if (!c || !book) return notFound(view);

  const has = new Set(book.entries.map((e) => e.letter));
  const letters = alphabetOf(lang).filter((L) => has.has(L)).concat(has.has("#") ? ["#"] : []);
  // #/dict/:lang/:band opens the volume already filtered — that is the link the
  // learning path hands you when you reach a new stage.
  const start = BANDS.includes(band) ? band : "all";
  const state = { letter: "all", band: start, q: "", fav: false };

  view.innerHTML = `
    <nav class="crumb"><a href="#/search">${esc(t("search.title"))}</a><span class="sep">/</span><span>${esc(mean(c.name))}</span></nav>
    <div class="card book-header">
      <div class="flag">${esc(c.flag)}</div>
      <div style="flex:1 1 220px;min-width:0">
        <h1>${esc(mean(c.name))} <span class="book-header__native" dir="${c.rtl ? "rtl" : "ltr"}">${esc(c.native)}</span></h1>
        <p>${esc(t("dict.entries", book.entries.length))} · A1–C2</p>
      </div>
      <div class="book-header__acts">
        <a class="btn btn--ghost btn--sm" href="#/guide/${esc(c.id)}">📐 ${esc(t("guide.title"))}</a>
        <a class="btn btn--ghost btn--sm" href="#/path/${esc(c.id)}">🧭 ${esc(t("path.cta"))}</a>
        <button class="btn btn--ghost btn--sm" id="dictRandom">${esc(t("dict.random"))}</button>
      </div>
    </div>

    <div class="dict-controls card">
      <input type="search" id="bookQ" class="dict-search" placeholder="${esc(t("dict.searchInBook"))}" autocomplete="off" spellcheck="false" aria-label="${esc(t("dict.searchInBook"))}" />
      <div class="band-strip" role="group" aria-label="CEFR">
        <button class="chip chip--tap ${start === "all" ? "is-on" : ""}" data-band="all">${esc(t("dict.allBands"))}</button>
        ${BANDS.map((b) => `<button class="chip chip--tap chip--band-${esc(b)} ${start === b ? "is-on" : ""}" data-band="${esc(b)}">${esc(b)}</button>`).join("")}
        <label class="check dict-check"><input type="checkbox" id="bookFav" /> ⭐ ${esc(t("dict.favOnly"))}</label>
      </div>
    </div>

    <div class="alpha-strip" role="group" aria-label="A–Z">
      <button class="alpha is-on" data-letter="all">${esc(t("dict.allLetters"))}</button>
      ${letters.map((L) => `<button class="alpha" data-letter="${esc(L)}">${esc(L)}</button>`).join("")}
    </div>

    <p class="dict-count" id="bookCount" aria-live="polite"></p>
    <div id="bookList" class="book-list"></div>
  `;

  const list = $("#bookList", view);
  const countEl = $("#bookCount", view);

  function run() {
    const nq = fold(state.q).trim();
    const hits = book.entries.filter((e) => {
      if (state.letter !== "all" && e.letter !== state.letter) return false;
      if (state.band !== "all" && e.cefr !== state.band) return false;
      if (state.fav && !store.isFav(e.key)) return false;
      return !nq || e.hay.includes(nq);
    });

    countEl.textContent = hits.length ? t("dict.entries", hits.length) : t("dict.none");

    // Grouped under letter headings, exactly like a printed dictionary.
    let html = "";
    let current = null;
    for (const e of hits) {
      if (e.letter !== current) {
        current = e.letter;
        html += `<h2 class="book-letter">${esc(current)}</h2>`;
      }
      html += entryRowHTML(e, c);
    }
    list.innerHTML = html;
    wireFav(list);
  }

  $$("[data-letter]", view).forEach((b) => {
    b.onclick = () => {
      state.letter = b.dataset.letter;
      $$("[data-letter]", view).forEach((x) => x.classList.toggle("is-on", x === b));
      run();
    };
  });
  $$("[data-band]", view).forEach((b) => {
    b.onclick = () => {
      state.band = b.dataset.band;
      $$("[data-band]", view).forEach((x) => x.classList.toggle("is-on", x === b));
      run();
    };
  });
  $("#bookFav", view).onchange = (e) => {
    state.fav = e.target.checked;
    run();
  };
  let deb;
  $("#bookQ", view).addEventListener("input", (e) => {
    state.q = e.target.value;
    clearTimeout(deb);
    deb = setTimeout(run, 120);
  });
  $("#dictRandom", view).onclick = () => {
    const e = book.entries[randInt(book.entries.length)];
    if (e) navigate(entryHref(e));
  };

  wireSpeakButtons(view);
  run();
}

/* =====================================================================
   #/entry/:lang/:word — a single page of the book
   ===================================================================== */

/** Where this headword shows up in the course, so reference and lessons link
 *  up in both directions. Only scans a course whose chunk is already loaded. */
function lessonRefs(c, word) {
  const w = fold(word);
  const out = [];
  for (const l of c.lessons) {
    for (const it of l.items) {
      const term = fold(it.term);
      if (term === w || term.split(/[\s/,]+/).includes(w)) {
        out.push({ l, it });
        break;
      }
    }
    if (out.length >= 6) break;
  }
  return out;
}

export function renderEntry(view, [lang, word]) {
  const c = findCourse(lang);
  const book = getLexicon(lang);
  if (!c || !book) return notFound(view);
  const e = findEntry(lang, word);
  if (!e) {
    view.innerHTML = `<div class="empty"><div class="emoji">🔍</div><h2>${esc(t("dict.notFound"))}</h2>
      <a class="btn" href="#/dict/${esc(c.id)}" style="margin-top:12px">${esc(mean(c.name))}</a></div>`;
    return;
  }

  const prev = book.entries[e.i - 1];
  const next = book.entries[e.i + 1];
  const refs = lessonRefs(c, e.w);
  const chipList = (words) =>
    words
      .map((w) => {
        const target = findEntry(lang, w);
        return target
          ? `<a class="chip chip--tap" href="${entryHref(target)}">${esc(w)}</a>`
          : `<span class="chip">${esc(w)}</span>`;
      })
      .join("");

  view.innerHTML = `
    <nav class="crumb">
      <a href="#/search">${esc(t("search.title"))}</a><span class="sep">/</span>
      <a href="#/dict/${esc(c.id)}">${esc(mean(c.name))}</a><span class="sep">/</span><span>${esc(e.w)}</span>
    </nav>

    <article class="card entry">
      <header class="entry__head">
        <div style="min-width:0">
          <h1 class="entry__w ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(e.w)}</h1>
          ${e.r ? `<div class="entry__r">${esc(e.r)}</div>` : ""}
          ${e.ipa ? `<div class="entry__ipa">/${esc(e.ipa)}/</div>` : ""}
          <div class="entry__tags">${posChip(e)}${genChip(e)}${bandChip(e.cefr)}<span class="chip">${esc(t("diff." + BAND_LEVEL[e.cefr]))}</span></div>
        </div>
        <div class="entry__acts">
          ${speakBtn(e.w, c.speech)}
          ${favBtn(e.key)}
          ${listBtn(e.key, e.w)}
        </div>
      </header>

      <p class="entry__gloss">${esc(mean(e.g))}</p>

      ${e.d ? `
      <section class="entry__block">
        <h2>${esc(t("dict.def"))}</h2>
        <p>${esc(mean(e.d))}</p>
      </section>` : ""}

      ${e.ex ? `
      <section class="entry__block">
        <h2>${esc(t("dict.ex"))}</h2>
        <p class="entry__ex ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(e.ex.t)} ${speakBtn(e.ex.t, c.speech)}</p>
        <p class="entry__exm">${esc(mean(e.ex.m))}</p>
      </section>` : ""}

      ${e.syn.length ? `<section class="entry__block"><h2>${esc(t("dict.syn"))}</h2><div class="chips">${chipList(e.syn)}</div></section>` : ""}
      ${e.ant.length ? `<section class="entry__block"><h2>${esc(t("dict.ant"))}</h2><div class="chips">${chipList(e.ant)}</div></section>` : ""}
      ${e.note ? `<section class="entry__block entry__note"><h2>${esc(t("dict.note"))}</h2><p>${esc(mean(e.note))}</p></section>` : ""}

      ${refs.length ? `
      <section class="entry__block">
        <h2>${esc(t("dict.inLessons"))}</h2>
        <div class="chips">${refs.map((r) => `<a class="chip chip--tap" href="#/lesson/${esc(c.id)}/${esc(r.l.id)}">${esc(r.l.icon)} ${esc(mean(r.l.title))}</a>`).join("")}</div>
      </section>` : ""}
    </article>

    <nav class="entry__nav" aria-label="${esc(t("search.title"))}">
      ${prev ? `<a class="btn btn--ghost btn--sm" href="${entryHref(prev)}" aria-label="${esc(t("dict.prev"))}: ${esc(prev.w)}">← ${esc(prev.w)}</a>` : `<span></span>`}
      <a class="btn btn--ghost btn--sm" href="#/dict/${esc(c.id)}">📖 ${esc(mean(c.name))}</a>
      ${next ? `<a class="btn btn--ghost btn--sm" href="${entryHref(next)}" aria-label="${esc(t("dict.next"))}: ${esc(next.w)}">${esc(next.w)} →</a>` : `<span></span>`}
    </nav>
  `;

  wireSpeakButtons(view);
  wireFav(view);
  wireAddList(view);
}

/* =====================================================================
   #/guide/:lang — front matter
   ===================================================================== */
export function renderGuide(view, [lang]) {
  const c = findCourse(lang);
  const book = getLexicon(lang);
  if (!c || !book) return notFound(view);
  const g = book.guide;
  const tri = (a) => (Array.isArray(a) ? a[["id", "en", "es"].indexOf(I18N.current)] || a[0] : a || "");

  if (!g) {
    view.innerHTML = `<div class="empty"><div class="emoji">📐</div><h2>${esc(t("guide.none"))}</h2></div>`;
    return;
  }

  const POS_ABBR = ["n", "v", "adj", "adv", "pron", "prep", "conj", "num", "phr", "intj", "part", "det"];

  view.innerHTML = `
    <nav class="crumb">
      <a href="#/search">${esc(t("search.title"))}</a><span class="sep">/</span>
      <a href="#/dict/${esc(c.id)}">${esc(mean(c.name))}</a><span class="sep">/</span><span>${esc(t("guide.title"))}</span>
    </nav>
    <div class="section-head"><div>
      <span class="eyebrow">${esc(c.flag)} ${esc(mean(c.name))}</span>
      <h2>${esc(t("guide.title"))}</h2><p>${esc(t("guide.sub"))}</p>
    </div></div>

    <div class="card prose"><p>${esc(tri(g.intro))}</p></div>

    <div class="card guide-block">
      <h3>🔤 ${esc(t("guide.script"))}</h3>
      <p>${esc(tri(g.script))}</p>
    </div>

    <div class="card guide-block">
      <h3>🗣️ ${esc(t("guide.pron"))}</h3>
      <table class="guide-table">
        <tbody>${(g.pron || []).map((row) => `
          <tr>
            <th scope="row" class="${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(row[0])}</th>
            <td>${esc(tri(row.slice(1)))}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    </div>

    <div class="card guide-block">
      <h3>🧩 ${esc(t("guide.grammar"))}</h3>
      <ol class="guide-grammar">
        ${(g.grammar || []).map((p) => `
          <li>
            <strong>${esc(tri(p.t))}</strong>
            <p>${esc(tri(p.d))}</p>
            ${p.ex ? `<p class="guide-ex ${c.cjk ? "cjk" : ""}" dir="${c.rtl ? "rtl" : "ltr"}">${esc(p.ex)} ${speakBtn(String(p.ex).split(" · ")[0], c.speech)}</p>` : ""}
          </li>`).join("")}
      </ol>
    </div>

    <div class="card guide-block">
      <h3>📑 ${esc(t("guide.abbr"))}</h3>
      <div class="chips">${POS_ABBR.map((p) => `<span class="chip"><b>${esc(p)}</b> · ${esc(t("pos." + p))}</span>`).join("")}</div>
      <div class="chips" style="margin-top:8px">${BANDS.map((b) => `<span class="chip chip--band-${esc(b)}"><b>${esc(b)}</b> · ${esc(t("diff." + BAND_LEVEL[b]))}</span>`).join("")}</div>
    </div>

    <div class="entry__nav">
      <a class="btn btn--ghost btn--sm" href="#/dict/${esc(c.id)}">📖 ${esc(t("dict.open"))}</a>
      <a class="btn btn--sm" href="#/path/${esc(c.id)}">🧭 ${esc(t("path.cta"))} →</a>
    </div>
  `;

  wireSpeakButtons(view);
}
