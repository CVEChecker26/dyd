"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { WHITELIST } = require("./helpers/server.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const html = read("index.html");
const SITE_JS = ["app.js", "engine.js", "i18n.js", "rules.js"];
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'none'; base-uri 'none'; form-action 'none'";

test("exact CSP meta and referrer meta", () => {
  assert.ok(html.includes(`<meta http-equiv="Content-Security-Policy" content="${CSP}">`));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
});
test("no inline script, inline style, style attributes or javascript: URLs", () => {
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    assert.match(m[1], /\bsrc="[^"]+"/, "script without src");
    assert.strictEqual(m[2].trim(), "", "inline script body");
  }
  assert.ok(!/<style\b/i.test(html), "inline <style>");
  assert.ok(!/\sstyle\s*=/i.test(html), "style attribute");
  assert.ok(!/javascript:/i.test(html));
  assert.ok(!/\son[a-z]+\s*=/i.test(html), "inline event handler");
  for (const f of ["style.css", ...SITE_JS]) assert.ok(!/javascript:/i.test(read(f)), f);
});
test("no unsafe DOM, storage or network APIs in site JavaScript", () => {
  const banned = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|importScripts|EventSource|window.open|postMessage|new Image/;
  for (const f of SITE_JS) {
    const src = read(f);
    const m = banned.exec(src);
    assert.ok(!m, `${f} contains ${m && m[0]}`);
  }
  assert.ok(!/console\./.test(read("app.js")), "app.js must not log");
});
test("every src/href/url() is relative, or an https anchor", () => {
  for (const m of html.matchAll(/<(\w+)\b[^>]*?\s(?:src|href)="([^"]*)"/g)) {
    const [, tag, url] = m;
    if (/^https:\/\//.test(url)) assert.strictEqual(tag.toLowerCase(), "a", `external URL on <${tag}>`);
    else assert.ok(!/^[a-z][a-z0-9+.-]*:/i.test(url) && !url.startsWith("//"), `non-relative: ${url}`);
  }
  assert.ok(!/url\(\s*["']?(https?:|\/\/)/i.test(read("style.css")), "external url() in CSS");
  assert.ok(!/@import|@font-face/.test(read("style.css")));
});
test("all locally referenced files exist and the whitelist exists", () => {
  for (const m of html.matchAll(/\s(?:src|href)="([^"#]+)"/g)) {
    if (/^https:/.test(m[1])) continue;
    assert.ok(fs.existsSync(path.join(root, m[1])), `missing ${m[1]}`);
  }
  for (const f of WHITELIST) assert.ok(fs.existsSync(path.join(root, f)), `missing whitelist file ${f}`);
  assert.ok(fs.existsSync(path.join(root, "assets")));
});
test("external links created from rules are https only and carry noopener noreferrer", () => {
  const rules = JSON.parse(read("rules.json"));
  const urls = [];
  for (const r of rules.rules) { urls.push(r.source_url, ...r.extra_sources); for (const c of Object.values(r.per_cve)) urls.push(c.source_url); }
  for (const c of rules.cves) urls.push(c.advisory);
  for (const u of urls) assert.match(u, /^https:\/\//);
  assert.match(read("app.js"), /rel: "noopener noreferrer"/);
});
test("i18n keys used in HTML and app.js exist", () => {
  const I = require("../i18n.js");
  const used = new Set();
  for (const m of html.matchAll(/data-i18n(?:-aria)?="([^"]+)"/g)) used.add(m[1]);
  for (const k of used) assert.ok(k in I.en, `HTML uses unknown key ${k}`);
  const app = read("app.js");
  for (const m of app.matchAll(/\bt\("([\w.]+)"\s*[,)]/g)) assert.ok(m[1] in I.en, `app.js uses unknown key ${m[1]}`);
  const dynamic = ["env.", "docker.", "plesk.", "sum.source.", "restart.", "verdict.", "state.", "why.", "note.", "status.review."];
  for (const p of dynamic) assert.ok(Object.keys(I.en).some((k) => k.startsWith(p)), p);
});
test("no secret-like strings or env files in the repository", () => {
  const skip = new Set(["node_modules", ".git", ".local", "BRAND", "test-results", "playwright-report"]);
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (skip.has(e.name)) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p); else files.push(p);
    }
  })(root);
  const thisFile = path.join(__dirname, "static.test.js");
  for (const f of files) {
    assert.ok(!/(^|[\\/])\.env(\.|$)/.test(f), `env file ${f}`);
    if (f === thisFile || /\.(png|ico)$/.test(f) || f.endsWith("package-lock.json")) continue;
    const txt = fs.readFileSync(f, "utf8");
    assert.ok(!/ghp_[A-Za-z0-9]{10}|github_pat_|-----BEGIN/.test(txt), `secret-like string in ${path.relative(root, f)}`);
  }
});
test("required repository files exist", () => {
  for (const f of ["README.md", "METHODOLOGY.md", "PRIVACY.md", "SECURITY.md", "CHANGELOG.md", "LICENSE", ".nojekyll", ".gitignore", ".gitattributes", "package.json", ".github/workflows/pages.yml", "scripts/build-rules.js"]) {
    assert.ok(fs.existsSync(path.join(root, f)), `missing ${f}`);
  }
});
test("BRAND assets copied into assets/ are byte-identical to the originals", () => {
  const pairs = [["BRAND/dyd-brand/svg/favicon.svg", "assets/favicon.svg"], ["BRAND/dyd-brand/favicon.ico", "assets/favicon.ico"], ["BRAND/dyd-brand/png/dyd-apple-touch-icon-180.png", "assets/apple-touch-icon.png"]];
  for (const [a, b] of pairs) assert.ok(fs.readFileSync(path.join(root, a)).equals(fs.readFileSync(path.join(root, b))), b);
});
test("inline logo paths equal the brand master", () => {
  const svg = read("BRAND/dyd-brand/svg/dyd-logo-master.svg");
  for (const id of ["d1", "y", "d2", "rotate"]) {
    const d = new RegExp(`<path id="${id}"[^>]* d="([^"]+)"`).exec(svg)[1];
    assert.ok(html.includes(`d="${d}"`), `logo path ${id} differs from the master`);
  }
});
