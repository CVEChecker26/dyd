"use strict";
// Browser end-to-end tests. Drives an installed Edge/Chrome through playwright-core.
const { describe, it, before, after } = require("node:test");
const assert = require("node:assert");
const { start } = require("../helpers/server.js");
const { launch } = require("../helpers/browser.js");
const AxeBuilder = require("@axe-core/playwright").default || require("@axe-core/playwright");
const I = require("../../i18n.js");

const STATIC_FILES = ["/", "/index.html", "/style.css", "/app.js", "/engine.js", "/i18n.js", "/rules.js", "/assets/favicon.svg", "/assets/favicon.ico", "/assets/apple-touch-icon.png", "/favicon.ico"];

const CASES = [
  { name: "upstream fixed", a: { platform: "upstream", version: "8.4.27", source: "web", restarted: "yes" }, v: "remediated" },
  { name: "upstream affected, no restart answer needed", a: { platform: "upstream", version: "8.4.20", source: "web", restarted: "no" }, v: "affected" },
  { name: "upstream fixed but source unsure", a: { platform: "upstream", version: "8.4.27", source: "unsure", restarted: "yes" }, v: "verify" },
  { name: "upstream fixed but not restarted", a: { platform: "upstream", version: "8.3.36", source: "web", restarted: "unknown" }, v: "verify" },
  { name: "upstream 8.1 is end of life", a: { platform: "upstream", version: "8.1.30", source: "web", restarted: "yes" }, v: "verify" },
  { name: "docker official fixed", a: { platform: "docker", docker_image: "official", version: "8.5.12", source: "web", restarted: "yes" }, v: "remediated" },
  { name: "docker derived image", a: { platform: "docker", docker_image: "other", version: "8.5.12", source: "web", restarted: "yes" }, v: "verify" },
  { name: "debian 13 fixed", a: { platform: "debian", release: "13", version: "8.4.27-1~deb13u1", source: "web", restarted: "yes" }, v: "remediated" },
  { name: "debian 12 affected", a: { platform: "debian", release: "12", version: "8.2.32-1~deb12u1", source: "web", restarted: "yes" }, v: "affected" },
  { name: "ubuntu 24.04 affected", a: { platform: "ubuntu", release: "24.04", version: "8.3.6-0ubuntu0.24.04.12", source: "web", restarted: "yes" }, v: "affected" },
  { name: "ubuntu 20.04 ESM fixed", a: { platform: "ubuntu", release: "20.04", version: "7.4.3-4ubuntu2.29+esm5", source: "web", restarted: "yes" }, v: "remediated" },
  { name: "ubuntu upstream-style number", a: { platform: "ubuntu", release: "24.04", version: "8.3.36", source: "web", restarted: "yes" }, v: "verify" },
  { name: "plesk linux fixed", a: { platform: "plesk", plesk_os: "linux", version: "8.5.12", source: "web", restarted: "yes" }, v: "remediated" },
  { name: "plesk windows", a: { platform: "plesk", plesk_os: "windows", version: "8.5.12", source: "web", restarted: "yes" }, v: "verify" },
  { name: "something else", a: { platform: "other" }, v: "verify" },
];

async function fill(page, a) {
  await page.locator(`input[name=platform][value=${a.platform}]`).check();
  if (a.docker_image) await page.locator(`input[name=docker_image][value=${a.docker_image}]`).check();
  if (a.plesk_os) await page.locator(`input[name=plesk_os][value=${a.plesk_os}]`).check();
  if (a.release) await page.selectOption("#release", a.release);
  await page.click("#btn-next");
  if (a.platform === "other") return;
  await page.fill("#version", a.version);
  await page.click("#btn-next");
  await page.locator(`input[name=source][value=${a.source}]`).check();
  await page.locator(`input[name=restarted][value=${a.restarted}]`).check();
  await page.click("#btn-next");
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
  page.on("request", (r) => requests.push(new URL(r.url()).pathname));
  const failed = [];
  page.on("requestfailed", (r) => failed.push(r.url()));
  await page.goto((base || srv.base) + (opts.query || ""));
  return { ctx, page, problems, requests, failed };
}

