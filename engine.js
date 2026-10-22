/* dyd engine: pure assessment logic. No DOM, network or storage. UMD (browser + Node). */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.DYD_ENGINE = factory(); }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var PLATFORMS = ["upstream", "docker", "debian", "ubuntu", "plesk", "other"];
  var DISTROS = ["debian", "ubuntu"];
  var SERVING_SOURCES = ["web_diagnostic", "panel", "provider_support"]; // the user says the value describes the PHP serving the site
  var VERSION_SOURCES = SERVING_SOURCES.concat(["cli", "unknown"]);
  var CONFIRM = ["confirmed", "assumed", "no", "unknown"];
  var ENUMS = {
    hosting_type: ["shared", "vps", "dedicated", "cloud", "managed", "docker", "other", "unknown"],
    panel: ["cpanel", "plesk", "other", "none", "unknown"],
    other_kind: ["provider", "unknown", "other"],
    update_from: ["upstream", "os_vendor", "provider", "other", "unknown"],
    runtimes: ["yes", "no", "unknown"],
    reachability: ["reached", "inconclusive", "not_checked"],
    exec_model: ["fpm", "mod_php", "cgi", "frankenphp", "litespeed", "unknown"],
    mitigations_applied: ["yes", "no", "unknown"],
  };
  var VERSION_CHARS = /^[A-Za-z0-9.+~:_-]+$/;
  var STRICT_TRIPLE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
  var PRERELEASE_SHAPE = /^\d+\.\d+(\.\d+)?[-.~+_]?(alpha|beta|rc|dev|snapshot|nightly)\d*([.+~_-].*)?$/i;
  var INTERNAL_SUFFIXES = [".local", ".localhost", ".localdomain", ".internal", ".lan", ".home", ".corp", ".intranet", ".private", ".router", ".gateway", ".onion", ".arpa", ".test", ".invalid", ".example"];

  // ---- Debian version comparison (Debian Policy section 5.6.12) ----
  function isDigit(c) { return c >= "0" && c <= "9"; }
  function isAlpha(c) { return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z"); }
  function order(c) {
    if (c === undefined) { return 0; }
    if (isDigit(c)) { return 0; }
    if (isAlpha(c)) { return c.charCodeAt(0); }
    if (c === "~") { return -1; }
    return c.charCodeAt(0) + 256;
  }
  function verrevcmp(a, b) {
    var i = 0, j = 0;
    while (i < a.length || j < b.length) {
      var firstDiff = 0;
      while ((i < a.length && !isDigit(a[i])) || (j < b.length && !isDigit(b[j]))) {
        var ac = order(a[i]), bc = order(b[j]);
        if (ac !== bc) { return ac < bc ? -1 : 1; }
        i++; j++;
      }
      while (a[i] === "0") { i++; }
      while (b[j] === "0") { j++; }
      while (i < a.length && j < b.length && isDigit(a[i]) && isDigit(b[j])) {
        if (!firstDiff) { firstDiff = a.charCodeAt(i) - b.charCodeAt(j); }
        i++; j++;
      }
      if (i < a.length && isDigit(a[i])) { return 1; }
      if (j < b.length && isDigit(b[j])) { return -1; }
      if (firstDiff) { return firstDiff < 0 ? -1 : 1; }
    }
    return 0;
  }
  function splitDebian(v) {
    var s = String(v), epoch = 0, revision = "";
    var colon = s.indexOf(":");
    if (colon !== -1) {
      var e = s.slice(0, colon);
      if (!/^\d+$/.test(e)) { throw new TypeError("invalid epoch"); }
      epoch = parseInt(e, 10);
      s = s.slice(colon + 1);
    }
    var hyphen = s.lastIndexOf("-");
    if (hyphen !== -1) { revision = s.slice(hyphen + 1); s = s.slice(0, hyphen); }
    return { epoch: epoch, upstream: s, revision: revision };
  }
  function dpkgCompare(a, b) {
    var x = splitDebian(a), y = splitDebian(b);
    if (x.epoch !== y.epoch) { return x.epoch < y.epoch ? -1 : 1; }
    var r = verrevcmp(x.upstream, y.upstream);
    if (r !== 0) { return r; }
    return verrevcmp(x.revision, y.revision);
  }

  // ---- Upstream MAJOR.MINOR.PATCH ----
  function parseUpstream(v) {
    var s = String(v);
    var m = STRICT_TRIPLE.exec(s);
    if (m) { return { ok: true, major: +m[1], minor: +m[2], patch: +m[3], series: m[1] + "." + m[2] }; }
    if (PRERELEASE_SHAPE.test(s)) { return { ok: false, reason: "prerelease" }; }
    return { ok: false, reason: "format" };
  }

  function findRule(rules, platform, key) {
    var list = (rules && rules.rules) || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.platform !== platform) { continue; }
      if (DISTROS.indexOf(platform) !== -1) { if (r.release === key) { return r; } }
      else if (r.series === key) { return r; }
    }
    return null;
  }
  function hasPlatformRules(rules, platform) {
    var list = (rules && rules.rules) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].platform === platform) { return true; } }
    return false;
  }

  // ---- Domain normalisation: keeps only a public host name ----
  function normalizeDomain(raw) {
    var fail = function (reason) { return { ok: false, reason: reason }; };
    if (typeof raw !== "string") { return fail("required"); }
    var s = raw.trim();
    if (s === "") { return fail("required"); }
    if (s.length > 300) { return fail("too_long"); }
    if (/[\u0000-\u001f\u007f\s]/.test(s)) { return fail("bad_chars"); }
    var hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(s);
    if (!hasScheme && /^[a-z][a-z0-9+.-]*:/i.test(s) && !/^[^/]*:\d+(\/|$)/.test(s)) { return fail("malformed"); }
    var u;
    try { u = new URL(hasScheme ? s : "https://" + s); } catch (e) { return fail("malformed"); }
    if (u.protocol !== "https:" && u.protocol !== "http:") { return fail("malformed"); }
    if (u.username || u.password) { return fail("has_credentials"); }
    if (u.port) { return fail("has_port"); }
    var host = u.hostname.toLowerCase().replace(/\.$/, "");
    if (host === "") { return fail("malformed"); }
    if (host.indexOf("[") !== -1 || host.indexOf(":") !== -1 || /^[0-9.]+$/.test(host)) { return fail("ip_address"); }
    if (host.length > 253) { return fail("too_long"); }
    var labels = host.split(".");
    if (labels.length < 2) { return fail("not_public"); }
    for (var i = 0; i < labels.length; i++) {
      if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(labels[i])) { return fail("malformed"); }
    }
    var tld = labels[labels.length - 1];
    if (!/^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(tld)) { return fail("malformed"); }
    for (var k = 0; k < INTERNAL_SUFFIXES.length; k++) {
      if (host === INTERNAL_SUFFIXES[k].slice(1) || host.slice(-INTERNAL_SUFFIXES[k].length) === INTERNAL_SUFFIXES[k]) { return fail("not_public"); }
    }
    return { ok: true, host: host };
  }

  // ---- Validation (step 1 of the engine) ----
  function validate(input) {
    var errs = [];
    var inp = input || {};
    function add(field, reason) { errs.push({ field: field, reason: reason }); }
    function optionalText(field) {
      var v = inp[field];
      if (v === undefined || v === null || v === "") { return; }
      if (typeof v !== "string") { add(field, "invalid_value"); }
      else if (v.trim().length > 60) { add(field, "too_long"); }
      else if (/[\u0000-\u001f\u007f\u0085\u2028\u2029]/.test(v)) { add(field, "bad_chars"); }
    }
    function optionalEnum(field, list) {
      var v = inp[field];
      if (v === undefined || v === null || v === "") { return; }
      if (list.indexOf(v) === -1) { add(field, "invalid_value"); }
    }
    var p = inp.platform;
    if (p === undefined || p === null || p === "") { add("platform", "required"); return errs; }
    if (PLATFORMS.indexOf(p) === -1) { add("platform", "invalid_value"); return errs; }
    if (inp.domain !== undefined && inp.domain !== null && inp.domain !== "") {
      var d = normalizeDomain(inp.domain);
      if (!d.ok) { add("domain", d.reason); }
    }
    optionalText("site_name"); optionalText("provider");
    optionalEnum("hosting_type", ENUMS.hosting_type); optionalEnum("panel", ENUMS.panel);
    optionalEnum("other_kind", ENUMS.other_kind); optionalEnum("update_from", ENUMS.update_from);
    optionalEnum("runtimes", ENUMS.runtimes); optionalEnum("reachability", ENUMS.reachability);
    optionalEnum("exec_model", ENUMS.exec_model); optionalEnum("mitigations_applied", ENUMS.mitigations_applied);
    optionalEnum("update_applied", CONFIRM);
    if (p === "other") { return errs; }
    if (p === "docker") {
      if (!inp.docker_image) { add("docker_image", "required"); }
      else if (inp.docker_image !== "official" && inp.docker_image !== "other") { add("docker_image", "invalid_value"); }
    }
    if (p === "plesk") {
      if (!inp.plesk_os) { add("plesk_os", "required"); }
      else if (["linux", "windows", "unknown"].indexOf(inp.plesk_os) === -1) { add("plesk_os", "invalid_value"); }
    }
    if (DISTROS.indexOf(p) !== -1) {
      if (typeof inp.release !== "string" || inp.release === "") { add("release", "required"); }
      else if (inp.release.length > 32 || !VERSION_CHARS.test(inp.release)) { add("release", "invalid_value"); }
    }
    var versionUnknown = inp.version_unknown === "yes";
    if (!versionUnknown) {
      var v = inp.version;
      if (typeof v !== "string" || v.trim() === "") { add("version", "required"); }
      else {
        v = v.trim();
        if (v.length > 64) { add("version", "too_long"); }
        else if (!VERSION_CHARS.test(v)) { add("version", "bad_chars"); }
        else if (DISTROS.indexOf(p) === -1 && parseUpstream(v).reason === "format") { add("version", "format"); }
      }
      if (!inp.version_source) { add("version_source", "required"); }
      else if (VERSION_SOURCES.indexOf(inp.version_source) === -1) { add("version_source", "invalid_value"); }
    }
    if (!inp.restarted) { add("restarted", "required"); }
    else if (CONFIRM.indexOf(inp.restarted) === -1) { add("restarted", "invalid_value"); }
    return errs;
  }

  function isServing(input) { return SERVING_SOURCES.indexOf(input.version_source) !== -1; }

  // ---- Evidence: every fact is labelled declared / verified / inferred / unknown ----
  function buildEvidence(input, res, rules) {
    var e = [];
    function add(id, provenance, value, extra) {
      var o = { id: id, provenance: provenance, value: value };
      if (extra) { for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { o[k] = extra[k]; } } }
      e.push(o);
    }
    var d = input.domain ? normalizeDomain(input.domain) : null;
    if (d && d.ok) { add("domain", "declared", d.host); }
    add("reachability", input.reachability === "reached" ? "verified" : "unknown", input.reachability || "not_checked");
    if (input.hosting_type) { add("hosting_type", "declared", input.hosting_type); }
    if (input.provider) { add("provider", "declared", String(input.provider).trim()); }
    if (input.panel) { add("panel", input.panel === "unknown" ? "unknown" : "declared", input.panel); }
    add("package_source", input.platform === "other" && input.other_kind !== "provider" ? "unknown" : "declared", input.platform + (input.docker_image ? ":" + input.docker_image : ""));
    if (input.version_unknown === "yes") { add("version", "unknown", ""); }
    else if (input.version) { add("version", "declared", String(input.version).trim()); }
    if (input.version_source) { add("version_source", input.version_source === "unknown" ? "unknown" : "declared", input.version_source); }
    add("runtime_serving", isServing(input) ? "declared" : "unknown", input.version_source || "unknown");
    if (input.exec_model) { add("exec_model", input.exec_model === "unknown" ? "unknown" : "declared", input.exec_model); }
    if (input.mitigations_applied) { add("mitigations", input.mitigations_applied === "unknown" ? "unknown" : "declared", input.mitigations_applied); }
    if (input.runtimes) { add("runtimes", input.runtimes === "unknown" ? "unknown" : "declared", input.runtimes); }
    if (input.update_applied) { add("update", input.update_applied === "unknown" ? "unknown" : "declared", input.update_applied, { basis: input.update_applied }); }
    if (input.restarted) { add("restart", input.restarted === "unknown" ? "unknown" : "declared", input.restarted, { basis: input.restarted }); }
    if (res.rule) { add("rule", "verified", res.rule, { date: rules && rules.rules_verified_at }); }
    for (var i = 0; i < res.per_cve.length; i++) {
      if (res.per_cve[i].state) { add("comparison", "inferred", res.per_cve[i].state, { cve: res.per_cve[i].id }); }
    }
    return e;
  }

  // ---- Action plan: ordered action ids chosen from the result ----
  var PLAN_BY_CODE = {
    platform_not_covered: ["identify_package_source", "read_vendor_advisory", "recheck"],
    package_source_unknown: ["identify_package_source", "read_vendor_advisory", "recheck"],
    provider_managed: ["ask_provider", "read_vendor_advisory", "recheck"],
    docker_not_official: ["identify_image", "rebuild_official", "restart_runtime", "recheck"],
    plesk_windows: ["read_vendor_advisory", "apply_update", "restart_runtime", "recheck"],
    plesk_os_unknown: ["identify_plesk_os", "recheck"],
    plesk_eol_branch: ["upgrade_branch", "read_vendor_advisory", "recheck"],
    eol_branch: ["upgrade_branch", "read_vendor_advisory", "recheck"],
    prerelease: ["use_stable_branch", "read_vendor_advisory", "recheck"],
    unknown_branch: ["use_stable_branch", "read_vendor_advisory", "recheck"],
    unexpected_package_format: ["check_package_version", "identify_package_source", "recheck"],
    version_unknown: ["find_version", "confirm_serving", "recheck"],
    version_source_unconfirmed: ["confirm_serving", "recheck"],
    update_version_conflict: ["resolve_conflict", "confirm_serving", "recheck"],
    restart_not_confirmed: ["restart_runtime", "verify_restart", "recheck"],
    update_not_confirmed: ["confirm_update", "verify_restart", "recheck"],
    multiple_runtimes: ["check_each_runtime", "recheck"],
    affected: ["apply_update", "restart_runtime", "recheck"],
    remediated: ["keep_updated", "recheck"],
  };
  function buildPlan(res, input) {
    if (res.status === "invalid") { return []; }
    var out = [];
    function push(id) { if (out.indexOf(id) === -1) { out.push(id); } }
    var codes = [res.code];
    for (var i = 0; i < res.per_cve.length; i++) { if (res.per_cve[i].code && codes.indexOf(res.per_cve[i].code) === -1) { codes.push(res.per_cve[i].code); } }
    // A declared version below the fixed version makes the update the first concrete step, even while other facts are open.
    var belowFixed = res.per_cve.some(function (c) { return c.state === "affected"; });
    if (belowFixed && res.status !== "affected" && res.code !== "update_version_conflict") { push("apply_update"); }
    codes.forEach(function (c) { (PLAN_BY_CODE[c] || []).forEach(function (id) { if (id !== "recheck") { push(id); } }); });
    if (input && input.runtimes === "yes") { push("check_each_runtime"); }
    push("recheck");
    // the re-check is always last
    out.splice(out.indexOf("recheck"), 1); out.push("recheck");
    return out;
  }


  // ---- Notes: facts from the PHP announcement and php-src that explain a result without changing it ----
  function prereleaseRank(v) {
    var m = /^(\d+)\.(\d+)\.(\d+)[-.~+_]?(alpha|beta|rc)(\d+)?/i.exec(String(v));
    if (!m) { return null; }
    return { stage: { alpha: 1, beta: 2, rc: 3 }[m[4].toLowerCase()], n: m[5] ? parseInt(m[5], 10) : 0 };
  }
  function buildNotes(input, res, rules) {
    var notes = [];
    if (res.status === "invalid") { return notes; }
    var ann = (rules && rules.announcement) || {};
    var sm = typeof input.version === "string" ? /^(\d+)\.(\d+)/.exec(input.version.trim()) : null;
    var series = sm ? sm[1] + "." + sm[2] : null;
    var upstreamLike = ["upstream", "docker", "plesk"].indexOf(input.platform) !== -1;
    if (upstreamLike && series) {
      var back = (ann.backport_branches || []).some(function (b) { return b.series === series; });
      if (back) { notes.push("backport_branch"); }
      var pn = rules && rules.prerelease_notes && rules.prerelease_notes[series];
      if (pn) {
        var have = prereleaseRank(input.version), need = prereleaseRank(pn.first_fixed + "");
        var fixedHere = have && need && (have.stage > need.stage || (have.stage === need.stage && have.n >= need.n));
        notes.push(have ? (fixedHere ? "prerelease_fixed" : "prerelease_not_fixed") : "prerelease_unspecified");
      }
    }
    if (res.status !== "remediated" && input.exec_model === "mod_php") { notes.push("highest_risk_mod_php"); }
    if (input.mitigations_applied === "yes") { notes.push("mitigation_not_a_fix"); }
    if (res.status === "affected" && input.restarted === "confirmed") { notes.push("restart_alone"); }
    return notes;
  }

  function result(status, code, extra) {
    var o = { status: status, code: code, per_cve: [], fixed: null, series: null, version: null, rule: null, versionIsFixed: null, evidence: [], plan: [], notes: [] };
    for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { o[k] = extra[k]; } }
    return o;
  }

  function evaluate(input, rules) {
    input = input || {};
    var errs = validate(input);
    if (errs.length) { return result("invalid", errs[0].reason, { field: errs[0].field, errors: errs }); }
    var cves = (rules && rules.cves) || [];
    function finish(res) { res.evidence = buildEvidence(input, res, rules); res.plan = buildPlan(res, input); res.notes = buildNotes(input, res, rules); return res; }
    function allVerify(code, extra) {
      var per = cves.map(function (c) { return { id: c.id, title: c.title, state: null, status: "verify", code: code, fixed: null, source_url: c.advisory, advisory: c.advisory }; });
      var o = {}; for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { o[k] = extra[k]; } }
      o.per_cve = per;
      return finish(result("verify", code, o));
    }
    var p = input.platform;
    var version = typeof input.version === "string" && input.version.trim() !== "" ? input.version.trim() : null;
    var base = { version: version };

    // Step 2: environment checks
    if (p === "other") {
      var kind = input.other_kind;
      return allVerify(kind === "provider" ? "provider_managed" : kind === "unknown" ? "package_source_unknown" : "platform_not_covered", base);
    }
    if (p === "docker" && input.docker_image !== "official") { return allVerify("docker_not_official", base); }
    if (p === "plesk" && input.plesk_os === "windows") { return allVerify("plesk_windows", base); }
    if (p === "plesk" && input.plesk_os === "unknown") { return allVerify("plesk_os_unknown", base); }
    if (!hasPlatformRules(rules, p)) { return allVerify("platform_not_covered", base); }
    if (input.version_unknown === "yes") { return allVerify("version_unknown", { version: null }); }

    // Step 3: version parsing
    var rule, key, isDistro = DISTROS.indexOf(p) !== -1, parsed = null;
    if (isDistro) {
      rule = findRule(rules, p, input.release);
      if (!rule) { return allVerify("platform_not_covered", base); }
      base.series = rule.release; base.rule = rule.id;
      if (!new RegExp(rule.version_regex).test(version)) { return allVerify("unexpected_package_format", base); }
    } else {
      parsed = parseUpstream(version);
      if (!parsed.ok) { return allVerify("prerelease", base); }
      key = parsed.series; base.series = key;
      var pre = (rules && rules.upstream_prerelease_branches) || [];
      if (pre.indexOf(key) !== -1) { return allVerify("prerelease", base); }
      rule = findRule(rules, p, key);
      if (!rule) {
        var eol = parsed.major < 8 || (parsed.major === 8 && parsed.minor <= 1);
        return allVerify(eol ? (p === "plesk" ? "plesk_eol_branch" : "eol_branch") : "unknown_branch", base);
      }
      base.rule = rule.id;
    }

    // Step 4: per-advisory comparison, with the method of this environment only
    var perCve = [], allFixed = true, anyAffected = false, fixedValues = {};
    for (var i = 0; i < cves.length; i++) {
      var c = cves[i], pc = rule.per_cve && rule.per_cve[c.id];
      if (!pc) { return allVerify("platform_not_covered", base); }
      var isFixed;
      if (isDistro) { isFixed = dpkgCompare(version, pc.fixed) >= 0; }
      else {
        var f = parseUpstream(pc.fixed);
        if (!f.ok || f.series !== parsed.series) { return allVerify("platform_not_covered", base); }
        isFixed = parsed.patch >= f.patch;
      }
      fixedValues[pc.fixed] = true;
      if (!isFixed) { anyAffected = true; allFixed = false; }
      perCve.push({ id: c.id, title: c.title, state: isFixed ? "fixed" : "affected", status: null, code: null, fixed: pc.fixed, source_url: pc.source_url, advisory: c.advisory });
    }
    var fv = Object.keys(fixedValues);

    // Steps 5 to 8: conflicts and confirmations decide the status of each advisory separately
    var claimsUpdated = input.update_applied === "confirmed" || input.update_applied === "assumed";
    var conflict = anyAffected && claimsUpdated;
    var serving = isServing(input);
    perCve.forEach(function (c) {
      if (conflict) { c.status = "verify"; c.code = "update_version_conflict"; }
      else if (!serving) { c.status = "verify"; c.code = "version_source_unconfirmed"; }
      else if (c.state === "affected") { c.status = "affected"; c.code = "affected"; }
      else if (input.update_applied !== "confirmed") { c.status = "verify"; c.code = "update_not_confirmed"; }
      else if (input.runtimes === "yes") { c.status = "verify"; c.code = "multiple_runtimes"; }
      else if (input.restarted !== "confirmed") { c.status = "verify"; c.code = "restart_not_confirmed"; }
      else { c.status = "remediated"; c.code = "remediated"; }
    });
    var statuses = perCve.map(function (c) { return c.status; });
    var overall = statuses.indexOf("affected") !== -1 ? "affected" : statuses.indexOf("verify") !== -1 ? "verify" : "remediated";
    var code = overall === "verify" ? perCve.filter(function (c) { return c.status === "verify"; })[0].code : overall;
    return finish(result(overall, code, {
      per_cve: perCve, fixed: fv.length === 1 ? fv[0] : null, series: base.series, version: version, rule: rule.id, versionIsFixed: allFixed,
    }));
  }

  return {
    evaluate: evaluate, validate: validate, dpkgCompare: dpkgCompare, parseUpstream: parseUpstream, findRule: findRule,
    normalizeDomain: normalizeDomain, buildPlan: buildPlan, SERVING_SOURCES: SERVING_SOURCES,
  };
});
