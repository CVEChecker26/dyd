"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const DOCS = ["README.md", "METHODOLOGY.md", "PRIVACY.md", "SECURITY.md", "CHANGELOG.md"];
const BANNED = /(?<![\p{L}])(scanned|audited|certified|safe|secure|protected|guaranteed|compromised|hacked|no risk|scanat\p{L}*|auditat\p{L}*|certificat\p{L}*|sigur\p{L}*|securizat\p{L}*|protejat\p{L}*|garantat\p{L}*|compromis\p{L}*)(?![\p{L}])/iu;
// A line may contain a banned word only inside this explicit negation phrase.
const NEGATION = /never claims or implies that a server was scanned, audited or certified/;

test("docs use banned wording only inside explicit negations", () => {
  for (const f of DOCS) {
    fs.readFileSync(path.join(root, f), "utf8").split("\n").forEach((line, i) => {
      if (BANNED.test(line)) assert.ok(NEGATION.test(line), `${f}:${i + 1} uses banned wording outside a negation: ${line}`);
    });
  }
});
test("docs do not claim live/published/deployed status before it is verified", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  // The one Pages URL below was verified after deployment (workflow success, HTTP 200, title, scripts).
  const other = (readme.match(/https?:\/\/[^\s)>]*github\.io[^\s)>]*/g) || []).filter((u) => u !== "https://cvechecker26.github.io/dyd/");
  assert.deepStrictEqual(other, [], "only the verified Pages URL may be linked");
  assert.ok(!/\b(is live|now live|has been deployed|is deployed|is published)\b/i.test(readme));
});
test("independence statement is present in README and in the page", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.match(readme, /not affiliated with or endorsed by the PHP Group, Debian, Ubuntu, Docker or Plesk/);
  assert.match(readme, /trademark or domain clearance/);
  const I = require("../i18n.js");
  assert.match(I.en.indep, /not affiliated with or endorsed by the PHP Group, Debian, Ubuntu, Docker or Plesk/);
});
test("README does not invent badges or repository URLs", () => {
  const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
  assert.ok(!/img\.shields\.io|badge\.svg/.test(readme));
});
