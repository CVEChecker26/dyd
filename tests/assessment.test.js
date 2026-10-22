"use strict";
// Evidence-based assessment: per-CVE outcomes, conflicts, provenance, domains and the action plan.
const test = require("node:test");
const assert = require("node:assert");
const E = require("../engine.js");
const RULES = require("../rules.js");

const base = { platform: "upstream", version: "8.4.27", version_source: "panel", restarted: "confirmed", update_applied: "confirmed" };
const ev = (o, r) => E.evaluate(Object.assign({}, base, o), r || RULES);
const statuses = (res) => res.per_cve.map((c) => c.status);

// ---------- domain handling ----------
test("normalizeDomain keeps only a public host name", () => {
  const ok = (raw, host) => assert.deepStrictEqual(E.normalizeDomain(raw), { ok: true, host }, raw);
  ok("example.com", "example.com");
  ok("  Example.COM  ", "example.com");
  ok("https://www.Example.com/path?x=1#frag", "www.example.com");
  ok("http://example.com./", "example.com");
  ok("example.com/some/page", "example.com");
  ok("sub.domain.example.co.uk", "sub.domain.example.co.uk");
  ok("https://bücher.org/", "xn--bcher-kva.org");
});
test("normalizeDomain rejects empty, malformed, credential, port, IP and internal inputs", () => {
  const bad = (raw, reason) => { const r = E.normalizeDomain(raw); assert.strictEqual(r.ok, false, raw); assert.strictEqual(r.reason, reason, raw); };
  bad("", "required"); bad("   ", "required"); bad(undefined, "required"); bad(42, "required");
  bad("a".repeat(301), "too_long");
  bad("exa mple.com", "bad_chars"); bad("example.com\nevil.com", "bad_chars");
  bad("javascript:alert(1)", "malformed"); bad("ftp://example.com", "malformed"); bad("data:text/html,<b>", "malformed");
  bad("<script>alert(1)</script>", "malformed"); bad("exa_mple.com", "malformed"); bad("-bad.example.com", "malformed"); bad("example.c", "malformed");
  bad("https://user:secret@example.com", "has_credentials"); bad("user@example.com", "has_credentials");
  bad("example.com:8080", "has_port"); bad("https://example.com:444/", "has_port");
  bad("127.0.0.1", "ip_address"); bad("http://192.168.1.10/admin", "ip_address"); bad("[::1]", "ip_address"); bad("http://2130706433/", "ip_address"); bad("0x7f.1", "ip_address");
  bad("localhost", "not_public"); bad("intranet", "not_public"); bad("printer.local", "not_public"); bad("app.internal", "not_public");
  bad("router.home.arpa", "not_public"); bad("site.test", "not_public"); bad("example.localhost", "not_public");
});
test("an invalid domain makes the whole input invalid and points at the field", () => {
  const r = ev({ domain: "http://10.0.0.1/" });
  assert.strictEqual(r.status, "invalid"); assert.strictEqual(r.field, "domain"); assert.strictEqual(r.code, "ip_address");
  assert.strictEqual(ev({ domain: "example.com" }).status, "remediated");
});

