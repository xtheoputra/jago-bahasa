/* =========================================================================
   auth/remote.js — RemoteAuthProvider: talks to the optional Node backend
   for real cross-device accounts + progress sync. Uses cookie sessions
   (credentials: 'include') and a double-submit CSRF token header.
   ========================================================================= */
import { session } from "./session.js";

/** Build an API URL relative to the app's base (works at root or a subpath). */
const apiUrl = (path) => new URL("api/" + path, document.baseURI).href;

function authError(key, status) {
  const e = new Error(key);
  e.key = key;
  e.status = status;
  return e;
}

function readCookie(name) {
  const safe = name.replace(/([.*+?^${}()|[\]\\])/g, "\\$1");
  const m = document.cookie.match(new RegExp("(?:^|; )" + safe + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

async function ensureCsrf() {
  let token = readCookie("jb_csrf");
  if (token) return token;
  try {
    await fetch(apiUrl("csrf"), { credentials: "include", cache: "no-store" });
  } catch (e) {}
  return readCookie("jb_csrf") || "";
}

async function request(path, { method = "GET", body, csrf = false, errors = {} } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (csrf) headers["X-CSRF-Token"] = await ensureCsrf();

  let res;
  try {
    res = await fetch(apiUrl(path), {
      method,
      credentials: "include",
      cache: "no-store",
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    throw authError(navigator.onLine ? "auth.errNetwork" : "auth.errOffline");
  }

  if (res.status === 204) return null;

  let data = null;
  try {
    data = await res.json();
  } catch (e) {}

  if (!res.ok) {
    const byStatus = { 429: "auth.errRate", 423: "auth.errLocked", ...errors };
    throw authError(byStatus[res.status] || "auth.errGeneric", res.status);
  }
  return data;
}

function setUser(data) {
  const u = (data && data.user) || null;
  session.set(u);
  return u;
}

export const RemoteAuthProvider = {
  kind: "remote",
  supportsSync: true,

  async me() {
    try {
      const data = await request("auth/me");
      const u = (data && data.user) || null;
      session.set(u, { broadcast: false });
      return u;
    } catch (e) {
      return null; // not signed in / unreachable
    }
  },

  async register({ displayName, email, password, remember }) {
    const data = await request("auth/register", {
      method: "POST",
      body: { displayName, email, password, remember: !!remember },
      errors: { 409: "auth.errEmailExists", 422: "valid.passwordWeak" },
    });
    await ensureCsrf();
    return setUser(data);
  },

  async login({ email, password, remember }) {
    const data = await request("auth/login", {
      method: "POST",
      body: { email, password, remember: !!remember },
      errors: { 401: "auth.errWrongCreds" },
    });
    await ensureCsrf();
    return setUser(data);
  },

  async logout() {
    try {
      await request("auth/logout", { method: "POST", csrf: true });
    } catch (e) {}
    session.clear();
  },

  async changePassword({ currentPassword, newPassword }) {
    await request("auth/password", {
      method: "POST",
      csrf: true,
      body: { currentPassword, newPassword },
      errors: { 403: "auth.wrongCurrentPassword", 401: "auth.sessionExpired", 422: "valid.passwordWeak" },
    });
  },

  async updateProfile({ displayName }) {
    const data = await request("auth/profile", {
      method: "POST",
      csrf: true,
      body: { displayName },
      errors: { 401: "auth.sessionExpired", 422: "valid.nameTooLong" },
    });
    return setUser(data);
  },

  async deleteAccount({ password }) {
    const u = session.user;
    await request("account", {
      method: "DELETE",
      csrf: true,
      body: { password },
      errors: { 403: "auth.wrongCurrentPassword", 401: "auth.sessionExpired" },
    });
    session.clear();
    return { id: u && u.id };
  },

  async pullProgress() {
    try {
      return await request("progress", { errors: { 401: "auth.sessionExpired" } });
    } catch (e) {
      return null;
    }
  },

  async pushProgress(progress, updatedAt) {
    return request("progress", {
      method: "PUT",
      csrf: true,
      body: { progress, updatedAt },
      errors: { 401: "auth.sessionExpired", 413: "auth.errGeneric" },
    });
  },
};
