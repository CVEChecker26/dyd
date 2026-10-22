"use strict";
// Browser end-to-end tests. Drives an installed Edge/Chrome through playwright-core.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { start } = require("../helpers/server.js");
const { launch } = require("../helpers/browser.js");
const AxeBuilder = require("@axe-core/playwright").default || require("@axe-core/playwright");
const C = require("../../copy.js");

const STATIC_FILES = ["/", "/index.html", "/style.css", "/app.js", "/engine.js", "/copy.js", "/rules.js", "/assets/favicon.svg", "/assets/favicon.ico", "/assets/apple-touch-icon.png", "/favicon.ico"];
const HEAD = { affected: C.copy["headline.affected"], remediated: C.copy["headline.supported"], verify: C.copy["headline.verify"] };
const BADGE = { affected: C.copy["status.affected"], remediated: C.copy["status.supported"], verify: C.copy["status.verify"] };
const FIXED = { domain: "example.com", hosting: "vps", ps: "upstream", version: "8.4.27", vsrc: "panel", update: "confirmed", restart: "confirmed" };

const CASES = [
  { name: "upstream fixed and confirmed", a: {}, v: "remediated" },
  { name: "upstream below the fixed version, no update", a: { version: "8.4.20", update: "no", restart: "no" }, v: "affected" },
  { name: "fixed version read from the command line only", a: { vsrc: "cli" }, v: "verify" },
  { name: "fixed version, restart only assumed", a: { restart: "assumed" }, v: "verify" },
  { name: "fixed version, restart unknown", a: { restart: "unknown" }, v: "verify" },
  { name: "PHP version unknown", a: { vunknown: true }, v: "verify" },
  { name: "update claimed but version below the fixed one", a: { version: "8.4.20", update: "confirmed" }, v: "verify" },
  { name: "shared hosting, provider-managed PHP", a: { hosting: "shared", ps: "provider" }, v: "verify" },
  { name: "package source unknown", a: { ps: "unknown" }, v: "verify" },
  { name: "PHP 8.1 is end of life", a: { version: "8.1.30", update: "no" }, v: "verify" },
  { name: "docker official image, fixed", a: { hosting: "docker", ps: "docker_official", version: "8.5.12" }, v: "remediated" },
  { name: "docker custom image", a: { hosting: "docker", ps: "docker_other", version: "8.5.12" }, v: "verify" },
  { name: "debian 13 package, fixed", a: { ps: "distro", os: "debian", release: "13", version: "8.4.27-1~deb13u1" }, v: "remediated" },
  { name: "ubuntu 24.04 package, below the fixed one", a: { ps: "distro", os: "ubuntu", release: "24.04", version: "8.3.6-0ubuntu0.24.04.12", update: "no", restart: "no" }, v: "affected" },
  { name: "ubuntu package with an upstream-style number", a: { ps: "distro", os: "ubuntu", release: "24.04", version: "8.3.36" }, v: "verify" },
  { name: "plesk on linux, fixed", a: { hosting: "dedicated", panel: "plesk", ps: "plesk", plesk: "linux", version: "8.5.12" }, v: "remediated" },
  { name: "plesk on windows", a: { hosting: "dedicated", panel: "plesk", ps: "plesk", plesk: "windows", version: "8.5.12" }, v: "verify" },
  { name: "fixed version, update not installed", a: { update: "no" }, v: "verify" },
  { name: "fixed version, several PHP runtimes", a: { runtimes: "yes" }, v: "verify" },
];

async function answer(page, over, opts = {}) {
  const a = Object.assign({}, FIXED, over);
  await page.fill("#domain", a.domain);
  if (a.name) await page.fill("#site_name", a.name);
  await page.click("#btn-next");
  await page.locator(`input[name=hosting_type][value=${a.hosting}]`).check();
  if (a.provider) await page.fill("#provider", a.provider);
  if (a.panel) await page.selectOption("#panel", a.panel);
  await page.click("#btn-next");
  await page.locator(`input[name=package_source][value=${a.ps}]`).check();
  if (a.os) await page.locator(`input[name=os_family][value=${a.os}]`).check();
  if (a.release) await page.selectOption("#release", a.release);
  if (a.plesk) await page.locator(`input[name=plesk_os][value=${a.plesk}]`).check();
  if (a.vunknown) await page.locator("#version_unknown").check(); else if (!["provider", "unknown"].includes(a.ps)) await page.fill("#version", a.version);
  if (!a.vunknown && !["provider", "unknown"].includes(a.ps)) await page.locator(`input[name=version_source][value=${a.vsrc}]`).check();
  if (a.runtimes) await page.locator(`input[name=runtimes][value=${a.runtimes}]`).check();
  if (a.exec) await page.locator(`input[name=exec_model][value=${a.exec}]`).check();
  await page.click("#btn-next");
  await page.locator(`input[name=update_applied][value=${a.update}]`).check();
  if (a.from) await page.selectOption("#update_from", a.from);
  if (a.mit) await page.locator(`input[name=mitigations_applied][value=${a.mit}]`).check();
  await page.locator(`input[name=restarted][value=${a.restart}]`).check();
  if (!opts.stop) await page.click("#btn-next");
}

let browser, srv, sub, skipReason = null;
before(async () => {
  try { browser = await launch(); } catch (e) { skipReason = e.message; return; }
  srv = await start("/");
  sub = await start("/dyd/");
});
after(async () => {
  if (browser) await browser.close();
  if (srv) await srv.close();
  if (sub) await sub.close();
});
const T = (name, fn) => it(name, async (t) => { if (skipReason) return t.skip(skipReason); await fn(t); });

async function newPage(opts = {}, base) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const problems = [];
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) problems.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => problems.push("pageerror: " + e.message));
  await page.addInitScript(() => { window.__csp = []; document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(e.violatedDirective + " " + e.blockedURI)); });
  const requests = [];
  page.on("request", (r) => requests.push(r.url()));
  await page.goto((base || srv.base) + (opts.query || ""));
  return { ctx, page, problems, requests };
}
const badges = (page) => page.locator(".cve-card .badge").allTextContents().then((l) => l.map((x) => x.replace(/^[!?✓]\s*/, "").trim()));
const heading = (page) => page.textContent("#report-heading");

