# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Published
- 2026-10-22: the guided assessment (pull request 1, merge commit `3456e5f`) was deployed to GitHub Pages and checked live: the Pages workflow succeeded, https://cvechecker26.github.io/dyd/ answered HTTP 200 with the new title, `app.js`, `engine.js`, `copy.js`, `rules.js` and `rules.json` were served with HTTP 200 (`i18n.js` returns 404, as it was removed), 22 rules loaded, an assessment produced the expected result and the console had no errors (`npm run check:live`).

### Changed (product transformation)
- Guided four-step assessment (site, hosting, PHP, update status) replaces the single form; questions adapt to earlier answers and answers are kept when going back.
- Domain input with strict normalisation (host name only; credentials, ports, IP addresses, internal names and other schemes rejected) and an optional, user-started HTTPS reachability check. A failed request is inconclusive and never changes a status.
- Each CVE is evaluated independently, with statuses "Affected according to the available evidence", "Remediation supported by the available evidence" and "Needs further verification".
- New result report: headline, "do this first", per-CVE cards, evidence summary (verified, declared, inferred, unknown), prioritized action plan, advisory-based explanation, provenance. Print/save as PDF and a local Markdown download.
- New engine inputs and outcomes: package source and provider-managed PHP, unknown version, version source (panel, provider support, a served page, command line), several runtimes, update and restart as confirmed/assumed/no/unknown, and a conflict check (update claimed but version below the fixed one).
- `rules.json` cves now carry severity, CVSS, publication date, impact, mechanism and mitigation text taken from the advisories and re-read on 2026-10-22; no threshold changed.
- Visual redesign: compact two-column first viewport, system fonts, hairline surfaces, no gradients or glows, status colours always paired with an icon and text, print stylesheet.
- English only: the Romanian translation, the language toggle and `i18n.js` were removed; `copy.js` holds the run-time text.
- CSP: `connect-src 'none'` became `connect-src https:` for the reachability check only (see SECURITY.md).

- PHP announcement (stable link `php.net/archive/2026.php#2026-10-21-5`, read verbatim on 2026-10-22): metadata, at-risk environments, mod_php context, the end of updates for 8.1 and older, and the temporary mitigations with their limitations are stored in `rules.json`. Thresholds are unchanged and still come from the two GHSA advisories.
- PHP 7.4, 8.0 and 8.1 (source backports on GitHub branches, no new versions): always "Needs further verification" with a backport note and links.
- PHP 8.6: still a pre-release; RC4 is noted as containing the fixes, from the php-src NEWS file (the announcement does not mention 8.6). Earlier 8.6 pre-releases are noted as older than the first pre-release whose NEWS lists the fixes, not as affected.
- Optional question about how the web server runs PHP (PHP-FPM, mod_php, php-cgi, FrankenPHP, LiteSpeed): it never changes a status and shows no score; it selects the restart instruction and the mod_php context.
- Optional question about temporary mitigations (asked only when the update is not installed or unknown). Mitigations never change a status; the report summarises them with their limitations and states that a restart alone does not fix an installation that has not been updated. The print layout opens every section.
- After the independent review: remediation now requires a confirmed update and no declared multiple runtimes (new codes `update_not_confirmed`, `multiple_runtimes`); a mixed outcome therefore shows "needs verification" for the CVE whose version is fixed and "affected" for the other. Hidden answers are no longer reported; the Markdown file puts user text in code spans; more internal suffixes are rejected; the reachability note mentions possible redirects (browsers require `redirect: "follow"` in `no-cors` mode); the chip selection no longer relies only on `:has()`.

### Added
- Tests for domains, per-CVE independence, conflicts, provenance, the action plan, English-only text, the reachability check (mocked), downloads and print, and a first-viewport check at 1440x900 and 390x844.

### Previously added
- Static page (`index.html`, `style.css`, `app.js`, `engine.js`) with English and Romanian text (Romanian removed in the transformation above), dark-first design and the official brand assets from `BRAND/`.
- `rules.json` (schema version 2) with 22 rules verified on 2026-10-22, and `scripts/build-rules.js` that generates `rules.js` from it.
- Verdict engine with the eight-step precedence described in METHODOLOGY.md, a Debian-policy version comparator, and reason codes with next steps.
- Tests: rules, engine, i18n, static/CSP, contrast, workflow (`npm test`) and browser end-to-end, accessibility, network, offline, responsive and subpath tests (`npm run test:e2e`).
- GitHub Pages workflow deploying a whitelist of files only.

### Decisions
- Test files are listed explicitly in npm scripts because Node 24's test runner does not accept a directory argument (`node --test tests/`).
- A version string that is neither `MAJOR.MINOR.PATCH` nor pre-release-shaped (for example `8.04.1`, `8.4`) is `invalid` (field `version`, reason `format`). A pre-release-shaped string (for example `8.5.0RC1`) or a version in a pre-release branch (8.6) is a `prerelease` verify result.
- Plesk rules rest on the Plesk change log because the Plesk support article returned HTTP 403 (see METHODOLOGY.md).
- The GitHub Pages docs example showed older action versions; the workflow uses the current major versions read from each action's releases page (checkout v7, setup-node v7, upload-pages-artifact v5, deploy-pages v5), and `include-hidden-files: true` so `.nojekyll` is part of the artifact. `actions/configure-pages` is not used because there is no build step that needs it.
- The workflow YAML is checked by a structural test, not by a full YAML parser (none is available without adding a dependency).

## Review

An independent review was done by a fresh subagent that was given only the project path and a checklist (it is an AI review, **not** the pending independent human review). It re-fetched primary sources and confirmed the thresholds of the rules it checked (upstream, Docker, Debian 12/13, all Ubuntu releases).

Fixed after the review:
- HIGH: three Romanian strings showed "0219" instead of "ș" (`env.other`, `source.unsure`, `sum.source.unsure`); a mojibake/escape-fragment test was added.
- MEDIUM: radio-group and release errors are now tied to their controls (`aria-describedby`, `aria-invalid`, cleared on change); table roles are kept when cells are stacked on narrow screens.
- MEDIUM: Plesk results now say that the fix is inferred from the equal upstream version because the Plesk change log does not name the CVEs; the format-error decision (distribution-style string for an upstream environment is `invalid`) is documented in METHODOLOGY.md.
- LOW: absolute privacy wording narrowed to "nothing you enter"; Romanian register unified (informal) and "release" renamed "versiunea distribuției"; PATCH capped at six digits and the bare "a"/"b" pre-release suffixes removed from the engine; Plesk find-command note; stricter banned-wording check for the docs and more banned APIs in the static test; dead assertion removed; "Copied" feedback uses a status region; the workflow also runs tests on pull requests; an unverified Debian "sid" detail was removed from METHODOLOGY.md.

Remaining low items: `assets/social-preview.png` is not referenced by the page (it is meant for the repository's social preview setting, which needs a manual upload); no `og:image` because it needs an absolute URL that is not known yet; actions are pinned to major tags, not commit SHAs; the Ubuntu 26.04/26.10 package regex accepts any 8.5.x Ubuntu-style string; the `dpkg` cross-check did not run on this Windows machine and will run on the Ubuntu CI runner.

