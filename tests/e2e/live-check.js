"use strict";
// Post-deploy check of the published page: node tests/e2e/live-check.js [url]
// Asserts that rules load, an assessment works and the console is clean. Exit code 1 on any failure.
const { launch } = require("../helpers/browser.js");
const URL_BASE = process.argv[2] || "https://cvechecker26.github.io/dyd/";
(async () => {
  const browser = await launch();
  const page = await (await browser.newContext()).newPage();
  const problems = [], statuses = {};
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(m.text()); });
  page.on("pageerror", (e) => problems.push(e.message));
  page.on("response", (r) => { statuses[new URL(r.url()).pathname] = r.status(); });
  await page.goto(URL_BASE + "?lang=en");
  await page.waitForLoadState("networkidle");
  const fail = (m) => { console.error("FAIL: " + m); process.exitCode = 1; };
  if (await page.locator("#rules-error").isVisible()) fail("rules error box is visible");
  const n = await page.evaluate(() => (window.DYD_RULES && window.DYD_RULES.rules ? window.DYD_RULES.rules.length : 0));
  if (n < 1) fail("window.DYD_RULES not loaded");
  for (const f of ["rules.js", "engine.js", "i18n.js", "app.js", "style.css"]) if (statuses[new URL(f, URL_BASE).pathname] !== 200) fail(f + " not served with 200");
  await page.locator("input[name=platform][value=upstream]").check(); await page.click("#btn-next");
  await page.fill("#version", "8.4.20"); await page.click("#btn-next");
  await page.locator("input[name=source][value=web]").check(); await page.locator("input[name=restarted][value=yes]").check(); await page.click("#btn-next");
  const h = await page.textContent("#result-heading");
  if (!h.includes("Affected according to the advisory")) fail("unexpected verdict: " + h);
  if (problems.length) fail("console problems: " + problems.join(" | "));
  console.log(`rules=${n} title=${JSON.stringify(await page.title())} verdict=${JSON.stringify(h.trim())} console=${problems.length} errors`);
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
