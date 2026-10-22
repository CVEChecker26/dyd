/* dyd engine: pure verdict logic. No DOM, network or storage. UMD (browser + Node). */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) { module.exports = factory(); }
  else { root.DYD_ENGINE = factory(); }
})(typeof window !== "undefined" ? window : this, function () {
  "use strict";

  var PLATFORMS = ["upstream", "docker", "debian", "ubuntu", "plesk", "other"];
  var DISTROS = ["debian", "ubuntu"];
  var VERSION_CHARS = /^[A-Za-z0-9.+~:_-]+$/;
  var STRICT_TRIPLE = /^(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})\.(0|[1-9]\d{0,5})$/;
  var PRERELEASE_SHAPE = /^\d+\.\d+(\.\d+)?[-.~+_]?(alpha|beta|rc|dev|snapshot|nightly)\d*([.+~_-].*)?$/i;

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
    if (m) {
      return { ok: true, major: +m[1], minor: +m[2], patch: +m[3], series: m[1] + "." + m[2] };
    }
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

  // ---- Step 1: validation ----
  function validate(input) {
    var errs = [];
    var inp = input || {};
    function add(field, reason) { errs.push({ field: field, reason: reason }); }
    var p = inp.platform;
    if (p === undefined || p === null || p === "") { add("platform", "required"); return errs; }
    if (PLATFORMS.indexOf(p) === -1) { add("platform", "invalid_value"); return errs; }
    if (p === "other") { return errs; }
    if (p === "docker") {
      if (!inp.docker_image) { add("docker_image", "required"); }
      else if (inp.docker_image !== "official" && inp.docker_image !== "other") { add("docker_image", "invalid_value"); }
    }
    if (p === "plesk") {
      if (!inp.plesk_os) { add("plesk_os", "required"); }
      else if (inp.plesk_os !== "linux" && inp.plesk_os !== "windows") { add("plesk_os", "invalid_value"); }
    }
    if (DISTROS.indexOf(p) !== -1) {
      if (typeof inp.release !== "string" || inp.release === "") { add("release", "required"); }
      else if (inp.release.length > 32 || !VERSION_CHARS.test(inp.release)) { add("release", "invalid_value"); }
    }
    var v = inp.version;
    if (typeof v !== "string" || v.trim() === "") { add("version", "required"); }
    else {
      v = v.trim();
      if (v.length > 64) { add("version", "too_long"); }
      else if (!VERSION_CHARS.test(v)) { add("version", "bad_chars"); }
      else if (DISTROS.indexOf(p) === -1 && !parseUpstream(v).ok && parseUpstream(v).reason === "format") { add("version", "format"); }
    }
    if (!inp.source) { add("source", "required"); }
    else if (inp.source !== "web" && inp.source !== "unsure") { add("source", "invalid_value"); }
    if (!inp.restarted) { add("restarted", "required"); }
    else if (["yes", "no", "unknown"].indexOf(inp.restarted) === -1) { add("restarted", "invalid_value"); }
    return errs;
  }

  function result(status, code, extra) {
    var o = { status: status, code: code, per_cve: [], fixed: null, series: null, version: null, rule: null, versionIsFixed: null };
    for (var k in extra) { if (Object.prototype.hasOwnProperty.call(extra, k)) { o[k] = extra[k]; } }
    return o;
  }

  function evaluate(input, rules) {
    var errs = validate(input);
    if (errs.length) { return result("invalid", errs[0].reason, { field: errs[0].field, errors: errs }); }
    var p = input.platform;
    var version = typeof input.version === "string" ? input.version.trim() : null;
    var base = { version: version };

    // Step 2
    if (p === "other") { return result("verify", "platform_not_covered", base); }
    if (p === "docker" && input.docker_image !== "official") { return result("verify", "docker_not_official", base); }
    if (p === "plesk" && input.plesk_os === "windows") { return result("verify", "plesk_windows", base); }
    if (!hasPlatformRules(rules, p)) { return result("verify", "platform_not_covered", base); }

    // Step 3
    var rule, key, isDistro = DISTROS.indexOf(p) !== -1, parsed = null;
    if (isDistro) {
      rule = findRule(rules, p, input.release);
      if (!rule) { return result("verify", "platform_not_covered", base); }
      base.series = rule.release;
      base.rule = rule.id;
      if (!new RegExp(rule.version_regex).test(version)) {
        return result("verify", "unexpected_package_format", base);
      }
    } else {
      parsed = parseUpstream(version);
      if (!parsed.ok) { return result("verify", "prerelease", base); }
      key = parsed.series;
      base.series = key;
      var pre = (rules && rules.upstream_prerelease_branches) || [];
      if (pre.indexOf(key) !== -1) { return result("verify", "prerelease", base); }
      rule = findRule(rules, p, key);
      if (!rule) {
        var eol = parsed.major < 8 || (parsed.major === 8 && parsed.minor <= 1);
        var code = eol ? (p === "plesk" ? "plesk_eol_branch" : "eol_branch") : "unknown_branch";
        return result("verify", code, base);
      }
      base.rule = rule.id;
    }

    // Step 4
    var cves = (rules && rules.cves) || [];
    var perCve = [], allFixed = true, anyAffected = false, fixedValues = {};
    for (var i = 0; i < cves.length; i++) {
      var c = cves[i], pc = rule.per_cve && rule.per_cve[c.id];
      if (!pc) { return result("verify", "platform_not_covered", base); }
      var isFixed;
      if (isDistro) { isFixed = dpkgCompare(version, pc.fixed) >= 0; }
      else {
        var f = parseUpstream(pc.fixed);
        if (!f.ok || f.series !== parsed.series) { return result("verify", "platform_not_covered", base); }
        isFixed = parsed.patch >= f.patch;
      }
      fixedValues[pc.fixed] = true;
      if (!isFixed) { anyAffected = true; allFixed = false; }
      perCve.push({ id: c.id, title: c.title, state: isFixed ? "fixed" : "affected", fixed: pc.fixed, source_url: pc.source_url, advisory: c.advisory });
    }
    var fv = Object.keys(fixedValues);
    var done = {
      per_cve: perCve, fixed: fv.length === 1 ? fv[0] : null, series: base.series,
      version: version, rule: rule.id, versionIsFixed: allFixed,
    };

    // Step 5
    if (input.source !== "web") { return result("verify", "version_source_unconfirmed", done); }
    // Step 6
    if (anyAffected) { return result("affected", "affected", done); }
    // Step 7
    if (input.restarted !== "yes") { return result("verify", "restart_not_confirmed", done); }
    // Step 8
    return result("remediated", "remediated", done);
  }

  return { evaluate: evaluate, validate: validate, dpkgCompare: dpkgCompare, parseUpstream: parseUpstream, findRule: findRule };
});