describe("the assessment flow", () => {
  for (const c of CASES) {
    T(`${c.name} -> ${c.v}`, async () => {
      const { ctx, page, problems } = await newPage();
      await answer(page, c.a);
      assert.strictEqual(await heading(page), HEAD[c.v]);
      assert.strictEqual(await page.evaluate(() => document.activeElement.id), "report-heading");
      assert.deepStrictEqual(await badges(page), [BADGE[c.v], BADGE[c.v]]);
      assert.strictEqual(await page.locator(".cve-card").count(), 2);
      assert.ok((await page.textContent(".verdict")).includes("It does not mean that any server was scanned, audited or certified"));
      assert.deepStrictEqual(problems, []);
      await ctx.close();
    });
  }
  T("a first action and an ordered plan are always shown, ending with the re-check", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { version: "8.4.20", update: "no", restart: "no" });
    assert.ok((await page.textContent(".first")).includes("Install the vendor-supported update"));
    const steps = await page.locator(".plan li b").allTextContents();
    assert.strictEqual(steps[0], "Install the vendor-supported update");
    assert.strictEqual(steps[steps.length - 1], "Run the assessment again");
    await ctx.close();
  });
  T("the report keeps the declared facts separate from the verified ones", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { name: "My shop" });
    const group = async (title) => (await page.locator(".ev-group", { has: page.locator("h4", { hasText: title }) }).textContent());
    const declared = await group("Declared by you"), verified = await group("Verified by dyd"), unknown = await group("Unknown or unconfirmed"), inferred = await group("Inferred");
    assert.ok(declared.includes("Domain: example.com") && declared.includes("PHP version: 8.4.27") && declared.includes("PHP restarted or container recreated"));
    assert.ok(verified.includes("Rule upstream-8.4"));
    assert.ok(!verified.includes("PHP version") && !verified.includes("restarted"), "declared claims must not appear as verified");
    assert.ok(inferred.includes("CVE-2026-109618") && inferred.includes("CVE-2026-109619"));
    assert.ok(unknown.includes("Reachability not established"));
    assert.ok((await page.textContent(".report-meta")).includes("My shop"));
    assert.ok((await page.textContent(".prov")).includes("independent human review pending"));
    await ctx.close();
  });
  T("the risk explanation comes from the advisories and is available on demand", async () => {
    const { ctx, page } = await newPage();
    await answer(page, {});
    await page.locator("details.block summary", { hasText: "About these vulnerabilities" }).click();
    const text = await page.textContent("details.block[open]");
    assert.ok(text.includes("unauthenticated remote code execution") && text.includes("Critical, CVSS v4 base score 9.2"));
    assert.ok(text.includes("only complete mitigation") || text.includes("only reliable mitigation"));
    await ctx.close();
  });
  T("an invalid combination never reaches a result: errors appear beside the fields", async () => {
    const { ctx, page } = await newPage();
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-domain"), C.copy["err.domain.required"]);
    assert.strictEqual(await page.getAttribute("#domain", "aria-invalid"), "true");
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-hosting_type"), C.copy["err.hosting_type.required"]);
    await page.locator("input[name=hosting_type][value=vps]").check();
    assert.strictEqual(await page.textContent("#err-hosting_type"), "");
    await page.click("#btn-next");
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-package_source"), C.copy["err.package_source.required"]);
    await page.locator("input[name=package_source][value=upstream]").check();
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version"), C.copy["err.version.required"]);
    await page.fill("#version", "8.04.1"); await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version"), C.copy["err.format"]);
    await page.fill("#version", "8.4.27<script>"); await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version"), C.copy["err.version.bad_chars"]);
    await page.fill("#version", "8.4.27"); await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version_source"), C.copy["err.version_source.required"]);
    assert.strictEqual(await page.locator("#report-heading").count(), 0);
    await ctx.close();
  });
  T("hostile input is rejected or rendered as text, never as markup", async () => {
    const { ctx, page } = await newPage();
    for (const bad of ["javascript:alert(1)", "<img src=x onerror=alert(1)>", "https://user:secret@example.com", "127.0.0.1", "http://192.168.0.1/", "localhost", "example.com:8080", "intranet", "../../etc/passwd", "a b.com"]) {
      await page.fill("#domain", bad); await page.click("#btn-next");
      assert.ok((await page.textContent("#err-domain")).length > 0, `no error for ${bad}`);
      assert.strictEqual(await page.locator("#step-1").isVisible(), true);
    }
    await page.fill("#domain", "example.com"); await page.fill("#site_name", "<img src=x onerror=alert(1)><b>x</b>");
    await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.fill("#provider", "<script>alert(1)</script>");
    await page.click("#btn-next");
    await page.locator("input[name=package_source][value=upstream]").check(); await page.fill("#version", "8.4.27");
    await page.locator("input[name=version_source][value=panel]").check(); await page.click("#btn-next");
    await page.locator("input[name=update_applied][value=confirmed]").check(); await page.locator("input[name=restarted][value=confirmed]").check();
    await page.click("#btn-next");
    assert.strictEqual(await page.locator("#report img, #report script, #summary img, #report [onerror]").count(), 0);
    assert.ok((await page.textContent(".report-meta")).includes("<img src=x onerror=alert(1)>"));
    assert.strictEqual(await page.evaluate(() => window.__csp.length), 0);
    await ctx.close();
  });
  T("answers are preserved when going back, editing and generating again", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { name: "Shop", provider: "Acme Hosting", panel: "cpanel" });
    await page.click("#btn-edit");
    assert.strictEqual(await page.inputValue("#domain"), "example.com");
    assert.strictEqual(await page.inputValue("#site_name"), "Shop");
    await page.click("#btn-next");
    assert.strictEqual(await page.locator("input[name=hosting_type][value=vps]").isChecked(), true);
    assert.strictEqual(await page.inputValue("#provider"), "Acme Hosting");
    assert.strictEqual(await page.inputValue("#panel"), "cpanel");
    await page.click("#btn-next");
    assert.strictEqual(await page.inputValue("#version"), "8.4.27");
    assert.strictEqual(await page.locator("input[name=version_source][value=panel]").isChecked(), true);
    await page.click("#btn-back");
    assert.strictEqual(await page.locator("input[name=hosting_type][value=vps]").isChecked(), true);
    await page.click("#btn-next"); await page.click("#btn-next"); await page.click("#btn-next");
    assert.strictEqual(await heading(page), HEAD.remediated);
    await page.click("#btn-new");
    assert.strictEqual(await page.inputValue("#domain"), "");
    assert.strictEqual(await page.locator("input:checked").count(), 0);
    await ctx.close();
  });
  T("keyboard-only completion", async () => {
    const { ctx, page } = await newPage();
    const activeIs = (sel) => page.evaluate((s) => document.activeElement && document.activeElement.matches(s), sel);
    async function tabTo(sel) { for (let i = 0; i < 60; i++) { if (await activeIs(sel)) return; await page.keyboard.press("Tab"); } throw new Error("could not reach " + sel); }
    await tabTo("#domain"); await page.keyboard.type("example.com"); await page.keyboard.press("Enter");
    await tabTo("input[name=hosting_type]"); await page.keyboard.press("Space"); // Shared hosting
    await tabTo("#btn-next"); await page.keyboard.press("Enter");
    await tabTo("input[name=package_source]"); await page.keyboard.press("Space"); // first visible option: provider-managed for shared hosting
    await tabTo("#version"); await page.keyboard.type("8.4.27");
    await tabTo("input[name=version_source]"); await page.keyboard.press("Space");
    await tabTo("#btn-next"); await page.keyboard.press("Enter");
    await tabTo("input[name=update_applied]"); await page.keyboard.press("Space");
    await tabTo("input[name=restarted]"); await page.keyboard.press("Space");
    await tabTo("#btn-next"); await page.keyboard.press("Enter");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "report-heading");
    assert.strictEqual(await heading(page), HEAD.verify); // shared hosting with provider-managed PHP
    await ctx.close();
  });
});