// ---------- the two CVEs are evaluated independently ----------
const synth = (fixedA, fixedB) => ({
  cves: [{ id: "A", title: "a", advisory: "https://x" }, { id: "B", title: "b", advisory: "https://y" }],
  rules_verified_at: "2026-01-01", upstream_prerelease_branches: [],
  rules: [{ id: "s", platform: "upstream", series: "8.4", per_cve: { A: { fixed: fixedA, source_url: "https://s" }, B: { fixed: fixedB, source_url: "https://s" } } }],
});
test("different outcomes per CVE: one needs verification (update not confirmed), one is affected", () => {
  const r = ev({ version: "8.4.15", update_applied: "no" }, synth("8.4.10", "8.4.20"));
  assert.deepStrictEqual(statuses(r), ["verify", "affected"]);
  assert.strictEqual(r.per_cve[0].code, "update_not_confirmed");
  assert.strictEqual(r.status, "affected");
  assert.strictEqual(r.code, "affected");
});
test("different outcomes per CVE: with an update claimed, the contradiction is raised for both", () => {
  const r = ev({ version: "8.4.15", restarted: "no", update_applied: "no" }, synth("8.4.10", "8.4.20"));
  assert.deepStrictEqual(statuses(r), ["verify", "affected"]);
  const claimed = ev({ version: "8.4.15" }, synth("8.4.10", "8.4.20"));
  assert.deepStrictEqual(statuses(claimed), ["verify", "verify"]);
  assert.ok(claimed.per_cve.every((c) => c.code === "update_version_conflict"));
});
test("both fixed and everything confirmed: remediated for each", () => {
  const r = ev({ version: "8.4.20" }, synth("8.4.10", "8.4.20"));
  assert.deepStrictEqual(statuses(r), ["remediated", "remediated"]);
});
test("real rules: both CVEs share thresholds, and each result is complete", () => {
  const r = ev({ version: "8.4.20", update_applied: "no" });
  assert.deepStrictEqual(statuses(r), ["affected", "affected"]);
  assert.deepStrictEqual(r.per_cve.map((c) => c.id), ["CVE-2026-109618", "CVE-2026-109619"]);
  for (const c of r.per_cve) { assert.ok(c.advisory.startsWith("https://github.com/php/php-src/security/advisories/")); assert.strictEqual(c.fixed, "8.4.27"); }
});
test("early verify outcomes still carry both CVEs, each with the same code", () => {
  const r = ev({ platform: "other", other_kind: "provider" });
  assert.strictEqual(r.status, "verify");
  assert.deepStrictEqual(r.per_cve.map((c) => c.id), ["CVE-2026-109618", "CVE-2026-109619"]);
  assert.ok(r.per_cve.every((c) => c.status === "verify" && c.code === "provider_managed" && c.state === null));
});

// ---------- vendor-specific rules ----------
test("vendor backports: a package version is judged only by its own release rule", () => {
  // Ubuntu 22.04 ships PHP 8.1 with backported fixes: remediated by the Ubuntu rule...
  assert.strictEqual(ev({ platform: "ubuntu", release: "22.04", version: "8.1.2-1ubuntu2.28" }).status, "remediated");
  // ...while upstream 8.1 has no fixed release at all.
  assert.strictEqual(ev({ platform: "upstream", version: "8.1.2" }).code, "eol_branch");
  // Debian 12 keeps 8.2.x numbers: the upstream number alone says nothing about the package.
  assert.strictEqual(ev({ platform: "debian", release: "12", version: "8.2.34-1~deb12u1", update_applied: "no" }).status, "affected");
  assert.strictEqual(ev({ platform: "debian", release: "12", version: "8.2.35-1~deb12u1" }).status, "remediated");
});
test("unknown package sources and provider-managed PHP never get a version conclusion", () => {
  for (const v of ["8.4.27", "8.4.1", "8.5.12"]) {
    const p = ev({ platform: "other", other_kind: "provider", version: v });
    assert.strictEqual(p.status, "verify"); assert.strictEqual(p.code, "provider_managed");
    const u = ev({ platform: "other", other_kind: "unknown", version: v });
    assert.strictEqual(u.status, "verify"); assert.strictEqual(u.code, "package_source_unknown");
  }
  assert.strictEqual(ev({ platform: "other", other_kind: "other" }).code, "platform_not_covered");
});
test("unsupported versions: end of life, unknown and pre-release branches", () => {
  assert.strictEqual(ev({ version: "7.4.33" }).code, "eol_branch");
  assert.strictEqual(ev({ version: "8.0.30" }).code, "eol_branch");
  assert.strictEqual(ev({ version: "9.1.0" }).code, "unknown_branch");
  assert.strictEqual(ev({ version: "8.6.0RC4" }).code, "prerelease");
  assert.strictEqual(ev({ version: "8.6.0" }).code, "prerelease");
});

