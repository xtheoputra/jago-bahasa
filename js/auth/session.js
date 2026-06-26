/* =========================================================================
   auth/session.js — In-memory current-user + provider state, with listeners
   and cross-tab sync. This is UX state (who is signed in), NOT a trust
   boundary. Only non-secret fields ({id,email,displayName,createdAt}) live here.
   ========================================================================= */
const listeners = new Set();
let _user = null;
let _provider = null;
let _mode = "pending"; // "pending" | "local" | "remote"

let bc = null;
try {
  bc = new BroadcastChannel("jb-auth");
} catch (e) {
  bc = null;
}

function emit(prev) {
  listeners.forEach((fn) => {
    try {
      fn(_user, prev);
    } catch (e) {}
  });
}

export const session = {
  get user() {
    return _user;
  },
  get provider() {
    return _provider;
  },
  get mode() {
    return _mode;
  },
  isAuthed() {
    return !!_user;
  },
  setProvider(provider, mode) {
    _provider = provider;
    _mode = mode;
  },
  /** Set (or clear with null) the current user and notify subscribers. */
  set(user, { broadcast = true } = {}) {
    const prev = _user;
    _user = user || null;
    if (broadcast && bc) {
      try {
        bc.postMessage({ type: "set", user: _user });
      } catch (e) {}
    }
    emit(prev);
  },
  clear(opts) {
    this.set(null, opts);
  },
  /** Subscribe to (user, prevUser) changes. Returns an unsubscribe fn. */
  onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

if (bc) {
  bc.onmessage = (ev) => {
    const d = ev && ev.data;
    if (d && d.type === "set") session.set(d.user, { broadcast: false });
  };
}
