# Privacy

## What the page does with your data

Nothing you enter is collected, stored or sent. The page has no backend, no account, no analytics, no cookies, no `localStorage`, `sessionStorage` or IndexedDB, no fonts or scripts from other hosts and no console logging of what you type. Language selection uses the `?lang=` query parameter or the browser language, and is not stored.

The Content-Security-Policy of the page (`connect-src 'none'`, `default-src 'none'`) forbids any connection from the page's scripts; a browser test asserts this.

## "Offline" defined precisely

After the static files are loaded, the page performs no further network requests, and every assessment works with the network disabled. There is no service worker, and reloading the page while offline is not supported.

## The host

The page is intended to be served by GitHub Pages. A host can process the IP addresses of visitors. GitHub's General Privacy Statement lists IP address among the usage information it collects automatically (<https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>, read on 2026-10-22). That statement does not mention GitHub Pages specifically; whatever GitHub does is governed by GitHub's own policy, not by this project.

## Links

The page links to external documentation (advisories, vendor pages). Links open with `rel="noopener noreferrer"`, and the page sets `<meta name="referrer" content="no-referrer">`. Following a link is a visit to another site with its own policy.
