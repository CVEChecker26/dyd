"use strict";
// Parses the Pages workflow without dependencies (it is a small, regular YAML file) and cross-checks the whitelist.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { WHITELIST } = require("./helpers/server.js");

const wf = fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", "pages.yml"), "utf8");

test("workflow has no tabs and consistent two-space indentation", () => {
  assert.ok(!/\t/.test(wf));
  for (const line of wf.split("\n")) { if (line.trim()) assert.strictEqual((line.match(/^ */)[0].length) % 2, 0, line); }
});
test("workflow structure: jobs, needs, environment, concurrency, minimal permissions", () => {
  assert.match(wf, /^concurrency:\n  group: pages/m);
  assert.match(wf, /^permissions:\n  contents: read/m);
  assert.match(wf, /\n  test:\n/); assert.match(wf, /\n  deploy:\n/);
  assert.match(wf, /needs: test/);
  assert.match(wf, /environment:\n      name: github-pages/);
  assert.match(wf, /pages: write\n      id-token: write/);
  assert.ok(!/contents: write|write-all/.test(wf));
  assert.match(wf, /run: npm test/);
});
test("actions are pinned to major versions that were verified", () => {
  const uses = [...wf.matchAll(/uses: (\S+)/g)].map((m) => m[1]);
  assert.deepStrictEqual([...new Set(uses)].sort(), ["actions/checkout@v7", "actions/deploy-pages@v5", "actions/setup-node@v7", "actions/upload-pages-artifact@v5"]);
});
test("deployed whitelist equals the files the tests and the local server treat as the site", () => {
  const cp = /cp (index\.html[^\n]*) _site\//.exec(wf)[1].split(/\s+/);
  const expected = WHITELIST.slice().sort();
  assert.deepStrictEqual(cp.slice().sort(), expected);
  assert.match(wf, /cp -r assets _site\/assets/);
  for (const banned of ["BRAND", "tests", "docs", "scripts"]) assert.ok(!new RegExp(`cp[^\\n]*\\b${banned}\\b`).test(wf), banned);
});