describe("a dynamic, relevant questionnaire", () => {
  T("hosting answers change the follow-up questions and notes", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    assert.strictEqual(await page.locator("#hosting-note").isVisible(), false);
    await page.locator("input[name=hosting_type][value=shared]").check();
    assert.ok((await page.textContent("#hosting-note")).includes("your provider usually controls PHP"));
    assert.strictEqual(await page.locator("#field-panel").isVisible(), true);
    await page.locator("input[name=hosting_type][value=docker]").check();
    assert.ok((await page.textContent("#hosting-note")).includes("the image decides the PHP build"));
    assert.strictEqual(await page.locator("#field-panel").isVisible(), false);
    await page.click("#btn-next");
    assert.strictEqual(await page.locator('[data-ps="docker_official"]').isVisible(), true);
    assert.strictEqual(await page.locator('[data-ps="distro"]').isVisible(), false);
    assert.strictEqual(await page.locator('[data-ps="upstream"]').isVisible(), false);
    await page.click("#btn-back");
    await page.locator("input[name=hosting_type][value=shared]").check(); await page.click("#btn-next");
    assert.strictEqual(await page.locator('[data-ps="provider"]').isVisible(), true);
    assert.strictEqual(await page.locator('[data-ps="docker_official"]').isVisible(), false);
    assert.strictEqual(await page.locator('[data-ps="plesk"]').isVisible(), false);
    await ctx.close();
  });
  T("the Plesk option appears only when the panel is Plesk", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check();
    await page.click("#btn-next");
    assert.strictEqual(await page.locator('[data-ps="plesk"]').isVisible(), false);
    await page.click("#btn-back"); await page.selectOption("#panel", "plesk"); await page.click("#btn-next");
    assert.strictEqual(await page.locator('[data-ps="plesk"]').isVisible(), true);
    await page.locator("input[name=package_source][value=plesk]").check();
    assert.strictEqual(await page.locator("#fs-plesk_os").isVisible(), true);
    await ctx.close();
  });
  T("a distribution reveals release choices; the version label and example follow the release", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.click("#btn-next");
    assert.strictEqual(await page.locator("#fs-os_family").isVisible(), false);
    await page.locator("input[name=package_source][value=distro]").check();
    assert.strictEqual(await page.locator("#fs-os_family").isVisible(), true);
    assert.strictEqual(await page.locator("#field-release").isVisible(), false);
    await page.locator("input[name=os_family][value=ubuntu]").check();
    assert.strictEqual(await page.locator("#field-release").isVisible(), true);
    assert.ok((await page.locator("#release option").count()) >= 10);
    await page.selectOption("#release", "22.04");
    assert.strictEqual(await page.textContent("#version-label"), "Package version");
    assert.ok((await page.textContent("#version-hint")).includes("8.1.2-1ubuntu2.28"));
    await page.locator("input[name=os_family][value=other]").check();
    assert.strictEqual(await page.locator("#field-release").isVisible(), false);
    await ctx.close();
  });
  T("'I don't know my PHP version' shows tailored instructions", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=shared]").check(); await page.selectOption("#panel", "cpanel"); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=provider]").check();
    assert.strictEqual(await page.locator("#version-help").isVisible(), false);
    await page.locator("#version_unknown").check();
    assert.strictEqual(await page.locator("#version-help").isVisible(), true);
    assert.strictEqual(await page.locator("#version").isDisabled(), true);
    assert.ok((await page.textContent("#help-list")).includes("MultiPHP Manager"));
    await page.click("#btn-back"); await page.selectOption("#panel", "plesk"); await page.click("#btn-next");
    assert.ok((await page.textContent("#help-list")).includes("Websites & Domains"));
    await page.click("#btn-back"); await page.locator("input[name=hosting_type][value=vps]").check(); await page.selectOption("#panel", "none"); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=docker_official]").check();
    assert.strictEqual(await page.textContent("#help-cmd"), "docker exec CONTAINER php -v");
    await page.locator("input[name=package_source][value=distro]").check();
    await page.locator("input[name=os_family][value=debian]").check(); await page.selectOption("#release", "13");
    assert.strictEqual(await page.textContent("#help-cmd"), "dpkg-query -W -f='${Version}\\n' php8.4-fpm");
    await page.click("#copy-btn");
    await page.waitForFunction(() => !document.getElementById("copy-hint").hidden);
    await ctx.close();
  });
  T("the update source question appears only after an update was claimed", async () => {
    const { ctx, page } = await newPage();
    await answer(page, {}, { stop: true });
    await page.locator("input[name=update_applied][value=no]").check();
    assert.strictEqual(await page.locator("#field-update_from").isVisible(), false);
    await page.locator("input[name=update_applied][value=assumed]").check();
    assert.strictEqual(await page.locator("#field-update_from").isVisible(), true);
    await ctx.close();
  });
  T("provider-managed PHP does not demand version or update answers", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=managed]").check(); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=provider]").check(); await page.click("#btn-next");
    await page.click("#btn-next");
    assert.strictEqual(await heading(page), HEAD.verify);
    assert.ok((await page.textContent(".cve-card details")).length > 0);
    await page.locator(".cve-card details summary").first().click();
    assert.ok((await page.textContent(".cve-card details[open]")).includes("Your provider controls this PHP"));
    assert.ok((await page.textContent(".plan")).includes("Ask your provider"));
    await ctx.close();
  });
  T("the stepper and the live answer summary follow the answers", async () => {
    const { ctx, page } = await newPage();
    assert.strictEqual(await page.textContent("#step-status"), "Step 1 of 4: Site");
    await page.fill("#domain", "https://Example.com/x"); await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#step-status"), "Step 2 of 4: Hosting");
    assert.strictEqual(await page.getAttribute("#stepper li[data-step='2']", "aria-current"), "step");
    await page.locator("input[name=hosting_type][value=cloud]").check();
    await page.locator("#answers summary").click();
    const sum = await page.textContent("#summary");
    assert.ok(sum.includes("example.com") && sum.includes("Cloud hosting"));
    await ctx.close();
  });
});

