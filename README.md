<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="BRAND/dyd-brand/svg/dyd-logo-primary-dark.svg">
    <img alt="dyd↻" src="BRAND/dyd-brand/svg/dyd-logo-primary-light.svg" width="240">
  </picture>
</p>

# dyd↻

**dyd↻** is a free, open-source, purely static web page. You declare your PHP version and environment; the page compares that declared data with rules derived from official advisories and shows a verdict about exactly two advisories: [CVE-2026-109618](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w) (remote code execution via out-of-memory corruption, GHSA-w8hw-w9fx-j79w) and [CVE-2026-109619](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp) (remote code execution via stale global state, GHSA-6wmf-4rv5-p3rp). There is no backend, account, analytics, cookie, browser storage or external request. English is the primary language, Romanian is fully supported (`?lang=ro`).

> dyd↻ is an independent project and is not affiliated with or endorsed by the PHP Group, Debian, Ubuntu, Docker or Plesk. The name "dyd" has not undergone trademark or domain clearance (see `BRAND/BRAND.md`, section 8).

![Dark theme](docs/screenshots/dark.png)

## What it covers, and what it does not

dyd↻ analyses only the data you declare. It never claims or implies that a server was scanned, audited or certified, and it says nothing about other vulnerabilities or about attacks that may already have happened.

Rules exist for: upstream php.net 8.2–8.5, the official Docker `php` image 8.2–8.5, Plesk on Linux 8.2–8.5, Debian 12 and 13, and Ubuntu 26.10, 26.04, 24.04, 22.04 plus the Pro/ESM releases 20.04, 18.04, 16.04 and 14.04. Everything else (PHP 8.1 and older from php.net, pre-releases such as 8.6, derived Docker images, Plesk on Windows, cPanel, CloudLinux, RHEL and derivatives, SUSE, Alpine, Amazon Linux, Windows, third-party repositories such as Sury, Remi or PPAs, Debian testing/unstable, managed hosting) always resolves to "Needs further verification". The full table is in [METHODOLOGY.md](METHODOLOGY.md).

## The three verdicts

| English | Română |
|---|---|
| Affected according to the advisory | Afectat conform avizului |
| Remediated according to the declared data | Remediat conform datelor declarate |
| Needs further verification | Necesită verificări suplimentare |

The checks run in a fixed order and stop at the first one that decides: invalid input; unsupported environment; version parsing; per-advisory comparison; version source; affected; restart; remediated. Two rules matter most:

- The version must come from "the PHP or package that actually serves the site". A command-line reading only, or "not sure", gives "Needs further verification", even if the version looks fixed or affected.
- A fixed version alone is not enough: running PHP processes keep the old code until they are restarted. If everything looks fixed but you did not answer "Yes" to the restart question, the verdict is "Needs further verification". An affected version stays "Affected" whatever the restart answer.

## How to use

Open the page, choose the environment, enter the version exactly as reported (the "How do I find it?" disclosure shows a command for each environment), answer the two confirmation questions and read the result. Debian and Ubuntu need the **package version** (for example from `dpkg-query -W -f='${Version}\n' php8.4-fpm`), never the upstream PHP number.

| Light theme | Result view | Mobile |
|---|---|---|
| ![Light theme](docs/screenshots/light.png) | ![Result view](docs/screenshots/result.png) | ![Mobile](docs/screenshots/mobile.png) |

(The screenshots were captured by Playwright from the real page.)

## Run locally

Open `index.html` directly in a browser, or serve the folder:

```
python -m http.server 8080
```

or `npx serve`. All URLs are relative, so the site also works under a repository subpath.

## Tests

```
npm install
npm test          # rules, engine, i18n, static, contrast, workflow checks (no dependencies needed)
npm run test:e2e  # browser tests with an installed Edge or Chrome (needs the dev dependencies)
npm run test:all
npm run screenshots
```

`npm test` runs with Node's built-in test runner only. The end-to-end tests use `playwright-core` and `@axe-core/playwright` (dev dependencies; no browser is downloaded).

## Update the rules

`rules.json` is the single source of truth. After editing it, run:

```
node scripts/build-rules.js
```

This regenerates `rules.js`; a test fails if `rules.js` is not exactly what the script produces. A rule may only be added or changed from sources you have actually read; record the URLs and the day in `verified_at` and in the verification log of [METHODOLOGY.md](METHODOLOGY.md).

## Contributing

Issues and pull requests are welcome, especially corrections to rules with a primary source attached. Keep the scope: two advisories, no scanning, no backend, no new runtime dependencies.

## Rules status

Rules last verified: 2026-10-22 (AI-assisted reading of official sources). **Independent human review is pending.**

## Documents

[METHODOLOGY](METHODOLOGY.md) · [PRIVACY](PRIVACY.md) · [SECURITY](SECURITY.md) · [CHANGELOG](CHANGELOG.md) · [LICENSE](LICENSE) (MIT)

Advisories: [GHSA-w8hw-w9fx-j79w](https://github.com/php/php-src/security/advisories/GHSA-w8hw-w9fx-j79w) · [GHSA-6wmf-4rv5-p3rp](https://github.com/php/php-src/security/advisories/GHSA-6wmf-4rv5-p3rp)

## Suggested repository settings

Description: "Static, no-tracking check of a declared PHP setup against two critical advisories (CVE-2026-109618, CVE-2026-109619)." Topics: `php`, `cve`, `security`, `static-site`, `github-pages`, `privacy`.
