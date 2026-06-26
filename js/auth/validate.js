/* =========================================================================
   auth/validate.js — Shared client-side validation for auth forms.
   Mirrors the server-side rules so the UX is consistent in both modes.
   ========================================================================= */

export const MAX_NAME = 40;
export const MIN_PASSWORD = 8;

// Pragmatic email shape check (real validation is "can they receive mail",
// which only a server round-trip can confirm — we just block obvious typos).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

/** Returns an i18n KEY for the first problem, or null if valid. */
export function validateDisplayName(name) {
  const v = String(name || "").trim();
  if (!v) return "valid.nameRequired";
  if (Array.from(v).length > MAX_NAME) return "valid.nameTooLong";
  return null;
}

export function validateEmail(email) {
  const v = normalizeEmail(email);
  if (!v) return "valid.emailRequired";
  if (!EMAIL_RE.test(v) || v.length > 254) return "valid.emailInvalid";
  return null;
}

export function validatePassword(password) {
  const v = String(password || "");
  if (!v) return "valid.passwordRequired";
  if (v.length < MIN_PASSWORD) return "valid.passwordShort";
  if (passwordStrength(v).score < 1) return "valid.passwordWeak";
  return null;
}

/** Lightweight strength estimate → { score: 0..4, key }. Not a security control. */
export function passwordStrength(password) {
  const v = String(password || "");
  let score = 0;
  if (v.length >= 8) score++;
  if (v.length >= 12) score++;
  if (/[a-z]/.test(v) && /[A-Z]/.test(v)) score++;
  if (/\d/.test(v) && /[^A-Za-z0-9]/.test(v)) score++;
  // Penalize trivial/common patterns.
  if (/^(.)\1+$/.test(v) || /^(?:123456|password|qwerty|111111|abc123)/i.test(v)) score = 0;
  score = Math.max(0, Math.min(4, score));
  const key = ["pw.weak", "pw.weak", "pw.fair", "pw.good", "pw.strong"][score];
  return { score, key };
}
