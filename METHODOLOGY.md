# Methodology

dyd↻ compares **declared data** with rules derived from official advisories. It never scans anything. This document explains the verdict logic, the comparison methods, every rule with its source, and what was and was not verified.

## Verdict logic and precedence

The engine (`engine.js`, pure logic, no DOM/network/storage) applies these steps in this exact order and returns at the first step that decides.

1. **Invalid input**: a missing or malformed field returns status `invalid` with the field and a reason; no verdict is shown. Version strings are trimmed, at most 64 characters and must match `^[A-Za-z0-9.+~:_-]+$`. For upstream-like environments the version must be `MAJOR.MINOR.PATCH` (each part up to six digits, no leading zeros), or look like a pre-release (handled in step 3). Anything else, including a distribution-style string such as `8.4.27-1~deb12u1` entered for an upstream, Docker or Plesk environment, is `invalid` with reason `format`: the visitor is asked to correct the answer rather than receiving a verdict. Distribution package strings are only judged in the Debian and Ubuntu environments, where a non-matching format gives `unexpected_package_format`.
2. **Environment checks** (`verify`): "something else / not sure" or an environment or release without a verified rule (`platform_not_covered`), a Docker image that is not the official `php` image (`docker_not_official`), Plesk on Windows (`plesk_windows`).
3. **Version parsing** (`verify`): pre-release versions and branches listed as pre-release (`prerelease`); PHP 8.1 and older (`eol_branch`, or `plesk_eol_branch` on Plesk); other branches without a rule (`unknown_branch`); a distribution package version that does not match the release's expected format (`unexpected_package_format`).
4. **Per-advisory comparison** with the method of that environment only (below). Each advisory ends as "fixed" or "affected".
5. **Version source** not confirmed as "the PHP or package that actually serves the site" returns `verify` (`version_source_unconfirmed`), whether the version looks fixed or affected.
6. At least one advisory affected returns **affected**. The restart answer is irrelevant here.
7. All fixed but the restart not answered "yes" returns `verify` (`restart_not_confirmed`).
8. All fixed, source confirmed and restart confirmed returns **remediated**.

Whenever sources conflict, are unreachable or doubt remains, the rule is "Needs further verification" or no rule. Nothing is guessed.

### Why a restart is required

Installing a fixed package does not change code that running PHP processes (PHP-FPM workers, Apache with mod_php, a running container) have already loaded. Until those are restarted or the container is recreated, the old code can still serve requests. The advisories themselves say that workers must be restarted when configuration mitigations are applied. A version that looks fixed is therefore not enough for "Remediated".

## Comparison methods (never mixed)

- **Upstream PHP, the official Docker `php` image and Plesk**: the version must be `MAJOR.MINOR.PATCH` (integers). It is compared only inside the same `MAJOR.MINOR` branch, by integer PATCH, with the rule of that branch. There is no comparison across branches.
- **Debian and Ubuntu**: the declared value is the distribution package version of the PHP package serving the site. It is compared only with the fixed package version of the selected release, using a comparator written from Debian Policy section 5.6.12 (epoch, upstream version, revision; `~` sorts before everything; digits compared numerically; letters sort before non-letters). Upstream numbers such as 8.4.27 are never used to judge a distribution package. Each distribution rule has a `version_regex` that describes the expected package format for that release; a value that does not match (third-party repositories, other packages) gives `unexpected_package_format`.

## Rules

All rules were last verified on 2026-10-22 by AI-assisted reading of the sources listed below. **Independent human review is pending** (`review_status: pending_independent_human_review`). The table shows the threshold for CVE-2026-109618; CVE-2026-109619 has the same threshold in every rule.

