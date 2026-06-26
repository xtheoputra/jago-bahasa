/* =========================================================================
   auth/local.js — LocalAuthProvider: in-browser accounts for GitHub Pages
   (no server). Passwords are PBKDF2-hashed and stored in IndexedDB; the
   "session" is a device-local marker. This separates profiles and adds a
   speed-bump, but is NOT protection against someone with device access.
   ========================================================================= */
import { Users } from "./db.js";
import { hashPassword, verifyPassword, randomToken } from "./crypto.js";
import { normalizeEmail, validateDisplayName, validateEmail, validatePassword } from "./validate.js";
import { session } from "./session.js";

const SESSION_KEY = "jb.session.v1";
const REMEMBER_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const TAB_TTL = 12 * 60 * 60 * 1000; // 12 hours
const MAX_FAILS = 5;
const BASE_LOCK = 30_000;
const MAX_LOCK = 900_000;

const now = () => Date.now();

function authError(key) {
  const e = new Error(key);
  e.key = key;
  return e;
}

function ensureSecure() {
  if (!window.isSecureContext || !(crypto && crypto.subtle)) {
    throw authError("auth.insecureContext");
  }
}

function publicUser(rec) {
  return { id: rec.id, email: rec.emailNorm, displayName: rec.displayName, createdAt: rec.createdAt };
}

function lockoutMs(fails) {
  if (fails < MAX_FAILS) return 0;
  return Math.min(BASE_LOCK * 2 ** (fails - MAX_FAILS), MAX_LOCK);
}

/* ------------------------------------------------------------- session I/O */
function writeSession(userId, remember) {
  const sess = {
    userId,
    token: randomToken(),
    issuedAt: now(),
    expiresAt: now() + (remember ? REMEMBER_TTL : TAB_TTL),
  };
  clearSession();
  const store = remember ? localStorage : sessionStorage;
  try {
    store.setItem(SESSION_KEY, JSON.stringify(sess));
  } catch (e) {}
  return sess;
}
function readSession() {
  for (const store of [localStorage, sessionStorage]) {
    let raw;
    try {
      raw = store.getItem(SESSION_KEY);
    } catch (e) {
      continue;
    }
    if (!raw) continue;
    try {
      const sess = JSON.parse(raw);
      if (sess && sess.userId && sess.expiresAt > now()) return sess;
    } catch (e) {}
    try {
      store.removeItem(SESSION_KEY);
    } catch (e) {}
  }
  return null;
}
function clearSession() {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch (e) {}
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}

/* -------------------------------------------------------------- provider */
export const LocalAuthProvider = {
  kind: "local",
  supportsSync: false,

  /** Restore an existing session on boot. Returns the user or null. */
  async me() {
    const sess = readSession();
    if (!sess) return null;
    const rec = await Users.getById(sess.userId);
    if (!rec) {
      clearSession();
      return null;
    }
    const u = publicUser(rec);
    session.set(u, { broadcast: false });
    return u;
  },

  async register({ displayName, email, password, remember }) {
    ensureSecure();
    let key = validateDisplayName(displayName) || validateEmail(email) || validatePassword(password);
    if (key) throw authError(key);

    const emailNorm = normalizeEmail(email);
    if (await Users.getByEmail(emailNorm)) throw authError("auth.errEmailExists");

    const rec = {
      id: crypto.randomUUID(),
      emailNorm,
      displayName: String(displayName).trim(),
      passwordRecord: await hashPassword(password),
      createdAt: now(),
      updatedAt: now(),
      fails: 0,
      lockedUntil: 0,
    };
    await Users.put(rec);
    writeSession(rec.id, remember);
    const u = publicUser(rec);
    session.set(u);
    return u;
  },

  async login({ email, password, remember }) {
    ensureSecure();
    const emailNorm = normalizeEmail(email);
    const rec = await Users.getByEmail(emailNorm);

    // Anti-enumeration: spend equivalent work and return the SAME generic error.
    if (!rec) {
      await verifyPassword(password, `pbkdf2-sha256$600000$${randomToken(16)}$${randomToken(32)}`);
      throw authError("auth.errWrongCreds");
    }
    if (rec.lockedUntil && rec.lockedUntil > now()) throw authError("auth.errLocked");

    const { ok, needsRehash } = await verifyPassword(password, rec.passwordRecord);
    if (!ok) {
      rec.fails = (rec.fails || 0) + 1;
      rec.lockedUntil = rec.fails >= MAX_FAILS ? now() + lockoutMs(rec.fails) : 0;
      rec.updatedAt = now();
      await Users.put(rec);
      throw authError("auth.errWrongCreds");
    }

    rec.fails = 0;
    rec.lockedUntil = 0;
    if (needsRehash) rec.passwordRecord = await hashPassword(password);
    rec.updatedAt = now();
    await Users.put(rec);

    writeSession(rec.id, remember);
    const u = publicUser(rec);
    session.set(u);
    return u;
  },

  async logout() {
    clearSession();
    session.clear();
  },

  async changePassword({ currentPassword, newPassword }) {
    ensureSecure();
    if (!session.user) throw authError("auth.sessionExpired");
    const rec = await Users.getById(session.user.id);
    if (!rec) throw authError("auth.sessionExpired");

    const { ok } = await verifyPassword(currentPassword, rec.passwordRecord);
    if (!ok) throw authError("auth.wrongCurrentPassword");

    const key = validatePassword(newPassword);
    if (key) throw authError(key);

    rec.passwordRecord = await hashPassword(newPassword);
    rec.updatedAt = now();
    await Users.put(rec);
    // Rotate the local session token to invalidate other tabs' stale markers.
    writeSession(rec.id, !!localStorage.getItem(SESSION_KEY));
  },

  async updateProfile({ displayName }) {
    if (!session.user) throw authError("auth.sessionExpired");
    const key = validateDisplayName(displayName);
    if (key) throw authError(key);
    const rec = await Users.getById(session.user.id);
    if (!rec) throw authError("auth.sessionExpired");
    rec.displayName = String(displayName).trim();
    rec.updatedAt = now();
    await Users.put(rec);
    const u = publicUser(rec);
    session.set(u);
    return u;
  },

  /** Remove the account record. Caller is responsible for purging local progress. */
  async deleteAccount({ password }) {
    ensureSecure();
    if (!session.user) throw authError("auth.sessionExpired");
    const rec = await Users.getById(session.user.id);
    if (!rec) throw authError("auth.sessionExpired");
    const { ok } = await verifyPassword(password, rec.passwordRecord);
    if (!ok) throw authError("auth.wrongCurrentPassword");
    const id = rec.id;
    await Users.remove(id);
    clearSession();
    session.clear();
    return { id };
  },

  // Local mode keeps progress in a per-user localStorage namespace; nothing to sync.
  async pullProgress() {
    return null;
  },
  async pushProgress() {
    return null;
  },
};
