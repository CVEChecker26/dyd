"use strict";
// Launches an installed Edge or Chrome via playwright-core (no browser download).
const { chromium } = require("playwright-core");

async function launch() {
  const errors = [];
  for (const channel of ["msedge", "chrome"]) {
    try { return await chromium.launch({ channel, headless: true }); } catch (e) { errors.push(`${channel}: ${String(e.message).split("\n")[0]}`); }
  }
  const err = new Error("No installed Edge or Chrome could be launched: " + errors.join(" | "));
  err.code = "NO_BROWSER";
  throw err;
}
module.exports = { launch };
