/* dyd UI. Builds the DOM with createElement/textContent only. No storage. The only network request is the optional reachability check. */
(function () {
  "use strict";

  var RULES = window.DYD_RULES, E = window.DYD_ENGINE, C = window.DYD_COPY;
  var doc = document;
  var ready = !!(RULES && E && C && Array.isArray(RULES.rules) && RULES.rules.length);

  var EMPTY = {
    domain: "", site_name: "", hosting_type: "", provider: "", panel: "", package_source: "", os_family: "", release: "", plesk_os: "",
    version: "", version_unknown: "", version_source: "", runtimes: "", exec_model: "", update_applied: "", update_from: "", mitigations_applied: "", restarted: "",
  };
  var FIELD_STEP = {
    domain: 1, site_name: 1, hosting_type: 2, provider: 2, panel: 2, package_source: 3, os_family: 3, release: 3, plesk_os: 3,
    version: 3, version_unknown: 3, version_source: 3, runtimes: 3, exec_model: 3, update_applied: 4, update_from: 4, mitigations_applied: 4, restarted: 4,
  };
  var RADIOS = ["hosting_type", "package_source", "os_family", "plesk_os", "version_source", "runtimes", "exec_model", "update_applied", "mitigations_applied", "restarted"];
  var PLATFORM_NAMES = { upstream: "php.net", docker: "Docker (official image)", debian: "Debian", ubuntu: "Ubuntu", plesk: "Plesk" };
  var STATUS_CLASS = { affected: "st-affected", remediated: "st-supported", verify: "st-verify" };
  var STATUS_KEY = { affected: "status.affected", remediated: "status.supported", verify: "status.verify" };
  var STATUS_ICON = { affected: "!", remediated: "✓", verify: "?" };
  var REACH_SECONDS = 8;

  var a = Object.assign({}, EMPTY);
  var step = 1;
  var reach = { state: "idle", host: "", time: "" };
  var last = null; // the last report: { res, input, when, a }
  var reachId = 0;

  function $(id) { return doc.getElementById(id); }
  function t(key, params) { return C ? C.t(key, params) : key; }
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
  function shortUrl(u) { return u.replace(/^https:\/\//, ""); }
  function keepTableRoles(tbl) {
    tbl.setAttribute("role", "table");
    var map = { THEAD: "rowgroup", TBODY: "rowgroup", TR: "row", TH: "columnheader", TD: "cell" };
    Array.prototype.forEach.call(tbl.querySelectorAll("thead, tbody, tr, th, td"), function (n) { n.setAttribute("role", map[n.tagName]); });
  }
  function rulesOf(platform) { return RULES.rules.filter(function (r) { return r.platform === platform; }); }
  function releaseRule() { return (a.os_family === "debian" || a.os_family === "ubuntu") && a.release ? E.findRule(RULES, a.os_family, a.release) : null; }
  function stamp(d) { return d.toISOString().slice(0, 16).replace("T", " ") + " UTC"; }
  function valText(field, v) { var k = "val." + field + "." + v; return C.has(k) ? t(k) : v; }
  function isOtherPlatform() {
    var s = a.package_source;
    return s === "provider" || s === "unknown" || (s === "distro" && a.os_family === "other");
  }

  /* ---------- engine input ---------- */
  function reachValue() { return reach.state === "reached" ? "reached" : reach.state === "inconclusive" ? "inconclusive" : "not_checked"; }
  // Answers whose question is hidden by an earlier answer are not used and not reported.
  function visible(src) {
    var v = Object.assign({}, src);
    if (v.hosting_type === "docker") { v.panel = ""; }
    if (v.package_source !== "distro") { v.os_family = ""; v.release = ""; }
    else if (v.os_family !== "debian" && v.os_family !== "ubuntu") { v.release = ""; }
    if (v.package_source !== "plesk") { v.plesk_os = ""; }
    if (v.update_applied !== "confirmed" && v.update_applied !== "assumed") { v.update_from = ""; }
    if (v.update_applied !== "no" && v.update_applied !== "unknown") { v.mitigations_applied = ""; }
    if (v.package_source === "provider" || v.package_source === "unknown" || (v.package_source === "distro" && v.os_family === "other")) { v.exec_model = ""; }
    if (v.version_unknown === "yes") { v.version = ""; v.version_source = ""; }
    return v;
  }
  function toEngine(src) {
    var s = visible(src || a);
    var i = {
      domain: s.domain, site_name: s.site_name, hosting_type: s.hosting_type, provider: s.provider, panel: s.panel,
      version: s.version, version_unknown: s.version_unknown, version_source: s.version_source, runtimes: s.runtimes,
      exec_model: s.exec_model, mitigations_applied: s.mitigations_applied,
      update_applied: s.update_applied, update_from: s.update_from, restarted: s.restarted, reachability: reachValue(),
    };
    switch (s.package_source) {
      case "upstream": i.platform = "upstream"; break;
      case "distro":
        if (s.os_family === "debian" || s.os_family === "ubuntu") { i.platform = s.os_family; i.release = s.release; }
        else { i.platform = "other"; i.other_kind = "other"; }
        break;
      case "docker_official": i.platform = "docker"; i.docker_image = "official"; break;
      case "docker_other": i.platform = "docker"; i.docker_image = "other"; break;
      case "plesk": i.platform = "plesk"; i.plesk_os = s.plesk_os; break;
      case "provider": i.platform = "other"; i.other_kind = "provider"; break;
      case "unknown": i.platform = "other"; i.other_kind = "unknown"; break;
      default: i.platform = "";
    }
    return i;
  }

  /* ---------- reading and writing the form ---------- */
  function syncFromForm() {
    ["domain", "site_name", "provider", "version"].forEach(function (id) { a[id] = $(id).value; });
    ["panel", "release", "update_from"].forEach(function (id) { a[id] = $(id).value; });
    a.version_unknown = $("version_unknown").checked ? "yes" : "";
    RADIOS.forEach(function (name) {
      var c = doc.querySelector('input[name="' + name + '"]:checked');
      a[name] = c ? c.value : "";
    });
  }
  function pushToForm() {
    ["domain", "site_name", "provider", "version"].forEach(function (id) { $(id).value = a[id]; });
    ["panel", "update_from"].forEach(function (id) { $(id).value = a[id]; });
    $("version_unknown").checked = a.version_unknown === "yes";
    RADIOS.forEach(function (name) {
      Array.prototype.forEach.call(doc.querySelectorAll('input[name="' + name + '"]'), function (r) { r.checked = r.value === a[name]; });
    });
    renderReleaseOptions(); $("release").value = a.release;
  }

  function renderReleaseOptions() {
    var sel = $("release"); clear(sel);
    sel.appendChild(el("option", { text: "Choose…", attrs: { value: "" } }));
    if (a.os_family === "debian" || a.os_family === "ubuntu") {
      rulesOf(a.os_family).slice().sort(function (x, y) { return E.dpkgCompare(y.release, x.release); }).forEach(function (r) {
        sel.appendChild(el("option", { text: r.release_label, attrs: { value: r.release } }));
      });
      sel.appendChild(el("option", { text: "Another release", attrs: { value: "other" } }));
    }
    sel.value = a.release;
  }

  function allowedSources() {
    var h = a.hosting_type, plesk = a.panel === "plesk";
    if (h === "docker") { return ["docker_official", "docker_other", "unknown"]; }
    if (h === "shared" || h === "managed") { return plesk ? ["provider", "plesk", "unknown"] : ["provider", "unknown"]; }
    var list = ["upstream", "distro", "docker_official", "docker_other", "provider", "unknown"];
    if (plesk) { list.splice(2, 0, "plesk"); }
    return list;
  }

  function refresh() {
    // hosting step
    $("field-panel").hidden = a.hosting_type === "docker";
    var noteKey = { shared: "hosting.shared", managed: "hosting.managed", vps: "hosting.vps", dedicated: "hosting.vps", cloud: "hosting.vps", docker: "hosting.docker", unknown: "hosting.unknown", other: "hosting.unknown" }[a.hosting_type];
    var note = $("hosting-note");
    if (noteKey) { note.textContent = t(noteKey); note.hidden = false; } else { note.hidden = true; }
    // PHP step: only show the options that make sense for the hosting answers
    var allowed = allowedSources();
    Array.prototype.forEach.call(doc.querySelectorAll("[data-ps]"), function (chip) { chip.hidden = allowed.indexOf(chip.getAttribute("data-ps")) === -1; });
    if (a.package_source && allowed.indexOf(a.package_source) === -1) {
      a.package_source = "";
      Array.prototype.forEach.call(doc.querySelectorAll('input[name="package_source"]'), function (r) { r.checked = false; });
    }
    var distro = a.package_source === "distro";
    $("fs-os_family").hidden = !distro;
    $("field-release").hidden = !(distro && (a.os_family === "debian" || a.os_family === "ubuntu"));
    $("fs-plesk_os").hidden = a.package_source !== "plesk";
    var other = isOtherPlatform();
    $("version-label").textContent = distro && !other ? t("version.label.distro") : t("version.label.upstream");
    var sample = "";
    if (distro && !other) { var r = releaseRule() || rulesOf(a.os_family)[0]; sample = r ? r.example : ""; }
    $("version-hint").textContent = other ? t("version.hint.other") : distro ? t("version.hint.distro", { example: sample }) : t("version.hint.upstream");
    $("version").disabled = a.version_unknown === "yes";
    renderHelp();
    // update step
    $("field-update_from").hidden = !(a.update_applied === "confirmed" || a.update_applied === "assumed");
    $("fs-mitigations_applied").hidden = !(a.update_applied === "no" || a.update_applied === "unknown");
    $("fs-exec_model").hidden = isOtherPlatform();
    var eh = $("exec-help");
    if (a.exec_model === "unknown" && !isOtherPlatform()) { eh.textContent = t("exec.hint.unknown"); eh.hidden = false; } else { eh.hidden = true; }
    renderStepper();
    renderSummary();
  }

  function renderHelp() {
    var box = $("version-help");
    if (a.version_unknown !== "yes") { box.hidden = true; return; }
    box.hidden = false;
    var list = $("help-list"); clear(list);
    var panelKey = a.panel === "cpanel" ? "help.panel.cpanel" : a.panel === "plesk" ? "help.panel.plesk" : "help.panel.other";
    [panelKey, "help.provider", "help.phpinfo", "help.cli_warning"].forEach(function (k) { list.appendChild(el("li", { text: t(k) })); });
    var kind = a.package_source === "distro" ? "distro" : a.package_source === "plesk" ? "plesk" : (a.package_source === "docker_official" || a.package_source === "docker_other") ? "docker" : a.package_source === "upstream" ? "upstream" : "";
    var row = $("help-cmd-row");
    if (!kind || (kind === "distro" && isOtherPlatform())) { row.hidden = true; return; }
    var rule = releaseRule();
    var pkg = rule ? rule.package : "php8.X";
    $("help-cmd").textContent = t("help.cmd." + kind, { pkg: pkg });
    list.appendChild(el("li", { text: t("help.cmd.note." + kind, { pkg: pkg }) }));
    list.appendChild(el("li", { text: t("help.cmd.after") }));
    row.hidden = false;
  }

  /* ---------- summary of answers ---------- */
  function renderSummary() {
    var host = $("summary"); clear(host);
    var dl = el("dl", { cls: "kv" }), shown = 0, vis = visible(a);
    ["domain", "site_name", "hosting_type", "provider", "panel", "package_source", "os_family", "release", "plesk_os", "version", "version_source", "runtimes", "exec_model", "update_applied", "update_from", "mitigations_applied", "restarted"].forEach(function (f) {
      var v = vis[f];
      if (f === "version" && a.version_unknown === "yes") { v = "unknown"; }
      if (!v || String(v).trim() === "") { return; }
      shown++;
      var shownValue = String(v).trim();
      if (f === "domain") { var nd = E.normalizeDomain(v); if (nd.ok) { shownValue = nd.host; } }
      if (f === "release") { var r = releaseRule(); shownValue = r ? r.release_label : (v === "other" ? "Another release" : v); }
      else if (["hosting_type", "panel", "package_source", "os_family", "plesk_os", "version_source", "runtimes", "exec_model", "update_applied", "update_from", "mitigations_applied", "restarted"].indexOf(f) !== -1) { shownValue = valText(f, v); }
      dl.appendChild(el("dt", { text: t("sum." + f) }));
      dl.appendChild(el("dd", { text: shownValue, cls: f === "version" || f === "domain" ? "mono" : "" }));
    });
    host.appendChild(shown ? dl : el("p", { cls: "muted", text: t("summary.empty") }));
  }

  /* ---------- stepper and navigation ---------- */
  function renderStepper() {
    Array.prototype.forEach.call($("stepper").children, function (li) {
      var n = Number(li.getAttribute("data-step"));
      li.removeAttribute("aria-current");
      li.className = n < step ? "done" : "";
      if (n === step) { li.setAttribute("aria-current", "step"); }
    });
    var status = t("step.of", { n: step, total: 4, name: t("step." + step) });
    if ($("step-status").textContent !== status) { $("step-status").textContent = status; }
    $("btn-back").hidden = step === 1;
    $("btn-next").textContent = t(step === 4 ? "btn.generate" : "btn.continue");
  }
  function showStep(n, focus) {
    step = n;
    [1, 2, 3, 4].forEach(function (i) { $("step-" + i).hidden = i !== n; });
    refresh();
    if (focus) {
      var target = n === 1 ? $("domain") : $("step-" + n).querySelector("legend");
      if (target) { if (n !== 1) { target.setAttribute("tabindex", "-1"); } target.focus(); }
    }
  }
  function setView(v) {
    doc.body.setAttribute("data-view", v);
    $("report-view").hidden = v !== "report";
  }

  /* ---------- validation ---------- */
  function clearErrors() {
    Array.prototype.forEach.call(doc.querySelectorAll(".field-error"), function (p) { p.textContent = ""; });
    Array.prototype.forEach.call(doc.querySelectorAll("[aria-invalid]"), function (n) { n.removeAttribute("aria-invalid"); });
  }
  function errText(e) {
    var k = "err." + e.field + "." + e.reason;
    return C.has(k) ? t(k) : t("err." + e.reason);
  }
  function showErrors(errs) {
    clearErrors();
    errs.forEach(function (e) {
      var p = $("err-" + e.field); if (p) { p.textContent = errText(e); }
      var ctls = ["domain", "site_name", "provider", "version", "release"].indexOf(e.field) !== -1 ? [$(e.field)] : Array.prototype.slice.call(doc.querySelectorAll('input[name="' + e.field + '"]'));
      ctls.forEach(function (c) { c.setAttribute("aria-invalid", "true"); });
    });
    if (errs.length) {
      var f = errs[0].field;
      var target = ["domain", "site_name", "provider", "version", "release"].indexOf(f) !== -1 ? $(f) : doc.querySelector('input[name="' + f + '"]');
      if (target) { target.focus(); }
    }
  }
  function stepErrors(n) {
    var errs = [], other = isOtherPlatform();
    function add(field, reason) { errs.push({ field: field, reason: reason }); }
    if (n === 1) {
      var d = E.normalizeDomain(a.domain);
      if (!d.ok) { add("domain", d.reason); }
    }
    if (n === 2 && !a.hosting_type) { add("hosting_type", "required"); }
    if (n === 3) {
      if (!a.package_source) { add("package_source", "required"); }
      else if (a.package_source === "distro" && !a.os_family) { add("os_family", "required"); }
      else if (a.package_source === "distro" && a.os_family !== "other" && !a.release) { add("release", "required"); }
      else if (a.package_source === "plesk" && !a.plesk_os) { add("plesk_os", "required"); }
    }
    if (n === 4 && !other && !a.update_applied) { add("update_applied", "required"); }
    if (!errs.length) {
      E.validate(toEngine()).forEach(function (e) {
        if (FIELD_STEP[e.field] === n && e.field !== "platform") { errs.push(e); }
      });
    }
    return errs;
  }
  function next() {
    syncFromForm();
    var errs = stepErrors(step);
    if (errs.length) { showErrors(errs); return; }
    clearErrors();
    if (step < 4) { showStep(step + 1, true); } else { renderReport(); }
  }
  function back() { clearErrors(); if (step > 1) { showStep(step - 1, true); } }

  /* ---------- optional reachability check: the only request the page makes ---------- */
  function renderReach() {
    var s = $("reach-status"), btn = $("reach-btn");
    s.className = "reach-status";
    btn.disabled = reach.state === "checking";
    if (reach.state === "checking") { s.textContent = t("reach.checking", { seconds: REACH_SECONDS }); }
    else if (reach.state === "reached") { s.textContent = t("reach.reached", { host: reach.host, time: reach.time }); s.className += " is-reached"; }
    else if (reach.state === "inconclusive") { s.textContent = t("reach.inconclusive"); s.className += " is-inconclusive"; }
    else if (reach.state === "invalid") { s.textContent = t("reach.needs_domain"); }
    else { s.textContent = ""; }
  }
  function checkReach() {
    syncFromForm();
    var n = E.normalizeDomain(a.domain);
    if (!n.ok) { reach = { state: "invalid", host: "", time: "" }; renderReach(); showErrors([{ field: "domain", reason: n.reason }]); return; }
    clearErrors();
    var host = n.host, myId = ++reachId;
    reach = { state: "checking", host: host, time: "" };
    renderReach();
    var ctrl = new AbortController();
    var timer = window.setTimeout(function () { ctrl.abort(); }, REACH_SECONDS * 1000);
    var done = function (state) {
      window.clearTimeout(timer);
      if (myId !== reachId || reach.host !== host || reach.state !== "checking") { return; } // the domain changed meanwhile
      reach = { state: state, host: host, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) };
      renderReach();
    };
    // no-cors: the answer is opaque. It can only show that some HTTP response arrived (browsers require redirect "follow"
    // in this mode, so the answer may come after a redirect). Nothing else is read.
    fetch("https://" + host + "/", { method: "GET", mode: "no-cors", cache: "no-store", credentials: "omit", redirect: "follow", referrerPolicy: "no-referrer", signal: ctrl.signal })
      .then(function () { ctrl.abort(); done("reached"); }, function () { done("inconclusive"); });
  }

  /* ---------- report ---------- */
  function evidenceText(it, input, md) {
    switch (it.id) {
      case "domain": return t("ev.domain") + ": " + it.value;
      case "reachability": return it.provenance === "verified" ? t("ev.reachability.reached") : t("ev.reachability.unknown");
      case "hosting_type": return t("ev.hosting_type") + ": " + valText("hosting_type", it.value);
      case "provider": return t("ev.provider") + ": " + (md ? code(it.value) : it.value);
      case "panel": return t("ev.panel") + ": " + valText("panel", it.value);
      case "package_source": return t("ev.package_source") + ": " + valText("package_source", (last && last.a.package_source) || "unknown");
      case "version": return t("ev.version") + ": " + (it.provenance === "unknown" ? "unknown" : (md ? code(it.value) : it.value));
      case "version_source": return t("ev.version_source") + ": " + valText("version_source", it.value);
      case "runtime_serving": return t("ev.runtime_serving." + (it.provenance === "declared" ? "declared" : "unknown"));
      case "exec_model": return t("ev.exec_model") + ": " + valText("exec_model", it.value);
      case "mitigations": return t("ev.mitigations") + ": " + valText("mitigations_applied", it.value);
      case "runtimes": return t("ev.runtimes") + ": " + valText("runtimes", it.value);
      case "update": return t("ev.update") + ": " + valText("update_applied", it.value);
      case "restart": return t("ev.restart") + ": " + valText("restarted", it.value);
      case "rule": return t("ev.rule", { rule: it.value, date: it.date });
      case "comparison": return t("ev.comparison." + it.value, { cve: it.cve });
      default: return it.id;
    }
  }
  function groupOf(it) {
    if (it.provenance === "unknown" || it.basis === "assumed") { return "unknown"; }
    return it.provenance;
  }
  function cveCard(c, res, input) {
    var cls = STATUS_CLASS[c.status];
    var card = el("article", { cls: "cve-card " + cls });
    card.appendChild(el("header", {}, [
      el("h4", { text: c.id }),
      el("span", { cls: "badge" }, [el("span", { cls: "icon", text: STATUS_ICON[c.status], attrs: { "aria-hidden": "true" } }), el("span", { text: t(STATUS_KEY[c.status]) })]),
    ]));
    card.appendChild(el("p", { cls: "title", text: c.title }));
    var lines = el("ul", { cls: "lines" });
    if (c.state) { lines.appendChild(el("li", { text: t(c.state === "affected" ? "line.compare_affected" : "line.compare_fixed", { version: res.version, fixed: c.fixed, series: res.series }) })); }
    else { lines.appendChild(el("li", { text: t("line.no_comparison") })); }
    if (input.version_source && input.version_unknown !== "yes") { lines.appendChild(el("li", { text: t("line.source", { source: valText("version_source", input.version_source).toLowerCase() }) })); }
    if (input.update_applied) { lines.appendChild(el("li", { text: t("line.update", { basis: valText("update_applied", input.update_applied).toLowerCase() }) })); }
    if (input.restarted) { lines.appendChild(el("li", { text: t("line.restart", { basis: valText("restarted", input.restarted).toLowerCase() }) })); }
    card.appendChild(lines);
    var links = el("p", { cls: "card-links" }, [link(c.advisory, t("card.advisory"))]);
    if (c.source_url && c.source_url !== c.advisory) { links.appendChild(link(c.source_url, "Vendor source")); }
    card.appendChild(links);
    var why = el("details", {}, [el("summary", { text: t("card.why") }), el("p", { text: t("why." + c.code) })]);
    var rule = res.rule ? RULES.rules.filter(function (r) { return r.id === res.rule; })[0] : null;
    if (rule && rule.note) { why.appendChild(el("p", { text: t("note." + rule.note) })); }
    if (rule && rule.series === "8.2" && RULES.php82_end_of_support) { why.appendChild(el("p", { text: t("note.php82_eol", { date: RULES.php82_end_of_support.date }) })); }
    if (rule && rule.platform === "plesk") { why.appendChild(el("p", { text: t("note.plesk_match") })); }
    if (c.status === "verify") { why.appendChild(el("p", { text: t("note.provider_backports") })); }
    card.appendChild(why);
    return card;
  }
  function section(title, node) {
    return [el("h3", { cls: "section-title", text: title }), node];
  }

  function noteNode(id, res) {
    var ann = RULES.announcement, pn = RULES.prerelease_notes && RULES.prerelease_notes["8.6"];
    var p = el("p", { cls: "callout" }, [doc.createTextNode(t("note." + id) + " ")]);
    if (id === "backport_branch") {
      p.appendChild(link(ann.url, t("link.announcement")));
      var m = /^(\d+\.\d+)/.exec(String(res.version || ""));
      (ann.backport_branches || []).forEach(function (b) { if (m && b.series === m[1]) { p.appendChild(doc.createTextNode(" · ")); p.appendChild(link(b.url, t("link.branch", { series: b.series }))); } });
    } else if (id === "highest_risk_mod_php") { p.appendChild(link(ann.url, t("link.announcement"))); }
    else if (id.indexOf("prerelease_") === 0 && pn) { p.appendChild(link(pn.source_url, "php-src NEWS (8.6.0 RC4)")); }
    return p;
  }
  function mitigationsBlock(res) {
    var ann = RULES.announcement, box = el("div");
    box.appendChild(el("p", { text: t("mit.intro") }));
    var ul = el("ul");
    (RULES.mitigations || []).forEach(function (m) {
      ul.appendChild(el("li", {}, [el("span", { text: m.summary }), el("br"), el("span", { cls: "muted", text: t("mit.limit") + ": " + m.limitation }), el("br"), el("span", { cls: "muted", text: t("mit.applies", { cves: m.cves.join(", ") }) })]));
    });
    box.appendChild(ul);
    box.appendChild(el("p", { text: t("mit.restart_note") + " " }, [link(ann.url, t("link.announcement"))]));
    return box;
  }
  function restartText(id, input) {
    if (id === "restart_runtime" && input.exec_model && C.has("act.restart_runtime.d." + input.exec_model)) { return t("act.restart_runtime.d." + input.exec_model); }
    return t("act." + id + ".d");
  }

  function renderReport() {
    var input = toEngine();
    var res = E.evaluate(input, RULES);
    if (res.status === "invalid") {
      var fs = FIELD_STEP[res.field] || 1;
      setView("form"); showStep(fs, false); showErrors(res.errors || [{ field: res.field, reason: res.code }]);
      return;
    }
    last = { res: res, input: input, when: new Date(), a: visible(a) };
    var cls = STATUS_CLASS[res.status];
    var host = $("report"); clear(host);
    var snap = last.a;
    var d = E.normalizeDomain(snap.domain);

    // header
    var meta = el("p", { cls: "report-meta" }, [el("span", { text: t("rep.title").toUpperCase() }), el("br"), el("strong", { text: (d.ok ? d.host : "") + (snap.site_name.trim() ? " · " + snap.site_name.trim() : "") }), el("br"), el("span", { text: t("rep.assessed", { when: stamp(last.when) }) })]);
    var actions = el("div", { cls: "report-actions" }, [
      el("button", { cls: "btn", text: t("btn.edit"), attrs: { type: "button", id: "btn-edit" } }),
      el("button", { cls: "btn", text: t("btn.print"), attrs: { type: "button", id: "btn-print" } }),
      el("button", { cls: "btn", text: t("btn.download"), attrs: { type: "button", id: "btn-download" } }),
      el("button", { cls: "btn btn-primary", text: t("btn.new"), attrs: { type: "button", id: "btn-new" } }),
    ]);
    host.appendChild(el("div", { cls: "report-head" }, [meta, actions]));

    // headline
    var allAffected = res.per_cve.length > 0 && res.per_cve.every(function (c) { return c.status === "affected"; });
    var headKey = res.status === "affected" ? (allAffected ? "headline.affected" : "headline.affected_partial") : res.status === "remediated" ? "headline.supported" : "headline.verify";
    var subKey = res.status === "affected" ? "headline.sub.affected" : res.status === "remediated" ? "headline.sub.supported" : "headline.sub.verify";
    host.appendChild(el("section", { cls: "verdict " + cls }, [
      el("span", { cls: "icon", text: STATUS_ICON[res.status], attrs: { "aria-hidden": "true" } }),
      el("div", {}, [
        el("h2", { text: t(headKey), attrs: { id: "report-heading", tabindex: "-1" } }),
        el("p", { text: t(subKey) }),
        el("p", { cls: "scope", text: t("scope.note") }),
      ]),
    ]));
    if (res.plan.length) {
      host.appendChild(el("div", { cls: "first " + cls }, [el("h3", { text: t("rep.first") + ": " + t("act." + res.plan[0] + ".t") }), el("p", { text: restartText(res.plan[0], input) })]));
    }
    if (res.notes.length) { var nb = el("div", { cls: "notes" }); res.notes.forEach(function (id) { nb.appendChild(noteNode(id, res)); }); host.appendChild(nb); }

    // each CVE
    var grid = el("div", { cls: "cve-grid" });
    res.per_cve.forEach(function (c) { grid.appendChild(cveCard(c, res, input)); });
    section(t("rep.cves"), grid).forEach(function (n) { host.appendChild(n); });

    // evidence summary
    var groups = { verified: [], declared: [], inferred: [], unknown: [] };
    res.evidence.forEach(function (it) { groups[groupOf(it)].push(evidenceText(it, input)); });
    var eg = el("div", { cls: "evidence-grid" });
    ["verified", "declared", "inferred", "unknown"].forEach(function (g) {
      var box = el("div", { cls: "ev-group" }, [el("h4", { text: t("evg." + g) }), el("p", { cls: "sub", text: t("evg." + g + ".d") })]);
      if (groups[g].length) { var ul = el("ul"); groups[g].forEach(function (x) { ul.appendChild(el("li", { text: x })); }); box.appendChild(ul); }
      else { box.appendChild(el("p", { cls: "none", text: t("evg.none") })); }
      eg.appendChild(box);
    });
    section(t("rep.evidence"), eg).forEach(function (n) { host.appendChild(n); });

    // action plan
    var ol = el("ol", { cls: "plan" });
    res.plan.forEach(function (id) { ol.appendChild(el("li", {}, [el("div", {}, [el("b", { text: t("act." + id + ".t") }), el("span", { text: restartText(id, input) })])])); });
    section(t("rep.plan"), ol).forEach(function (n) { host.appendChild(n); });

    // risk explanation
    var risk = el("div");
    RULES.cves.forEach(function (c) {
      var ul = el("ul");
      ul.appendChild(el("li", { text: t("risk.severity", { severity: c.severity, cvss: c.cvss, published: c.published }) }));
      ul.appendChild(el("li", { text: t("risk.impact") + ": " + c.impact }));
      ul.appendChild(el("li", { text: t("risk.mechanism") + ": " + c.mechanism }));
      ul.appendChild(el("li", { text: t("risk.mitigation") + ": " + c.mitigation }));
      risk.appendChild(el("h4", { text: c.id + " · " + c.title }));
      risk.appendChild(ul);
      risk.appendChild(el("p", {}, [link(c.advisory, t("card.advisory"))]));
    });
    risk.appendChild(el("p", { text: t("risk.announcement") + " " }, [link(RULES.announcement.url, t("link.announcement"))]));
    risk.appendChild(el("p", { cls: "muted", text: t("risk.announcement_note") }));
    risk.appendChild(el("p", { cls: "muted", text: t("risk.note") }));
    host.appendChild(el("details", { cls: "block" }, [el("summary", { text: t("rep.risk") }), risk]));
    if (res.status !== "remediated") { host.appendChild(el("details", { cls: "block", attrs: { id: "mitigations" } }, [el("summary", { text: t("mit.title") }), mitigationsBlock(res)])); }

    // provenance and sources
    var prov = el("div");
    var srcList = el("ul");
    var seen = {};
    var rule = res.rule ? RULES.rules.filter(function (r) { return r.id === res.rule; })[0] : null;
    var urls = rule ? [rule.source_url].concat(rule.extra_sources || []) : [];
    RULES.cves.forEach(function (c) { urls.push(c.advisory); });
    urls.forEach(function (u) { if (u.indexOf("https://") === 0 && !seen[u]) { seen[u] = true; srcList.appendChild(el("li", {}, [link(u, shortUrl(u))])); } });
    prov.appendChild(el("h4", { text: t("rep.sources") })); prov.appendChild(srcList);
    host.appendChild(el("details", { cls: "block" }, [el("summary", { text: t("rep.provenance") }), prov]));
    host.appendChild(el("p", { cls: "prov", text: t("prov.line", { when: stamp(last.when), date: RULES.rules_verified_at }) }));

    setView("report");
    $("btn-edit").addEventListener("click", function () { setView("form"); showStep(1, true); });
    $("btn-print").addEventListener("click", function () { openDetails(); window.print(); });
    $("btn-download").addEventListener("click", downloadReport);
    $("btn-new").addEventListener("click", reset);
    $("report-heading").focus();
  }

  // User text goes into the Markdown file inside a code span, so it cannot become a link, HTML or a heading.
  function code(x) { return "`" + String(x).replace(/`/g, "'").replace(/[\r\n\u0085\u2028\u2029]/g, " ").trim() + "`"; }
  function openDetails() { Array.prototype.forEach.call(doc.querySelectorAll("#report details"), function (d) { d.open = true; }); }
  window.addEventListener("beforeprint", function () { if (last) { openDetails(); } });
  function reportMarkdown() {
    var snap = last.a;
    var r = last.res, input = last.input, d = E.normalizeDomain(snap.domain);
    var out = [];
    out.push("# dyd↻ assessment report", "");
    out.push("- Domain: " + (d.ok ? d.host : "") + (snap.site_name.trim() ? " (" + code(snap.site_name) + ")" : ""));
    out.push("- Assessed: " + stamp(last.when) + " (in the browser, nothing uploaded)");
    out.push("- Rules re-read: " + RULES.rules_verified_at + "; independent human review pending", "");
    out.push("## Overall: " + t(STATUS_KEY[r.status]), "");
    out.push(t("scope.note"), "");
    out.push("## Each vulnerability", "");
    r.per_cve.forEach(function (c) { out.push("- " + c.id + " (" + c.title + "): " + t(STATUS_KEY[c.status]) + (c.fixed ? "; fixed in " + c.fixed : "") + ". " + t("why." + c.code) + " Advisory: " + c.advisory); });
    out.push("", "## Evidence", "");
    ["verified", "declared", "inferred", "unknown"].forEach(function (g) {
      var items = r.evidence.filter(function (it) { return groupOf(it) === g; });
      out.push("### " + t("evg." + g), "");
      if (!items.length) { out.push("- " + t("evg.none")); }
      items.forEach(function (it) { out.push("- " + evidenceText(it, input, true)); });
      out.push("");
    });
    if (r.notes.length) { out.push("## Notes", ""); r.notes.forEach(function (id) { out.push("- " + t("note." + id)); }); out.push("", "PHP announcement: " + RULES.announcement.url, ""); }
    out.push("## Action plan", "");
    r.plan.forEach(function (id, i) { out.push((i + 1) + ". **" + t("act." + id + ".t") + "**: " + restartText(id, input)); });
    if (r.status !== "remediated") {
      out.push("", "## " + t("mit.title"), "", t("mit.intro"), "");
      (RULES.mitigations || []).forEach(function (m) { out.push("- " + m.summary + " " + t("mit.limit") + ": " + m.limitation); });
      out.push("", t("mit.restart_note") + " " + RULES.announcement.url);
    }
    out.push("", "---", t("prov.line", { when: stamp(last.when), date: RULES.rules_verified_at }), "");
    return out.join("\n");
  }
  function downloadReport() {
    var d = E.normalizeDomain(last.a.domain);
    var name = "dyd-report-" + (d.ok ? d.host : "site") + "-" + last.when.toISOString().slice(0, 10) + ".md";
    var url = URL.createObjectURL(new Blob([reportMarkdown()], { type: "text/markdown" }));
    var anchor = el("a", { attrs: { href: url, download: name } });
    doc.body.appendChild(anchor); anchor.click();
    window.setTimeout(function () { URL.revokeObjectURL(url); doc.body.removeChild(anchor); }, 1000);
  }

  function reset() {
    a = Object.assign({}, EMPTY); reach = { state: "idle", host: "", time: "" }; last = null;
    pushToForm(); clearErrors(); renderReach(); setView("form"); showStep(1, true);
  }

  /* ---------- static sections generated from the rules ---------- */
  function renderStatic() {
    var days = Math.floor((Date.now() - Date.parse(RULES.rules_verified_at + "T00:00:00Z")) / 86400000);
    $("rules-chip").textContent = "Rules verified " + RULES.rules_verified_at + (days > 30 ? " · older than 30 days, re-read the sources" : "");
    $("footer-verified").textContent = "Rules last verified: " + RULES.rules_verified_at;
    var ul = $("cve-list"); clear(ul);
    RULES.cves.forEach(function (c) {
      ul.appendChild(el("li", {}, [el("span", { cls: "cve-id", text: c.id }), el("span", { text: c.title }),
        el("span", {}, [doc.createTextNode(c.severity + " · " + c.cvss + " · "), link(c.advisory, "Official advisory")])]));
    });
    var tbl = $("envs-table"); clear(tbl);
    tbl.appendChild(el("caption", { text: "Verified rules" }));
    var head = el("tr");
    ["Environment", "Branch or release", "Package", "Fixed in", "Verified"].forEach(function (k) { head.appendChild(el("th", { text: k, attrs: { scope: "col" } })); });
    tbl.appendChild(el("thead", {}, [head]));
    var body = el("tbody");
    RULES.rules.forEach(function (r) {
      var fixedVals = {}; Object.keys(r.per_cve).forEach(function (c) { fixedVals[r.per_cve[c].fixed] = true; });
      var tr = el("tr");
      [["Environment", PLATFORM_NAMES[r.platform] || r.platform, ""], ["Branch or release", r.release_label || ("PHP " + r.series), ""], ["Package", r.package || "php", "mono"],
        ["Fixed in", Object.keys(fixedVals).join(" / "), "mono"], ["Verified", r.verified_at, ""]].forEach(function (c) {
        tr.appendChild(el("td", { text: c[1], cls: c[2], attrs: { "data-label": c[0] } }));
      });
      body.appendChild(tr);
    });
    tbl.appendChild(body); keepTableRoles(tbl);
    var host = $("sources-list"); clear(host);
    var seen = {};
    function group(title, urls) {
      var list = [];
      urls.forEach(function (u) { if (typeof u === "string" && u.indexOf("https://") === 0 && !seen[u]) { seen[u] = true; list.push(u); } });
      if (!list.length) { return; }
      var l = el("ul"); list.forEach(function (u) { l.appendChild(el("li", {}, [link(u, shortUrl(u))])); });
      host.appendChild(el("div", {}, [el("h3", { text: title }), l]));
    }
    group("php-src advisories", RULES.cves.map(function (c) { return c.advisory; }));
    [["upstream", "PHP project"], ["docker", "Docker official image"], ["plesk", "Plesk"], ["debian", "Debian"], ["ubuntu", "Ubuntu"]].forEach(function (p) {
      var urls = [];
      rulesOf(p[0]).forEach(function (r) { urls.push(r.source_url); (r.extra_sources || []).forEach(function (u) { urls.push(u); }); Object.keys(r.per_cve).forEach(function (c) { urls.push(r.per_cve[c].source_url); }); });
      group(p[1], urls);
    });
    if (RULES.php82_end_of_support) { group("Other", [RULES.php82_end_of_support.source_url]); }
  }

  /* ---------- events ---------- */
  function onInput(ev) {
    var before = { host: a.domain, os: a.os_family, ps: a.package_source, ht: a.hosting_type };
    syncFromForm();
    if (before.host !== a.domain && reach.state !== "idle") { reach = { state: "idle", host: "", time: "" }; renderReach(); }
    if (before.os !== a.os_family) { a.release = ""; renderReleaseOptions(); }
    if (ev && ev.target && ev.target.name) {
      var p = $("err-" + ev.target.name); if (p) { p.textContent = ""; }
      Array.prototype.forEach.call(doc.querySelectorAll('[name="' + ev.target.name + '"]'), function (c) { c.removeAttribute("aria-invalid"); });
    }
    refresh();
  }
  function copyCommand() {
    var node = $("help-cmd"), text = node.textContent, hint = $("copy-hint");
    function fallback() {
      var range = doc.createRange(); range.selectNodeContents(node);
      var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      hint.textContent = t("copy.hint");
    }
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          hint.textContent = t("btn.copied");
          window.setTimeout(function () { hint.textContent = ""; }, 2000);
        }, fallback);
      } else { fallback(); }
    } catch (e) { fallback(); }
  }

  // Built only when the scripts really failed, so readers that do not run JavaScript never see an error that does not apply.
  function showRulesError() {
    var old = $("rules-error");
    if (old) { old.parentNode.removeChild(old); }
    var missing = [];
    if (!RULES || !Array.isArray(RULES.rules) || !RULES.rules.length) { missing.push("rules.js"); }
    if (!E) { missing.push("engine.js"); }
    if (!C) { missing.push("copy.js"); }
    var box = el("div", { cls: "notice notice-danger", attrs: { id: "rules-error", role: "alert" } }, [
      el("strong", { text: "The rules could not be loaded" }),
      el("p", { text: "A script file is missing or unreadable, so the assessment is disabled. Reload the page; if the problem stays, report it to the project." }),
      el("p", { cls: "mono", attrs: { id: "rules-error-detail" }, text: "Missing or empty: " + missing.join(", ") }),
    ]);
    var stage = $("top");
    stage.parentNode.insertBefore(box, stage);
    $("assess").hidden = true;
  }

  function init() {
    if (!ready) { showRulesError(); return; }
    var form = $("form");
    form.addEventListener("change", onInput);
    form.addEventListener("input", onInput);
    form.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && ev.target.tagName === "INPUT" && ev.target.type === "text") { ev.preventDefault(); next(); } });
    form.addEventListener("submit", function (ev) { ev.preventDefault(); next(); });
    $("btn-next").addEventListener("click", next);
    $("btn-back").addEventListener("click", back);
    $("copy-btn").addEventListener("click", copyCommand);
    $("reach-btn").addEventListener("click", checkReach);
    renderStatic(); renderReleaseOptions(); renderReach();
    showStep(1, false);
  }
  init();
})();
