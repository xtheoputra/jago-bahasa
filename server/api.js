/* server/api.js — JSON API: auth + progress. Pure node:http + node:crypto. */
const crypto = require("crypto");
const config = require("./config");
const db = require("./db");
const { hashPassword, verifyPassword, randomToken } = require("./crypto");
const sess = require("./sessions");
const sec = require("./security");

const now = () => Date.now();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_FAILS = 5;
const BASE_LOCK = 30_000;
const MAX_LOCK = 900_000;

/* --------------------------------------------------------------- helpers */
function send(res, status, obj, opts = {}) {
  const headers = Object.assign(
    { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", Vary: "Cookie" },
    opts.headers || {}
  );
  if (opts.cookies && opts.cookies.length) headers["Set-Cookie"] = opts.cookies;
  res.writeHead(status, headers);
  res.end(obj === undefined ? "" : JSON.stringify(obj));
}
function noContent(res, opts = {}) {
  const headers = Object.assign({ "Cache-Control": "no-store", Vary: "Cookie" }, opts.headers || {});
  if (opts.cookies && opts.cookies.length) headers["Set-Cookie"] = opts.cookies;
  res.writeHead(204, headers);
  res.end();
}

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers["content-type"] || "").includes("application/json")) return reject({ status: 415 });
    let size = 0;
    let done = false;
    const chunks = [];
    req.on("data", (c) => {
      if (done) return;
      size += c.length;
      if (size > limit) {
        done = true;
        reject({ status: 413 });
        // Keep the listener attached so the rest of the upload drains (we ignore
        // it via the `done` guard) instead of resetting the socket mid-request.
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (done) return;
      done = true;
      try {
        const txt = Buffer.concat(chunks).toString("utf8").trim();
        resolve(txt ? JSON.parse(txt) : {});
      } catch (e) {
        reject({ status: 400 });
      }
    });
    req.on("error", () => {
      if (!done) {
        done = true;
        reject({ status: 400 });
      }
    });
  });
}

const publicUser = (u) => ({ id: u.id, email: u.emailNorm, displayName: u.displayName, createdAt: u.createdAt });
const findByEmail = (emailNorm) => Object.values(db.users()).find((u) => u.emailNorm === emailNorm) || null;
const lockoutMs = (fails) => (fails < MAX_FAILS ? 0 : Math.min(BASE_LOCK * 2 ** (fails - MAX_FAILS), MAX_LOCK));

function sessionCookies(s, req) {
  return [
    sess.cookie("jb_sid", s.sid, { maxAge: s.ttl, req }),
    sess.cookie("jb_csrf", s.csrf, { maxAge: s.ttl, req, httpOnly: false }),
  ];
}

function requireSession(req, res) {
  const s = sess.getSession(req);
  if (!s) {
    send(res, 401, { error: "auth" });
    return null;
  }
  return s;
}
function requireCsrf(req, res, s) {
  if (!sec.verifyCsrf(req, s)) {
    send(res, 403, { error: "csrf" });
    return false;
  }
  return true;
}

/* ------------------------------------------------------------- handlers */
async function register(req, res) {
  const rl = sec.rateLimit("register:" + sec.clientIp(req), 5, 60 * 60 * 1000);
  if (!rl.ok) return send(res, 429, { error: "rate" }, { headers: { "Retry-After": String(rl.retryAfter) } });
  if (!sec.originOk(req)) return send(res, 403, { error: "origin" });

  let body;
  try {
    body = await readJson(req, config.maxBodyAuth);
  } catch (e) {
    return send(res, e.status || 400, { error: "bad" });
  }
  const displayName = String(body.displayName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!displayName || Array.from(displayName).length > 40) return send(res, 422, { error: "name" });
  if (!EMAIL_RE.test(email) || email.length > 254) return send(res, 422, { error: "email" });
  if (password.length < 8) return send(res, 422, { error: "password" });
  if (findByEmail(email)) return send(res, 409, { error: "exists" });

  const id = crypto.randomUUID();
  db.users()[id] = {
    id,
    emailNorm: email,
    displayName,
    passwordRecord: await hashPassword(password),
    createdAt: now(),
    updatedAt: now(),
    fails: 0,
    lockedUntil: 0,
  };
  await db.commitUsers();
  const s = await sess.createSession(id, !!body.remember, req);
  return send(res, 201, { user: publicUser(db.users()[id]) }, { cookies: sessionCookies(s, req) });
}