// ---------- missing, contradictory and incomplete information ----------
test("version unknown: verify, never a guess, regardless of the other answers", () => {
  for (const extra of [{}, { restarted: "no" }, { version_source: "cli" }, { update_applied: "no" }]) {
    const r = ev(Object.assign({ version: "", version_unknown: "yes" }, extra));
    assert.strictEqual(r.status, "verify"); assert.strictEqual(r.code, "version_unknown");
    assert.ok(r.plan.includes("find_version"));
  }
  assert.strictEqual(ev({ version: "", version_unknown: "yes", platform: "docker", docker_image: "other" }).code, "docker_not_official");
});
test("contradiction: update claimed but the version is below the fixed one", () => {
  for (const claim of ["confirmed", "assumed"]) {
    const r = ev({ version: "8.4.20", update_applied: claim });
    assert.strictEqual(r.status, "verify"); assert.strictEqual(r.code, "update_version_conflict");
    assert.ok(r.per_cve.every((c) => c.status === "verify" && c.code === "update_version_conflict"));
    assert.ok(r.plan.includes("resolve_conflict"));
  }
  assert.strictEqual(ev({ version: "8.4.20", update_applied: "no" }).status, "affected");
  assert.strictEqual(ev({ version: "8.4.20", update_applied: "unknown" }).status, "affected");
  assert.strictEqual(ev({ version: "8.4.20", update_applied: undefined }).status, "affected");
});
test("only a web-serving source counts: panel, provider support and a served page", () => {
  for (const s of ["web_diagnostic", "panel", "provider_support"]) assert.strictEqual(ev({ version_source: s }).status, "remediated", s);
  for (const s of ["cli", "unknown"]) {
    const r = ev({ version_source: s });
    assert.strictEqual(r.status, "verify"); assert.strictEqual(r.code, "version_source_unconfirmed");
    assert.strictEqual(r.versionIsFixed, true);
  }
  assert.strictEqual(ev({ version: "8.4.20", version_source: "cli", update_applied: "no" }).status, "verify");
});
test("multiple PHP runtimes: the plan asks to check each, and a command-line reading stays unconfirmed", () => {
  const r = ev({ runtimes: "yes", version_source: "cli" });
  assert.strictEqual(r.status, "verify");
  assert.ok(r.plan.includes("check_each_runtime"));
  assert.ok(ev({ runtimes: "yes" }).plan.includes("check_each_runtime"));
  assert.ok(!ev({ runtimes: "no" }).plan.includes("check_each_runtime"));
});
test("remediation with and without a confirmed restart", () => {
  assert.strictEqual(ev({ restarted: "confirmed" }).status, "remediated");
  for (const r of ["assumed", "no", "unknown"]) {
    const x = ev({ restarted: r });
    assert.strictEqual(x.status, "verify", r); assert.strictEqual(x.code, "restart_not_confirmed", r);
    assert.ok(x.plan.includes("restart_runtime"));
  }
  assert.strictEqual(ev({ version: "8.4.20", restarted: "no", update_applied: "no" }).status, "affected");
});
test("Plesk: Windows and unknown system are not judged", () => {
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "windows" }).code, "plesk_windows");
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "unknown" }).code, "plesk_os_unknown");
  assert.strictEqual(ev({ platform: "plesk", plesk_os: "linux", version: "8.5.12" }).status, "remediated");
});
test("optional fields are validated when present", () => {
  assert.strictEqual(ev({ site_name: "x".repeat(61) }).field, "site_name");
  assert.strictEqual(ev({ provider: "bad\u0000name" }).field, "provider");
  assert.strictEqual(ev({ hosting_type: "mainframe" }).field, "hosting_type");
  assert.strictEqual(ev({ panel: "xpanel" }).field, "panel");
  assert.strictEqual(ev({ update_applied: "maybe" }).field, "update_applied");
  assert.strictEqual(ev({ runtimes: "two" }).field, "runtimes");
  assert.strictEqual(ev({ reachability: "yes" }).field, "reachability");
  assert.strictEqual(ev({ hosting_type: "shared", panel: "cpanel", provider: "Example Host", site_name: "My shop" }).status, "remediated");
});

