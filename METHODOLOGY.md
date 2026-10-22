# Methodology

dyd↻ compares **declared details** with rules derived from official advisories. It does not scan, log in to, or inspect any server. This document explains what the assessment can and cannot determine, how each result is calculated, the rules and their sources, and what was and was not verified.

## What a domain can and cannot tell dyd↻

A static web page cannot read the PHP runtime, packages or processes of a remote server. Entering a domain therefore does **not** reveal which PHP version serves it. Cross-origin browser rules also hide response headers, so dyd↻ cannot read a `Server` or `X-Powered-By` header, and it would not trust one: a header, a CMS or a framework does not identify the PHP runtime.

The only thing dyd↻ can do with a domain is the optional reachability check (below). Everything about PHP comes from what the user declares.

### Optional reachability check

When the user presses the button, the browser sends one HTTPS `GET` request to `https://<host>/` (host name only, never the path or query), with `mode: "no-cors"`, no credentials, no referrer and an 8-second timeout. The answer is opaque: the page can only learn that **some HTTP response arrived**. It is recorded as verified evidence of reachability from this browser, and nothing more.

A failed request is **inconclusive**: a blocker, a certificate problem, a firewall, CORS-related browser rules, an HTTP-only site or a timeout all produce the same failure. It is never reported as "down", "vulnerable" or "fine", and it never changes a status. The Content-Security-Policy allows `connect-src https:` for this single purpose (see SECURITY.md).

Browsers require `redirect: "follow"` in `no-cors` mode, so the answer can come after a redirect to another host; the page says "possibly after a redirect". DNS cannot be checked from a static page: a public-looking name can resolve to a private address, and the denylist covers only common internal suffixes.

Domains are normalised to a public host name. The page rejects URLs with credentials or ports, IP addresses (including decimal and hex forms), single-label names, common internal suffixes (`.local`, `.localhost`, `.localdomain`, `.internal`, `.lan`, `.home`, `.corp`, `.intranet`, `.private`, `.router`, `.gateway`, `.onion`, `.arpa`, `.test`, `.invalid`, `.example`), other schemes, and control or line-separator characters.

## Evidence model

Every fact in a report is labelled:

| Label | Meaning | Examples |
|---|---|---|
| Verified by dyd↻ | Something dyd↻ checked itself | The rule and its sources (re-read on the date shown); a reachability answer |
| Declared by you | Not verified; dyd↻ relies on the user | Domain, hosting, package source, PHP version, where it was read, update and restart answers |
| Inferred | A conclusion drawn from the facts above | "The declared version is below the fixed version" |
| Unknown or unconfirmed | Missing, assumed or not confirmed | An unreachable site, "I think so" answers, an unconfirmed runtime |

Update and restart answers are always **declared**, never verified. "Assumed" answers are listed as unconfirmed.

## The PHP announcement

Source: <https://www.php.net/archive/2026.php#2026-10-21-5> (the stable archive link, not an `index.php#` anchor), read in full on 2026-10-22 from the page itself. The announcement does **not** list affected versions. dyd↻ uses it only for:

- the fixed versions (8.5.12, 8.4.27, 8.3.36, 8.2.35), which equal the thresholds taken from the two GHSA advisories (the "affected" thresholds stay based on those advisories; no threshold was changed);
- who is at risk: all PHP installations serving web requests, including PHP-FPM, Apache with mod_php, php-cgi, FrankenPHP and LiteSpeed, with the risk highest for mod_php (a demonstrated exploit where an unauthenticated request can trigger the attack before any application code runs);
- PHP 8.1 and older no longer receiving updates from the PHP project, with some distributions and LTS vendors providing backported fixes;
- the temporary mitigations and their limitations (below).

