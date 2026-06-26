/* =========================================================================
   core/ui.js — Ephemeral UI: toasts, confetti, live regions, TTS, skeletons.
   ========================================================================= */
import { $ } from "./dom.js";
import { randFloat } from "./random.js";

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

/* -------------------------------------------------------------------- TTS */
export function speak(text, lang) {
  if (!("speechSynthesis" in window)) {
    toast("🔇 " + text);
    return;
  }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = lang || "en-US";
    u.rate = 0.92;
    const v = speechSynthesis
      .getVoices()
      .find((vo) => vo.lang && vo.lang.toLowerCase().startsWith((lang || "en").slice(0, 2)));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) {
    /* TTS is best-effort; never throw. */
  }
}

/** Warm up the voice list (some browsers populate it lazily). */
export function warmVoices() {
  if ("speechSynthesis" in window) {
    try {
      speechSynthesis.getVoices();
    } catch (e) {}
  }
}

/* --------------------------------------------------------------- skeleton */
export function skeleton(rows = 3) {
  return `<div class="skeleton-wrap" aria-hidden="true">${Array.from(
    { length: rows },
    () => `<div class="skeleton"></div>`
  ).join("")}</div>`;
}