async function login(req, res) {
  const rl = sec.rateLimit("login:" + sec.clientIp(req), 10, 15 * 60 * 1000);
  if (!rl.ok) return send(res, 429, { error: "rate" }, { headers: { "Retry-After": String(rl.retryAfter) } });
  if (!sec.originOk(req)) return send(res, 403, { error: "origin" });

  let body;
  try {
    body = await readJson(req, config.maxBodyAuth);
  } catch (e) {
    return send(res, e.status || 400, { error: "bad" });
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const user = findByEmail(email);

  // Anti-enumeration: same work + same generic 401 for unknown email.
  if (!user) {
    await verifyPassword(password, `scrypt$32768$8$1$${randomToken(16)}$${randomToken(32)}`);
    return send(res, 401, { error: "creds" });
  }

  const ok = await verifyPassword(password, user.passwordRecord);
  if (ok) {
    // A correct password ALWAYS succeeds, so a third party who knows the email
    // cannot lock the real user out. Brute force is bounded by the IP rate limit.
    if (user.fails || user.lockedUntil) {
      user.fails = 0;
      user.lockedUntil = 0;
    }
    user.updatedAt = now();
    await db.commitUsers();
    const s = await sess.createSession(user.id, !!body.remember, req);
    return send(res, 200, { user: publicUser(user) }, { cookies: sessionCookies(s, req) });
  }

  // Wrong password: record the failure (informs monitoring / the local UI) but
  // never use it to deny a future correct login.
  user.fails = (user.fails || 0) + 1;
  user.lockedUntil = user.fails >= MAX_FAILS ? now() + lockoutMs(user.fails) : 0;
  user.updatedAt = now();
  await db.commitUsers();
  return send(res, 401, { error: "creds" });
}

async function logout(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (!requireCsrf(req, res, s)) return;
  await sess.destroySession(s.sid);
  return noContent(res, { cookies: [sess.clearCookie("jb_sid", req), sess.clearCookie("jb_csrf", req, false)] });
}

async function me(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  const user = db.users()[s.userId];
  if (!user) {
    await sess.destroySession(s.sid);
    return send(res, 401, { error: "auth" });
  }
  return send(res, 200, { user: publicUser(user) });
}

function csrf(req, res) {
  const s = sess.getSession(req);
  const token = s ? s.csrf : randomToken(32);
  const maxAge = s ? s.expiresAt - now() : config.sessionTtlDefault;
  return send(res, 200, { csrf: token }, { cookies: [sess.cookie("jb_csrf", token, { req, httpOnly: false, maxAge })] });
}

async function changePassword(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (!requireCsrf(req, res, s)) return;
  let body;
  try {
    body = await readJson(req, config.maxBodyAuth);
  } catch (e) {
    return send(res, e.status || 400, { error: "bad" });
  }
  const user = db.users()[s.userId];
  if (!user) return send(res, 401, { error: "auth" });
  if (!(await verifyPassword(String(body.currentPassword || ""), user.passwordRecord))) {
    return send(res, 403, { error: "current" });
  }
  const np = String(body.newPassword || "");
  if (np.length < 8) return send(res, 422, { error: "weak" });
  user.passwordRecord = await hashPassword(np);
  user.updatedAt = now();
  await db.commitUsers();
  // Revoke ALL of this user's sessions (logs out other devices on password
  // change), then issue a fresh session for the current device — preserving its
  // original lifetime instead of forcing a 30-day "remember" session.
  const remember = s.expiresAt - s.createdAt > config.sessionTtlDefault;
  await sess.destroyUserSessions(user.id);
  const ns = await sess.createSession(user.id, remember, req);
  return noContent(res, { cookies: sessionCookies(ns, req) });
}

async function profile(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (!requireCsrf(req, res, s)) return;
  let body;
  try {
    body = await readJson(req, config.maxBodyAuth);
  } catch (e) {
    return send(res, e.status || 400, { error: "bad" });
  }
  const user = db.users()[s.userId];
  if (!user) return send(res, 401, { error: "auth" });
  const name = String(body.displayName || "").trim();
  if (!name || Array.from(name).length > 40) return send(res, 422, { error: "name" });
  user.displayName = name;
  user.updatedAt = now();
  await db.commitUsers();
  return send(res, 200, { user: publicUser(user) });
}

async function deleteAccount(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (!requireCsrf(req, res, s)) return;
  let body;
  try {
    body = await readJson(req, config.maxBodyAuth);
  } catch (e) {
    return send(res, e.status || 400, { error: "bad" });
  }
  const user = db.users()[s.userId];
  if (!user) return send(res, 401, { error: "auth" });
  if (!(await verifyPassword(String(body.password || ""), user.passwordRecord))) {
    return send(res, 403, { error: "current" });
  }
  delete db.users()[user.id];
  await db.commitUsers();
  delete db.progress()[user.id];
  await db.commitProgress();
  const sessions = db.sessions();
  for (const sid of Object.keys(sessions)) if (sessions[sid].userId === user.id) delete sessions[sid];
  await db.commitSessions();
  return noContent(res, { cookies: [sess.clearCookie("jb_sid", req), sess.clearCookie("jb_csrf", req, false)] });
}

function getProgress(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  const p = db.progress()[s.userId] || { progress: null, updatedAt: 0 };
  return send(res, 200, p);
}

async function putProgress(req, res) {
  const s = requireSession(req, res);
  if (!s) return;
  if (!requireCsrf(req, res, s)) return;
  let body;
  try {
    body = await readJson(req, config.maxBodyProgress);
  } catch (e) {
    return send(res, e.status || 400, { error: "bad" });
  }
  if (!body.progress || typeof body.progress !== "object") return send(res, 422, { error: "bad" });
  const incoming = Number(body.updatedAt) || 0;
  const progress = db.progress();
  const existing = progress[s.userId];
  if (!existing || incoming >= (existing.updatedAt || 0)) {
    progress[s.userId] = { progress: body.progress, updatedAt: incoming || now() };
    await db.commitProgress();
  }
  return send(res, 200, progress[s.userId]);
}

/* --------------------------------------------------------------- router */
async function handleApi(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  const m = req.method;

  const g = sec.rateLimit("global:" + sec.clientIp(req), 120, 60 * 1000);
  if (!g.ok) return send(res, 429, { error: "rate" }, { headers: { "Retry-After": String(g.retryAfter) } });

  try {
    if (m === "GET" && pathname === "/api/health") return send(res, 200, { status: "ok", version: "2.0.0", time: now() });
    if (m === "GET" && pathname === "/api/csrf") return csrf(req, res);
    if (m === "POST" && pathname === "/api/auth/register") return await register(req, res);
    if (m === "POST" && pathname === "/api/auth/login") return await login(req, res);
    if (m === "POST" && pathname === "/api/auth/logout") return await logout(req, res);
    if (m === "GET" && pathname === "/api/auth/me") return await me(req, res);
    if (m === "POST" && pathname === "/api/auth/password") return await changePassword(req, res);
    if (m === "POST" && pathname === "/api/auth/profile") return await profile(req, res);
    if (m === "DELETE" && pathname === "/api/account") return await deleteAccount(req, res);
    if (m === "GET" && pathname === "/api/progress") return getProgress(req, res);
    if (m === "PUT" && pathname === "/api/progress") return await putProgress(req, res);
    return send(res, 404, { error: "not_found" });
  } catch (err) {
    return send(res, 500, { error: "server" });
  }
}

module.exports = { handleApi };
