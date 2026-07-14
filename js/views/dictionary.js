/* =========================================================================
   views/dictionary.js — Global searchable dictionary across every course.
   Flattens all vocabulary into one index and filters it live by query,
   language, level, and "has example". Read-only; reuses the design system.
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { speak } from "../core/ui.js";
import { COURSES } from "../data.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);
const RESULT_CAP = 200;

/** Strip diacritics + lowercase so "elocuente" matches "elócuente", etc.
 *  Non-Latin scripts (Hangul, Han, Arabic) pass through unchanged. */
const norm = (s) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");

/* Build the flat index once per module load (data is static). */
const INDEX = [];
for (const c of COURSES) {
  for (const l of c.lessons) {
    for (const it of l.items) {
      const hay = norm(
        [it.term, it.reading, it.m?.id, it.m?.en, it.m?.es, it.ex?.t, it.ex?.m?.id, it.ex?.m?.en, it.ex?.m?.es]
          .filter(Boolean)
          .join(" ")
      );
      INDEX.push({ c, l, it, hay });
    }
  }
}

function resultHTML(rec) {
  const { c, l, it } = rec;
  return `
    <div class="dict-item">
      <div class="dict-item__head">
        <span class="dict-item__flag" aria-hidden="true">${esc(c.flag)}</span>
        <span class="dict-item__crumb">${esc(mean(c.name))} · ${esc(mean(l.title))}</span>
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
        <button class="speakbtn" data-speak="${esc(it.term)}" data-speech="${esc(c.speech)}" aria-label="🔊">🔊</button>
      </div>
    </div>`;
}

export function renderDictionary(view) {
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
    <p class="dict-count" id="dictCount" aria-live="polite"></p>
    <div class="dict-results" id="dictResults"></div>
  `;

  const qEl = $("#dictQ", view);
  const results = $("#dictResults", view);
  const countEl = $("#dictCount", view);

  function run() {
    const nq = norm(state.q).trim();
    const terms = nq ? nq.split(/\s+/) : [];
    const empty = !nq && state.lang === "all" && state.level === "all" && !state.ex;

    if (empty) {
      results.innerHTML = "";
      countEl.textContent = t("search.hint");
      return;
    }

    let matches = INDEX.filter((r) => {
      if (state.lang !== "all" && r.c.id !== state.lang) return false;
      if (state.level !== "all" && r.l.level !== state.level) return false;
      if (state.ex && !r.it.ex) return false;
      return terms.every((tk) => r.hay.includes(tk));
    });

    const total = matches.length;
    if (!total) {
      results.innerHTML = "";
      countEl.textContent = t("search.none");
      return;
    }

    const shown = matches.slice(0, RESULT_CAP);
    countEl.textContent =
      total > RESULT_CAP ? `${t("search.count", total)} · ${t("search.capped", RESULT_CAP)}` : t("search.count", total);
    results.innerHTML = shown.map(resultHTML).join("");
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

  // Delegated speak — each result carries its own BCP-47 speech code.
  results.addEventListener("click", (e) => {
    const b = e.target.closest("[data-speak]");
    if (!b) return;
    speak(b.dataset.speak, b.dataset.speech);
  });

  run();
  qEl.focus();
}