describe("facts from the PHP announcement", () => {
  const ANN = "https://www.php.net/archive/2026.php#2026-10-21-5";
  const notesText = (page) => page.locator(".notes").textContent().catch(() => "");
  const hrefs = (page, sel) => page.locator(sel + " a").evaluateAll((l) => l.map((a) => a.href));

  T("8.6.0 RC4 is a pre-release that needs verification, with the note that it contains the fixes", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { version: "8.6.0RC4" });
    assert.strictEqual(await heading(page), HEAD.verify);
    const n = await notesText(page);
    assert.ok(n.includes("8.6.0 RC4 contains the fixes") && n.includes("pre-release"));
    assert.ok((await hrefs(page, ".notes")).includes("https://github.com/php/php-src/blob/php-8.6.0RC4/NEWS"));
    await ctx.close();
  });
  T("an 8.6 pre-release older than RC4 is not listed as containing the fixes", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { version: "8.6.0RC3" });
    assert.strictEqual(await heading(page), HEAD.verify);
    assert.ok((await notesText(page)).includes("older than 8.6.0 RC4"));
    await ctx.close();
  });
  for (const v of ["7.4.33", "8.0.30", "8.1.30"]) {
    T(`PHP ${v}: the version number proves nothing, backport note and links shown`, async () => {
      const { ctx, page } = await newPage();
      await answer(page, { version: v, update: "confirmed", restart: "confirmed" });
      assert.strictEqual(await heading(page), HEAD.verify);
      assert.deepStrictEqual(await badges(page), [BADGE.verify, BADGE.verify]);
      const n = await notesText(page);
      assert.ok(n.includes("minimal source backports for 7.4, 8.0 and 8.1") && n.includes("cannot show whether the fixes are present"));
      const links = await hrefs(page, ".notes");
      assert.ok(links.includes(ANN));
      const series = v.split(".").slice(0, 2).join(".");
      assert.ok(links.includes(`https://github.com/php/php-src/tree/PHP-${series}-CVE-2026-109618-109619`), "link to the backport branch of this series");
      await ctx.close();
    });
  }
  T("the execution-model question is optional, hidden for provider-managed PHP, and never changes the result", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=provider]").check();
    assert.strictEqual(await page.locator("#fs-exec_model").isVisible(), false);
    await page.locator("input[name=package_source][value=upstream]").check();
    assert.strictEqual(await page.locator("#fs-exec_model").isVisible(), true);
    assert.ok((await page.textContent("#fs-exec_model legend")).includes("optional"));
    assert.strictEqual(await page.locator("#exec-help").isVisible(), false);
    await page.locator("input[name=exec_model][value=unknown]").check();
    assert.ok((await page.textContent("#exec-help")).includes("cannot detect it from the domain"));
    await ctx.close();
    for (const model of ["fpm", "mod_php", "cgi", "frankenphp", "litespeed", "unknown"]) {
      const r = await newPage();
      await answer(r.page, { exec: model });
      assert.strictEqual(await heading(r.page), HEAD.remediated, model);
      assert.ok(!(await r.page.evaluate(() => document.body.innerText)).match(/risk score|rating/i));
      await r.ctx.close();
    }
  });
  T("mod_php adds the announcement's urgency context for an affected install, other models do not", async () => {
    const mod = await newPage();
    await answer(mod.page, { version: "8.4.20", update: "no", restart: "no", exec: "mod_php" });
    const n = await notesText(mod.page);
    assert.ok(n.includes("highest for Apache with mod_php") && n.includes("not a score"));
    assert.ok((await hrefs(mod.page, ".notes")).includes(ANN));
    assert.ok((await mod.page.textContent(".plan")).includes("Restart Apache, or the web server that loads mod_php"));
    await mod.ctx.close();
    const fpm = await newPage();
    await answer(fpm.page, { version: "8.4.20", update: "no", restart: "no", exec: "fpm" });
    assert.ok(!(await notesText(fpm.page)).includes("mod_php"));
    assert.ok((await fpm.page.textContent(".plan")).includes("Restart the PHP-FPM service, every pool"));
    await fpm.ctx.close();
  });
  T("temporary mitigations: shown when not remediated, with limitations and the announcement link", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { version: "8.4.20", update: "no", restart: "no" });
    const block = page.locator("#mitigations");
    assert.strictEqual(await block.count(), 1);
    await block.locator("summary").click();
    const text = await block.textContent();
    assert.ok(text.includes("Only an update is a complete solution") && text.includes("A restart alone does not fix an installation that has not been updated"));
    assert.ok(text.includes("underlying allocation failure can still reach the vulnerable path") && text.includes("can affect availability"));
    assert.ok(text.includes("RLIMIT_AS or RLIMIT_DATA") && text.includes("blocks the confirmed fatal backtrace path only"));
    assert.ok(!/protect|\bsafe\b|secure/i.test(text));
    assert.strictEqual(await block.locator("pre, code").count(), 0, "no copy-paste configuration block");
    assert.ok((await hrefs(page, "#mitigations")).includes(ANN));
    await ctx.close();
    const ok = await newPage();
    await answer(ok.page, {});
    assert.strictEqual(await ok.page.locator("#mitigations").count(), 0);
    await ok.ctx.close();
  });
  T("declared mitigations are recorded but never change the status", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=upstream]").check(); await page.fill("#version", "8.4.20");
    await page.locator("input[name=version_source][value=panel]").check(); await page.click("#btn-next");
    assert.strictEqual(await page.locator("#fs-mitigations_applied").isVisible(), false);
    await page.locator("input[name=update_applied][value=no]").check();
    assert.strictEqual(await page.locator("#fs-mitigations_applied").isVisible(), true);
    await page.locator("input[name=mitigations_applied][value=yes]").check();
    await page.locator("input[name=restarted][value=confirmed]").check(); await page.click("#btn-next");
    assert.strictEqual(await heading(page), HEAD.affected);
    assert.ok((await notesText(page)).includes("They never change the status"));
    assert.ok((await notesText(page)).includes("A restart alone does not fix an installation that has not been updated"));
    await page.click("#btn-edit"); await page.click("#btn-next"); await page.click("#btn-next"); await page.click("#btn-next");
    await page.locator("input[name=update_applied][value=confirmed]").check();
    assert.strictEqual(await page.locator("#fs-mitigations_applied").isVisible(), false);
    await ctx.close();
  });
  T("a fixed version without a confirmed update, or with several runtimes, needs verification", async () => {
    for (const [a, expectText] of [[{ update: "no" }, "did not confirm that the update was installed"], [{ update: "unknown" }, "did not confirm that the update was installed"], [{ runtimes: "yes" }, "more than one PHP version or runtime"]]) {
      const { ctx, page } = await newPage();
      await answer(page, a);
      assert.strictEqual(await heading(page), HEAD.verify);
      await page.locator(".cve-card details summary").first().click();
      assert.ok((await page.textContent(".cve-card details[open]")).includes(expectText));
      await ctx.close();
    }
  });
  T("print opens every section of the report; the saved file carries the notes and mitigations", async () => {
    const { ctx, page } = await newPage();
    await answer(page, { version: "8.1.30", update: "confirmed", restart: "confirmed", name: "[click](https://evil.example)<img src=x>" });
    await page.evaluate(() => { window.print = () => {}; });
    await page.click("#btn-print");
    assert.strictEqual(await page.locator("#report details:not([open])").count(), 0);
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-download")]);
    const md = fs.readFileSync(await dl.path(), "utf8");
    assert.ok(md.includes("## Notes") && md.includes("minimal source backports") && md.includes(ANN));
    assert.ok(md.includes("## If you cannot update immediately") && md.includes("Only an update is a complete solution"));
    assert.ok(md.includes("(`[click](https://evil.example)<img src=x>`)"), "user text only inside a code span");
    assert.ok(!md.includes("](https://evil.example)\n") && !/^<img/m.test(md));
    await ctx.close();
  });
  T("answers hidden by later choices are not reported", async () => {
    const { ctx, page } = await newPage();
    await page.fill("#domain", "example.com"); await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.selectOption("#panel", "cpanel");
    await page.locator("input[name=hosting_type][value=docker]").check(); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=docker_official]").check(); await page.fill("#version", "8.5.12");
    await page.locator("input[name=version_source][value=panel]").check(); await page.click("#btn-next");
    await page.locator("input[name=update_applied][value=confirmed]").check(); await page.selectOption("#update_from", "upstream");
    await page.locator("input[name=update_applied][value=no]").check();
    await page.locator("input[name=restarted][value=confirmed]").check();
    await page.locator("#answers summary").click();
    const sum = await page.textContent("#summary");
    assert.ok(!sum.includes("Panel") && !sum.includes("cPanel") && !sum.includes("Update source"));
    await page.click("#btn-next");
    const declared = await page.locator(".ev-group", { has: page.locator("h4", { hasText: "Declared by you" }) }).textContent();
    assert.ok(!declared.includes("Control panel"));
    await ctx.close();
  });
});

