/* =========================================================================
   core/random.js — Cryptographically-sound randomness helpers.
   We never use Math.random(): it is biased and predictable. crypto.getRandomValues
   gives uniform, unpredictable values for shuffles, sampling, and decorative motion.
   ========================================================================= */

/** Uniform integer in [0, max) with rejection sampling (no modulo bias). */
export function randInt(max) {
  if (max <= 0) return 0;
  const limit = Math.floor(0xffffffff / max) * max; // largest multiple of max that fits
  const buf = new Uint32Array(1);
  let x;
  do {
    crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= limit);
  return x % max;
}

/** Float in [0, 1). For visuals only — still crypto-backed for uniformity. */
export function randFloat() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] / 0x100000000;
}

/** Unbiased Fisher–Yates shuffle returning a NEW array (input untouched). */
export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Take up to n random elements. */
export function sample(arr, n) {
  return shuffle(arr).slice(0, n);
}
