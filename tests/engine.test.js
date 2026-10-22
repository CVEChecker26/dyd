"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { spawnSync } = require("node:child_process");
const E = require("../engine.js");
const RULES = require("../rules.js");

const base = { platform: "upstream", release: "", version: "8.4.27", version_source: "web_diagnostic", restarted: "confirmed", update_applied: "confirmed" };
// A consistent user: when the declared version is below the fixed one, they did not install the update
// (an explicit update_applied in the test overrides this).
const ev = (o, r) => {
  const input = Object.assign({}, base, o);
  const res = E.evaluate(input, r || RULES);
  if (res.code === "update_version_conflict" && !("update_applied" in o)) return E.evaluate(Object.assign({}, input, { update_applied: "no" }), r || RULES);
  return res;
};
const CVES = RULES.cves.map((c) => c.id);

// ---------- Debian comparator ----------
test("dpkgCompare: Debian Policy 5.6.12 ordering", () => {
  // '~' sorts before everything (even end of string); a letter sorts before a non-letter; so ~~ < ~~a < ~ < (end) < a < +
  const exp = ["1.0~~", "1.0~~a", "1.0~", "1.0", "1.0a", "1.0+b1"];
  for (let i = 0; i < exp.length; i++) for (let j = 0; j < exp.length; j++) {
    assert.strictEqual(Math.sign(E.dpkgCompare(exp[i], exp[j])), Math.sign(i - j), `${exp[i]} vs ${exp[j]}`);
  }
  assert.ok(E.dpkgCompare("1.0~rc1", "1.0") < 0);
  assert.ok(E.dpkgCompare("1.0.1", "1.1") < 0);
});
test("dpkgCompare: epochs, numeric comparison, revisions, suffixes", () => {
  assert.ok(E.dpkgCompare("1:0.1", "9.9") > 0);
  assert.ok(E.dpkgCompare("0:1.0", "1.0") === 0);
  assert.ok(E.dpkgCompare("1.9", "1.10") < 0);
  assert.ok(E.dpkgCompare("1.0", "1.00") === 0);
  assert.ok(E.dpkgCompare("1.0-1", "1.0-2") < 0);
  assert.ok(E.dpkgCompare("1.0-9", "1.0-10") < 0);
  assert.ok(E.dpkgCompare("1.0-1", "1.0") > 0);
  assert.ok(E.dpkgCompare("1.2-3-4", "1.2-3-5") < 0); // revision is after the LAST hyphen
  assert.ok(E.dpkgCompare("7.4.3-4ubuntu2.29", "7.4.3-4ubuntu2.29+esm1") < 0);
  assert.ok(E.dpkgCompare("7.4.3-4ubuntu2.29+esm5", "7.4.3-4ubuntu2.29+esm10") < 0);
  assert.ok(E.dpkgCompare("8.4.27-1~deb13u1", "8.4.27-1") < 0);
  assert.ok(E.dpkgCompare("8.4.27-1~deb13u1", "8.4.26-1~deb13u2") > 0);
  assert.ok(E.dpkgCompare("8.4.27-1~deb13u1", "8.4.27-1~deb13u1+b1") < 0);
  assert.ok(E.dpkgCompare("5.5.9+dfsg-1ubuntu4.29+esm17", "5.5.9+dfsg-1ubuntu4.29+esm18") < 0);
  assert.throws(() => E.dpkgCompare("x:1", "1"), TypeError);
});
test("dpkgCompare: reflexive, antisymmetric, transitive on generated values", () => {
  let s = 12345;
  const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
  const alphabet = ["0", "1", "2", "9", "10", "a", "b", "~", ".", "+", "-", ":"];
  const gen = () => {
    let out = String(rnd(3)) + ".";
    for (let i = 0, n = 1 + rnd(6); i < n; i++) out += alphabet[rnd(alphabet.length - 1)];
    if (rnd(2)) out += "-" + String(rnd(9)) + alphabet[rnd(5)];
    return out;
  };
  const vals = Array.from({ length: 250 }, gen);
  for (const a of vals) {
    assert.strictEqual(E.dpkgCompare(a, a), 0);
    for (const b of vals.slice(0, 40)) {
      assert.strictEqual(Math.sign(E.dpkgCompare(a, b)) + Math.sign(E.dpkgCompare(b, a)), 0, `${a} ${b}`);
    }
  }
  const sorted = vals.slice().sort(E.dpkgCompare);
  for (let i = 0; i + 1 < sorted.length; i++) assert.ok(E.dpkgCompare(sorted[i], sorted[i + 1]) <= 0);
  for (let i = 0; i < sorted.length; i += 7) for (let j = i; j < sorted.length; j += 11) {
    assert.ok(E.dpkgCompare(sorted[i], sorted[j]) <= 0);
  }
});
const dpkgAvailable = spawnSync("dpkg", ["--version"], { encoding: "utf8" }).status === 0;
test("dpkgCompare agrees with real dpkg (cross-check)", { skip: !dpkgAvailable && "dpkg not available on PATH; cross-check not run" }, () => {
  let s = 777;
  const rnd = (n) => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s % n; };
  const al = ["0", "1", "2", "9", "a", "b", "~", ".", "+"];
  const gen = () => { let o = String(1 + rnd(9)); for (let i = 0, n = 1 + rnd(7); i < n; i++) o += al[rnd(al.length)]; return o + (rnd(2) ? "-" + (1 + rnd(9)) : ""); };
  for (let i = 0; i < 600; i++) {
    const a = gen(), b = gen();
    const lt = spawnSync("dpkg", ["--compare-versions", a, "lt", b]).status === 0;
    const eq = spawnSync("dpkg", ["--compare-versions", a, "eq", b]).status === 0;
    const exp = lt ? -1 : eq ? 0 : 1;
    assert.strictEqual(Math.sign(E.dpkgCompare(a, b)), exp, `${a} vs ${b}`);
  }
});

