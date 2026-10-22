"use strict";
// English-only product text: no other language, no language switching, honest wording.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const C = require("../copy.js");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const SITE_FILES = ["index.html", "app.js", "copy.js", "engine.js", "style.css"];

test("every string is a non-empty string and placeholders are well formed", () => {
  for (const [k, v] of Object.entries(C.copy)) {
    assert.strictEqual(typeof v, "string", k);
    assert.ok(v.trim().length > 0, k);
    for (const m of v.matchAll(/\{([^}]*)\}/g)) assert.match(m[1], /^\w+$/, `${k} has a malformed placeholder`);
  }
});
test("t() substitutes placeholders and returns the key for unknown keys", () => {
  assert.strictEqual(C.t("step.of", { n: 2, total: 4, name: "Hosting" }), "Step 2 of 4: Hosting");
  assert.strictEqual(C.t("no.such.key"), "no.such.key");
  assert.strictEqual(C.t("reach.checking", { seconds: 8 }), "Waiting for the site to answer (up to 8 seconds)…");
});
test("the three statuses are exactly the specified labels", () => {
  assert.strictEqual(C.copy["status.affected"], "Affected according to the available evidence");
  assert.strictEqual(C.copy["status.supported"], "Remediation supported by the available evidence");
  assert.strictEqual(C.copy["status.verify"], "Needs further verification");
});
test("every reason code and every plan action has text", () => {
  const codes = ["affected", "remediated", "platform_not_covered", "package_source_unknown", "provider_managed", "docker_not_official", "plesk_windows", "plesk_os_unknown", "plesk_eol_branch", "eol_branch", "prerelease", "unknown_branch", "unexpected_package_format", "version_unknown", "version_source_unconfirmed", "update_version_conflict", "restart_not_confirmed"];
  for (const c of codes) assert.ok(C.has("why." + c), "why." + c);
  const E = require("../engine.js"), R = require("../rules.js");
  const ids = new Set();
  for (const input of [
    { platform: "upstream", version: "8.4.20", version_source: "cli", restarted: "no", runtimes: "yes", update_applied: "confirmed" },
    { platform: "other", other_kind: "provider" }, { platform: "docker", docker_image: "other" }, { platform: "plesk", plesk_os: "unknown" },
    { platform: "plesk", plesk_os: "windows" }, { platform: "upstream", version: "8.1.1", version_source: "panel", restarted: "no" },
    { platform: "upstream", version: "8.6.0", version_source: "panel", restarted: "no" }, { platform: "upstream", version: "8.4.27", version_source: "panel", restarted: "confirmed" },
    { platform: "upstream", version: "", version_unknown: "yes" }, { platform: "debian", release: "13", version: "8.4.27", version_source: "panel", restarted: "no" },
    { platform: "upstream", version: "9.1.0", version_source: "panel", restarted: "no" }, { platform: "upstream", version: "8.4.20", version_source: "panel", restarted: "no", update_applied: "no" },
  ]) E.evaluate(input, R).plan.forEach((id) => ids.add(id));
  for (const id of ids) { assert.ok(C.has(`act.${id}.t`) && C.has(`act.${id}.d`), "act." + id); }
  assert.ok(ids.size >= 12);
});

// ---- English only ----
test("no Romanian or other non-English letters in any site file", () => {
  for (const f of SITE_FILES) {
    const txt = read(f);
    assert.ok(!/[ăâîșțĂÂÎȘȚşţ]/.test(txt), `${f} contains Romanian letters`);
    assert.ok(!/\b(Continuă|Evaluare|Rezultat|Afectat|Necesită|Alege)\b/.test(txt), `${f} contains Romanian words`);
  }
  const rules = read("rules.json");
  assert.ok(!/[ăâîșț]/.test(rules));
});
test("no language selector or language-switching logic remains", () => {
  const html = read("index.html"), app = read("app.js");
  assert.ok(!/lang-en|lang-ro|data-lang|aria-pressed|class="lang"/.test(html));
  assert.ok(!/setLang|navigator\.language|searchParams|lang-en|lang-ro|\?lang|URLSearchParams|replaceState/.test(app));
  assert.match(html, /<html lang="en">/);
  assert.ok(!fs.existsSync(path.join(root, "i18n.js")), "i18n.js should be gone");
  assert.ok(!/DYD_I18N|i18n/.test(html + app + read("copy.js")));
});

// ---- banned wording (B3), applied to run-time copy and to the static page ----
const BANNED = /(?<![\p{L}])(scanned|audited|certified|safe|secure|protected|guaranteed|compromised|hacked)(?![\p{L}])|(?<![\p{L}])no risk(?![\p{L}])/iu;
const ALLOWED_KEYS = { "scope.note": "the mandatory scope sentence: 'does not mean that any server was scanned, audited or certified'" };
const NEGATION = /never claims or implies that a server was scanned, audited or certified|does not mean that any server was scanned, audited or certified/;
test("banned words appear only inside the allowlisted negations (copy.js)", () => {
  for (const [k, v] of Object.entries(C.copy)) {
    if (BANNED.test(v)) { assert.ok(k in ALLOWED_KEYS, `${k} uses banned wording: ${v}`); assert.match(v, NEGATION); }
  }
});
test("banned words appear only inside the explicit negation in index.html", () => {
  read("index.html").split("\n").forEach((line, i) => { if (BANNED.test(line)) assert.match(line, NEGATION, `index.html:${i + 1}: ${line}`); });
});
test("the page never calls a site secure or vulnerable-free in rules text either", () => {
  const rules = JSON.parse(read("rules.json"));
  for (const c of rules.cves) assert.ok(!BANNED.test([c.impact, c.mechanism, c.mitigation].join(" ")), c.id);
});