describe("flows", () => {
  for (const lang of ["en", "ro"]) {
    for (const c of CASES) {
      T(`[${lang}] ${c.name} -> ${c.v}`, async () => {
        const { ctx, page, problems } = await newPage({ query: `?lang=${lang}` });
        await fill(page, c.a);
        const heading = await page.textContent("#result-heading");
        assert.ok(heading.includes(I.t(lang, "verdict." + c.v)), `${heading} should include ${I.t(lang, "verdict." + c.v)}`);
        assert.strictEqual(await page.evaluate(() => document.activeElement.id), "result-heading");
        assert.strictEqual(await page.getAttribute("html", "lang"), lang);
        assert.deepStrictEqual(problems, []);
        await ctx.close();
      });
    }
  }

  T("language toggle updates html lang, title and keeps working", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    assert.strictEqual(await page.title(), I.en["meta.title"]);
    await page.click("#lang-ro");
    assert.strictEqual(await page.getAttribute("html", "lang"), "ro");
    assert.strictEqual(await page.title(), I.ro["meta.title"]);
    assert.strictEqual(await page.getAttribute("#lang-ro", "aria-pressed"), "true");
    assert.strictEqual(await page.getAttribute("#lang-en", "aria-pressed"), "false");
    assert.ok(page.url().includes("lang=ro"));
    await ctx.close();
  });
  T("navigator.language starting with ro selects Romanian", async () => {
    const { ctx, page } = await newPage({ locale: "ro-RO" });
    assert.strictEqual(await page.getAttribute("html", "lang"), "ro");
    await ctx.close();
  });
  T("English is the default", async () => {
    const { ctx, page } = await newPage({ locale: "de-DE" });
    assert.strictEqual(await page.getAttribute("html", "lang"), "en");
    await ctx.close();
  });
  T("errors are announced and shown per field", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-platform"), I.en["err.platform.required"]);
    assert.strictEqual(await page.getAttribute("#err-platform", "role"), "alert");
    await page.locator("input[name=platform][value=upstream]").check();
    assert.strictEqual(await page.textContent("#err-platform"), "");
    await page.click("#btn-next");
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version"), I.en["err.version.required"]);
    assert.strictEqual(await page.getAttribute("#version", "aria-invalid"), "true");
    await page.fill("#version", "8.04.1");
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version"), I.en["err.format"]);
    await page.fill("#version", "8.4.27<script>");
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#err-version"), I.en["err.bad_chars"]);
    await ctx.close();
  });
  T("user input is rendered as text, never as markup", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    await page.locator("input[name=platform][value=debian]").check();
    await page.selectOption("#release", "13");
    await page.click("#btn-next");
    await page.fill("#version", "8.4.27-1~deb13u1");
    await page.click("#btn-next");
    await page.locator("input[name=source][value=web]").check();
    await page.locator("input[name=restarted][value=yes]").check();
    await page.click("#btn-next");
    assert.strictEqual(await page.locator("#result-body img, #result-body script, #summary img").count(), 0);
    await ctx.close();
  });
  T("keyboard-only completion", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    const activeIs = (sel) => page.evaluate((s) => document.activeElement && document.activeElement.matches(s), sel);
    async function tabTo(sel) { for (let i = 0; i < 40; i++) { if (await activeIs(sel)) return; await page.keyboard.press("Tab"); } throw new Error("could not reach " + sel); }
    await tabTo("input[name=platform]");
    await page.keyboard.press("Space"); // first tile: PHP from php.net
    await tabTo("#btn-next"); await page.keyboard.press("Enter");
    assert.ok(await activeIs("#version"));
    await page.keyboard.type("8.4.27");
    await page.keyboard.press("Enter");
    await tabTo("input[name=source]"); await page.keyboard.press("Space");
    await tabTo("input[name=restarted]"); await page.keyboard.press("Space");
    await tabTo("#btn-next"); await page.keyboard.press("Enter");
    assert.strictEqual(await page.evaluate(() => document.activeElement.id), "result-heading");
    assert.ok((await page.textContent("#result-heading")).includes(I.en["verdict.remediated"]));
    await ctx.close();
  });
  T("edit answers and new assessment", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    await fill(page, CASES[0].a);
    await page.click("#btn-edit");
    assert.strictEqual(await page.locator("input[name=platform][value=upstream]").isChecked(), true);
    await page.click("#btn-next"); // step 2 with the version kept
    assert.strictEqual(await page.inputValue("#version"), "8.4.27");
    await page.click("#btn-back");
    await page.click("#btn-next"); await page.click("#btn-next"); await page.click("#btn-next"); // answers were kept
    assert.ok((await page.textContent("#result-heading")).includes(I.en["verdict.remediated"]));
    await page.click("#btn-new");
    assert.strictEqual(await page.locator("input[name=platform]:checked").count(), 0);
    await ctx.close();
  });
  T("copy button works or shows the Ctrl+C hint", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    await page.locator("input[name=platform][value=docker]").check();
    await page.locator("input[name=docker_image][value=official]").check();
    await page.click("#btn-next");
    await page.locator("details.find summary").click();
    assert.strictEqual(await page.textContent("#find-cmd"), "docker exec CONTAINER php -v");
    await page.click("#copy-btn");
    await page.waitForFunction((copied) => document.getElementById("copy-btn").textContent === copied || !document.getElementById("copy-hint").hidden, I.en["btn.copied"]);
    await ctx.close();
  });
  T("distro command uses the package of the selected release", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    await page.locator("input[name=platform][value=debian]").check();
    await page.selectOption("#release", "13");
    await page.click("#btn-next");
    assert.strictEqual(await page.textContent("#find-cmd"), "dpkg-query -W -f='${Version}\\n' php8.4-fpm");
    await ctx.close();
  });
  T("generated sections are present", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    assert.strictEqual(await page.locator("#envs-table tbody tr").count(), 22);
    assert.ok((await page.locator("#sources-list a").count()) > 15);
    for (const a of await page.locator("#sources-list a").all()) assert.strictEqual(await a.getAttribute("rel"), "noopener noreferrer");
    assert.ok((await page.textContent("#status-list")).includes("2026-10-22"));
    await ctx.close();
  });
});