describe("English only", () => {
  T("there is no language selector and no Romanian text, even with ?lang=ro", async () => {
    const { ctx, page } = await newPage({ query: "?lang=ro", locale: "ro-RO" });
    assert.strictEqual(await page.getAttribute("html", "lang"), "en");
    assert.strictEqual(await page.locator("#lang-ro, #lang-en, [data-lang]").count(), 0);
    await answer(page, { version: "8.4.20", update: "no", restart: "no" });
    const text = await page.evaluate(() => document.body.innerText);
    assert.ok(!/[ăâîșț]/i.test(text), "Romanian letters found");
    assert.ok(!/\b(Afectat|Rezultat|Evaluare|Necesit)/.test(text));
    assert.ok(text.includes(BADGE.affected));
    await ctx.close();
  });
});

describe("domain reachability check (the only request the page can make)", () => {
  T("an answer is shown as reachability only, and is recorded as verified evidence", async () => {
    const { ctx, page, requests } = await newPage();
    const seen = [];
    await page.route("https://reach.example.com/**", (route) => { seen.push({ url: route.request().url(), method: route.request().method(), headers: route.request().headers() }); route.fulfill({ status: 200, contentType: "text/html", body: "<p>hi</p>" }); });
    await page.fill("#domain", "https://Reach.Example.com/private/path?token=abc");
    assert.strictEqual(await page.textContent("#reach-status"), "");
    await page.click("#reach-btn");
    await page.waitForFunction(() => document.getElementById("reach-status").textContent.includes("answered over HTTPS"));
    assert.ok((await page.textContent("#reach-status")).includes("reach.example.com answered over HTTPS from this browser"));
    assert.ok((await page.textContent("#reach-status")).includes("not which PHP runs it"));
    assert.ok((await page.textContent("#reach-status")).includes("possibly after a redirect"));
    assert.strictEqual(seen.length, 1);
    assert.strictEqual(seen[0].url, "https://reach.example.com/", "only the host is requested, never the path or query");
    assert.strictEqual(seen[0].method, "GET");
    assert.ok(!("cookie" in seen[0].headers) && !("authorization" in seen[0].headers));
    await page.fill("#domain", "reach.example.com");
    // changing the domain text without changing the host still resets the check
    assert.strictEqual(await page.textContent("#reach-status"), "");
    await page.click("#reach-btn");
    await page.waitForFunction(() => document.getElementById("reach-status").textContent.includes("answered"));
    await answer(page, { domain: "reach.example.com" }).catch(() => {});
    await ctx.close();
  });
  T("the report lists reachability as verified only after an answer", async () => {
    const { ctx, page } = await newPage();
    await page.route("https://reach.example.com/**", (route) => route.fulfill({ status: 204, body: "" }));
    await page.fill("#domain", "reach.example.com"); await page.click("#reach-btn");
    await page.waitForFunction(() => document.getElementById("reach-status").textContent.includes("answered"));
    await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=upstream]").check(); await page.fill("#version", "8.4.27");
    await page.locator("input[name=version_source][value=cli]").check(); await page.click("#btn-next");
    await page.locator("input[name=update_applied][value=confirmed]").check(); await page.locator("input[name=restarted][value=confirmed]").check(); await page.click("#btn-next");
    const verified = await page.locator(".ev-group", { has: page.locator("h4", { hasText: "Verified by dyd" }) }).textContent();
    assert.ok(verified.includes("Answered over HTTPS from this browser (reachability only)"));
    assert.strictEqual(await heading(page), HEAD.verify, "reachability must not turn an unconfirmed runtime into a conclusion");
    await ctx.close();
  });
  T("a failed request is inconclusive: never 'down', never vulnerable, never remediated", async () => {
    const { ctx, page } = await newPage();
    await page.route("https://gone.example.com/**", (route) => route.abort("connectionrefused"));
    await page.fill("#domain", "gone.example.com"); await page.click("#reach-btn");
    await page.waitForFunction(() => document.getElementById("reach-status").textContent.includes("No answer was received"));
    const msg = await page.textContent("#reach-status");
    assert.ok(msg.includes("does not mean the site is down") && msg.includes("Nothing was concluded"));
    await page.click("#btn-next");
    await page.locator("input[name=hosting_type][value=vps]").check(); await page.click("#btn-next");
    await page.locator("input[name=package_source][value=upstream]").check(); await page.locator("#version_unknown").check(); await page.click("#btn-next");
    await page.locator("input[name=update_applied][value=unknown]").check(); await page.locator("input[name=restarted][value=unknown]").check(); await page.click("#btn-next");
    assert.strictEqual(await heading(page), HEAD.verify);
    const text = await page.evaluate(() => document.querySelector("#report").innerText);
    assert.ok(!/Remediation supported|appears affected/.test(text));
    assert.ok(!/\b(offline|unreachable)\b/i.test(text));
    const unknown = await page.locator(".ev-group", { has: page.locator("h4", { hasText: "Unknown or unconfirmed" }) }).textContent();
    assert.ok(unknown.includes("Reachability not established"));
    await ctx.close();
  });
  T("a timeout is inconclusive too, and the button works again afterwards", async () => {
    const { ctx, page } = await newPage();
    await page.route("https://slow.example.com/**", () => { /* never answers */ });
    await page.fill("#domain", "slow.example.com");
    await page.click("#reach-btn");
    assert.strictEqual(await page.locator("#reach-btn").isDisabled(), true);
    assert.ok((await page.textContent("#reach-status")).includes("Waiting for the site to answer"));
    await page.waitForFunction(() => document.getElementById("reach-status").textContent.includes("No answer was received"), null, { timeout: 15000 });
    assert.strictEqual(await page.locator("#reach-btn").isDisabled(), false);
    await ctx.close();
  });
  T("an invalid domain never triggers a request", async () => {
    const { ctx, page, requests } = await newPage();
    for (const bad of ["", "localhost", "192.168.1.1", "javascript:alert(1)", "user:pw@example.com"]) { await page.fill("#domain", bad); await page.click("#reach-btn"); assert.ok((await page.textContent("#err-domain")).length > 0); }
    assert.deepStrictEqual(requests.filter((u) => new URL(u).origin !== srv.origin), [], "no request may leave the site");
    assert.deepStrictEqual(srv.requests.filter((p) => !STATIC_FILES.includes(p)), []);
    await ctx.close();
  });
});