**PHP 7.4, 8.0 and 8.1.** The announcement says the PHP security team provided minimal source backports for these branches on GitHub branches (`PHP-7.4-CVE-2026-109618-109619`, `PHP-8.0-CVE-2026-109618-109619`, `PHP-8.1-CVE-2026-109618-109619`), and no new versions were released. A version number on these branches therefore cannot prove anything either way, so a php.net, Docker or Plesk version on them is always "Needs further verification" (`eol_branch` or `plesk_eol_branch`), with a note and links to the announcement and the branch. Distribution packages keep using their own vendor rule.

**PHP 8.6.** 8.6 is treated as a pre-release (`prerelease`, needs further verification). The announcement does not mention 8.6 at all. What is verified is in the php-src `NEWS` file of tag `php-8.6.0RC4` (dated 21 Oct 2026), which lists GHSA-w8hw-w9fx-j79w and GHSA-6wmf-4rv5-p3rp (CVE-2026-109618, CVE-2026-109619) as fixed. The page therefore says "8.6.0 RC4 contains the fixes" for RC4 and later, and, for earlier 8.6 pre-releases, that they are older than the first pre-release whose NEWS lists the fixes. It does not claim that earlier pre-releases are affected, because no source states it.

**Execution model.** The optional question "How does the web server run PHP?" (PHP-FPM, Apache with mod_php, php-cgi, FrankenPHP, LiteSpeed, I don't know) never changes a status and produces no score. It only selects the restart instruction and, for mod_php on a result that is not remediated, shows the announcement's urgency sentence. "I don't know" explains where to look (hosting panel PHP handler or SAPI, "Server API" in an administrator-only phpinfo page, the provider). The model is declared; dyd↻ cannot detect it from a domain. The question is hidden for provider-managed PHP.

**Mitigations.** Summarised from the announcement with its exact limitations and a link; no configuration block is offered, and no mitigation is described as protecting an installation. The announcement says only an update is a complete solution and that the measures reduce exposure to specific attack paths without making an installation fully fixed. Two cautions are dyd↻'s own and are labelled as such in `rules.json`: removing the memory limit lets one request use all available memory, and a low `post_max_size` can reject legitimate large requests. A mitigation never changes a status: a declared mitigation is recorded as declared evidence, and an affected version stays "Affected according to the available evidence". A restart alone does not fix an installation that has not been updated.

## How each CVE is evaluated

CVE-2026-109618 and CVE-2026-109619 are evaluated **separately**, each with its own status, evidence and next action. With the current rules both CVEs share the same fixed versions, so they currently get the same status, but the engine keeps them independent (tests use synthetic rules where they differ).

Statuses: **Affected according to the available evidence**, **Remediation supported by the available evidence**, **Needs further verification**. "Remediation supported" is a statement about these two CVEs and the declared evidence only.

The engine (`engine.js`, pure logic, no DOM/network/storage) applies these steps in this exact order and returns at the first step that decides:

1. **Invalid input**: a missing or malformed field returns `invalid` with the field and a reason; no result is shown. Version strings are trimmed, at most 64 characters and match `^[A-Za-z0-9.+~:_-]+$`; for upstream-like environments they must be `MAJOR.MINOR.PATCH` (each part up to six digits, no leading zeros) or look like a pre-release. Anything else, including a package-style string entered for an upstream, Docker or Plesk environment, is `invalid` with reason `format`.
2. **Environment checks** (`verify`): provider-managed PHP (`provider_managed`), unknown package source (`package_source_unknown`), another distribution (`platform_not_covered`), a non-official Docker image (`docker_not_official`), Plesk on Windows (`plesk_windows`) or an unknown Plesk system (`plesk_os_unknown`).
3. **Unknown version** (`verify`, `version_unknown`).
4. **Version parsing** (`verify`): pre-releases and pre-release branches (`prerelease`); PHP 8.1 and older (`eol_branch`, or `plesk_eol_branch`); other branches without a rule (`unknown_branch`); a package version in an unexpected format for the selected release (`unexpected_package_format`).
5. **Per-CVE comparison** with the method of that environment only (below).
6. **Conflict** (`verify`, `update_version_conflict`): the user says the update is installed (confirmed or assumed) but the declared version is below the fixed version. Evidence that conflicts is not turned into a conclusion.
7. **Version source** (`verify`, `version_source_unconfirmed`): the version must come from a page served by the site, the hosting panel for this site, or provider support. A command-line reading or an unknown source is not confirmation, even if the version looks fixed or affected. Versions given by the hosting panel for the site or by provider support are taken to describe the runtime that serves the site; the declared answer does not record which runtime a provider had in mind.
8. **Per CVE**: below the fixed version means affected (a restart and mitigations are irrelevant). At or above it, remediation is supported only if the update is **confirmed** (otherwise `verify`, `update_not_confirmed`), the user did not say that several PHP runtimes exist (otherwise `verify`, `multiple_runtimes`, because the declared version describes only one of them), and a restart is **confirmed** (otherwise `verify`, `restart_not_confirmed`).

The overall result is "affected" if any CVE is affected, otherwise "needs further verification" if any CVE needs it, otherwise "remediation supported". Whenever sources conflict, are unreachable or doubt remains, the result is "Needs further verification" or no rule. Nothing is guessed.

### Action plan

The plan is a short ordered list of action ids chosen from the result (for example: install the update, restart the processes, confirm the PHP that serves the site, ask the provider). It only contains actions relevant to the environment and the result, and always ends with running the assessment again. The first item is shown as "Do this first".

### Why a restart is required

Installing a fixed package does not change code that running PHP processes (PHP-FPM workers, Apache with mod_php, a running container) have already loaded. Until those are restarted or the container is recreated, the old code can still serve requests. The advisories themselves say that workers must be restarted when configuration mitigations are applied. A version that looks fixed is therefore not enough for "Remediation supported".

### Vendor backports and provider-managed PHP

Some vendors fix a vulnerability without changing the upstream version number. dyd↻ applies a vendor rule only where it has verified one (Debian 12 and 13, Ubuntu 26.10 to 14.04), using that vendor's package version. For hosting providers, cPanel/EasyApache and CloudLinux, no official advisory for these two CVEs could be found on 2026-10-22, so such environments always get "Needs further verification" with the advice to ask the provider.

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
- <https://www.php.net/archive/2026.php#2026-10-21-5> (the announcement): read in full on 2026-10-22 from the page itself (not from a summary); see "The PHP announcement" above. It lists no affected versions; every quoted fact was checked against the page text and its links (downloads page, the three backport branches, both advisories).
- <https://github.com/php/php-src/blob/php-8.6.0RC4/NEWS>: read; lists both CVEs as fixed in 8.6.0RC4 (21 Oct 2026). The `php-8.6.0RC4` tag page itself carries only the tag message. The three backport branch pages returned HTTP 200.
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

### Re-read on the day of the redesign (2026-10-22)

Both GitHub advisories, the Debian tracker (CVE-2026-109618), the Ubuntu page (CVE-2026-109619) and docker-library `versions.json` were read again: no threshold or version changed, and the advisories show no revision notes. The advisories were also read for the impact statements used in the report (unauthenticated remote code execution as the web worker account for CVE-2026-109618; unauthenticated heap use-after-free, memory disclosure and remote code execution for CVE-2026-109619; both "Critical", CVSS v4 9.2, published 2026-10-21). A search for official cPanel, EasyApache or CloudLinux advisories for these two CVEs found nothing.

## Test notes

- The Debian comparator is tested with vectors that follow from the Policy algorithm, with property tests (reflexive, antisymmetric, transitive) on generated values, and with a cross-check against real `dpkg --compare-versions` when `dpkg` is on the PATH. It was not available on the development machine (Windows), so the cross-check was **not run** there.
- Node 24's test runner treats `node --test tests/` as a module path, so the npm scripts list test files explicitly.

## Independent review

See the "Review" section of [CHANGELOG.md](CHANGELOG.md).
