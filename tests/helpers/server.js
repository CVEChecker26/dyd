"use strict";
// Tiny dependency-free static server. Serves only the deploy whitelist, optionally under a subpath.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..", "..");
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };
const WHITELIST = ["index.html", "style.css", "app.js", "engine.js", "copy.js", "rules.js", "rules.json", ".nojekyll"];

function start(prefix) {
  prefix = prefix || "/";
  const requests = [];
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    requests.push(url.pathname);
    let p = decodeURIComponent(url.pathname);
    if (!p.startsWith(prefix)) { res.writeHead(404); return res.end("not found"); }
    p = p.slice(prefix.length).replace(/^\/+/, "");
    if (p === "") { p = "index.html"; }
    const ok = WHITELIST.includes(p) || p.startsWith("assets/");
    const file = path.join(ROOT, p);
    if (!ok || !file.startsWith(ROOT) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      resolve({ server, port, origin: `http://127.0.0.1:${port}`, base: `http://127.0.0.1:${port}${prefix}`, requests, close: () => new Promise((r) => server.close(r)) });
    });
  });
}
module.exports = { start, WHITELIST };
