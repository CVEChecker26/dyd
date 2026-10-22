"use strict";
// Facts from the PHP announcement (php.net/archive/2026.php#2026-10-21-5) and what dyd does with them.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const E = require("../engine.js");
const RULES = require("../rules.js");
const C = require("../copy.js");

const root = path.join(__dirname, "..");
const base = { platform: "upstream", version: "8.4.27", version_source: "panel", restarted: "confirmed", update_applied: "confirmed" };
const ev = (o) => E.evaluate(Object.assign({}, base, o), RULES);
const statuses = (r) => r.per_cve.map((c) => c.status);
const STABLE = "https://www.php.net/archive/2026.php#2026-10-21-5";

// ---------- metadata and sources ----------
test("the announcement is recorded with its stable link, reading date and the facts used", () => {
  const a = RULES.announcement;
  assert.strictEqual(a.url, STABLE);
  assert.strictEqual(a.read_at, "2026-10-22");
  assert.deepStrictEqual(a.fixed_versions, ["8.5.12", "8.4.27", "8.3.36", "8.2.35"]);
  assert.deepStrictEqual(a.at_risk, ["PHP-FPM", "Apache with mod_php", "php-cgi", "FrankenPHP", "LiteSpeed"]);
  assert.strictEqual(a.highest_risk, "mod_php");
  assert.deepStrictEqual(a.backport_branches.map((b) => b.series), ["7.4", "8.0", "8.1"]);
  for (const b of a.backport_branches) assert.match(b.url, /^https:\/\/github\.com\/php\/php-src\/tree\/PHP-\d\.\d-CVE-2026-109618-109619$/);
  assert.match(a.note, /does not list affected versions/);
});
test("the announcement's fixed versions equal the thresholds taken from the advisories", () => {
  for (const v of RULES.announcement.fixed_versions) {
    const series = v.split(".").slice(0, 2).join(".");
    const rule = RULES.rules.find((r) => r.id === "upstream-" + series);
    assert.strictEqual(rule.per_cve["CVE-2026-109618"].fixed, v);
    assert.strictEqual(rule.per_cve["CVE-2026-109619"].fixed, v);
    assert.ok(rule.extra_sources.includes(STABLE), `${rule.id} should cite the announcement`);
    assert.ok(rule.per_cve["CVE-2026-109618"].source_url.includes("GHSA-w8hw-w9fx-j79w"), "thresholds stay based on the advisory");
  }
});
test("only the stable announcement link is used, never the index.php anchor", () => {
  const files = ["rules.json", "app.js", "copy.js", "index.html", "README.md", "METHODOLOGY.md", "SECURITY.md", "CHANGELOG.md", "PRIVACY.md"];
  for (const f of files) assert.ok(!/php\.net\/index\.php#/.test(fs.readFileSync(path.join(root, f), "utf8")), f);
});
test("8.6.0 RC4 facts come from the php-src NEWS file, not from the announcement", () => {
  const n = RULES.prerelease_notes["8.6"];
  assert.strictEqual(n.first_fixed, "8.6.0RC4");
  assert.match(n.source_url, /php-8\.6\.0RC4\/NEWS$/);
  assert.match(n.text, /announcement does not mention 8\.6/);
});

// ---------- fixed versions from the announcement ----------
test("every version named as fixed is remediated when confirmed; one patch lower is affected", () => {
  for (const v of RULES.announcement.fixed_versions) {
    const [maj, min, pat] = v.split(".").map(Number);
    assert.strictEqual(ev({ version: v }).status, "remediated", v);
    const lower = ev({ version: `${maj}.${min}.${pat - 1}`, update_applied: "no" });
    assert.strictEqual(lower.status, "affected", `${maj}.${min}.${pat - 1}`);
    assert.deepStrictEqual(statuses(lower), ["affected", "affected"]);
  }
});

// ---------- 8.6 pre-releases ----------
test("8.6.0 RC4: still a pre-release for dyd, with the note that it contains the fixes", () => {
  const r = ev({ version: "8.6.0RC4" });
  assert.strictEqual(r.status, "verify"); assert.strictEqual(r.code, "prerelease");
  assert.deepStrictEqual(r.notes, ["prerelease_fixed"]);
  assert.match(C.t("note.prerelease_fixed"), /8\.6\.0 RC4 contains the fixes/);
  assert.ok(ev({ version: "8.6.0RC5" }).notes.includes("prerelease_fixed"));
});
test("8.6 pre-releases older than RC4 are not listed as containing the fixes, and still need verification", () => {
  for (const v of ["8.6.0RC3", "8.6.0RC2", "8.6.0beta3", "8.6.0alpha1"]) {
    const r = ev({ version: v });
    assert.strictEqual(r.status, "verify", v); assert.strictEqual(r.code, "prerelease", v);
    assert.deepStrictEqual(r.notes, ["prerelease_not_fixed"], v);
  }
  const final = ev({ version: "8.6.0" });
  assert.strictEqual(final.status, "verify"); assert.deepStrictEqual(final.notes, ["prerelease_unspecified"]);
});
test("8.6 pre-release results never turn into affected or remediated, whatever else is declared", () => {
  for (const v of ["8.6.0RC4", "8.6.0RC3"]) for (const extra of [{}, { update_applied: "no", restarted: "no" }, { version_source: "cli" }]) {
    assert.strictEqual(ev(Object.assign({ version: v }, extra)).status, "verify");
  }
});

// ---------- 7.4, 8.0, 8.1 with source backports ----------
test("PHP 7.4, 8.0 and 8.1: the version number proves nothing; verification is needed, with the backport note", () => {
  for (const v of ["7.4.33", "7.4.1", "8.0.30", "8.0.1", "8.1.30", "8.1.2", "8.1.99"]) {
    for (const extra of [{}, { update_applied: "no", restarted: "no" }, { version_source: "cli" }, { update_applied: "confirmed", restarted: "confirmed", runtimes: "no" }]) {
      const r = ev(Object.assign({ version: v }, extra));
      assert.strictEqual(r.status, "verify", `${v} ${JSON.stringify(extra)}`);
      assert.strictEqual(r.code, "eol_branch");
      assert.ok(r.notes.includes("backport_branch"), v);
      assert.ok(r.per_cve.every((c) => c.status === "verify" && c.code === "eol_branch"));
    }
  }
  assert.match(C.t("note.backport_branch"), /minimal source backports for 7\.4, 8\.0 and 8\.1/);
  assert.match(C.t("note.backport_branch"), /cannot show whether the fixes are present/);
});
test("the backport note also applies to Docker and Plesk, and not to unrelated branches", () => {
  assert.ok(E.evaluate({ platform: "docker", docker_image: "official", version: "8.1.30", version_source: "panel", restarted: "confirmed", update_applied: "confirmed" }, RULES).notes.includes("backport_branch"));
  assert.ok(E.evaluate({ platform: "plesk", plesk_os: "linux", version: "8.0.30", version_source: "panel", restarted: "confirmed", update_applied: "confirmed" }, RULES).notes.includes("backport_branch"));
  assert.ok(!ev({ version: "8.4.27" }).notes.includes("backport_branch"));
  assert.ok(!ev({ version: "7.3.33" }).notes.includes("backport_branch"));
  assert.ok(!ev({ platform: "ubuntu", release: "22.04", version: "8.1.2-1ubuntu2.28" }).notes.includes("backport_branch"), "distribution packages use their own vendor rule");
});

// ---------- execution model: context only ----------
test("the execution model never changes the status, the codes or the plan order, and there are no scores", () => {
  const models = [undefined, "fpm", "mod_php", "cgi", "frankenphp", "litespeed", "unknown"];
  for (const input of [{}, { version: "8.4.20", update_applied: "no" }, { version_source: "cli" }]) {
    const ref = ev(input);
    for (const m of models) {
      const r = ev(Object.assign({ exec_model: m }, input));
      assert.strictEqual(r.status, ref.status); assert.strictEqual(r.code, ref.code);
      assert.deepStrictEqual(statuses(r), statuses(ref));
      assert.deepStrictEqual(r.plan, ref.plan);
      assert.ok(!Object.keys(r).some((k) => /score|risk|severity|rating/i.test(k)));
      assert.ok(r.per_cve.every((c) => !Object.keys(c).some((k) => /score|risk|rating/i.test(k))));
    }
  }
});
test("mod_php adds the announcement's urgency context, only when the result is not remediated", () => {
  assert.ok(ev({ version: "8.4.20", update_applied: "no", exec_model: "mod_php" }).notes.includes("highest_risk_mod_php"));
  assert.ok(ev({ version_source: "cli", exec_model: "mod_php" }).notes.includes("highest_risk_mod_php"));
  assert.ok(!ev({ exec_model: "mod_php" }).notes.includes("highest_risk_mod_php"));
  for (const m of ["fpm", "cgi", "frankenphp", "litespeed", "unknown"]) assert.ok(!ev({ version: "8.4.20", update_applied: "no", exec_model: m }).notes.includes("highest_risk_mod_php"), m);
  assert.match(C.t("note.highest_risk_mod_php"), /before any application code runs/);
  assert.match(C.t("note.highest_risk_mod_php"), /not a score/);
});
test("each execution model has its own restart instruction, and 'I don't know' explains where to look", () => {
  for (const m of ["fpm", "mod_php", "cgi", "frankenphp", "litespeed"]) {
    const t = C.t("act.restart_runtime.d." + m);
    assert.match(t, /restart/i); assert.match(t, /A restart alone does not fix an installation that has not been updated/);
  }
  assert.notStrictEqual(C.t("act.restart_runtime.d.fpm"), C.t("act.restart_runtime.d.mod_php"));
  assert.match(C.t("exec.hint.unknown"), /cannot detect it from the domain/);
  assert.ok(ev({ exec_model: "fpm" }).evidence.some((e) => e.id === "exec_model" && e.provenance === "declared"));
  assert.ok(ev({ exec_model: "unknown" }).evidence.some((e) => e.id === "exec_model" && e.provenance === "unknown"));
  assert.strictEqual(E.evaluate({ platform: "upstream", version: "8.4.27", version_source: "panel", restarted: "confirmed", update_applied: "confirmed", exec_model: "systemd" }, RULES).field, "exec_model");
});

// ---------- mitigations ----------
test("mitigations are summaries with their exact limitations, a source link, and no copy-paste block", () => {
  const m = RULES.mitigations;
  assert.deepStrictEqual(m.map((x) => x.id), ["memory_limit", "post_max_size", "request_limits", "cgroup", "upload_progress", "fatal_error_backtraces", "diagnostics", "fatal_errors"]);
  for (const x of m) {
    assert.strictEqual(x.source_url, STABLE);
    assert.ok(x.summary.length > 20 && x.limitation.length > 20);
    assert.ok(x.cves.length >= 1 && x.cves.every((c) => /^CVE-2026-10961[89]$/.test(c)));
    assert.ok(!/```|\n/.test(x.summary + x.limitation), "no config block");
  }
  const by = Object.fromEntries(m.map((x) => [x.id, x]));
  assert.match(by.memory_limit.limitation, /underlying allocation failure can still reach the vulnerable path/);
  assert.match(by.memory_limit.limitation, /availability/);
  assert.match(by.post_max_size.limitation, /legitimate large requests/);
  assert.match(by.cgroup.summary, /RLIMIT_AS or RLIMIT_DATA/);
  assert.match(by.upload_progress.limitation, /not other variants/);
  assert.match(by.fatal_error_backtraces.limitation, /confirmed fatal backtrace path only/);
  assert.match(by.diagnostics.limitation, /does not help/);
  assert.deepStrictEqual(by.upload_progress.cves, ["CVE-2026-109619"]); assert.deepStrictEqual(by.memory_limit.cves, ["CVE-2026-109618"]);
});
test("mitigation wording never says an installation is protected, and says only an update is complete", () => {
  const all = RULES.mitigations.map((x) => x.summary + " " + x.limitation).join(" ") + " " + C.t("mit.intro") + " " + RULES.announcement.complete_fix_text;
  assert.ok(!/\b(protect\w*|safe\w*|secure\w*|guarantee\w*)\b/i.test(all));
  assert.match(C.t("mit.intro"), /Only an update is a complete solution/);
  assert.match(C.t("mit.intro"), /never change the status/);
  assert.match(C.t("mit.intro"), /affect availability/);
});
test("a mitigation never changes a verdict: an affected version stays affected", () => {
  for (const m of ["yes", "no", "unknown"]) {
    const r = ev({ version: "8.4.20", update_applied: "no", mitigations_applied: m });
    assert.strictEqual(r.status, "affected", m);
    assert.deepStrictEqual(statuses(r), ["affected", "affected"]);
  }
  const yes = ev({ version: "8.4.20", update_applied: "no", mitigations_applied: "yes" });
  assert.ok(yes.notes.includes("mitigation_not_a_fix"));
  assert.ok(yes.evidence.some((e) => e.id === "mitigations" && e.provenance === "declared"));
  assert.strictEqual(ev({ version_source: "cli", mitigations_applied: "yes" }).status, "verify");
  assert.strictEqual(ev({ mitigations_applied: "yes" }).status, "remediated", "a fixed, confirmed setup is not downgraded either");
  assert.strictEqual(E.evaluate({ platform: "upstream", version: "8.4.27", version_source: "panel", restarted: "confirmed", update_applied: "confirmed", mitigations_applied: "maybe" }, RULES).field, "mitigations_applied");
});
test("a restart alone does not fix a version that was not updated, and the note says so", () => {
  const r = ev({ version: "8.4.20", update_applied: "no", restarted: "confirmed" });
  assert.strictEqual(r.status, "affected");
  assert.ok(r.notes.includes("restart_alone"));
  assert.match(C.t("note.restart_alone"), /A restart alone does not fix an installation that has not been updated/);
  assert.match(C.t("why.affected"), /A restart alone does not fix an installation that has not been updated/);
  assert.match(C.t("mit.restart_note"), /A restart alone does not fix/);
});

// ---------- review findings: remediation needs a confirmed update, and no doubt about other runtimes ----------
test("remediation requires a confirmed update", () => {
  for (const u of ["no", "unknown", "assumed", undefined]) {
    const r = ev({ update_applied: u });
    assert.strictEqual(r.status, "verify", String(u)); assert.strictEqual(r.code, "update_not_confirmed", String(u));
    assert.ok(r.plan.includes("confirm_update"));
  }
  assert.strictEqual(ev({ update_applied: "confirmed" }).status, "remediated");
});
test("several PHP runtimes: a fixed version is not enough, an affected one stays affected", () => {
  const fixed = ev({ runtimes: "yes" });
  assert.strictEqual(fixed.status, "verify"); assert.strictEqual(fixed.code, "multiple_runtimes");
  assert.ok(fixed.plan.includes("check_each_runtime"));
  assert.strictEqual(ev({ runtimes: "no" }).status, "remediated");
  assert.strictEqual(ev({ runtimes: "unknown" }).status, "remediated");
  assert.strictEqual(ev({ version: "8.4.20", update_applied: "no", runtimes: "yes" }).status, "affected");
});
test("domains and free text cannot carry line separators", () => {
  assert.strictEqual(E.validate({ platform: "upstream", provider: "a" + String.fromCharCode(0x2028) + "b" }).some((e) => e.field === "provider"), true);
  assert.strictEqual(E.normalizeDomain("a" + String.fromCharCode(0x2028) + "b.com").ok, false);
  for (const d of ["x.arpa", "1.0.0.127.in-addr.arpa", "hidden.onion", "nas.localdomain", "a.private", "r.router"]) assert.strictEqual(E.normalizeDomain(d).ok, false, d);
});