describe("network, offline and CSP", () => {
  T("only same-origin static files are requested, nothing after load", async () => {
    const { ctx, page, requests, failed } = await newPage({ query: "?lang=en" });
    await page.waitForLoadState("networkidle");
    const afterLoad = requests.length;
    for (const c of [CASES[0], CASES[1], CASES[7]]) { await fill(page, c.a); await page.click("#btn-new"); }
    assert.strictEqual(requests.length, afterLoad, "requests were made after load");
    for (const p of requests) assert.ok(STATIC_FILES.includes(p), `unexpected request ${p}`);
    assert.deepStrictEqual(srv.requests.filter((p) => !STATIC_FILES.includes(p)), []);
    assert.deepStrictEqual(failed.filter((u) => !u.endsWith("/favicon.ico")), []);
    await ctx.close();
  });
  T("complete assessments work with the network disabled", async () => {
    const { ctx, page, failed } = await newPage({ query: "?lang=ro" });
    await page.waitForLoadState("networkidle");
    await ctx.setOffline(true);
    for (const c of [CASES[0], CASES[1], CASES[2], CASES[7], CASES[13]]) {
      await fill(page, c.a);
      assert.ok((await page.textContent("#result-heading")).includes(I.ro["verdict." + c.v]));
      await page.click("#btn-new");
    }
    await page.click("#lang-en");
    assert.strictEqual(await page.getAttribute("html", "lang"), "en");
    // The browser itself may fetch the tab icon lazily; that is not a request made by the page script.
    assert.deepStrictEqual(failed.filter((u) => !/\/assets\/(favicon|apple-touch-icon)/.test(u)), []);
    await ctx.close();
  });
  T("no CSP violations and no console errors or warnings", async () => {
    for (const q of ["?lang=en", "?lang=ro"]) {
      const { ctx, page, problems } = await newPage({ query: q });
      await fill(page, CASES[7].a);
      await page.click("#btn-edit");
      await page.click("#lang-en");
      assert.deepStrictEqual(await page.evaluate(() => window.__csp), []);
      assert.deepStrictEqual(problems, []);
      await ctx.close();
    }
  });
  T("the CSP really blocks injected inline script and outside connections", async () => {
    const { ctx, page } = await newPage({ query: "?lang=en" });
    const r = await page.evaluate(async () => {
      const out = {};
      try { const s = document.createElement("script"); s.textContent = "window.__x = 1"; document.body.appendChild(s); out.inline = window.__x === 1; } catch (e) { out.inline = "threw"; }
      try { await window.fetch("/rules.json"); out.conn = "allowed"; } catch (e) { out.conn = "blocked"; }
      return out;
    });
    assert.notStrictEqual(r.inline, true);
    assert.strictEqual(r.conn, "blocked");
    assert.ok((await page.evaluate(() => window.__csp)).length >= 2);
    await ctx.close();
  });
  T("rules load failure disables the assessment instead of showing a verdict", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.route("**/rules.js", (route) => route.fulfill({ status: 200, contentType: "text/javascript", body: "/* empty */" }));
    await page.goto(srv.base + "?lang=en");
    assert.strictEqual(await page.locator("#rules-error").isVisible(), true);
    assert.strictEqual(await page.locator("#assess-grid").isVisible(), false);
    assert.ok((await page.textContent("#rules-error-detail")).includes("rules.js"));
    await ctx.close();
  });
  for (const file of ["rules.js", "engine.js", "i18n.js"]) {
    T(`a blocked ${file} shows the error state naming it, with no verdict`, async () => {
      const ctx = await browser.newContext();
      const page = await ctx.newPage();
      await page.route("**/" + file, (route) => route.abort());
      await page.goto(srv.base + "?lang=en");
      assert.strictEqual(await page.locator("#rules-error").isVisible(), true);
      assert.strictEqual(await page.locator("#assess-grid").isVisible(), false);
      assert.ok((await page.textContent("#rules-error-detail")).includes(file));
      assert.strictEqual(await page.locator("#result-heading").isVisible(), false);
      await ctx.close();
    });
  }
  T("works from a local file (no server)", async () => {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const path = require("node:path");
    await page.goto("file:///" + path.join(__dirname, "..", "..", "index.html").replace(/\\/g, "/") + "?lang=en");
    await fill(page, CASES[0].a);
    assert.ok((await page.textContent("#result-heading")).includes(I.en["verdict.remediated"]));
    await ctx.close();
  });
});

