/* =========================================================================
   core/ui.js — Ephemeral UI: toasts, confetti, live regions, TTS, skeletons.
   ========================================================================= */
import { $ } from "./dom.js";
import { randFloat } from "./random.js";
import { I18N } from "../i18n.js";

/* ----------------------------------------------------------------- toast */
let toastTimer;
export function toast(msg) {
  const el = $("#toast");
  if (!el) return;
  el.textContent = msg;
  el.hidden = false;
  requestAnimationFrame(() => el.classList.add("show"));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => (el.hidden = true), 320);
  }, 2800);
}

/* ----------------------------------------------------- ARIA live regions */
/** Polite announcement (route changes, status). */
export function liveStatus(msg) {
  const el = $("#live-status");
  if (el) el.textContent = msg;
}
/** Assertive announcement (errors that need immediate attention). */
export function liveAlert(msg) {
  const el = $("#live-alert");
  if (el) {
    el.textContent = "";
    requestAnimationFrame(() => (el.textContent = msg));
  }
}

/* --------------------------------------------------------------- confetti */
export function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const wrap = document.createElement("div");
  wrap.className = "confetti";
  const colors = ["#6d5efc", "#ff9f43", "#2dd4a7", "#ff5e7a", "#ffce4a"];
  for (let i = 0; i < 80; i++) {
    const p = document.createElement("i");
    p.style.left = randFloat() * 100 + "vw";
    p.style.background = colors[i % colors.length];
    p.style.animationDuration = 1.6 + randFloat() * 1.6 + "s";
    p.style.animationDelay = randFloat() * 0.4 + "s";
    p.style.transform = `rotate(${randFloat() * 360}deg)`;
    wrap.appendChild(p);
  }
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 3600);
}

/* -------------------------------------------------------------------- TTS
   The app teaches 23 languages; a browser typically ships voices for a dozen.
   Swahili, Tagalog, Ukrainian and Thai are routinely missing, and the old
   behaviour — hand the text to whatever default voice exists — meant a learner
   pressed 🔊 and heard English phonetics read off Thai script, or nothing at
   all, with no way to tell the difference from a bug. So availability is
   checked up front: the button says it cannot speak, instead of lying. */

/** The primary language subtag — everything before the first hyphen.
 *  Split, never sliced to two characters: Tagalog is "fil-PH", and the first
 *  two letters of that are "fi", which is Finnish. A Finnish voice must not
 *  be offered as a way to read Tagalog. */
const base = (lang) => String(lang || "en").toLowerCase().split("-")[0];

/** The installed voices, or [] when speech is unavailable or not yet loaded. */
function voices() {
  if (!("speechSynthesis" in window)) return [];
  try {
    return speechSynthesis.getVoices() || [];
  } catch (e) {
    return [];
  }
}

/** Is there a voice installed that can read `lang`?
 *
 *  Answers `true` while the voice list is still empty: browsers populate it
 *  asynchronously, and flagging every button as mute for the first second
 *  would be a worse lie than the one being fixed. `whenVoicesReady` re-runs
 *  the check once the real list arrives. */
export function hasVoice(lang) {
  if (!("speechSynthesis" in window)) return false;
  const list = voices();
  if (!list.length) return true;
  const b = base(lang);
  return list.some((v) => v.lang && base(v.lang) === b);
}

/** Run `cb` once the voice list is populated (and again if it changes).
 *  Fires immediately when the list is already there. */
export function whenVoicesReady(cb) {
  if (!("speechSynthesis" in window)) return;
  if (voices().length) {
    cb();
    return;
  }
  let done = false;
  const fire = () => {
    if (done || !voices().length) return;
    done = true;
    cb();
  };
  try {
    speechSynthesis.addEventListener("voiceschanged", fire);
  } catch (e) {
    speechSynthesis.onvoiceschanged = fire;
  }
  // Safari never fires the event when the list was already warm but empty.
  setTimeout(fire, 1200);
}

/** Speak `text` in `lang`. Optional `rate` (default .92) and `onend` callback
 *  (also fired if speech is unavailable, so callers can keep a playlist moving). */
export function speak(text, lang, rate, onend) {
  const giveUp = (msg) => {
    toast(msg);
    if (onend) setTimeout(onend, 400);
  };
  if (!("speechSynthesis" in window)) return giveUp("🔇 " + text);
  // Still show the word: a learner who cannot hear it should at least see it.
  if (!hasVoice(lang)) return giveUp(`🔇 ${text} · ${I18N.t("tts.noVoice")}`);
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "en-US";
    u.rate = rate || 0.92;
    const v = voices().find((vo) => vo.lang && base(vo.lang) === base(lang));
    if (v) u.voice = v;
    if (onend) {
      // Fire the callback exactly once, on success OR failure — a missing voice
      // for the language would otherwise stall a hands-free playlist forever.
      let fired = false;
      const once = () => {
        if (fired) return;
        fired = true;
        onend();
      };
      u.onend = once;
      u.onerror = once;
    }
    speechSynthesis.speak(u);
  } catch (e) {
    /* TTS is best-effort; never throw. */
    if (onend) setTimeout(onend, 400);
  }
}
/** Stop any in-progress speech (used when leaving the hands-free audio mode). */
export function stopSpeak() {
  try {
    window.speechSynthesis.cancel();
  } catch (e) {}
}