// ---------- parseUpstream ----------
test("parseUpstream", () => {
  assert.deepStrictEqual(E.parseUpstream("8.4.27"), { ok: true, major: 8, minor: 4, patch: 27, series: "8.4" });
  for (const v of ["8.5.0RC1", "8.6.0alpha1", "8.4.0-dev", "8.5.12-rc1", "8.6.0beta2", "8.5.0-snapshot"]) assert.strictEqual(E.parseUpstream(v).reason, "prerelease", v);
  for (const v of ["8.04.1", "8.4", "8", "8.4.27.1", "abc", "8.4.x", "08.4.1", "8.4.27-1~deb13u1", "8.4.99999999999999999999", "8.4.27a", "8.4.1000000"]) assert.strictEqual(E.parseUpstream(v).reason, "format", v);
});

test("findRule", () => {
  assert.strictEqual(E.findRule(RULES, "upstream", "8.4").id, "upstream-8.4");
  assert.strictEqual(E.findRule(RULES, "debian", "13").id, "debian-13");
  assert.strictEqual(E.findRule(RULES, "ubuntu", "26.04").id, "ubuntu-26.04");
  assert.strictEqual(E.findRule(RULES, "upstream", "8.1"), null);
  assert.strictEqual(E.findRule(RULES, "debian", "11"), null);
});

// ---------- boundaries for every upstream/docker/plesk rule ----------
for (const r of RULES.rules.filter((x) => ["upstream", "docker", "plesk"].includes(x.platform))) {
  test(`boundary ${r.id}`, () => {
    const [maj, min, fx] = r.per_cve[CVES[0]].fixed.split(".").map(Number);
    const mk = (p) => ({ platform: r.platform, docker_image: "official", plesk_os: "linux", version: `${maj}.${min}.${p}` });
    const below = ev(mk(fx - 1)), at = ev(mk(fx)), above = ev(mk(fx + 1));
    assert.strictEqual(below.status, "affected");
    assert.ok(below.per_cve.every((c) => c.state === "affected"));
    assert.strictEqual(at.status, "remediated");
    assert.strictEqual(above.status, "remediated");
    assert.strictEqual(ev(mk(0)).status, "affected");
    assert.strictEqual(at.rule, r.id);
  });
}

test("thresholds never leak across branches", () => {
  assert.strictEqual(ev({ version: "8.4.26" }).status, "affected");
  assert.strictEqual(ev({ version: "8.3.27" }).status, "affected"); // 27 >= 8.4's 27 but 8.3 needs 36
  assert.strictEqual(ev({ version: "8.3.36" }).status, "remediated");
  assert.strictEqual(ev({ version: "8.5.11" }).status, "affected");
  assert.strictEqual(ev({ version: "8.2.34" }).status, "affected");
  assert.strictEqual(ev({ version: "8.2.100" }).status, "remediated");
});

