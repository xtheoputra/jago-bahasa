/* server/index.js — Jago Bahasa server: hardened static hosting + optional
   auth/sync API. Pure node:http + node:crypto, zero dependencies. */
const http = require("http");
const config = require("./config");
const sec = require("./security");
const sess = require("./sessions");
const { handleApi } = require("./api");
const { serveStatic } = require("./static");

// Prune expired sessions on boot and hourly.
sess.sweep();
const sweepTimer = setInterval(() => sess.sweep(), 60 * 60 * 1000);
if (sweepTimer.unref) sweepTimer.unref();

const server = http.createServer((req, res) => {
  sec.secureHeaders(req, res);

  // Optional CORS (only when the API is served from a different origin).
  if (config.allowOrigin && req.headers.origin === config.allowOrigin) {
    res.setHeader("Access-Control-Allow-Origin", config.allowOrigin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
      res.writeHead(204);
      return res.end();
    }
  }

  let pathname;
  try {
    pathname = new URL(req.url, "http://localhost").pathname;
  } catch (e) {
    res.writeHead(400);
    return res.end("Bad request");
  }

  if (pathname.startsWith("/api/")) return handleApi(req, res);
  serveStatic(req, res);
});

server.listen(config.port, config.host, () => {
  console.log(`\n  🌐 Jago Bahasa berjalan di:  http://localhost:${config.port}`);
  console.log(`     API auth + sinkronisasi aktif di  /api/*`);
  console.log(`     Tekan Ctrl+C untuk berhenti.\n`);
});

module.exports = server;
