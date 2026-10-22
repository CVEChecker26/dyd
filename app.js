/* dyd UI. Builds the DOM with createElement/textContent only. No storage, no network. */
(function () {
  "use strict";

  var RULES = window.DYD_RULES, E = window.DYD_ENGINE, I = window.DYD_I18N;
  var doc = document;
  var ready = !!(RULES && E && I && Array.isArray(RULES.rules) && RULES.rules.length);

  var FIELD_STEP = { platform: 1, docker_image: 1, plesk_os: 1, release: 1, version: 2, source: 3, restarted: 3 };
  var EMPTY = { platform: "", docker_image: "", plesk_os: "", release: "", version: "", source: "", restarted: "" };
  var input = Object.assign({}, EMPTY);
  var step = 1;
  var showingResult = false;
  var lang = pickLang();

  function $(id) { return doc.getElementById(id); }
  function t(key, params) { return I ? I.t(lang, key, params) : key; }
  function pickLang() {
    var q = null;
    try { q = new URLSearchParams(window.location.search).get("lang"); } catch (e) { q = null; }
    if (q === "en" || q === "ro") { return q; }
    var nl = (navigator.language || "").toLowerCase();
    return nl.indexOf("ro") === 0 ? "ro" : "en";
  }

  function el(tag, opts, children) {
    var n = doc.createElement(tag);
    opts = opts || {};
    if (opts.cls) { n.className = opts.cls; }
    if (opts.text !== undefined) { n.textContent = opts.text; }
    if (opts.attrs) { for (var k in opts.attrs) { if (Object.prototype.hasOwnProperty.call(opts.attrs, k)) { n.setAttribute(k, opts.attrs[k]); } } }
    (children || []).forEach(function (c) { if (c) { n.appendChild(c); } });
    return n;
  }
  function clear(n) { while (n.firstChild) { n.removeChild(n.firstChild); } }
  function link(url, text) {
    if (typeof url !== "string" || url.indexOf("https://") !== 0) { return el("span", { text: text }); }
    return el("a", { text: text, attrs: { href: url, rel: "noopener noreferrer", target: "_blank" } });
  }
  // The narrow-screen CSS stacks table cells; explicit roles keep the table semantics for assistive technology.
  function keepTableRoles(tbl) {
    tbl.setAttribute("role", "table");
    var map = { THEAD: "rowgroup", TBODY: "rowgroup", TR: "row", TH: "columnheader", TD: "cell" };
    Array.prototype.forEach.call(tbl.querySelectorAll("thead, tbody, tr, th, td"), function (n) { n.setAttribute("role", map[n.tagName]); });
  }
  function shortUrl(u) { return u.replace(/^https:\/\//, ""); }
  function distro(p) { return p === "debian" || p === "ubuntu"; }
  function rulesOf(platform) { return RULES.rules.filter(function (r) { return r.platform === platform; }); }
  function ruleFor(platform, release) {
    return distro(platform) && release ? E.findRule(RULES, platform, release) : null;
  }
  function platformCount() {
    var s = {}; RULES.rules.forEach(function (r) { s[r.platform] = true; }); return Object.keys(s).length;
  }

  /* ---------- static strings ---------- */
  function applyStatic() {
    doc.documentElement.setAttribute("lang", lang);
    doc.title = t("meta.title");
    var md = doc.querySelector('meta[name="description"]');
    if (md) { md.setAttribute("content", t("meta.description")); }
    Array.prototype.forEach.call(doc.querySelectorAll("[data-i18n]"), function (n) { n.textContent = t(n.getAttribute("data-i18n")); });
    Array.prototype.forEach.call(doc.querySelectorAll("[data-i18n-aria]"), function (n) { n.setAttribute("aria-label", t(n.getAttribute("data-i18n-aria"))); });
    ["en", "ro"].forEach(function (l) { $("lang-" + l).setAttribute("aria-pressed", l === lang ? "true" : "false"); });
  }

  /* ---------- rules status card ---------- */
  function renderStatus() {
    var dl = $("status-list"); clear(dl);
    function row(k, v) { dl.appendChild(el("dt", { text: k })); dl.appendChild(el("dd", { text: v })); }
    row(t("status.verified"), RULES.rules_verified_at);
    row(t("status.review"), t("status.review." + RULES.review_status));
    row(t("status.scope"), t("status.scope.value", { rules: RULES.rules.length, platforms: platformCount() }));
    row(t("status.cves"), RULES.cves.map(function (c) { return c.id; }).join(", "));
    var warn = $("stale-warning");
    var days = Math.floor((Date.now() - Date.parse(RULES.rules_verified_at + "T00:00:00Z")) / 86400000);
    if (days > 30) { warn.textContent = t("status.stale", { days: days }); warn.hidden = false; } else { warn.hidden = true; }
    $("footer-verified").textContent = t("footer.verified", { date: RULES.rules_verified_at });
  }

  /* ---------- environments table + sources ---------- */
  function renderEnvs() {
    var tbl = $("envs-table"); clear(tbl);
    tbl.appendChild(el("caption", { text: t("envs.h") }));
    var head = el("tr");
    ["envs.col.platform", "envs.col.branch", "envs.col.package", "envs.col.fixed", "envs.col.verified"].forEach(function (k) { head.appendChild(el("th", { text: t(k), attrs: { scope: "col" } })); });
    tbl.appendChild(el("thead", {}, [head]));
    var body = el("tbody");
    RULES.rules.forEach(function (r) {
      var fixedVals = {}; Object.keys(r.per_cve).forEach(function (c) { fixedVals[r.per_cve[c].fixed] = true; });
      var tr = el("tr");
      var cells = [
        [t("envs.col.platform"), t("env." + r.platform), ""],
        [t("envs.col.branch"), r.release_label || ("PHP " + r.series), ""],
        [t("envs.col.package"), r.package || "php", "mono"],
        [t("envs.col.fixed"), Object.keys(fixedVals).join(" / "), "mono"],
        [t("envs.col.verified"), r.verified_at, ""],
      ];
      cells.forEach(function (c) { tr.appendChild(el("td", { text: c[1], cls: c[2], attrs: { "data-label": c[0] } })); });
      body.appendChild(tr);
    });
    tbl.appendChild(body);
    keepTableRoles(tbl);
  }
  function renderSources() {
    var host = $("sources-list"); clear(host);
    var seen = {};
    function group(titleKey, urls) {
      var list = [];
      urls.forEach(function (u) { if (typeof u === "string" && u.indexOf("https://") === 0 && !seen[u]) { seen[u] = true; list.push(u); } });
      if (!list.length) { return; }
      var ul = el("ul");
      list.forEach(function (u) { ul.appendChild(el("li", {}, [link(u, shortUrl(u))])); });
      host.appendChild(el("div", {}, [el("h3", { text: t(titleKey) }), ul]));
    }
    group("sources.g.advisories", RULES.cves.map(function (c) { return c.advisory; }));
    ["upstream", "docker", "plesk", "debian", "ubuntu"].forEach(function (p) {
      var urls = [];
      rulesOf(p).forEach(function (r) {
        urls.push(r.source_url);
        (r.extra_sources || []).forEach(function (u) { urls.push(u); });
        Object.keys(r.per_cve).forEach(function (c) { urls.push(r.per_cve[c].source_url); });
      });
      group("sources.g." + p, urls);
    });
    if (RULES.php82_end_of_support) { group("sources.g.other", [RULES.php82_end_of_support.source_url]); }
  }

  /* ---------- form state ---------- */
  function syncInputFromForm() {
    ["platform", "docker_image", "plesk_os", "source", "restarted"].forEach(function (name) {
      var c = doc.querySelector('input[name="' + name + '"]:checked');
      input[name] = c ? c.value : "";
    });
    input.release = $("release").value;
    input.version = $("version").value;
  }
  function pushInputToForm() {
    ["platform", "docker_image", "plesk_os", "source", "restarted"].forEach(function (name) {
      Array.prototype.forEach.call(doc.querySelectorAll('input[name="' + name + '"]'), function (r) { r.checked = r.value === input[name]; });
    });
    $("release").value = input.release;
    $("version").value = input.version;
  }

  function renderReleaseOptions() {
    var sel = $("release"); clear(sel);
    sel.appendChild(el("option", { text: t("release.placeholder"), attrs: { value: "" } }));
    if (distro(input.platform)) {
      rulesOf(input.platform).slice().sort(function (a, b) { return E.dpkgCompare(b.release, a.release); }).forEach(function (r) {
        sel.appendChild(el("option", { text: r.release_label, attrs: { value: r.release } }));
      });
      sel.appendChild(el("option", { text: t("release.other"), attrs: { value: "other" } }));
    }
    sel.value = input.release;
  }
  function updateConditional() {
    $("fs-docker").hidden = input.platform !== "docker";
    $("fs-plesk").hidden = input.platform !== "plesk";
    $("fs-release").hidden = !distro(input.platform);
  }
  function renderVersionStep() {
    var isDistro = distro(input.platform);
    $("version-label").textContent = t(isDistro ? "version.label.distro" : "version.label.upstream");
    var rule = ruleFor(input.platform, input.release);
    var sample = rule ? rule.example : (isDistro && rulesOf(input.platform)[0] ? rulesOf(input.platform)[0].example : "");
    $("version-hint").textContent = isDistro ? t("version.hint.distro", { example: sample }) : t("version.hint.upstream");
    var p = input.platform;
    var introKey = "find." + p + ".intro";
    var pkg = rule ? rule.package : "php8.X";
    $("find-intro").textContent = t(introKey);
    var cmdKey = isDistro ? "find.distro.cmd" : "find." + p + ".cmd";
    var noteKey = isDistro ? "find.distro.note" : "find." + p + ".note";
    $("find-cmd").textContent = t(cmdKey, { pkg: pkg, php: pkg });
    $("find-note").textContent = t(noteKey, { pkg: pkg, php: pkg });
    $("copy-hint").hidden = true;
  }

  function summaryValue(name, v) {
    if (name === "platform") { return t("env." + v); }
    if (name === "docker_image") { return t("docker." + v); }
    if (name === "plesk_os") { return t("plesk." + v); }
    if (name === "release") {
      if (v === "other") { return t("release.other"); }
      var r = ruleFor(input.platform, v); return r ? r.release_label : v;
    }
    if (name === "source") { return t("sum.source." + v); }
    if (name === "restarted") { return t("restart." + v); }
    return v;
  }
  function renderSummary() {
    var host = $("summary"); clear(host);
    var dl = el("dl", { cls: "kv" });
    var shown = 0;
    ["platform", "docker_image", "plesk_os", "release", "version", "source", "restarted"].forEach(function (name) {
      var v = name === "version" ? input.version.trim() : input[name];
      if (!v) { return; }
      shown++;
      dl.appendChild(el("dt", { text: t("sum." + name) }));
      dl.appendChild(el("dd", { text: summaryValue(name, v), cls: name === "version" ? "mono" : "" }));
    });
    if (shown) { host.appendChild(dl); } else { host.appendChild(el("p", { text: t("summary.empty"), cls: "muted" })); }
  }

  function totalSteps() { return input.platform === "other" ? 1 : 3; }
  function stepName(n) { return t(["", "step.env", "step.version", "step.confirm", "step.result"][n]); }
  function renderStepper() {
    Array.prototype.forEach.call($("stepper").children, function (li) {
      var n = Number(li.getAttribute("data-step"));
      var cur = showingResult ? 4 : step;
      li.removeAttribute("aria-current");
      li.className = n < cur ? "done" : "";
      if (n === cur) { li.setAttribute("aria-current", "step"); }
    });
    $("step-status").textContent = showingResult ? t("step.result") : t("step.of", { n: step, total: totalSteps(), name: stepName(step) });
  }
  function showStep(n, focus) {
    step = n; showingResult = false;
    $("form").hidden = false; $("result").hidden = true;
    [1, 2, 3].forEach(function (i) { $("step-" + i).hidden = i !== n; });
    $("btn-back").hidden = n === 1;
    var last = n === totalSteps();
    $("btn-next").textContent = t(last ? "btn.assess" : "btn.next");
    if (n === 2) { renderVersionStep(); }
    renderStepper();
    if (focus) {
      var target = n === 2 ? $("version") : $("step-" + n).querySelector("legend");
      if (target) { if (n !== 2) { target.setAttribute("tabindex", "-1"); } target.focus(); }
    }
  }

  /* ---------- errors ---------- */
  function clearErrors() {
    lastErrors = [];
    Array.prototype.forEach.call(doc.querySelectorAll(".field-error"), function (p) { p.textContent = ""; });
    Array.prototype.forEach.call(doc.querySelectorAll("[aria-invalid]"), function (n) { n.removeAttribute("aria-invalid"); });
  }
  function errText(e) {
    var k = "err." + e.field + "." + e.reason;
    return I.has(lang, k) ? t(k) : t("err." + e.reason);
  }
  var lastErrors = [];
  function showErrors(errs) {
    clearErrors();
    lastErrors = errs;
    errs.forEach(function (e) {
      var p = $("err-" + e.field); if (p) { p.textContent = errText(e); }
      var ctls = e.field === "version" ? [$("version")] : e.field === "release" ? [$("release")] : Array.prototype.slice.call(doc.querySelectorAll('input[name="' + e.field + '"]'));
      ctls.forEach(function (c) { c.setAttribute("aria-invalid", "true"); c.setAttribute("aria-describedby", "err-" + e.field); });
    });
    if (errs.length) {
      var f = errs[0].field;
      var focusEl = f === "version" ? $("version") : f === "release" ? $("release") : doc.querySelector('input[name="' + f + '"]');
      if (focusEl) { focusEl.focus(); }
    }
  }
  function stepErrors(n) {
    return E.validate(input).filter(function (e) { return FIELD_STEP[e.field] === n; });
  }

  /* ---------- result ---------- */
  function section(titleKey, content) {
    return el("section", { cls: "result-section" }, [el("h4", { text: t(titleKey) })].concat(content));
  }
  function listOf(items, ordered) { var l = el(ordered ? "ol" : "ul"); items.forEach(function (x) { l.appendChild(el("li", { text: x })); }); return l; }

  function renderResult(noFocus) {
    var res = E.evaluate(input, RULES);
    if (res.status === "invalid") {
      step = FIELD_STEP[res.field] || 1; showStep(step, false); showErrors(res.errors || [{ field: res.field, reason: res.code }]); return;
    }
    showingResult = true;
    clearErrors();
    $("form").hidden = true; $("result").hidden = false;
    var h = $("result-heading"); clear(h);
    var icon = { affected: "!", remediated: "✓", verify: "?" }[res.status];
    h.appendChild(el("span", { cls: "eyebrow", text: t("result.h") + ":" }));
    h.appendChild(el("span", { cls: "verdict verdict-" + res.status }, [el("span", { cls: "icon", text: icon, attrs: { "aria-hidden": "true" } }), el("span", { text: t("verdict." + res.status) })]));
    var body = $("result-body"); clear(body);

    if (res.per_cve.length) {
      var tbl = el("table", { cls: "data-table" });
      tbl.appendChild(el("caption", { text: t("result.table.h") }));
      var hr = el("tr");
      ["col.cve", "col.declared", "col.fixed", "col.state", "col.source"].forEach(function (k) { hr.appendChild(el("th", { text: t(k), attrs: { scope: "col" } })); });
      tbl.appendChild(el("thead", {}, [hr]));
      var tb = el("tbody");
      res.per_cve.forEach(function (c) {
        var tr = el("tr");
        var stateCell = el("td", { attrs: { "data-label": t("col.state") } }, [el("span", { cls: "state state-" + c.state }, [el("span", { text: c.state === "fixed" ? "✓" : "!", attrs: { "aria-hidden": "true" } }), el("span", { text: t("state." + c.state) })])]);
        var srcCell = el("td", { attrs: { "data-label": t("col.source") } }, [link(c.advisory, t("link.advisory")), doc.createTextNode(" · "), link(c.source_url, t("link.source"))]);
        tr.appendChild(el("td", { text: c.id, attrs: { "data-label": t("col.cve") } }));
        tr.appendChild(el("td", { text: res.version, cls: "mono", attrs: { "data-label": t("col.declared") } }));
        tr.appendChild(el("td", { text: c.fixed, cls: "mono", attrs: { "data-label": t("col.fixed") } }));
        tr.appendChild(stateCell); tr.appendChild(srcCell);
        tb.appendChild(tr);
      });
      tbl.appendChild(tb);
      keepTableRoles(tbl);
      body.appendChild(tbl);
    }

    var rule = res.rule ? RULES.rules.filter(function (r) { return r.id === res.rule; })[0] : null;
    var why = [el("p", { text: t("why." + res.code) })];
    if (rule && rule.note) { why.push(el("p", { cls: "muted", text: t("note." + rule.note) })); }
    if (rule && rule.series === "8.2" && RULES.php82_end_of_support) { why.push(el("p", { cls: "muted", text: t("note.php82_eol", { date: RULES.php82_end_of_support.date }) })); }
    if (rule && rule.platform === "plesk") { why.push(el("p", { cls: "muted", text: t("note.plesk_match") })); }
    if (res.status !== "remediated") { why.push(el("p", { cls: "muted", text: t("note.mitigations") })); }
    body.appendChild(section("result.why.h", why));

    var steps = [];
    for (var i = 1; I.has(lang, "next." + res.code + "." + i); i++) { steps.push(t("next." + res.code + "." + i)); }
    body.appendChild(section("result.next.h", [listOf(steps, true)]));

    var basis = el("dl", { cls: "kv" });
    function brow(k, node) { basis.appendChild(el("dt", { text: t(k) })); basis.appendChild(el("dd", {}, [node])); }
    if (rule) {
      brow("basis.rule", el("span", { text: rule.id, cls: "mono" }));
      brow("basis.verified", doc.createTextNode(rule.verified_at));
      brow("basis.review", doc.createTextNode(t("status.review." + RULES.review_status)));
      brow("basis.source", link(rule.source_url, shortUrl(rule.source_url)));
      body.appendChild(section("result.basis.h", [basis]));
    } else {
      body.appendChild(section("result.basis.h", [el("p", { text: t("basis.none") }), (function () { basis.appendChild(el("dt", { text: t("basis.verified") })); basis.appendChild(el("dd", { text: RULES.rules_verified_at })); basis.appendChild(el("dt", { text: t("basis.review") })); basis.appendChild(el("dd", { text: t("status.review." + RULES.review_status) })); return basis; })()]));
    }
    body.appendChild(el("p", { cls: "limits", text: t("result.limits") }));
    renderStepper();
    if (!noFocus) { h.focus(); }
  }

  /* ---------- events ---------- */
  function onChange(ev) {
    var prevPlatform = input.platform;
    syncInputFromForm();
    if (input.platform !== prevPlatform) {
      input.release = ""; input.docker_image = ""; input.plesk_os = "";
      pushInputToForm(); renderReleaseOptions(); updateConditional();
    }
    if (ev && ev.target && ev.target.name) {
      var p = $("err-" + ev.target.name); if (p) { p.textContent = ""; }
      Array.prototype.forEach.call(doc.querySelectorAll('[name="' + ev.target.name + '"]'), function (c) { c.removeAttribute("aria-invalid"); });
    }
    renderSummary(); renderStepper();
    if (!$("step-2").hidden) { renderVersionStep(); }
    if (!showingResult) { $("btn-next").textContent = t(step === totalSteps() ? "btn.assess" : "btn.next"); }
  }
  function next() {
    syncInputFromForm();
    var errs = stepErrors(step);
    if (errs.length) { showErrors(errs); return; }
    clearErrors();
    if (step >= totalSteps()) { renderResult(); } else { showStep(step + 1, true); }
  }
  function back() { clearErrors(); if (step > 1) { showStep(step - 1, true); } }
  function reset() {
    input = Object.assign({}, EMPTY); pushInputToForm(); renderReleaseOptions(); updateConditional(); clearErrors(); renderSummary(); showStep(1, true);
  }
  function copyCommand() {
    var node = $("find-cmd"), text = node.textContent, hint = $("copy-hint"), btn = $("copy-btn");
    function fallback() {
      var range = doc.createRange(); range.selectNodeContents(node);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      hint.textContent = t("copy.hint"); hint.hidden = false;
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          hint.textContent = t("btn.copied"); hint.hidden = false;
          window.setTimeout(function () { hint.hidden = true; }, 2000);
        }, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  }
  function setLang(l) {
    lang = l;
    try { var u = new URL(window.location.href); u.searchParams.set("lang", l); window.history.replaceState(null, "", u.toString()); } catch (e) { /* not available on some local files */ }
    renderAll();
  }
  function renderAll() {
    applyStatic();
    if (!ready) { return; }
    renderStatus(); renderEnvs(); renderSources(); renderReleaseOptions(); renderSummary();
    if (showingResult) { renderResult(true); } else { showStep(step, false); if (lastErrors.length) { showErrors(lastErrors); } }
    renderStepper();
  }

  function init() {
    applyStatic();
    ["en", "ro"].forEach(function (l) { $("lang-" + l).addEventListener("click", function () { setLang(l); }); });
    if (!ready) {
      // Names the script that did not load, so a report can say exactly what failed (static file names only).
      var missing = [];
      if (!RULES || !Array.isArray(RULES.rules) || !RULES.rules.length) { missing.push("rules.js"); }
      if (!E) { missing.push("engine.js"); }
      if (!I) { missing.push("i18n.js"); }
      $("rules-error-detail").textContent = "Missing or empty: " + missing.join(", ");
      $("rules-error").hidden = false; $("assess-grid").hidden = true;
      return;
    }
    var form = $("form");
    form.addEventListener("change", onChange);
    form.addEventListener("input", onChange);
    form.addEventListener("submit", function (ev) { ev.preventDefault(); next(); });
    $("btn-next").addEventListener("click", next);
    $("btn-back").addEventListener("click", back);
    $("btn-edit").addEventListener("click", function () { showStep(1, true); });
    $("btn-new").addEventListener("click", reset);
    $("copy-btn").addEventListener("click", copyCommand);
    renderAll();
  }
  init();
})();