// ---------- distro rules ----------
const LOWER = {
  "debian-12": "8.2.32-1~deb12u1", "debian-13": "8.4.24-1~deb13u1", "ubuntu-26.10": "8.5.9-0ubuntu2", "ubuntu-26.04": "8.5.4-0ubuntu1.4",
  "ubuntu-24.04": "8.3.6-0ubuntu0.24.04.12", "ubuntu-22.04": "8.1.2-1ubuntu2.27", "ubuntu-20.04": "7.4.3-4ubuntu2.28",
  "ubuntu-18.04": "7.2.24-0ubuntu0.18.04.16", "ubuntu-16.04": "7.0.33-0ubuntu0.16.04.15", "ubuntu-14.04": "5.5.9+dfsg-1ubuntu4.28",
};
for (const r of RULES.rules.filter((x) => x.platform === "debian" || x.platform === "ubuntu")) {
  test(`distro ${r.id}`, () => {
    const fixed = r.per_cve[CVES[0]].fixed;
    assert.ok(new RegExp(r.version_regex).test(fixed));
    const mk = (v) => ({ platform: r.platform, release: r.release, version: v });
    const ok = ev(mk(fixed));
    assert.strictEqual(ok.status, "remediated");
    assert.strictEqual(ok.versionIsFixed, true);
    assert.strictEqual(ok.fixed, fixed);
    const low = LOWER[r.id];
    assert.ok(new RegExp(r.version_regex).test(low), low);
    assert.ok(E.dpkgCompare(low, fixed) < 0, `${low} should sort below ${fixed}`);
    assert.strictEqual(ev(mk(low)).status, "affected", low);
    assert.strictEqual(ev(mk(fixed + "x")).status, "verify"); // not matching the regex for most releases, or higher
  });
}

test("distro package never judged by upstream numbers", () => {
  const r = ev({ platform: "debian", release: "13", version: "8.4.27" });
  assert.strictEqual(r.status, "verify");
  assert.strictEqual(r.code, "unexpected_package_format");
  assert.strictEqual(ev({ platform: "ubuntu", release: "24.04", version: "8.3.36" }).code, "unexpected_package_format");
});
test("regex rejections: third-party repositories and other formats", () => {
  for (const v of ["8.4.27-1+0~20261021.1+debian13~1.gbpabcdef", "8.4.27-1+ubuntu24.04.1+deb.sury.org+1", "8.4.28-1~deb12u1", "1:8.4.27-1~deb13u1"]) {
    assert.strictEqual(ev({ platform: "debian", release: "13", version: v }).code, "unexpected_package_format", v);
  }
  assert.strictEqual(ev({ platform: "ubuntu", release: "24.04", version: "8.3.6-0ubuntu0.24.04.13+ppa1~ondrej" }).code, "unexpected_package_format");
  assert.strictEqual(ev({ platform: "ubuntu", release: "24.04", version: "8.3.6-0ppa1" }).code, "unexpected_package_format");
});
test("debian: affected and fixed examples, later revisions", () => {
  assert.strictEqual(ev({ platform: "debian", release: "13", version: "8.4.24-1~deb13u1" }).status, "affected");
  assert.strictEqual(ev({ platform: "debian", release: "13", version: "8.4.27-1~deb13u2" }).status, "remediated");
  assert.strictEqual(ev({ platform: "debian", release: "12", version: "8.2.32-1~deb12u1" }).status, "affected");
  assert.strictEqual(ev({ platform: "ubuntu", release: "20.04", version: "7.4.3-4ubuntu2.28" }).status, "affected");
  assert.strictEqual(ev({ platform: "ubuntu", release: "20.04", version: "7.4.3-4ubuntu2.29+esm4" }).status, "affected");
  assert.strictEqual(ev({ platform: "ubuntu", release: "20.04", version: "7.4.3-4ubuntu2.29+esm10" }).status, "remediated");
});

