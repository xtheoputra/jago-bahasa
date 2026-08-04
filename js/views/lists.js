/* =========================================================================
   views/lists.js — word lists the learner builds themselves.

     #/lists       every list, and the button that makes a new one
     #/list/:id    one list: its words, and the modes that drill them

   Favourites is a single bag with no name. Somebody packing for a trip, or
   revising one chapter, or drilling the forty words they keep getting wrong
   in a particular register, wants several bags — each called something. So a
   list is exactly a named favourites bag: it holds the same two key
   namespaces (lesson words and dictionary headwords) and resolves through the
   same store.resolveCard(), which is why every practice mode can already play
   one without knowing lists exist.
   ========================================================================= */
import { $, $$, esc, mean } from "../core/dom.js";
import { toast, openDialog } from "../core/ui.js";
import * as store from "../core/state.js";
import { loadCourses } from "../data.js";
import { loadLexicons } from "../lexicon.js";
import { navigate } from "../core/router.js";
import { confirmDialog } from "./auth.js";
import { notFound } from "./partials.js";
import { I18N } from "../i18n.js";

const t = (...a) => I18N.t(...a);

/* =====================================================================
   The picker — "which of my lists does this word belong to?"
   ===================================================================== */

/** Open the add-to-list dialog for one card key. Resolves once it closes.
 *  Ticking a box takes effect immediately: there is no Save button to forget,
 *  and the dialog is a view of the truth rather than a form over it. */
export function pickLists(key, label) {
  const draw = () =>
    store
      .listAll()
      .map(
        (l) => `
        <label class="check list-pick__row">
          <input type="checkbox" data-list="${esc(l.id)}" ${store.listHas(l.id, key) ? "checked" : ""} />
          <span class="list-pick__name">${esc(l.name)}</span>
          <span class="chip list-pick__n">${l.count}</span>
        </label>`
      )
      .join("");

  return openDialog({
    title: esc(t("lists.addTo")),
    bodyHTML: `
      <p class="list-pick__word">${esc(label || "")}</p>
      <div class="list-pick" id="listPick">${draw() || `<p class="list-pick__none">${esc(t("lists.none"))}</p>`}</div>
      <div class="list-pick__new">
        <input type="text" id="listNewName" maxlength="${store.LIST_NAME_MAX}"
               placeholder="${esc(t("lists.newName"))}" autocomplete="off" />
        <button class="btn btn--sm" id="listNewGo" type="button">+ ${esc(t("lists.new"))}</button>
      </div>`,
    actions: [{ act: "done", cls: "", label: esc(t("lists.done")) }],
    onMount: (dlg) => {
      const box = $("#listPick", dlg);
      const nameEl = $("#listNewName", dlg);

      const wire = () => {
        $$("input[data-list]", box).forEach((cb) => {
          cb.onchange = () => {
            store.listToggle(cb.dataset.list, key);
            repaint();
          };
        });
      };
      const repaint = () => {
        box.innerHTML = draw() || `<p class="list-pick__none">${esc(t("lists.none"))}</p>`;
        wire();
      };
      wire();

      const create = () => {
        const id = store.listCreate(nameEl.value);
        if (!id) {
          // Either an empty name or the ceiling — say which.
          toast(nameEl.value.trim() ? t("lists.full", store.LIST_MAX) : t("lists.needName"));
          return;
        }
        store.listToggle(id, key); // a list made from a word starts with it
        nameEl.value = "";
        repaint();
      };
      $("#listNewGo", dlg).onclick = create;
      nameEl.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        create();
      });
    },
  });
}

/** Wire every `[data-addlist]` button under `root`. The button carries the
 *  card key and the word to show, so any view can offer it by adding markup. */
export function wireAddList(root) {
  $$("[data-addlist]", root).forEach((b) => {
    b.onclick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await pickLists(b.dataset.addlist, b.dataset.addlabel || "");
      // The count on the button may have changed.
      paintAddState(b);
    };
    paintAddState(b);
  });
}

/** Show at a glance whether a word is already filed somewhere. */
function paintAddState(b) {
  const n = store.listsWith(b.dataset.addlist).length;
  b.classList.toggle("is-on", n > 0);
  b.title = n ? t("lists.inN", n) : t("lists.addTo");
  b.setAttribute("aria-label", b.title);
}

/* =====================================================================
   #/lists — the shelf of lists
   ===================================================================== */
export function renderLists(view) {
  const all = store.listAll();

  const card = (l) => `
    <a class="card list-card" href="#/list/${esc(l.id)}">
      <span class="list-card__ico" aria-hidden="true">🗂️</span>
      <span class="list-card__main">
        <strong>${esc(l.name)}</strong>
        <small>${esc(t("lists.words", l.count))}</small>
      </span>
      <span class="list-card__go" aria-hidden="true">›</span>
    </a>`;

  view.innerHTML = `
    <div class="section-head"><div>
      <span class="eyebrow">🗂️ ${esc(t("lists.title"))}</span>
      <h2>${esc(t("lists.title"))}</h2><p>${esc(t("lists.sub"))}</p>
    </div>
    <button class="btn btn--sm" id="listAdd">+ ${esc(t("lists.new"))}</button></div>
    ${all.length
      ? `<div class="list-grid">${all.map(card).join("")}</div>`
      : `<div class="empty"><div class="emoji">🗂️</div><h2>${esc(t("lists.empty"))}</h2>
         <p>${esc(t("lists.emptySub"))}</p></div>`}
  `;

  $("#listAdd", view).onclick = async () => {
    const name = await promptName(t("lists.new"), "");
    if (name === null) return;
    const id = store.listCreate(name);
    if (!id) return toast(name.trim() ? t("lists.full", store.LIST_MAX) : t("lists.needName"));
    navigate(`#/list/${id}`);
  };
}

