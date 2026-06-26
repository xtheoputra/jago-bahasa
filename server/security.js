/* server/security.js — Secure headers, rate limiting, CSRF, origin checks. */
const config = require("./config");
const { timingSafeEqualStr } = require("./crypto");
const { parseCookies } = require("./sessions");

const CSP =
  "default-src 'self'; script-src 'self' 'sha256-4zd2smDdcAUaJ7gzkxrkyD/owwoLFxcWP8NtZjfyz54='; " +
  "style-src 'self' 'unsafe-inline'; img-src 'self' data:; " +
  "font-src 'self'; connect-src 'self'; manifest-src 'self'; worker-src 'self'; object-src 'none'; " +
  "base-uri 'none'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests";

function secureHeaders(req, res) {
  res.setHeader("Content-Security-Policy", CSP);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(), microphone=(), camera=(), payment=(), usb=(), accelerometer=(), gyroscope=(), interest-cohort=()"
  );
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  res.setHeader("X-DNS-Prefetch-Control", "off");
  const secure = config.cookieSecure || (config.trustProxy && req.headers["x-forwarded-proto"] === "https");
  if (secure) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

/* ---- in-memory fixed-window rate limiter ---- */
const buckets = new Map();
function rateLimit(key, limit, windowMs) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= t) {
    b = { count: 0, resetAt: t + windowMs };
    buckets.set(key, b);
  }
  b.count++;
  return { ok: b.count <= limit, retryAfter: Math.max(1, Math.ceil((b.resetAt - t) / 1000)) };
}
const pruneTimer = setInterval(() => {
  const t = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
}, 60_000);
if (pruneTimer.unref) pruneTimer.unref();

function clientIp(req) {
  if (config.trustProxy && req.headers["x-forwarded-for"]) {
    return String(req.headers["x-forwarded-for"]).split(",")[0].trim();
  }
  return req.socket.remoteAddress || "unknown";
}

/** Double-submit CSRF: header must equal the cookie AND the session token. */
function verifyCsrf(req, session) {
  if (!session) return false;
  const cookieToken = parseCookies(req).jb_csrf;
  const header = req.headers["x-csrf-token"];
  if (!header || !cookieToken) return false;
  return timingSafeEqualStr(header, cookieToken) && timingSafeEqualStr(header, session.csrf);
}

/** Reject state-changing requests whose Origin doesn't match. */
function originOk(req) {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin or non-browser client
  if (config.allowOrigin) return origin === config.allowOrigin;
  try {
    return new URL(origin).host === req.headers.host;
  } catch (e) {
    return false;
  }
}

module.exports = { secureHeaders, rateLimit, clientIp, verifyCsrf, originOk };
