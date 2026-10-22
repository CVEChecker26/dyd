"use strict";
// Captures the README screenshots from the real page, and composes the 1200x630 social preview
// from the official BRAND logo file (the logo is placed, never redrawn).
const fs = require("node:fs");
const path = require("node:path");
const { start } = require("../helpers/server.js");
const { launch } = require("../helpers/browser.js");

const root = path.join(__dirname, "..", "..");
const out = path.join(root, "docs", "screenshots");

async function flow(page, o) {
  await page.fill("#domain", o.domain);
  await page.click("#btn-next");
  await page.locator(`input[name=hosting_type][value=${o.hosting}]`).check();
  await page.click("#btn-next");
  await page.locator(`input[name=package_source][value=${o.ps}]`).check();
  if (o.os) await page.locator(`input[name=os_family][value=${o.os}]`).check();
  if (o.release) await page.selectOption("#release", o.release);
  await page.fill("#version", o.version);
  await page.locator(`input[name=version_source][value=${o.vsrc}]`).check();
  if (o.stop3) return;
  await page.click("#btn-next");
  await page.locator(`input[name=update_applied][value=${o.update}]`).check();
  await page.locator(`input[name=restarted][value=${o.restart}]`).check();
  await page.click("#btn-next");
}

(async () => {
  fs.mkdirSync(out, { recursive: true });
  const srv = await start("/");
  const browser = await launch();
  const shot = async (opts, name, fn) => {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    await page.goto(srv.base);
    await page.waitForLoadState("networkidle");
    await fn(page);
    await page.screenshot({ path: path.join(out, name) });
    await ctx.close();
  };
  const verify = { domain: "example.com", hosting: "vps", ps: "distro", os: "debian", release: "13", version: "8.4.27-1~deb13u1", vsrc: "panel", update: "confirmed", restart: "assumed" };
  const affected = { domain: "example.com", hosting: "vps", ps: "distro", os: "debian", release: "12", version: "8.2.32-1~deb12u1", vsrc: "panel", update: "no", restart: "no" };
  await shot({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" }, "dark.png", async () => {});
  await shot({ viewport: { width: 1440, height: 900 }, colorScheme: "light" }, "light.png", async (page) => { await flow(page, Object.assign({}, verify, { stop3: true })); });
  await shot({ viewport: { width: 390, height: 844 }, colorScheme: "dark", deviceScaleFactor: 2 }, "mobile.png", async () => {});
  await shot({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" }, "result.png", async (page) => { await flow(page, affected); });
  await shot({ viewport: { width: 1440, height: 1000 }, colorScheme: "dark" }, "result-verify.png", async (page) => { await flow(page, verify); });
  // Social preview composed from the official primary-dark logo file.
  const logo = "file:///" + path.join(root, "BRAND", "dyd-brand", "svg", "dyd-logo-primary-dark.svg").replace(/\\/g, "/");
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 } });
  const page = await ctx.newPage();
  fs.mkdirSync(path.join(root, '.local'), { recursive: true });
  const tmp = path.join(root, '.local', 'dyd-social.html');
  fs.writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#0B1220;display:grid;place-items:center;height:630px;font-family:'Segoe UI',system-ui,sans-serif;color:#F4F6F8">
    <div style="text-align:center"><img src="${logo}" style="width:560px;display:block;margin:0 auto 40px">
    <div style="font-size:34px;font-weight:600">Check your exposure to two critical PHP vulnerabilities.</div>
    <div style="font-size:22px;color:#A8B3C5;margin-top:16px">CVE-2026-109618 · CVE-2026-109619 · evidence-based · runs in your browser · no tracking</div></div></body>`);
  await page.goto('file:///' + tmp.split(path.sep).join('/'));
  await page.waitForLoadState("load");
  await page.screenshot({ path: path.join(root, "assets", "social-preview.png") });
  await ctx.close();
  fs.unlinkSync(tmp);
  await browser.close();
  await srv.close();
  console.log("screenshots written");
})().catch((e) => { console.error(e); process.exit(1); });
