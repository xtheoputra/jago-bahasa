/* server/store.js — Tiny JSON store: load-once in-memory + serialized atomic
   writes (tmp → fsync → rename, with a .bak of the prior file). Zero deps.

   Good enough for a small single-instance educational backend. For multi-
   instance / high write volume, swap this module for SQLite or Postgres. */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

module.exports = function createStore(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cache = Object.create(null);
  const chains = Object.create(null); // per-file write serialization

  const file = (name) => path.join(dir, `${name}.json`);

  function read(name, def) {
    if (cache[name] !== undefined) return cache[name];
    for (const p of [file(name), `${file(name)}.bak`]) {
      try {
        cache[name] = JSON.parse(fs.readFileSync(p, "utf8"));
        return cache[name];
      } catch (e) {
        /* try next */
      }
    }
    cache[name] = def !== undefined ? def : {};
    return cache[name];
  }

  function writeAtomic(target, content) {
    return new Promise((resolve, reject) => {
      const tmp = `${target}.${crypto.randomBytes(6).toString("hex")}.tmp`;
      fs.open(tmp, "w", 0o600, (err, fd) => {
        if (err) return reject(err);
        fs.writeFile(fd, content, (e1) => {
          if (e1) return fs.close(fd, () => reject(e1));
          fs.fsync(fd, (e2) => {
            fs.close(fd, (e3) => {
              if (e2 || e3) return reject(e2 || e3);
              fs.rename(target, `${target}.bak`, (eBak) => {
                // Only ignore "target doesn't exist yet"; surface real I/O errors
                // so we don't overwrite the original without a backup.
                if (eBak && eBak.code !== "ENOENT") return reject(eBak);
                fs.rename(tmp, target, (e4) => (e4 ? reject(e4) : resolve()));
              });
            });
          });
        });
      });
    });
  }

  /** Persist the in-memory object for `name`. Writes are serialized per file. */
  function commit(name) {
    const content = JSON.stringify(cache[name] ?? {});
    const prev = chains[name] || Promise.resolve();
    const next = prev.then(() => writeAtomic(file(name), content));
    chains[name] = next.catch(() => {});
    return next;
  }

  return { read, commit };
};