describe("network, offline and CSP", () => {
  T("without the optional check, only the site's own static files are requested, nothing after load", async () => {
    const { ctx, page, requests } = await newPage();
    await page.waitForLoadState("networkidle");
    const afterLoad = requests.length;
    for (const c of [CASES[0], CASES[1], CASES[12]]) { await answer(page, c.a); await page.click("#btn-new"); }
    assert.strictEqual(requests.length, afterLoad, "requests were made after load");
    for (const u of requests) assert.ok(STATIC_FILES.includes(new URL(u).pathname) && new URL(u).origin === srv.origin, `unexpected request ${u}`);
    assert.deepStrictEqual(srv.requests.filter((p) => !STATIC_FILES.includes(p)), []);
    await ctx.close();
  });
  T("complete assessments work with the network disabled", async () => {
    const { ctx, page } = await newPage();
    await page.waitForLoadState("networkidle");
    await ctx.setOffline(true);
    for (const c of [CASES[0], CASES[1], CASES[2], CASES[7]]) {
      await answer(page, c.a);
      assert.strictEqual(await heading(page), HEAD[c.v]);
      await page.click("#btn-new");
    }
    await ctx.close();
  });
  T("no CSP violations and no console errors or warnings in the normal flow", async () => {
    const { ctx, page, problems } = await newPage();
    await page.route("https://reach.example.com/**", (route) => route.fulfill({ status: 200, body: "ok" }));
    await page.fill("#domain", "reach.example.com"); await page.click("#reach-btn");
    await page.waitForFunction(() => document.getElementById("reach-status").textContent.includes("answered"));
    await answer(page, { domain: "reach.example.com", hosting: "shared", ps: "provider" });
    await page.click("#btn-edit");
    assert.deepStrictEqual(await page.evaluate(() => window.__csp), []);
    assert.deepStrictEqual(problems, []);
    await ctx.close();
  });
  T("the CSP blocks inline script and every connection that is not https", async () => {
    const { ctx, page } = await newPage();
    const r = await page.evaluate(async () => {
      const out = {};
      try { const s = document.createElement("script"); s.textContent = "window.__x = 1"; document.body.appendChild(s); out.inline = window.__x === 1; } catch (e) { out.inline = "threw"; }
      try { await window.fetch("/rules.json"); out.http = "allowed"; } catch (e) { out.http = "blocked"; }
      try { const ws = new WebSocket("ws://127.0.0.1:1/"); out.ws = "created"; ws.close(); } catch (e) { out.ws = "blocked"; }
      return out;
    });
    assert.notStrictEqual(r.inline, true);
    assert.strictEqual(r.http, "blocked");
    assert.ok((await page.evaluate(() => window.__csp)).length >= 2);
    await ctx.close();
  });
  T("rules load failure disables the assessment instead of showing a verdict", async () => {
    for (const file of ["rules.js", "engine.js", "copy.js"]) {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.route("**/" + file, (route) => route.abort());
      await page.goto(srv.base);
      assert.strictEqual(await page.locator("#rules-error").isVisible(), true, file);
      assert.strictEqual(await page.locator("#assess").isVisible(), false, file);
      assert.ok((await page.textContent("#rules-error-detail")).includes(file));
      assert.strictEqual(await page.locator("#report-heading").count(), 0);
      await ctx.close();
    }
  });
  T("the error text is not in the static HTML, and an empty rules file is handled", async () => {
    const html = fs.readFileSync(path.join(__dirname, "..", "..", "index.html"), "utf8");
    assert.ok(!/could not be loaded|rules-error/i.test(html));
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route("**/rules.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "/* empty */" }));
    await page.goto(srv.base + "?utm_source=chatgpt.com");
    assert.strictEqual(await page.locator("#rules-error").isVisible(), true);
    await ctx.close();
    const nojs = await browser.newContext({ javaScriptEnabled: false });
    const p2 = await nojs.newPage(); await p2.goto(srv.base);
    assert.ok(!/could not be loaded/i.test(await p2.content()));
    assert.ok((await p2.textContent("noscript")).includes("needs JavaScript"));
    await nojs.close();
  });
  T("works from a local file (no server)", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("file:///" + path.join(__dirname, "..", "..", "index.html").replace(/\\/g, "/"));
    await answer(page, {});
    assert.strictEqual(await heading(page), HEAD.remediated);
    await ctx.close();
  });
});