<!-- RULES-TABLE:START -->
| Rule | Platform | Branch / release | Fixed in | Primary source | Verified |
|---|---|---|---|---|---|
| upstream-8.2 | upstream | PHP 8.2 | `8.2.35` | https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w | 2026-10-22 |
| upstream-8.3 | upstream | PHP 8.3 | `8.3.36` | https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w | 2026-10-22 |
| upstream-8.4 | upstream | PHP 8.4 | `8.4.27` | https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w | 2026-10-22 |
| upstream-8.5 | upstream | PHP 8.5 | `8.5.12` | https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w | 2026-10-22 |
| docker-8.2 | docker | PHP 8.2 | `8.2.35` | https://raw.githubusercontent.com/docker-library/php/master/versions.json | 2026-10-22 |
| docker-8.3 | docker | PHP 8.3 | `8.3.36` | https://raw.githubusercontent.com/docker-library/php/master/versions.json | 2026-10-22 |
| docker-8.4 | docker | PHP 8.4 | `8.4.27` | https://raw.githubusercontent.com/docker-library/php/master/versions.json | 2026-10-22 |
| docker-8.5 | docker | PHP 8.5 | `8.5.12` | https://raw.githubusercontent.com/docker-library/php/master/versions.json | 2026-10-22 |
| plesk-8.2 | plesk | PHP 8.2 | `8.2.35` | https://docs.plesk.com/release-notes/obsidian/change-log/ | 2026-10-22 |
| plesk-8.3 | plesk | PHP 8.3 | `8.3.36` | https://docs.plesk.com/release-notes/obsidian/change-log/ | 2026-10-22 |
| plesk-8.4 | plesk | PHP 8.4 | `8.4.27` | https://docs.plesk.com/release-notes/obsidian/change-log/ | 2026-10-22 |
| plesk-8.5 | plesk | PHP 8.5 | `8.5.12` | https://docs.plesk.com/release-notes/obsidian/change-log/ | 2026-10-22 |
| debian-12 | debian | Debian 12 (bookworm) | `8.2.35-1~deb12u1` | https://security-tracker.debian.org/tracker/CVE-2026-109618 | 2026-10-22 |
| debian-13 | debian | Debian 13 (trixie) | `8.4.27-1~deb13u1` | https://security-tracker.debian.org/tracker/CVE-2026-109618 | 2026-10-22 |
| ubuntu-26.10 | ubuntu | Ubuntu 26.10 (stonking) | `8.5.9-0ubuntu2.1` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-26.04 | ubuntu | Ubuntu 26.04 LTS (resolute) | `8.5.4-0ubuntu1.5` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-24.04 | ubuntu | Ubuntu 24.04 LTS (noble) | `8.3.6-0ubuntu0.24.04.13` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-22.04 | ubuntu | Ubuntu 22.04 LTS (jammy) | `8.1.2-1ubuntu2.28` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-20.04 | ubuntu | Ubuntu 20.04 LTS (focal), Ubuntu Pro / ESM | `7.4.3-4ubuntu2.29+esm5` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-18.04 | ubuntu | Ubuntu 18.04 LTS (bionic), Ubuntu Pro / ESM | `7.2.24-0ubuntu0.18.04.17+esm14` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-16.04 | ubuntu | Ubuntu 16.04 LTS (xenial), Ubuntu Pro + Legacy Support | `7.0.33-0ubuntu0.16.04.16+esm22` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
| ubuntu-14.04 | ubuntu | Ubuntu 14.04 LTS (trusty), Ubuntu Pro + Legacy Support | `5.5.9+dfsg-1ubuntu4.29+esm18` | https://ubuntu.com/security/CVE-2026-109618 | 2026-10-22 |
<!-- RULES-TABLE:END -->

Ubuntu 20.04 and 18.04 fixes are Ubuntu Pro (ESM) builds; Ubuntu 16.04 and 14.04 fixes require Ubuntu Pro with the Legacy Support add-on, according to the Ubuntu pages. PHP 8.2 security support ends on 2026-12-31 according to php.net.

## Verification log

Every page below was read on 2026-10-22 using web fetch/search tools only. A blocked or unreachable page was not worked around.

**php-src advisories (all upstream, Docker and Plesk rules)**
- <https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w> and <https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp>: read. Both: critical, CVSS v4 9.2, published 2026-10-21; affected < 8.2.35, < 8.3.36, < 8.4.27, < 8.5.12; patched 8.2.35, 8.3.36, 8.4.27, 8.5.12. Outcome: confirmed. The advisories describe temporary mitigations (memory limit, input limits, `fatal_error_backtraces=0`, `session.upload_progress.enabled=0`, `pm.max_requests=1`); dyd↻ links to them only and states that they do not replace updating.
- <https://www.php.net/supported-versions.php>: read. Lists 8.2 to 8.5 only; security support ends 2026-12-31 (8.2), 2027-12-31 (8.3), 2028-12-31 (8.4), 2029-12-31 (8.5). 8.1 is not listed. Used for `php82_end_of_support` and for treating 8.1 and older as always "verify".
- <https://github.com/php/php-src/releases/tag/php-8.3.36> and `php-8.2.35`: read; security releases dated 21 October 2026 naming both CVEs. <https://www.php.net/releases/8_5_12.php>: read (security release; the page lists no CVEs). <https://www.php.net/ChangeLog-8.php>: only the first part was read (the 8.5.12 and 8.4.27 entries, dated 22 Oct 2026 on that page, listing both GHSA ids); the 8.3.36 and 8.2.35 entries were not reached in that page, so the GitHub release pages were used for them. Release dates differ by one day between sources (21 vs 22 October); this does not affect any threshold.

