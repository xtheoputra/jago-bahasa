/* =========================================================================
   tests/server.test.mjs — the optional backend, end to end.
   Boots a real `node server.js` on an ephemeral port with DATA_DIR pointed at
   a scratch folder, then exercises static hardening and the full auth + sync
   round trip over HTTP. Nothing is stubbed and nothing touches ./data.
   ========================================================================= */
import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 5100 + (process.pid % 700);
const BASE = `http://127.0.0.1:${PORT}`;
let child, dataDir;

/** fetch() with manual cookie handling — the API is cookie-session based. */
const jar = new Map();
const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() || []) {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    const k = pair.slice(0, i).trim();
    const v = decodeURIComponent(pair.slice(i + 1).trim());
    if (v === "") jar.delete(k);
    else jar.set(k, v);
  }
  return res;
}
async function api(method, url, body) {
  const headers = { Cookie: cookieHeader() };
  // Every state-changing call needs the double-submit token, body or not
  // (logout and account deletion carry none).
  if (jar.has("jb_csrf")) headers["X-CSRF-Token"] = jar.get("jb_csrf");
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return absorb(await fetch(BASE + url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }));
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jb-test-"));
  child = spawn(process.execPath, ["server.js"], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir },
    stdio: "ignore",
  });
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(BASE + "/api/health");
      if (r.ok) return;
    } catch (e) {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("server did not start");
});

after(() => {
  if (child) child.kill();
  if (dataDir) fs.rmSync(dataDir, { recursive: true, force: true });
});

/* ------------------------------------------------------------- static */
test("health check reports ok", async () => {
  const r = await fetch(BASE + "/api/health");
  assert.equal(r.status, 200);
  assert.equal((await r.json()).status, "ok");
});

test("the shell and its assets are served with the right content types", async () => {
  const cases = [
    ["/", "text/html"],
    ["/js/app.js", "text/javascript"],
    ["/js/data.js", "text/javascript"],
    ["/css/styles.css", "text/css"],
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/sw.js", "text/javascript"],
  ];
  for (const [p, mime] of cases) {
    const r = await fetch(BASE + p);
    assert.equal(r.status, 200, `${p} → ${r.status}`);
    assert.ok(r.headers.get("content-type").startsWith(mime), `${p} → ${r.headers.get("content-type")}`);
  }
});

test("security headers are set on every response", async () => {
  const h = (await fetch(BASE + "/")).headers;
  assert.match(h.get("content-security-policy"), /object-src 'none'/);
  assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.equal(h.get("x-frame-options"), "DENY");
  assert.equal(h.get("referrer-policy"), "no-referrer");
});

test("a missing module 404s instead of falling back to HTML", async () => {
  // Answering a module request with the HTML shell is a hard parse error.
  const r = await fetch(BASE + "/js/does-not-exist.js");
  assert.equal(r.status, 404);
  assert.ok(!(await r.text()).includes("<!DOCTYPE"));
});

test("unknown non-asset paths fall back to the SPA shell", async () => {
  const r = await fetch(BASE + "/some/deep/route");
  assert.equal(r.status, 200);
  assert.ok((await r.text()).includes("<!DOCTYPE html>"));
});

test("server source, data and dotfiles are never served", async () => {
  for (const p of ["/server/api.js", "/server/config.js", "/.gitignore", "/data/users.json"]) {
    assert.equal((await fetch(BASE + p)).status, 404, `${p} must not be readable`);
  }
});

test("path traversal cannot escape the web root", async () => {
  for (const p of ["/%2e%2e/%2e%2e/package.json", "/..%2f..%2fserver/api.js", "/%2e%2e%2fserver%2fcrypto.js"]) {
    const r = await fetch(BASE + p);
    const body = r.ok ? await r.text() : "";
    assert.ok(!body.includes("hashPassword"), `${p} leaked server source`);
    assert.ok(!body.includes("scrypt"), `${p} leaked server source`);
  }
});

/* ------------------------------------------------------------------ auth
   Registration is deliberately rate-limited to 5 attempts per IP per hour, and
   every test here shares one IP. The tests below therefore spend that budget on
   purpose: one real account (reused by the login/CSRF tests), four rejected
   payloads, and a sixth call that must come back 429 — which also proves the
   limiter works. Adding another registration anywhere will break this file. */