describe("the local report", () => {
  T("save as a markdown file, created in the browser, without any request", async () => {
    const { ctx, page, requests } = await newPage();
    await answer(page, { version: "8.4.20", update: "no", restart: "no", name: "Shop" });
    const before = requests.length;
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#btn-download")]);
    assert.match(dl.suggestedFilename(), /^dyd-report-example\.com-\d{4}-\d{2}-\d{2}\.md$/);
    const md = fs.readFileSync(await dl.path(), "utf8");
    assert.ok(md.includes("# dyd↻ assessment report") && md.includes("example.com") && md.includes(BADGE.affected));
    assert.ok(md.includes("CVE-2026-109618") && md.includes("CVE-2026-109619") && md.includes("Action plan"));
    assert.ok(md.includes("does not mean that any server was scanned, audited or certified"));
    assert.ok(md.includes("Declared by you") && md.includes("Verified by dyd"));
    assert.strictEqual(requests.length, before);
    await ctx.close();
  });
  T("print opens the print dialog; the print layout shows only the report", async () => {
    const { ctx, page } = await newPage();
    await answer(page, {});
    await page.evaluate(() => { window.__printed = 0; window.print = () => { window.__printed++; }; });
    await page.click("#btn-print");
    assert.strictEqual(await page.evaluate(() => window.__printed), 1);
    await page.emulateMedia({ media: "print" });
    assert.strictEqual(await page.locator(".topbar").isVisible(), false);
    assert.strictEqual(await page.locator(".report-actions").isVisible(), false);
    assert.strictEqual(await page.locator("#how").isVisible(), false);
    assert.strictEqual(await page.locator("#report-heading").isVisible(), true);
    await ctx.close();
  });
});

