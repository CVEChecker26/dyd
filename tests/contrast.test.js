"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--([\w-]+):\s*(#[0-9A-Fa-f]{6})\s*;/g)) out[m[1]] = m[2];
  return out;
}
const rootBlock = /:root\s*\{([^}]*)\}/.exec(css)[1];
const lightBlock = /@media \(prefers-color-scheme: light\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(css)[1];
const dark = tokens(rootBlock);
const light = Object.assign({}, dark, tokens(lightBlock));

function lum(hex) {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a, b) { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); }

// [foreground, background, minimum, why]
const PAIRS = [
  ["text", "bg", 4.5, "body text"], ["text", "surface", 4.5, "text on cards"], ["text", "surface-2", 4.5, "text in tiles and inputs"],
  ["muted", "bg", 4.5, "secondary text"], ["muted", "surface", 4.5, "secondary text on cards"], ["muted", "surface-2", 4.5, "secondary text in tiles"],
  ["link", "bg", 4.5, "links"], ["link", "surface", 4.5, "links on cards"],
  ["btn-text", "btn-bg", 4.5, "button label"],
  ["danger", "bg", 4.5, "affected text"], ["danger", "surface", 4.5, "affected text on cards"], ["danger", "surface-2", 4.5, "error text"],
  ["warn", "bg", 4.5, "verify text"], ["warn", "surface", 4.5, "verify text on cards"],
  ["ok", "bg", 4.5, "remediated text"], ["ok", "surface", 4.5, "remediated text on cards"],
  ["accent", "bg", 3, "arrow mark / UI accent"], ["accent", "surface", 3, "checked outline on cards"], ["accent", "surface-2", 3, "checked outline on tiles"],
  ["border-strong", "bg", 3, "control border"], ["border-strong", "surface", 3, "control border on cards"], ["border-strong", "surface-2", 3, "tile and input border"],
  ["focus", "bg", 3, "focus ring"], ["focus", "surface", 3, "focus ring on cards"], ["focus", "surface-2", 3, "focus ring on inputs"],
  ["logo-letters", "bg", 4.5, "wordmark letters"],
  ["text", "surface-3", 4.5, "text on selected chips"], ["muted", "surface-3", 4.5, "secondary text on selected chips"], ["accent", "surface-3", 3, "selected chip outline"],
  ["border-strong", "surface-3", 3, "chip border"], ["danger", "surface-3", 4.5, "affected text on raised surfaces"],
];

for (const [name, theme] of [["dark", dark], ["light", light]]) {
  test(`WCAG contrast, ${name} theme`, () => {
    const failures = [];
    for (const [fg, bg, min, why] of PAIRS) {
      assert.ok(theme[fg] && theme[bg], `token missing: ${fg}/${bg}`);
      const r = ratio(theme[fg], theme[bg]);
      if (r < min) failures.push(`${fg} ${theme[fg]} on ${bg} ${theme[bg]} = ${r.toFixed(2)} (< ${min}) [${why}]`);
    }
    assert.deepStrictEqual(failures, []);
  });
}
test("brand palette tokens are unchanged", () => {
  assert.strictEqual(dark.bg.toUpperCase(), "#0B1220"); assert.strictEqual(dark.text.toUpperCase(), "#F4F6F8");
  assert.strictEqual(dark.accent.toUpperCase(), "#2DD4BF"); assert.strictEqual(light.accent.toUpperCase(), "#0E7C70");
  assert.strictEqual(light.bg.toUpperCase(), "#F4F6F8"); assert.strictEqual(light.muted.toUpperCase(), "#475569");
});
test("no gradients, shadows or glows in the stylesheet", () => {
  assert.ok(!/gradient\(|box-shadow|text-shadow|drop-shadow|filter\s*:/i.test(css));
});
test("no purple-ish hue in the stylesheet tokens", () => {
  for (const hex of [...new Set([...Object.values(dark), ...Object.values(light)])]) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40) continue;
    let h; const d = max - min;
    if (max === r) h = ((g - b) / d) % 6; else if (max === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
    assert.ok(!(h >= 255 && h <= 320), `${hex} has a purple hue`);
  }
});
