/* server/sessions.js — Server-side session store + cookie helpers. */
const config = require("./config");
const db = require("./db");
const { randomToken } = require("./crypto");

const now = () => Date.now();

function isSecure(req) {
  return config.cookieSecure || (config.trustProxy && req.headers["x-forwarded-proto"] === "https");
}

function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie;
  if (!header) return out;
  header.split(";").forEach((part) => {
    const i = part.indexOf("=");
    if (i > -1) {
      const k = part.slice(0, i).trim();
      try {
        out[k] = decodeURIComponent(part.slice(i + 1).trim());
      } catch (e) {
        out[k] = part.slice(i + 1).trim();
      }
    }
  });
  return out;
}

function cookie(name, value, { maxAge, req, httpOnly = true } = {}) {
  // Cross-origin (ALLOW_ORIGIN) deployments need SameSite=None+Secure or the
  // browser won't send the cookie on credentialed cross-site requests.
  const sameSite = config.allowOrigin ? "None" : "Lax";
  let c = `${name}=${encodeURIComponent(value)}; Path=/; SameSite=${sameSite}`;
  if (httpOnly) c += "; HttpOnly";
  if (sameSite === "None" || isSecure(req)) c += "; Secure";
  if (maxAge != null) c += `; Max-Age=${Math.max(0, Math.floor(maxAge / 1000))}`;
  return c;
}

function clearCookie(name, req, httpOnly = true) {
  return cookie(name, "", { maxAge: 0, req, httpOnly });
}

async function createSession(userId, remember, req) {
  const sid = randomToken(32);
  const csrf = randomToken(32);
  const ttl = remember ? config.sessionTtlRemember : config.sessionTtlDefault;
  const sessions = db.sessions();
  sessions[sid] = { userId, csrf, createdAt: now(), expiresAt: now() + ttl };
  // Await persistence so the Set-Cookie is only sent once the session is durable.
  await db.commitSessions();
  return { sid, csrf, ttl };
}

function getSession(req) {
  const sid = parseCookies(req).jb_sid;
  if (!sid) return null;
  const sessions = db.sessions();
  const s = sessions[sid];
  if (!s) return null;
  if (s.expiresAt <= now()) {
    delete sessions[sid];
    db.commitSessions();
    return null;
  }
  return { sid, ...s };
}

async function destroySession(sid) {
  const sessions = db.sessions();
  if (sessions[sid]) {
    delete sessions[sid];
    await db.commitSessions();
  }
}

/** Revoke ALL sessions for a user (used on password change / account deletion). */
async function destroyUserSessions(userId) {
  const sessions = db.sessions();
  let changed = false;
  for (const sid of Object.keys(sessions)) {
    if (sessions[sid].userId === userId) {
      delete sessions[sid];
      changed = true;
    }
  }
  if (changed) await db.commitSessions();
}

function sweep() {
  const sessions = db.sessions();
  let changed = false;
  const t = now();
  for (const sid of Object.keys(sessions)) {
    if (sessions[sid].expiresAt <= t) {
      delete sessions[sid];
      changed = true;
    }
  }
  if (changed) db.commitSessions();
}

module.exports = { parseCookies, cookie, clearCookie, isSecure, createSession, getSession, destroySession, destroyUserSessions, sweep };
