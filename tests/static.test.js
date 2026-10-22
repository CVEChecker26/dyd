"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { WHITELIST } = require("./helpers/server.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const html = read("index.html");
const SITE_JS = ["app.js", "engine.js", "copy.js", "rules.js"];
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https:; base-uri 'none'; form-action 'none'";

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
  const banned = /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function|localStorage|sessionStorage|indexedDB|document\.cookie|XMLHttpRequest|sendBeacon|WebSocket|importScripts|EventSource|window.open|postMessage|new Image/;
  for (const f of SITE_JS) {
    const src = read(f);
    const m = banned.exec(src);
    assert.ok(!m, `${f} contains ${m && m[0]}`);
  }
  assert.ok(!/console\./.test(read("app.js")), "app.js must not log");
  for (const f of ["engine.js", "copy.js", "rules.js"]) assert.ok(!/fetch\(/.test(read(f)), `${f} must not use fetch`);
  // The single permitted request: the optional reachability check (opaque, credential-free, to https only).
  const app = read("app.js");
  assert.strictEqual((app.match(/fetch\(/g) || []).length, 1);
  const call = /fetch\("https:\/\/" \+ host \+ "\/", \{([^}]*)\}/.exec(app);
  assert.ok(call, "fetch must only target https://<normalised host>/");
  assert.match(call[1], /mode: "no-cors"/); assert.match(call[1], /credentials: "omit"/); assert.match(call[1], /referrerPolicy: "no-referrer"/);
  assert.ok(!/body:/.test(call[1]), "the request must send no body");
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
test("copy keys used by app.js exist, and dynamic key families are complete", () => {
  const C = require("../copy.js");
  const app = read("app.js");
  for (const m of app.matchAll(/\bt\("([\w.]+)"\s*[,)]/g)) assert.ok(C.has(m[1]), `app.js uses unknown key ${m[1]}`);
  // keys that app.js builds from field names and values
  const fields = { hosting_type: ["shared", "managed", "vps", "dedicated", "cloud", "docker", "other", "unknown"], panel: ["cpanel", "plesk", "other", "none", "unknown"],
    package_source: ["upstream", "distro", "docker_official", "docker_other", "plesk", "provider", "unknown"], os_family: ["debian", "ubuntu", "other"], plesk_os: ["linux", "windows", "unknown"],
    version_source: ["web_diagnostic", "panel", "provider_support", "cli", "unknown"], runtimes: ["yes", "no", "unknown"], exec_model: ["fpm", "mod_php", "cgi", "frankenphp", "litespeed", "unknown"], mitigations_applied: ["yes", "no", "unknown"], update_applied: ["confirmed", "assumed", "no", "unknown"],
    update_from: ["upstream", "os_vendor", "provider", "other", "unknown"], restarted: ["confirmed", "assumed", "no", "unknown"] };
  for (const [f, vals] of Object.entries(fields)) for (const v of vals) assert.ok(C.has(`val.${f}.${v}`), `val.${f}.${v}`);
  for (const f of ["domain", "site_name", "hosting_type", "provider", "panel", "package_source", "os_family", "release", "plesk_os", "version", "version_source", "runtimes", "exec_model", "update_applied", "update_from", "mitigations_applied", "restarted"]) assert.ok(C.has("sum." + f), "sum." + f);
  for (const n of [1, 2, 3, 4]) assert.ok(C.has("step." + n));
  for (const k of ["hosting.shared", "hosting.managed", "hosting.vps", "hosting.docker", "hosting.unknown"]) assert.ok(C.has(k), k);
  for (const k of ["help.cmd.upstream", "help.cmd.docker", "help.cmd.distro", "help.cmd.plesk", "help.cmd.note.upstream", "help.cmd.note.docker", "help.cmd.note.distro", "help.cmd.note.plesk"]) assert.ok(C.has(k), k);
  for (const s of ["verified", "declared", "inferred", "unknown"]) assert.ok(C.has("evg." + s) && C.has(`evg.${s}.d`));
});
test("every form field referenced by app.js exists in index.html", () => {
  const app = read("app.js");
  const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of app.matchAll(/\$\("([\w-]+)"\)/g)) {
    if (["report-heading", "btn-edit", "btn-print", "btn-download", "btn-new", "rules-error", "rules-error-detail"].includes(m[1])) continue;
    assert.ok(ids.has(m[1]), `index.html lacks #${m[1]}`);
  }
  for (const m of app.matchAll(/\$\("(err-[\w]+)"\)/g)) assert.ok(ids.has(m[1]));
  const names = new Set([...html.matchAll(/name="(\w+)"/g)].map((m) => m[1]));
  for (const n of ["hosting_type", "package_source", "os_family", "plesk_os", "version_source", "runtimes", "exec_model", "update_applied", "mitigations_applied", "restarted"]) assert.ok(names.has(n), n);
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
