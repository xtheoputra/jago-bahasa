/* =========================================================================
   auth/crypto.js — Password hashing for the in-browser (Local) auth provider.

   PBKDF2-HMAC-SHA256 via Web Crypto. Parameters are stored INSIDE each record
   (self-describing) so the iteration count can be raised later and upgraded
   transparently on the next successful login (`needsRehash`).

   Honest threat model: this protects the password value if someone reads the
   local database, by making offline guessing expensive. It is NOT encryption
   and passwords are never recoverable. See login.forgotLocalNote.
   ========================================================================= */
const ENC = new TextEncoder();

export const ITERATIONS = 600_000; // OWASP 2023 floor for PBKDF2-HMAC-SHA256
export const SALT_BYTES = 16;
export const KEY_BITS = 256;

export const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
export const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveBits(password, salt, iterations) {
  const km = await crypto.subtle.importKey(
    "raw",
    ENC.encode(String(password).normalize("NFC")),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    km,
    KEY_BITS
  );
  return new Uint8Array(bits);
}

/** Produce a self-describing record string: `pbkdf2-sha256$<iters>$<saltB64>$<hashB64>`. */
export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveBits(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${b64(salt)}$${b64(hash)}`;
}

/** Verify a password against a stored record. Returns { ok, needsRehash }. */
export async function verifyPassword(password, record) {
  const [scheme, iterStr, saltB64, hashB64] = String(record).split("$");
  if (scheme !== "pbkdf2-sha256" || !saltB64 || !hashB64) return { ok: false };
  const iterations = parseInt(iterStr, 10) || ITERATIONS;
  const actual = await deriveBits(password, unb64(saltB64), iterations);
  const expected = unb64(hashB64);
  const ok = timingSafeEqual(actual, expected);
  return { ok, needsRehash: ok && iterations < ITERATIONS };
}

/** Constant-time-ish array comparison (defense-in-depth hygiene). */
export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** Random URL-safe token (used as a local session marker). */
export function randomToken(bytes = 32) {
  return b64(crypto.getRandomValues(new Uint8Array(bytes)));
}
