/* server/static.js — Hardened static file serving with extension-aware SPA
   fallback. Missing assets return 404 (NOT the HTML shell) so ES-module
   imports fail loudly instead of silently receiving HTML. */
const fs = require("fs");
const path = require("path");
const config = require("./config");

const ROOT = config.rootDir;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

// Never serve runtime data, server source, or VCS internals over HTTP.
const BLOCKED = [path.join(ROOT, "server"), path.join(ROOT, ".git"), config.dataDir].map((p) =>
  path.resolve(p)
);

const hasAssetExt = (p) => /\.[a-z0-9]+$/i.test(p);

function send404(res) {
  res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
  res.end("Not found");
}

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split("?")[0]);
  } catch (e) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end("Bad request");
  }
  if (urlPath.indexOf("\0") !== -1) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end("Bad request");
  }
  if (urlPath === "/") urlPath = "/index.html";

  const filePath = path.resolve(path.join(ROOT, path.normalize(urlPath)));

  // Path traversal defense.
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403, { "Content-Type": "text/plain" });
    return res.end("Forbidden");
  }
  // Block sensitive directories.
  if (BLOCKED.some((b) => filePath === b || filePath.startsWith(b + path.sep))) return send404(res);
  // Block dotfiles (e.g. .env, .git internals).
  if (path.basename(filePath).startsWith(".")) return send404(res);

  fs.readFile(filePath, (err, data) => {
    if (err) {
      // SPA fallback for navigations only (no real asset extension).
      if (!hasAssetExt(urlPath)) {
        return fs.readFile(path.join(ROOT, "index.html"), (e2, html) => {
          if (e2) return send404(res);
          res.writeHead(200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" });
          res.end(html);
        });
      }
      return send404(res);
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (ext === ".html" || path.basename(filePath) === "sw.js") headers["Cache-Control"] = "no-cache";
    res.writeHead(200, headers);
    res.end(data);
  });
}

module.exports = { serveStatic };
