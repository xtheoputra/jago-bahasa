/* server/config.js — Environment configuration (zero dependencies). */
const path = require("path");

module.exports = {
  port: parseInt(process.env.PORT, 10) || 5173,
  host: process.env.HOST || "0.0.0.0",
  rootDir: path.join(__dirname, ".."),
  dataDir: process.env.DATA_DIR || path.join(__dirname, "..", "data"),

  // Secure cookies require HTTPS. Default off so plain http://localhost dev works;
  // set COOKIE_SECURE=1 in production, or TRUST_PROXY=1 to honour X-Forwarded-Proto.
  cookieSecure: process.env.COOKIE_SECURE === "1",
  trustProxy: process.env.TRUST_PROXY === "1",

  // Set to an exact origin (e.g. https://app.example.com) only if the API is
  // served from a different origin than the frontend. null = same-origin.
  allowOrigin: process.env.ALLOW_ORIGIN || null,

  sessionTtlRemember: 30 * 24 * 60 * 60 * 1000, // 30 days
  sessionTtlDefault: 12 * 60 * 60 * 1000, // 12 hours

  maxBodyAuth: 8 * 1024, // 8 KB
  maxBodyProgress: 256 * 1024, // 256 KB
};
