"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { generate } = require("../scripts/build-rules.js");

const root = path.join(__dirname, "..");
const json = JSON.parse(fs.readFileSync(path.join(root, "rules.json"), "utf8"));
const CVES = ["CVE-2026-109618", "CVE-2026-109619"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

test("rules.js is exactly what build-rules.js generates from rules.json", () => {
  const expected = generate(fs.readFileSync(path.join(root, "rules.json"), "utf8"));
  const actual = fs.readFileSync(path.join(root, "rules.js"), "utf8");
  assert.strictEqual(actual, expected);
});

test("rules.js exports data equal to rules.json under Node", () => {
  assert.deepStrictEqual(require("../rules.js"), json);
});

test("rules.js sets window.DYD_RULES when there is no module", () => {
  const src = fs.readFileSync(path.join(root, "rules.js"), "utf8");
  const win = {};
  new Function("window", "module", src)(win, undefined);
  assert.deepStrictEqual(win.DYD_RULES, json);
});

test("top-level structure (schema version 2)", () => {
  assert.strictEqual(json.schema_version, 2);
  assert.match(json.rules_verified_at, DATE);
  assert.strictEqual(json.review_status, "pending_independent_human_review");
  assert.deepStrictEqual(json.cves.map((c) => c.id), CVES);
  for (const c of json.cves) {
    assert.ok(c.title);
    assert.match(c.advisory, /^https:\/\/github\.com\/php\/php-src\/security\/advisories\/GHSA-/);
  }
  assert.ok(Array.isArray(json.upstream_prerelease_branches));
  assert.ok(Array.isArray(json.rules) && json.rules.length > 0);
  if ("php82_end_of_support" in json) {
    assert.match(json.php82_end_of_support.date, DATE);
    assert.match(json.php82_end_of_support.source_url, /^https:\/\/www\.php\.net\//);
  }
});

test("every rule has both CVEs, sources, dates and reviewer note", () => {
  const ids = new Set();
  for (const r of json.rules) {
    assert.ok(!ids.has(r.id), `duplicate id ${r.id}`);
    ids.add(r.id);
    assert.ok(["upstream", "docker", "plesk", "debian", "ubuntu"].includes(r.platform), r.id);
    assert.ok(r.series || r.release, r.id);
    for (const c of CVES) {
      assert.ok(r.per_cve[c], `${r.id} lacks ${c}`);
      assert.ok(r.per_cve[c].fixed, `${r.id} lacks fixed for ${c}`);
      assert.match(r.per_cve[c].source_url, /^https:\/\//, r.id);
    }
    assert.strictEqual(Object.keys(r.per_cve).length, 2);
    assert.match(r.source_url, /^https:\/\//);
    assert.ok(Array.isArray(r.extra_sources));
    for (const u of r.extra_sources) { assert.match(u, /^https:\/\//); }
    assert.ok(r.source_type);
    assert.ok(r.rationale.length > 20);
    assert.match(r.verified_at, DATE);
    assert.strictEqual(r.verified_by, "AI-assisted reading of official sources; independent human review pending");
  }
});

test("distro rules carry package_series, version_regex and a matching example", () => {
  for (const r of json.rules.filter((x) => x.platform === "debian" || x.platform === "ubuntu")) {
    assert.ok(r.package_series && r.package && r.release_label, r.id);
    const re = new RegExp(r.version_regex);
    assert.ok(re.test(r.example), `${r.id} example does not match its regex`);
    for (const c of CVES) { assert.ok(re.test(r.per_cve[c].fixed), `${r.id} fixed does not match regex`); }
  }
});

test("upstream-like rules use MAJOR.MINOR.PATCH inside their own series", () => {
  for (const r of json.rules.filter((x) => ["upstream", "docker", "plesk"].includes(x.platform))) {
    for (const c of CVES) {
      assert.ok(r.per_cve[c].fixed.startsWith(r.series + "."), `${r.id} threshold leaves its branch`);
      assert.match(r.per_cve[c].fixed, /^\d+\.\d+\.\d+$/);
    }
  }
});

test("candidate data that was confirmed: exact thresholds", () => {
  const f = (id) => json.rules.find((r) => r.id === id).per_cve[CVES[0]].fixed;
  assert.strictEqual(f("upstream-8.2"), "8.2.35");
  assert.strictEqual(f("upstream-8.3"), "8.3.36");
  assert.strictEqual(f("upstream-8.4"), "8.4.27");
  assert.strictEqual(f("upstream-8.5"), "8.5.12");
  assert.strictEqual(f("debian-13"), "8.4.27-1~deb13u1");
  assert.strictEqual(f("debian-12"), "8.2.35-1~deb12u1");
  assert.strictEqual(f("ubuntu-26.10"), "8.5.9-0ubuntu2.1");
  assert.strictEqual(f("ubuntu-14.04"), "5.5.9+dfsg-1ubuntu4.29+esm18");
});

test("no rule exists for platforms that are always 'verify'", () => {
  const platforms = new Set(json.rules.map((r) => r.platform));
  assert.deepStrictEqual([...platforms].sort(), ["debian", "docker", "plesk", "ubuntu", "upstream"]);
  assert.ok(!json.rules.some((r) => r.series && /^(8\.1|8\.0|7\.|5\.|8\.6)/.test(r.series) && r.platform !== "ubuntu"));
});

test("each CVE carries the advisory-based facts the report shows", () => {
  for (const c of json.cves) {
    for (const k of ["severity", "cvss", "published", "impact", "mechanism", "mitigation"]) assert.ok(typeof c[k] === "string" && c[k].length >= 8, `${c.id}.${k}`);
    assert.match(c.published, DATE);
    assert.strictEqual(c.severity, "Critical");
    assert.match(c.impact, /remote code execution/);
    assert.match(c.mitigation, /updat/i);
  }
});
