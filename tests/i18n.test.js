"use strict";
const test = require("node:test");
const assert = require("node:assert");
const I = require("../i18n.js");

const enKeys = Object.keys(I.en).sort();
const roKeys = Object.keys(I.ro).sort();
const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(",");

test("EN and RO have identical key sets", () => {
  assert.deepStrictEqual(roKeys.filter((k) => !(k in I.en)), [], "keys only in RO");
  assert.deepStrictEqual(enKeys.filter((k) => !(k in I.ro)), [], "keys only in EN");
});
test("identical {placeholder} sets per key", () => {
  for (const k of enKeys) assert.strictEqual(ph(I.ro[k]), ph(I.en[k]), k);
});
test("no empty or non-string values", () => {
  for (const lang of ["en", "ro"]) for (const [k, v] of Object.entries(I[lang])) {
    assert.strictEqual(typeof v, "string", `${lang}.${k}`);
    assert.ok(v.trim().length > 0, `${lang}.${k} is empty`);
  }
});
test("Romanian uses comma-below diacritics, never cedilla forms", () => {
  for (const [k, v] of Object.entries(I.ro)) assert.ok(!/[şţŞŢ]/.test(v), k);
  const joined = Object.values(I.ro).join(" ");
  for (const ch of ["ă", "â", "î", "ș", "ț"]) assert.ok(joined.includes(ch), `missing ${ch}`);
});
test("no mojibake or leftover escape fragments in any string", () => {
  for (const lang of ["en", "ro"]) for (const [k, v] of Object.entries(I[lang])) {
    assert.ok(!/\\u[0-9a-f]{4}/i.test(v), `${lang}.${k} has a literal escape`);
    assert.ok(!/(^|\s)0[0-9]{3}[a-zA-Zățș]/.test(v), `${lang}.${k} looks corrupted: ${v}`);
    assert.ok(!/[�ÃÄÈ]/.test(v), `${lang}.${k} has mojibake characters`);
  }
  assert.strictEqual(I.ro["env.other"], "Altceva / nu știu");
});
test("exact verdict strings (B5)", () => {
  assert.strictEqual(I.en["verdict.affected"], "Affected according to the advisory");
  assert.strictEqual(I.en["verdict.remediated"], "Remediated according to the declared data");
  assert.strictEqual(I.en["verdict.verify"], "Needs further verification");
  assert.strictEqual(I.ro["verdict.affected"], "Afectat conform avizului");
  assert.strictEqual(I.ro["verdict.remediated"], "Remediat conform datelor declarate");
  assert.strictEqual(I.ro["verdict.verify"], "Necesită verificări suplimentare");
});
test("every reason code has why + next steps in both languages", () => {
  const codes = ["platform_not_covered", "docker_not_official", "plesk_windows", "plesk_eol_branch", "eol_branch", "prerelease", "unknown_branch", "unexpected_package_format", "version_source_unconfirmed", "restart_not_confirmed", "affected", "remediated"];
  for (const lang of ["en", "ro"]) for (const c of codes) {
    assert.ok(I[lang]["why." + c], `${lang} why.${c}`);
    for (const n of [1, 2, 3]) assert.ok(I[lang][`next.${c}.${n}`], `${lang} next.${c}.${n}`);
  }
});
test("t() substitutes placeholders and falls back", () => {
  assert.strictEqual(I.t("en", "step.of", { n: 2, total: 3, name: "X" }), "Step 2 of 3: X");
  assert.strictEqual(I.t("ro", "step.of", { n: 2, total: 3, name: "X" }), "Pasul 2 din 3: X");
  assert.strictEqual(I.t("en", "no.such.key"), "no.such.key");
});

// ---- banned wording (B3) ----
const BANNED_EN = /(?<![\p{L}])(scanned|audited|certified|safe|secure|protected|guaranteed|compromised|hacked)(?![\p{L}])|(?<![\p{L}])no risk(?![\p{L}])/iu;
const BANNED_RO = /(?<![\p{L}])(scanat\p{L}*|auditat\p{L}*|certificat\p{L}*|sigur\p{L}*|securizat\p{L}*|protejat\p{L}*|garantat\p{L}*|compromis\p{L}*)(?![\p{L}])/iu;
// Keys allowed to contain a banned word, each one only inside an explicit negation:
const ALLOWED = {
  "never.1": "the list of things the tool never does: 'never claims ... scanned, audited or certified'",
  "result.limits": "the mandatory limits sentence: 'does not mean that any server was scanned, audited or certified'",
};
test("banned words appear only in the allowlisted negation keys", () => {
  for (const [lang, re] of [["en", BANNED_EN], ["ro", BANNED_RO]]) {
    for (const [k, v] of Object.entries(I[lang])) {
      if (re.test(v)) assert.ok(k in ALLOWED, `${lang}.${k} contains banned wording: ${v}`);
    }
  }
});
test("allowlisted keys really are negations", () => {
  assert.match(I.en["never.1"], /never/); assert.match(I.ro["never.1"], /Nu .* niciodată/);
  assert.match(I.en["result.limits"], /does not mean/); assert.match(I.ro["result.limits"], /Nu înseamnă/);
  for (const k of Object.keys(ALLOWED)) assert.ok(k in I.en);
});
