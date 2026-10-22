#!/usr/bin/env node
"use strict";
// Regenerates the rules table in METHODOLOGY.md from rules.json.
// The table sits between the marker comment and the next blank line after the table.
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const rules = JSON.parse(fs.readFileSync(path.join(root, "rules.json"), "utf8"));
const file = path.join(root, "METHODOLOGY.md");
const first = rules.cves[0].id;
const rows = rules.rules.map((r) => `| ${r.id} | ${r.platform} | ${r.release_label || "PHP " + r.series} | \`${r.per_cve[first].fixed}\` | ${r.source_url} | ${r.verified_at} |`);
const table = ["<!-- RULES-TABLE:START -->", "| Rule | Platform | Branch / release | Fixed in | Primary source | Verified |", "|---|---|---|---|---|---|", ...rows, "<!-- RULES-TABLE:END -->"].join("\n");
let md = fs.readFileSync(file, "utf8");
if (md.includes("<!-- RULES-TABLE -->")) md = md.replace("<!-- RULES-TABLE -->", table);
else md = md.replace(/<!-- RULES-TABLE:START -->[\s\S]*?<!-- RULES-TABLE:END -->/, table);
fs.writeFileSync(file, md);
console.log("METHODOLOGY.md table updated");