// ---------- reason codes ----------
test("reason codes", () => {
  assert.strictEqual(ev({ platform: "other" }).code, "platform_not_covered");
  assert.strictEqual(ev({ platform: "debian", release: "11", version: "7.4.33-1+deb11u1" }).code, "platform_not_covered");
  assert.strictEqual(ev({ platform: "ubuntu", release: "other" }).code, "platform_not_covered");
  assert.strictEqual(ev({ platform: "docker", docker_image: "other" }).code, "docker_not_official");
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "windows" }).code, "plesk_windows");
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "linux", version: "8.1.30" }).code, "plesk_eol_branch");
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "linux", version: "7.4.33" }).code, "plesk_eol_branch");
  assert.strictEqual(ev({ version: "8.1.30" }).code, "eol_branch");
  assert.strictEqual(ev({ platform: "docker", docker_image: "official", version: "8.0.30" }).code, "eol_branch");
  assert.strictEqual(ev({ version: "9.0.1" }).code, "unknown_branch");
  assert.strictEqual(ev({ version: "8.7.3" }).code, "unknown_branch");
  assert.strictEqual(ev({ version: "8.6.0" }).code, "prerelease");
  assert.strictEqual(ev({ version: "8.5.0RC1" }).code, "prerelease");
  assert.strictEqual(ev({ platform: "debian", release: "13", version: "8.4.27" }).code, "unexpected_package_format");
  assert.strictEqual(ev({ version_source: "unknown" }).code, "version_source_unconfirmed");
  assert.strictEqual(ev({ restarted: "no" }).code, "restart_not_confirmed");
  assert.strictEqual(ev({ restarted: "unknown" }).code, "restart_not_confirmed");
});

// ---------- precedence (B6) ----------
test("precedence", () => {
  // 6 before 7: affected stays affected without restart confirmation
  assert.strictEqual(ev({ version: "8.4.20", restarted: "no" }).status, "affected");
  assert.strictEqual(ev({ version: "8.4.20", restarted: "unknown" }).status, "affected");
  // 5 before 6: below fix with unconfirmed source is verify
  const a = ev({ version: "8.4.20", version_source: "unknown" });
  assert.strictEqual(a.status, "verify"); assert.strictEqual(a.code, "version_source_unconfirmed");
  assert.strictEqual(a.versionIsFixed, false);
  // fixed + unconfirmed source is verify too
  assert.strictEqual(ev({ version: "8.4.27", version_source: "unknown" }).code, "version_source_unconfirmed");
  // 5 before 7
  assert.strictEqual(ev({ version_source: "unknown", restarted: "no" }).code, "version_source_unconfirmed");
  // 7: fixed and restart not "yes"
  assert.strictEqual(ev({ restarted: "no" }).status, "verify");
  // 8
  assert.strictEqual(ev({}).status, "remediated");
  // 2 before 3 and 5: docker other image with bad-for-branch version still reports docker_not_official
  assert.strictEqual(ev({ platform: "docker", docker_image: "other", version: "8.1.1", version_source: "unknown" }).code, "docker_not_official");
  // 3 before 5: prerelease wins over unconfirmed source
  assert.strictEqual(ev({ version: "8.6.0RC1", version_source: "unknown" }).code, "prerelease");
  // 1 before everything: invalid beats "other" environment checks
  assert.strictEqual(ev({ platform: "docker", docker_image: "other", version: "" }).status, "invalid");
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "windows", version: "" }).field, "version");
});

// ---------- aggregation with synthetic rules ----------
test("aggregation: one CVE fixed, the other not", () => {
  const synth = {
    cves: [{ id: "A", title: "a", advisory: "https://x" }, { id: "B", title: "b", advisory: "https://y" }],
    upstream_prerelease_branches: [],
    rules: [{ id: "s", platform: "upstream", series: "8.4", per_cve: { A: { fixed: "8.4.10", source_url: "https://s" }, B: { fixed: "8.4.20", source_url: "https://s" } } }],
  };
  const r = ev({ version: "8.4.15" }, synth);
  assert.strictEqual(r.status, "affected");
  assert.deepStrictEqual(r.per_cve.map((c) => c.state), ["fixed", "affected"]);
  assert.strictEqual(r.fixed, null);
  assert.strictEqual(r.versionIsFixed, false);
  assert.strictEqual(ev({ version: "8.4.20" }, synth).status, "remediated");
  assert.strictEqual(ev({ version: "8.4.9" }, synth).per_cve.every((c) => c.state === "affected"), true);
});
test("no rules at all: platform not covered, never a verdict", () => {
  const r = ev({}, { cves: [], rules: [] });
  assert.strictEqual(r.status, "verify"); assert.strictEqual(r.code, "platform_not_covered");
});

