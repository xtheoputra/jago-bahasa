/* server/static.js — Hardened static file serving with extension-aware SPA
   fallback. Missing assets return 404 (NOT the HTML shell) so ES-module
   imports fail loudly instead of silently receiving HTML. */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
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

/* ------------------------------------------------------------- compression
   The app ships its content as JavaScript: 23 dictionaries and 23 course
   catalogues, ~1.9 MB of it, and opening the cross-language search pulls all
   of them at once. That text is enormously repetitive — the same field names
   on every one of 3,359 entries — so it deflates to well under a third of its
   size. Compressing costs a few milliseconds on a machine that is already
   idle; not compressing costs a phone several seconds on every cold visit. */

/** Text formats only. Images and icons are already compressed; running them
 *  through gzip spends CPU to make them very slightly larger. */
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".svg", ".map", ".txt"]);

/** Below this, the gzip header costs more than the compression saves. */
const MIN_COMPRESS = 1024;

/** Which encoding the client asked for, in our order of preference. */
function pickEncoding(req) {
  const accepted = String(req.headers["accept-encoding"] || "").toLowerCase();
  if (/\bbr\b/.test(accepted)) return "br";
  if (/\bgzip\b/.test(accepted)) return "gzip";
  return null;
}

const compressors = {
  br: (buf, cb) =>
    zlib.brotliCompress(
      buf,
      { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } },
      cb
    ),
  gzip: (buf, cb) => zlib.gzip(buf, { level: 6 }, cb),
};

/** Send `data`, compressed when the client accepts it and it is worth doing.
 *  Any compression failure falls back to the plain bytes — a slow response is
 *  a nuisance, a failed one is a broken app. */
function sendBody(req, res, status, headers, data, ext) {
  const enc = COMPRESSIBLE.has(ext) && data.length >= MIN_COMPRESS ? pickEncoding(req) : null;
  // Caches key on this: the same URL has two representations now.
  headers.Vary = headers.Vary ? headers.Vary + ", Accept-Encoding" : "Accept-Encoding";
  if (!enc) {
    res.writeHead(status, headers);
    return res.end(data);
  }
  compressors[enc](data, (err, packed) => {
    if (err || !packed || packed.length >= data.length) {
      res.writeHead(status, headers);
      return res.end(data);
    }
    res.writeHead(status, { ...headers, "Content-Encoding": enc });
    res.end(packed);
  });
}

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
          sendBody(req, res, 200, { "Content-Type": MIME[".html"], "Cache-Control": "no-cache" }, html, ".html");
        });
      }
      return send404(res);
    }
    const ext = path.extname(filePath).toLowerCase();
    const headers = { "Content-Type": MIME[ext] || "application/octet-stream" };
    if (ext === ".html" || path.basename(filePath) === "sw.js") headers["Cache-Control"] = "no-cache";
    sendBody(req, res, 200, headers, data, ext);
  });
}

module.exports = { serveStatic };