const USER = { displayName: "Tester", email: `t${Date.now()}@example.com`, password: "correct horse 42" };

test("[register 1/5] register → me → sync progress → logout round trip", async () => {
  const reg = await api("POST", "/api/auth/register", USER);
  assert.equal(reg.status, 201);
  assert.equal((await reg.json()).user.email, USER.email);
  assert.ok(jar.has("jb_sid") && jar.has("jb_csrf"), "session cookies were not set");

  const me = await api("GET", "/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal((await me.json()).user.displayName, "Tester");

  const put = await api("PUT", "/api/progress", { progress: { xp: 120, doneLessons: { "el/greet": true } }, updatedAt: Date.now() });
  assert.equal(put.status, 200);
  const got = await (await api("GET", "/api/progress")).json();
  assert.equal(got.progress.xp, 120);
  assert.equal(got.progress.doneLessons["el/greet"], true);

  assert.equal((await api("POST", "/api/auth/logout")).status, 204);
  assert.equal((await api("GET", "/api/auth/me")).status, 401);
});

test("the password never reaches disk in the clear", () => {
  const raw = fs.readFileSync(path.join(dataDir, "users.json"), "utf8");
  assert.ok(!raw.includes(USER.password), "the plaintext password was persisted");
  assert.match(raw, /scrypt\$/, "no scrypt record found");
});

test("login rejects a wrong password and accepts the right one", async () => {
  assert.equal((await api("POST", "/api/auth/login", { email: USER.email, password: "wrong" })).status, 401);
  assert.equal((await api("POST", "/api/auth/login", { email: USER.email, password: USER.password })).status, 200);
  await api("POST", "/api/auth/logout");
  // A correct password must keep working after failures, so a third party who
  // knows the email cannot lock the real owner out.
  for (let i = 0; i < 3; i++) await api("POST", "/api/auth/login", { email: USER.email, password: "wrong" });
  assert.equal((await api("POST", "/api/auth/login", { email: USER.email, password: USER.password })).status, 200);
});

test("login on an unknown email is indistinguishable from a wrong password", async () => {
  const r = await api("POST", "/api/auth/login", { email: "nobody@example.com", password: USER.password });
  assert.equal(r.status, 401);
  assert.equal((await r.json()).error, "creds");
});

test("a state-changing request without the CSRF header is refused", async () => {
  assert.equal((await api("POST", "/api/auth/login", { email: USER.email, password: USER.password })).status, 200);
  const r = await fetch(BASE + "/api/progress", {
    method: "PUT",
    headers: { Cookie: cookieHeader(), "Content-Type": "application/json" }, // no X-CSRF-Token
    body: JSON.stringify({ progress: { xp: 1 } }),
  });
  assert.equal(r.status, 403);
  assert.equal((await r.json()).error, "csrf");
});

test("progress sync rejects a malformed body", async () => {
  assert.equal((await api("PUT", "/api/progress", { progress: "not an object" })).status, 422);
  assert.equal((await api("POST", "/api/auth/logout")).status, 204);
});

test("[register 2-5/5] registration validates its input and rejects duplicates", async () => {
  assert.equal((await api("POST", "/api/auth/register", USER)).status, 409, "duplicate email");
  assert.equal((await api("POST", "/api/auth/register", { ...USER, email: "not-an-email" })).status, 422);
  assert.equal((await api("POST", "/api/auth/register", { ...USER, email: `x${USER.email}`, password: "short" })).status, 422);
  assert.equal((await api("POST", "/api/auth/register", { ...USER, email: `y${USER.email}`, displayName: "" })).status, 422);
});

test("[register 6th] registration is rate-limited per IP", async () => {
  const r = await api("POST", "/api/auth/register", { ...USER, email: `z${USER.email}` });
  assert.equal(r.status, 429, "the 5-per-hour registration limit did not kick in");
  assert.ok(Number(r.headers.get("retry-after")) > 0, "429 must carry Retry-After");
});

test("unauthenticated API calls are refused, unknown endpoints 404", async () => {
  jar.clear();
  assert.equal((await api("GET", "/api/auth/me")).status, 401);
  assert.equal((await api("GET", "/api/progress")).status, 401);
  assert.equal((await api("GET", "/api/nope")).status, 404);
});
