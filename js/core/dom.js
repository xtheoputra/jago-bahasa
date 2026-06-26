/* =========================================================================
   core/dom.js — Tiny DOM helpers shared across the app.
   No framework: just thin wrappers over the platform.
   ========================================================================= */
import { I18N } from "../i18n.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Escape a string for safe interpolation into innerHTML.
 *  This is the #1 XSS boundary — every user-controlled value (display name,
 *  email, query params) MUST pass through here before touching innerHTML. */
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/** Pick the meaning/label for the current UI language, with fallbacks. */
export const mean = (m) => (m && (m[I18N.current] || m.id || m.en)) || "";

/** Move focus to the main landmark (called after route changes for a11y).
 *  No-ops if a view already placed focus inside #main (e.g. an auth form field). */
export function focusMain() {
  const main = $("#main");
  if (!main) return;
  const ae = document.activeElement;
  if (ae && ae !== main && main.contains(ae)) return;
  main.focus({ preventScroll: true });
}

/** Grapheme-safe initials for an avatar, e.g. "Ann Lee" -> "AL". Escaped by caller. */
export function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const first = Array.from(parts[0])[0] || "";
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] || "" : "";
  return (first + last).toUpperCase();
}
