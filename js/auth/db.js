/* =========================================================================
   auth/db.js — Local user store with a single `Users` interface.
   Prefers IndexedDB; transparently falls back to a localStorage JSON blob
   (e.g. private mode or where IndexedDB is blocked). Record shape:
     { id, emailNorm, displayName, passwordRecord, createdAt, updatedAt,
       fails, lockedUntil }
   ========================================================================= */
const DB_NAME = "jb-auth";
const DB_VERSION = 1;
const STORE = "users";
const LS_KEY = "jb.auth.users.v1";

let dbPromise = null;

function openIDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("no-idb"));
    let req;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch (e) {
      return reject(e);
    }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: "id" });
        os.createIndex("by_email", "emailNorm", { unique: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("idb-open-failed"));
    req.onblocked = () => reject(new Error("idb-blocked"));
  }).catch((e) => {
    dbPromise = null; // allow fallback path
    throw e;
  });
  return dbPromise;
}

function idbTx(mode, fn) {
  return openIDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        let out;
        Promise.resolve(fn(store)).then((v) => (out = v));
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error || new Error("idb-abort"));
      })
  );
}

const reqAsync = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/* ----------------------------------------------------- localStorage backend */
function lsLoad() {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
  } catch (e) {
    return {};
  }
}
function lsSave(map) {
  localStorage.setItem(LS_KEY, JSON.stringify(map));
}

const lsBackend = {
  async getByEmail(emailNorm) {
    const map = lsLoad();
    return Object.values(map).find((u) => u.emailNorm === emailNorm) || null;
  },
  async getById(id) {
    return lsLoad()[id] || null;
  },
  async put(record) {
    const map = lsLoad();
    map[record.id] = record;
    lsSave(map);
    return record;
  },
  async remove(id) {
    const map = lsLoad();
    delete map[id];
    lsSave(map);
  },
};

const idbBackend = {
  async getByEmail(emailNorm) {
    return idbTx("readonly", (store) => reqAsync(store.index("by_email").get(emailNorm))).then(
      (r) => r || null
    );
  },
  async getById(id) {
    return idbTx("readonly", (store) => reqAsync(store.get(id))).then((r) => r || null);
  },
  async put(record) {
    await idbTx("readwrite", (store) => reqAsync(store.put(record)));
    return record;
  },
  async remove(id) {
    await idbTx("readwrite", (store) => reqAsync(store.delete(id)));
  },
};

let backend = null;
async function getBackend() {
  if (backend) return backend;
  try {
    await openIDB();
    backend = idbBackend;
  } catch (e) {
    backend = lsBackend;
  }
  return backend;
}

/** Uniform async Users API used by the Local auth provider. */
export const Users = {
  getByEmail: (emailNorm) => getBackend().then((b) => b.getByEmail(emailNorm)),
  getById: (id) => getBackend().then((b) => b.getById(id)),
  put: (record) => getBackend().then((b) => b.put(record)),
  remove: (id) => getBackend().then((b) => b.remove(id)),
};