describe("accessibility (axe runs in its own context with bypassCSP)", () => {
  for (const scheme of ["dark", "light"]) {
    T(`axe: every step and the report, ${scheme}`, async () => {
      const ctx = await browser.newContext({ colorScheme: scheme, bypassCSP: true });
      const page = await ctx.newPage();
      await page.goto(srv.base);
      const bad = async (label) => {
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        const serious = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        assert.deepStrictEqual(serious.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), []);
      };
      await bad("landing / step 1");
      await page.fill("#domain", "example.com"); await page.click("#btn-next");
      await page.locator("input[name=hosting_type][value=vps]").check(); await bad("step 2");
      await page.click("#btn-next");
      await page.locator("input[name=package_source][value=distro]").check(); await page.locator("input[name=os_family][value=ubuntu]").check(); await page.selectOption("#release", "24.04");
      await page.locator("#version_unknown").check(); await bad("step 3 with help");
      await page.locator("#version_unknown").uncheck(); await page.fill("#version", "8.3.6-0ubuntu0.24.04.13"); await page.locator("input[name=version_source][value=panel]").check();
      await page.click("#btn-next");
      await page.locator("input[name=update_applied][value=confirmed]").check(); await bad("step 4");
      await page.locator("input[name=restarted][value=assumed]").check(); await page.click("#btn-next");
      await bad("report");
      await page.locator("details.block summary").first().click(); await bad("report with details open");
      await ctx.close();
    });
  }
  T("errors are announced with role=alert next to the field and focus moves to it", async () => {
    const { ctx, page } = await newPage();
    await page.click("#btn-next");
    assert.strictEqual(await page.getAttribute("#err-domain", "role"), "alert");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "domain");
    await ctx.close();
  });
});

describe("layout, motion and subpath", () => {
  T("1440x900: the purpose, the two CVEs, the domain input and the primary action are in the first viewport", async () => {
    const { ctx, page } = await newPage({ viewport: { width: 1440, height: 900 } });
    const inView = async (sel) => { const b = await page.locator(sel).first().boundingBox(); return b && b.y >= 0 && b.y + b.height <= 900; };
    for (const sel of ["h1", ".lead", ".cve-list li:nth-child(1)", ".cve-list li:nth-child(2)", "#domain", "#btn-next", ".need", ".stepper"]) assert.ok(await inView(sel), `${sel} is below the fold`);
    assert.ok((await page.textContent("h1")).includes("two critical PHP vulnerabilities"));
    await ctx.close();
  });
  T("390x844: the headline and the domain input are in the first viewport", async () => {
    const { ctx, page } = await newPage({ viewport: { width: 390, height: 844 } });
    const b = await page.locator("#domain").boundingBox();
    assert.ok(b.y + b.height <= 844, "domain input below the fold");
    assert.ok((await page.locator("h1").boundingBox()).y < 400);
    await ctx.close();
  });
  for (const [w, h] of [[320, 700], [390, 844], [1280, 800], [1440, 900]]) {
    T(`no horizontal overflow and large touch targets at ${w}px (all steps and the report)`, async () => {
      const { ctx, page } = await newPage({ viewport: { width: w, height: h } });
      const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      const targets = () => page.evaluate(() => [...document.querySelectorAll("button, .chip, a.btn, select, input[type=text], .check")].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)));
      assert.ok((await over()) <= 0, "landing overflow");
      await page.click("#btn-next"); assert.ok((await over()) <= 0, "step 1 errors overflow");
      await page.fill("#domain", "a-very-long-subdomain-name.another-long-label.example.com"); await page.click("#btn-next");
      assert.ok((await over()) <= 0, "step 2 overflow"); assert.ok((await targets()).every((x) => x >= 44), "step 2 targets: " + (await targets()).join(","));
      await page.locator("input[name=hosting_type][value=vps]").check(); await page.click("#btn-next");
      await page.locator("input[name=package_source][value=distro]").check(); await page.locator("input[name=os_family][value=debian]").check(); await page.selectOption("#release", "13");
      await page.locator("#version_unknown").check();
      assert.ok((await over()) <= 0, "step 3 overflow"); assert.ok((await targets()).every((x) => x >= 44), "step 3 targets: " + (await targets()).join(","));
      await page.locator("#version_unknown").uncheck(); await page.fill("#version", "8.4.27-1~deb13u1"); await page.locator("input[name=version_source][value=panel]").check(); await page.click("#btn-next");
      await page.locator("input[name=update_applied][value=confirmed]").check(); await page.locator("input[name=restarted][value=confirmed]").check();
      assert.ok((await over()) <= 0, "step 4 overflow");
      await page.click("#btn-next");
      assert.ok((await over()) <= 0, "report overflow");
      await page.locator("details.block summary").first().click(); assert.ok((await over()) <= 0, "report details overflow");
      await ctx.close();
    });
  }
  T("200% text zoom does not clip the form", async () => {
    const { ctx, page } = await newPage({ viewport: { width: 640, height: 800 } });
    await page.addStyleTag({ content: "html { font-size: 200% !important; }" }).catch(() => {});
    assert.ok((await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 0);
    assert.strictEqual(await page.locator("#btn-next").isVisible(), true);
    await ctx.close();
  });
  T("reduced motion: no animation on the arrow", async () => {
    const { ctx, page } = await newPage({ reducedMotion: "reduce" });
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".brand .logo-arrow")).animationName), "none");
    await ctx.close();
    const n = await newPage({ reducedMotion: "no-preference" });
    assert.notStrictEqual(await n.page.evaluate(() => getComputedStyle(document.querySelector(".brand .logo-arrow")).animationName), "none");
    await n.ctx.close();
  });
  T("whole flow works under the /dyd/ subpath, with the reachability check as the only extra request", async () => {
    const { ctx, page, requests, problems } = await newPage({}, sub.base);
    await answer(page, {});
    assert.strictEqual(await heading(page), HEAD.remediated);
    for (const u of requests) { const p = new URL(u); assert.ok(p.pathname.startsWith("/dyd/") || p.pathname === "/favicon.ico", u); }
    assert.deepStrictEqual(problems.filter((p) => !p.includes("favicon")), []);
    await ctx.close();
  });
});
