# Changelog

All notable changes are recorded here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Static page (`index.html`, `style.css`, `app.js`, `engine.js`, `i18n.js`) with English and Romanian text, dark-first design and the official brand assets from `BRAND/`.
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

