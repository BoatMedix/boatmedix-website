# Deploying www.boatmedix.com

The site is served by GitHub Pages from the `main` branch (root folder). There is no build step.

## Preview (before DNS cutover)
With no `CNAME` file in the repository, Pages serves the site at
https://boatmedix.github.io/boatmedix-website/

## Cutover to www.boatmedix.com (do only after approval)
1. Add a file named `CNAME` at the repository root containing exactly: `www.boatmedix.com`
   (or set the custom domain under Settings → Pages). Commit to `main`.
2. In GoDaddy DNS for boatmedix.com:
   - Change `CNAME www` from `cname.blink.new` to `boatmedix.github.io`
   - Delete the two apex `A` records (216.69.141.59, 15.197.143.18) and add four `A @` records:
     185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
   - Leave every other record untouched: `CNAME app` (the live app), all `MX` records (Google Workspace email),
     the SPF `TXT`, `google-site-verification`, `replit-verify`.
3. Wait for the DNS check in Settings → Pages to pass, then tick **Enforce HTTPS**
   (the certificate is issued automatically; allow up to an hour).
4. Optional hardening: Settings → Pages → Verified domains → add `boatmedix.com` and create the
   `_github-pages-challenge-boatmedix` TXT record GitHub shows.

## Rolling back
Point `CNAME www` back to `cname.blink.new` and restore the two apex A records. The previous site
is unaffected by anything in this repository until DNS changes.
