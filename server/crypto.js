/* server/crypto.js — Password hashing (scrypt) + tokens, using node:crypto only. */
const crypto = require("crypto");

const N = 32768; // CPU/memory cost (2^15)
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAXMEM = 64 * 1024 * 1024; // 64 MB — required headroom for N=32768

/** Returns "scrypt$N$r$p$saltB64$hashB64". Async so a login storm can't block the loop. */
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16);
    crypto.scrypt(String(password).normalize("NFC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM }, (err, dk) => {
      if (err) return reject(err);
      resolve(`scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${dk.toString("base64")}`);
    });
  });
}

/** Verify against a stored record, re-deriving with the record's own params. */
function verifyPassword(password, record) {
  return new Promise((resolve) => {
    const parts = String(record).split("$");
    if (parts[0] !== "scrypt" || parts.length !== 6) return resolve(false);
    const [, n, r, p, saltB64, hashB64] = parts;
    let salt, expected;
    try {
      salt = Buffer.from(saltB64, "base64");
      expected = Buffer.from(hashB64, "base64");
    } catch (e) {
      return resolve(false);
    }
    crypto.scrypt(
      String(password).normalize("NFC"),
      salt,
      expected.length,
      { N: +n, r: +r, p: +p, maxmem: MAXMEM },
      (err, dk) => {
        if (err) return resolve(false);
        resolve(dk.length === expected.length && crypto.timingSafeEqual(dk, expected));
      }
    );
  });
}

const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");

function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

module.exports = { hashPassword, verifyPassword, randomToken, timingSafeEqualStr };