/** A one-field dialog. Resolves with the text, or null if cancelled. */
function promptName(title, initial) {
  let value = null;
  return openDialog({
    title: esc(title),
    bodyHTML: `<input type="text" id="nameField" class="dialog-input"
                 maxlength="${store.LIST_NAME_MAX}" value="${esc(initial || "")}"
                 placeholder="${esc(t("lists.newName"))}" autocomplete="off" />`,
    actions: [
      { act: "cancel", cls: "btn--ghost", label: esc(t("account.cancel")) },
      { act: "ok", cls: "", label: esc(t("lists.save")) },
    ],
    onMount: (dlg, close) => {
      const el = $("#nameField", dlg);
      el.addEventListener("input", () => (value = el.value));
      value = el.value;
      el.addEventListener("keydown", (e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        close("ok");
      });
    },
  }).then((act) => (act === "ok" ? value || "" : null));
}

/* =====================================================================
   #/list/:id — one list
   ===================================================================== */
export function renderList(view, [id], ctx) {
  const meta = store.listGet(id);
  if (!meta) return notFound(view);

  /* The words in a list can come from any of the 23 languages, and a
     language's chunk is only fetched when that language is opened. Pull
     exactly the ones this list needs — a list built on another device, or
     before a reload, would otherwise show up empty here. Drawing happens
     twice on purpose: once now, so the page is never blank, and again when
     the chunks land. */
  const langs = store.listLangs(id);
  if (langs.length) {
    Promise.all([loadCourses(langs), loadLexicons(langs)]).then(() => {
      if (!(ctx && ctx.signal && ctx.signal.aborted)) paint();
    });
  }
  paint();

  function paint() {
    const pool = store.listPool(id);
    const rows = pool
      .map(
        (card) => `
        <div class="vocab list-row">
          <div class="vocab__left" style="min-width:0">
            <div class="vocab__term ${card.c.cjk ? "cjk" : ""}" dir="${card.c.rtl ? "rtl" : "ltr"}">${esc(card.it.term)}</div>
            ${card.it.reading ? `<div class="vocab__reading">${esc(card.it.reading)}</div>` : ""}
          </div>
          <div class="vocab__mid">
            <div class="vocab__meaning">${esc(mean(card.it.m))}</div>
            <small class="list-row__from">${esc(card.c.flag)} ${esc(mean(card.c.name))}</small>
          </div>
          <button class="speakbtn" data-speak="${esc(card.it.term)}" data-speech="${esc(card.c.speech)}" aria-label="🔊">🔊</button>
          <button class="iconbtn list-row__rm" data-rm="${esc(card.key)}" title="${esc(t("lists.remove"))}"
                  aria-label="${esc(t("lists.remove"))}">✕</button>
        </div>`
      )
      .join("");

    view.innerHTML = `
      <nav class="crumb"><a href="#/lists">‹ ${esc(t("lists.title"))}</a></nav>
      <div class="section-head"><div>
        <span class="eyebrow">🗂️ ${esc(t("lists.title"))}</span>
        <h2>${esc(store.listGet(id).name)}</h2>
        <p>${esc(t("lists.words", pool.length))}</p>
      </div></div>

      ${/* Flashcards and Match are built around one language's writing
            direction and script; a list can mix all twenty-three. The
            pool-based modes — the ones the Favourites deck already uses —
            handle that, so those are the ones offered. */
        pool.length >= 4
        ? `<div class="practice-bar">
             <button class="btn btn--accent" id="lQuiz">🧠 ${esc(t("lesson.quiz"))}</button>
             <button class="btn" id="lListen" data-needs-voice>👂 ${esc(t("lesson.listen"))}</button>
           </div>`
        : `<p class="list-hint">${esc(t("lists.needFour"))}</p>`}

      <div class="list-rows">${rows || `<div class="empty"><div class="emoji">🗂️</div><p>${esc(t("lists.emptyOne"))}</p></div>`}</div>

      <div class="practice-bar" style="margin-top:22px">
        <button class="btn btn--ghost btn--sm" id="lRename">✏️ ${esc(t("lists.rename"))}</button>
        <button class="btn btn--ghost btn--sm" id="lDelete">🗑️ ${esc(t("lists.delete"))}</button>
      </div>`;

    $$("[data-rm]", view).forEach((b) => {
      b.onclick = () => {
        store.listToggle(id, b.dataset.rm);
        paint();
      };
    });
    if (pool.length >= 4) {
      $("#lQuiz", view).onclick = () => navigate(`#/listquiz/${id}`);
      $("#lListen", view).onclick = () => navigate(`#/listlisten/${id}`);
    }
    $("#lRename", view).onclick = async () => {
      const name = await promptName(t("lists.rename"), store.listGet(id).name);
      if (name === null) return;
      if (!store.listRename(id, name)) return toast(t("lists.needName"));
      paint();
    };
    $("#lDelete", view).onclick = async () => {
      const ok = await confirmDialog({
        title: t("lists.delete"),
        body: t("lists.deleteConfirm", store.listGet(id).name),
        confirmLabel: t("lists.delete"),
        danger: true,
      });
      if (!ok) return;
      store.listDelete(id);
      navigate("#/lists");
    };
  }
}