**Docker official image**
- <https://raw.githubusercontent.com/docker-library/php/master/versions.json>: read. Versions 8.2.35, 8.3.36, 8.4.27, 8.5.12 with source tarballs from php.net/distributions; 8.6 only as a release candidate (8.6.0RC4). Outcome: the official image carries upstream versions, so the upstream thresholds apply.
- <https://hub.docker.com/_/php>: read, but the tag list is truncated on that page (it points to docker-library/docs). The existence of each fixed *tag* on Docker Hub was therefore **not** confirmed directly; the rule rests on `versions.json`.

**Plesk**
- <https://docs.plesk.com/release-notes/obsidian/change-log/>: read (first part). The 21 October 2026 entries state "Updated PHP 8.5 to version 8.5.12", 8.4.27, 8.3.36 and 8.2.35, and Obsidian 18.0.81 Update 4 / 18.0.80 Update 11 update the bundled engine PHP to 8.4.27. The entries carry no Linux/Windows label and do not name the two CVEs; the rule infers the fix from the equal upstream version, and the page says so in the result (note.plesk_match).
- The Plesk support article for these CVEs (support.plesk.com) returned **HTTP 403** and was **not read**. Third-party summaries of it were not used.
- Decision: the Plesk rules for Linux 8.2 to 8.5 rest on the change log alone, which names the versions but not the platform. Plesk on Windows is always "verify" by design. Older Plesk PHP branches are "verify". This is flagged for the independent review.

**Debian**
- <https://security-tracker.debian.org/tracker/CVE-2026-109618> and `CVE-2026-109619`: read. php8.2 in bookworm (security) is fixed in `8.2.35-1~deb12u1` (DLA-4848-1); php8.4 in trixie (security) is fixed in `8.4.27-1~deb13u1` (DSA-6574-1); forky and sid are not covered by a rule. Releases older than 12 are not listed.
- <https://lists.debian.org/debian-security-announce/2026/msg00489.html> (DSA-6574-1, trixie, php8.4, both CVEs) and <https://lists.debian.org/debian-lts-announce/2026/10/msg00042.html> (DLA-4848-1, bookworm, php8.2, both CVEs): read; they agree with the tracker. The tracker page also links an unrelated third-party site, which was not followed.

**Ubuntu**
- <https://ubuntu.com/security/CVE-2026-109618> and `CVE-2026-109619`: read; identical package tables. <https://ubuntu.com/security/notices/USN-8948-1> (26.10, 26.04, 24.04, 22.04) and <https://ubuntu.com/security/notices/USN-8948-2> (20.04, 18.04, 16.04, 14.04; ESM): read. Versions as in the rules table.
- The Ubuntu pages list releases where a package is "Not in release" (for example php8.1 on 24.04); those combinations have no rule, and the package-format regex of each release also rejects them.

### Candidate data from the earlier unverified reading

Every candidate (upstream, Docker, Plesk Linux, Debian 12/13, all eight Ubuntu releases) was confirmed against the sources above, with the Plesk and Docker caveats stated. No candidate was rejected.

### Conflicts and unresolved items

- No source disagreed about a fixed version.
- A search-result summary mentioned an unconfirmed claim that PHP 8.5.12 could still be exploitable. No page stating this could be found, the PHP advisories list 8.5.12 as patched, and the claim was **not used**. Re-check the advisories if it surfaces.
- Plesk support article unreachable (HTTP 403); Docker Hub tag list not confirmed; PHP ChangeLog entries for 8.3.36 and 8.2.35 not reached; the platform label is missing in the Plesk change log (see above).

### Platforms that could not be verified (always "Needs further verification")

PHP 8.1 and older from php.net, pre-releases (8.6), derived or custom Docker images, Plesk on Windows and older Plesk branches, cPanel/EasyApache, CloudLinux, RHEL and derivatives, SUSE, Alpine packages, Amazon Linux, Windows, third-party repositories (Sury, Remi, PPAs), Debian testing/unstable, Debian 11 and older, managed hosting.

### How to re-verify

Re-read the sources listed above, compare each threshold with `rules.json`, update `verified_at` and `rules_verified_at` only on the day you actually read them, run `node scripts/build-rules.js` and `npm test`, and add the new log entry here. The page shows a warning when `rules_verified_at` is older than 30 days.

## Test notes

- The Debian comparator is tested with vectors that follow from the Policy algorithm, with property tests (reflexive, antisymmetric, transitive) on generated values, and with a cross-check against real `dpkg --compare-versions` when `dpkg` is on the PATH. It was not available on the development machine (Windows), so the cross-check was **not run** there.
- Node 24's test runner treats `node --test tests/` as a module path, so the npm scripts list test files explicitly.

## Independent review

See the "Review" section of [CHANGELOG.md](CHANGELOG.md).