// ---------- result shape ----------
test("result shape", () => {
  const r = ev({});
  assert.deepStrictEqual(Object.keys(r.per_cve[0]).sort(), ["advisory", "code", "fixed", "id", "source_url", "state", "status", "title"]);
  assert.strictEqual(r.series, "8.4"); assert.strictEqual(r.version, "8.4.27"); assert.strictEqual(r.fixed, "8.4.27");
  assert.strictEqual(r.rule, "upstream-8.4"); assert.strictEqual(r.versionIsFixed, true);
  assert.deepStrictEqual(r.per_cve.map((c) => c.id), CVES);
});

// ---------- invalid input ----------
test("invalid input cases", () => {
  const inv = (o, field, reason) => {
    const r = ev(o);
    assert.strictEqual(r.status, "invalid", JSON.stringify(o));
    assert.strictEqual(r.field, field); assert.strictEqual(r.code, reason);
    assert.strictEqual(r.per_cve.length, 0);
  };
  assert.strictEqual(E.evaluate(undefined, RULES).status, "invalid");
  assert.strictEqual(E.evaluate({}, RULES).field, "platform");
  inv({ platform: "" }, "platform", "required");
  inv({ platform: "windows" }, "platform", "invalid_value");
  inv({ platform: "docker" }, "docker_image", "required");
  inv({ platform: "docker", docker_image: "x" }, "docker_image", "invalid_value");
  inv({ platform: "plesk" }, "plesk_os", "required");
  inv({ platform: "plesk", plesk_os: "mac" }, "plesk_os", "invalid_value");
  inv({ platform: "debian", release: "" }, "release", "required");
  inv({ platform: "ubuntu", release: "24 04" }, "release", "invalid_value");
  inv({ version: "" }, "version", "required");
  inv({ version: "   " }, "version", "required");
  inv({ version: undefined }, "version", "required");
  inv({ version: 8.4 }, "version", "required");
  inv({ version: "8".repeat(65) }, "version", "too_long");
  inv({ version: "8.4.27 " + "x".repeat(70) }, "version", "too_long");
  inv({ version: "8.4.27;rm" }, "version", "bad_chars");
  inv({ version: "8.4.27<b>" }, "version", "bad_chars");
  inv({ version: "8.4.27\n8.4.28" }, "version", "bad_chars");
  inv({ version: "8.04.1" }, "version", "format");
  inv({ version: "8.4" }, "version", "format");
  inv({ version: "08.4.1" }, "version", "format");
  inv({ version: "8.4.27.1" }, "version", "format");
  inv({ version: "latest" }, "version", "format");
  inv({ version_source: "" }, "version_source", "required");
  inv({ version_source: "carrier-pigeon" }, "version_source", "invalid_value");
  inv({ restarted: "" }, "restarted", "required");
  inv({ restarted: "maybe" }, "restarted", "invalid_value");
  assert.strictEqual(ev({ version: "  8.4.27  " }).version, "8.4.27");
  assert.strictEqual(ev({ version: "8".repeat(1) + ".4.27" }).status, "remediated");
  assert.strictEqual(ev({ version: "8.4.27" + "~".repeat(0) }).status, "remediated");
  assert.strictEqual(E.validate({ platform: "other" }).length, 0);
  assert.ok(E.validate({ platform: "debian" }).length >= 4);
});
test("a 64-character version is accepted by length rule", () => {
  const v = "8.4.27-" + "1".repeat(57);
  assert.strictEqual(v.length, 64);
  assert.strictEqual(E.validate({ platform: "debian", release: "13", version: v, version_source: "web_diagnostic", restarted: "confirmed" }).length, 0);
  assert.strictEqual(E.validate({ platform: "debian", release: "13", version: v + "1", version_source: "web_diagnostic", restarted: "confirmed" })[0].reason, "too_long");
});