/** Warm up the voice list (some browsers populate it lazily). */
export function warmVoices() {
  if ("speechSynthesis" in window) {
    try {
      speechSynthesis.getVoices();
    } catch (e) {}
  }
}

/** Mark every audio button under `root` that this device cannot actually
 *  speak. A button carries its own `data-speech` when a view mixes languages
 *  (cross-language search); otherwise the route's language is used.
 *  Called by the router after each render, so no view has to remember. */
export function markMuteButtons(root, fallbackLang) {
  if (!root) return;
  const btns = root.querySelectorAll(
    "[data-speak], .speakbtn, #fspeak, #dicPlay, #scSpeak, [data-needs-voice]"
  );
  if (!btns.length) return;
  const reason = I18N.t("tts.noVoice");
  btns.forEach((b) => {
    const lang = b.dataset.speech || fallbackLang;
    if (!lang) return;
    const mute = !hasVoice(lang);
    b.classList.toggle("is-mute", mute);
    if (!mute) {
      // Put back whatever the view originally said, if this was ever muted.
      if ("muteName" in b.dataset) {
        if (b.dataset.muteName) b.setAttribute("aria-label", b.dataset.muteName);
        else b.removeAttribute("aria-label");
        delete b.dataset.muteName;
        b.removeAttribute("title");
      }
      return;
    }
    if (!("muteName" in b.dataset)) b.dataset.muteName = b.getAttribute("aria-label") || "";
    b.title = reason;
    /* A mode launcher reads "🎧 Audio" and must keep saying so — the reason is
       appended. A bare 🔊 button has no name worth keeping, so it becomes the
       reason outright. */
    const own = b.dataset.muteName || (b.textContent || "").trim();
    const spoken = own && !/^[\p{Emoji}\s]*$/u.test(own) ? `${own} — ${reason}` : reason;
    b.setAttribute("aria-label", spoken);
  });
}

/* ----------------------------------------------------------------- modal
   The backdrop, the focus trap, Escape, click-outside and restoring focus
   afterwards are the same for every dialog in the app; only the contents and
   what the buttons resolve to differ. */

/** Open a modal and resolve with whatever a button's `data-act` says, or
 *  `null` on Escape / click-outside. `onMount(dialogEl, close)` runs once the
 *  dialog is in the document, for wiring anything richer than buttons. */
export function openDialog({ title, bodyHTML = "", actions = [], onMount, labelledBy = "mdl-title" }) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const back = document.createElement("div");
    back.className = "modal-backdrop";
    back.innerHTML = `
      <div class="modal card" role="dialog" aria-modal="true" aria-labelledby="${labelledBy}">
        <h3 id="${labelledBy}">${title}</h3>
        ${bodyHTML}
        <div class="modal-actions">
          ${actions.map((a) => `<button class="btn ${a.cls || ""}" data-act="${a.act}">${a.label}</button>`).join("")}
        </div>
      </div>`;
    document.body.appendChild(back);
    const dlg = back.querySelector(".modal");
    const close = (val) => {
      back.remove();
      document.removeEventListener("keydown", onKey, true);
      if (prev && prev.focus) prev.focus();
      resolve(val);
    };
    dlg.querySelectorAll("[data-act]").forEach((b) => {
      b.onclick = () => close(b.dataset.act);
    });
    back.addEventListener("mousedown", (e) => {
      if (e.target === back) close(null);
    });
    function onKey(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        return close(null);
      }
      if (e.key !== "Tab") return;
      // Everything focusable, not just buttons: a dialog with a text field
      // must not let Tab escape into the page behind it.
      const f = [...dlg.querySelectorAll("button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")]
        .filter((el) => !el.disabled && el.offsetParent !== null);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey, true);
    if (onMount) onMount(dlg, close);
    const focusFirst = dlg.querySelector("input, select, textarea") || dlg.querySelector("[data-act]");
    if (focusFirst) focusFirst.focus();
  });
}

/* --------------------------------------------------------------- skeleton */
export function skeleton(rows = 3) {
  return `<div class="skeleton-wrap" aria-hidden="true">${Array.from(
    { length: rows },
    () => `<div class="skeleton"></div>`
  ).join("")}</div>`;
}
