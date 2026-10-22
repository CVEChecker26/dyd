# Privacy

## What the page does with your data

Nothing you enter is stored, uploaded or shared. The page has no backend, no account, no analytics, no cookies, no `localStorage`, `sessionStorage` or IndexedDB, no fonts or scripts from other hosts and no console logging of what you type. Reports (print or "Save report") are created in your browser; nothing is submitted. The report file contains the domain and details you entered because you asked to save them; keep it as you would any internal document.

dyd↻ asks you for a domain and technical details. It never asks for passwords, SSH keys, tokens or other credentials, and it rejects URLs that contain a user name or password.

## The only outbound request

The optional **reachability check** is the only request the page can make after it has loaded. It happens only when you press "Check that it answers from this browser":

- the browser sends one HTTPS `GET` request to `https://<your domain>/` (the host name only, not the path or query), without credentials or a referrer;
- the site you entered receives an ordinary request from your IP address, like any visit;
- dyd↻ and its host receive nothing, and the response is opaque to the page (it can only tell that some response arrived);
- nothing is kept after you leave the page.

The Content-Security-Policy reflects this: `connect-src https:`. Everything else stays at `'none'` or `'self'`.

## "Offline" defined precisely

After the static files are loaded, and if you do not press the reachability button, the page performs no further network requests, and every assessment works with the network disabled. There is no service worker, and reloading the page while offline is not supported.

## The host

The page is intended to be served by GitHub Pages. A host can process the IP addresses of visitors. GitHub's General Privacy Statement lists IP address among the usage information it collects automatically (<https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement>, read on 2026-10-22). That statement does not mention GitHub Pages specifically; whatever GitHub does is governed by GitHub's own policy, not by this project.

## Links

The page links to external documentation (advisories, vendor pages). Links open with `rel="noopener noreferrer"`, and the page sets `<meta name="referrer" content="no-referrer">`. Following a link is a visit to another site with its own policy.