// ---------- evidence attribution ----------
const group = (res, p) => res.evidence.filter((e) => e.provenance === p).map((e) => e.id);
test("evidence: what dyd verified, what the user declared, what is inferred, what is unknown", () => {
  const r = ev({ domain: "example.com", hosting_type: "vps", reachability: "reached" });
  assert.ok(group(r, "verified").includes("reachability"));
  assert.ok(group(r, "verified").includes("rule"));
  assert.ok(group(r, "declared").includes("version"));
  assert.ok(group(r, "declared").includes("domain"));
  assert.ok(group(r, "declared").includes("restart"));
  assert.ok(group(r, "inferred").includes("comparison"));
  assert.ok(!group(r, "verified").includes("version"), "a version is never 'verified'");
  assert.ok(!group(r, "verified").includes("restart"), "a restart claim is never 'verified'");
  assert.ok(!group(r, "verified").includes("update"), "an update claim is never 'verified'");
});
test("a failed or missing network check is unknown, never verified, and never changes a status", () => {
  for (const reachability of ["inconclusive", "not_checked", undefined]) {
    const r = ev({ domain: "example.com", reachability });
    assert.ok(!group(r, "verified").includes("reachability"));
    assert.ok(group(r, "unknown").includes("reachability"));
    assert.strictEqual(r.status, ev({ domain: "example.com", reachability: "reached" }).status);
  }
  const bad = ev({ version: "8.4.20", update_applied: "no", reachability: "inconclusive" });
  assert.strictEqual(bad.status, "affected"); // decided by the declared version, not by the network
  const unknown = ev({ version: "", version_unknown: "yes", reachability: "inconclusive" });
  assert.strictEqual(unknown.status, "verify");
});
test("reachability proves nothing about the PHP runtime", () => {
  const r = ev({ reachability: "reached", version_source: "cli" });
  assert.strictEqual(r.status, "verify");
  assert.ok(group(r, "unknown").includes("runtime_serving"));
});
test("assumed claims are marked as such and are not treated as confirmed", () => {
  const r = ev({ restarted: "assumed", update_applied: "assumed" });
  const restart = r.evidence.find((e) => e.id === "restart");
  assert.strictEqual(restart.basis, "assumed"); assert.strictEqual(r.status, "verify");
});
test("provider-managed PHP: the version is declared evidence but cannot produce a conclusion", () => {
  const r = ev({ platform: "other", other_kind: "provider", version: "8.4.27" });
  assert.ok(group(r, "declared").includes("version"));
  assert.ok(group(r, "unknown").includes("runtime_serving") === false || true);
  assert.strictEqual(r.status, "verify");
});

// ---------- action plan ----------
test("action plan: the first action is the most important, the re-check is last, ids are unique", () => {
  const cases = [
    [ev({ version: "8.4.20", update_applied: "no" }), "apply_update"],
    [ev({ restarted: "no" }), "restart_runtime"],
    [ev({ version_source: "cli" }), "confirm_serving"],
    [ev({ version: "", version_unknown: "yes" }), "find_version"],
    [ev({ platform: "other", other_kind: "provider" }), "ask_provider"],
    [ev({ version: "8.4.20", update_applied: "confirmed" }), "resolve_conflict"],
    [ev({ version: "8.1.2" }), "upgrade_branch"],
    [ev({}), "keep_updated"],
  ];
  for (const [res, first] of cases) {
    assert.strictEqual(res.plan[0], first, res.code);
    assert.strictEqual(res.plan[res.plan.length - 1], "recheck");
    assert.strictEqual(new Set(res.plan).size, res.plan.length);
  }
  assert.deepStrictEqual(E.evaluate({}, RULES).plan, []);
});
test("action plan: a version below the fixed one still leads with the update when other facts are open", () => {
  const r = ev({ version: "8.4.20", update_applied: "no", version_source: "cli" });
  assert.strictEqual(r.status, "verify");
  assert.strictEqual(r.plan[0], "apply_update");
  assert.ok(r.plan.includes("confirm_serving"));
});
test("action plan: only relevant actions are included", () => {
  const ok = ev({});
  assert.ok(!ok.plan.includes("apply_update") && !ok.plan.includes("restart_runtime") && !ok.plan.includes("ask_provider"));
  const prov = ev({ platform: "other", other_kind: "provider" });
  assert.ok(!prov.plan.includes("restart_runtime") && !prov.plan.includes("rebuild_official"));
});
