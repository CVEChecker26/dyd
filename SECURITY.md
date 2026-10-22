# Security policy

## Scope

In scope: errors in `rules.json` (a wrong fixed version, a wrong source), logic errors in `engine.js`, and weaknesses in the page itself (script injection, privacy leaks, requests the page should not make).

Out of scope: the PHP vulnerabilities themselves (report those to the PHP project), other CVEs, and anything about a specific server. dyd↻ analyses declared data only.

## How to report

No private reporting channel or e-mail address is published for this project. Until the maintainers enable and document one, report a rules error or a weakness as a **public issue** on the project repository, **without exploit details**: say what is wrong, link the primary source, and do not post working payloads. If GitHub private vulnerability reporting is enabled on the repository, the repository's "Security" tab will offer it; this document does not assume that it is.

## Limits of GitHub Pages headers

GitHub Pages does not allow custom HTTP response headers. The page therefore sets its Content-Security-Policy and referrer policy with `<meta>` elements. Protections that only exist as HTTP headers, such as `frame-ancestors`, `X-Frame-Options`, `Strict-Transport-Security` settings of our own or `Permissions-Policy`, are not available.

## What the tests enforce

The static test suite checks the exact CSP string, absence of inline scripts and styles, absence of `innerHTML`-style APIs, `eval`, storage APIs and network APIs in the site's JavaScript, and that external links are `https` anchors. The end-to-end suite records every request and asserts that only the site's own static files are requested, none after load.