describe("accessibility (axe runs in its own context with bypassCSP)", () => {
  for (const scheme of ["dark", "light"]) for (const lang of ["en", "ro"]) {
    T(`axe: form and result, ${scheme}, ${lang}`, async () => {
      const ctx = await browser.newContext({ colorScheme: scheme, bypassCSP: true });
      const page = await ctx.newPage();
      await page.goto(srv.base + `?lang=${lang}`);
      const bad = async (label) => {
        const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"]).analyze();
        const serious = r.violations.filter((v) => ["serious", "critical"].includes(v.impact));
        assert.deepStrictEqual(serious.map((v) => `${label}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).slice(0, 3).join(" | ")}`), []);
      };
      await bad("form step 1");
      await page.locator("input[name=platform][value=docker]").check();
      await page.locator("input[name=docker_image][value=official]").check();
      await page.click("#btn-next");
      await page.locator("details.find summary").click();
      await bad("form step 2");
      await page.fill("#version", "8.4.20");
      await page.click("#btn-next");
      await bad("form step 3");
      await page.locator("input[name=source][value=web]").check();
      await page.locator("input[name=restarted][value=no]").check();
      await page.click("#btn-next");
      await bad("result affected");
      await ctx.close();
    });
  }
});

describe("layout, motion and subpath", () => {
  for (const w of [320, 375, 768, 1024, 1440]) {
    T(`no horizontal overflow at ${w}px (form, errors and result)`, async () => {
      const { ctx, page } = await newPage({ viewport: { width: w, height: 900 }, query: "?lang=ro" });
      const over = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok((await over()) <= 0, "landing overflow");
      await page.click("#btn-next");
      assert.ok((await over()) <= 0, "errors overflow");
      await fill(page, CASES[9].a);
      assert.ok((await over()) <= 0, "result overflow");
      const size = await page.evaluate(() => [...document.querySelectorAll("button, .tile, a.btn, select, input[type=text], .choice")].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height)));
      assert.ok(size.every((h) => h >= 40), "touch target below 40px: " + size.join(","));
      await ctx.close();
    });
  }
  T("reduced motion: no animation on the arrow", async () => {
    const { ctx, page } = await newPage({ reducedMotion: "reduce" });
    assert.strictEqual(await page.evaluate(() => getComputedStyle(document.querySelector(".brand .logo-arrow")).animationName), "none");
    await ctx.close();
    const n = await newPage({ reducedMotion: "no-preference" });
    assert.notStrictEqual(await n.page.evaluate(() => getComputedStyle(document.querySelector(".brand .logo-arrow")).animationName), "none");
    await n.ctx.close();
  });
  T("whole flow works under the /dyd/ subpath with only subpath requests", async () => {
    const { ctx, page, requests, problems } = await newPage({ query: "?lang=en" }, sub.base);
    await fill(page, CASES[7].a);
    assert.ok((await page.textContent("#result-heading")).includes(I.en["verdict.remediated"]));
    for (const p of requests) assert.ok(p.startsWith("/dyd/") || p === "/favicon.ico", p);
    assert.deepStrictEqual(problems.filter((p) => !p.includes("favicon")), []);
    await ctx.close();
  });
});
