# Security policy

## Scope

In scope: errors in `rules.json` (a wrong fixed version, a wrong source), logic errors in `engine.js`, and weaknesses in the page itself (script injection, privacy leaks, requests the page should not make, a way to make the reachability check contact something other than a public host name).

Out of scope: the PHP vulnerabilities themselves (report those to the PHP project), other CVEs, and anything about a specific server. dyd↻ analyses declared details only.

## How to report

No private reporting channel or e-mail address is published for this project. Until the maintainers enable and document one, report a rules error or a weakness as a **public issue** on the project repository, **without exploit details**: say what is wrong, link the primary source, and do not post working payloads. If GitHub private vulnerability reporting is enabled on the repository, the repository's "Security" tab will offer it; this document does not assume that it is.

## Content-Security-Policy

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src https:; base-uri 'none'; form-action 'none'
```

`connect-src https:` is the one relaxation compared with the first release (`'none'`). It exists only for the optional reachability check, which must be able to contact the domain a visitor enters. The consequences are limited by design: the single `fetch` call in `app.js` builds its URL from a normalised public host name, uses `mode: "no-cors"`, sends no credentials, no referrer and no body, and a test asserts that this is the only `fetch` in the site's code. Domains with credentials, ports, IP addresses, single-label names, common internal suffixes (`.local`, `.internal`, `.arpa`, `.onion` and similar) and non-HTTP schemes are rejected before any request is made. DNS cannot be checked from a static page, so a public-looking name that resolves to a private address cannot be excluded. Browsers also require redirects to be followed in `no-cors` mode, so the answer may come from a redirect target. Plain `http:` and `ws:` connections stay blocked.

GitHub Pages does not allow custom HTTP response headers, so the policy is set with a `<meta>` element and header-only protections such as `frame-ancestors`, `X-Frame-Options` or `Permissions-Policy` are not available.

## What the tests enforce

The static test suite checks the exact CSP string, absence of inline scripts and styles, absence of `innerHTML`-style APIs, `eval`, storage APIs and other network APIs in the site's JavaScript, that `fetch` appears exactly once with the restrictions above, and that external links are `https` anchors. The end-to-end suite records every request and asserts that, without the optional check, only the site's own static files are requested, none after load; that invalid and hostile domains never cause a request; and that user input is only ever rendered as text.
