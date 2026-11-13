# BoatMedix™ marketing website

Static site for **www.boatmedix.com**, served by GitHub Pages from the `main` branch of this repository.

- No build step, no framework, no server: plain HTML, CSS and JavaScript.
- The mobile app, Captain, APIs and backend live in separate repositories and are not part of this site. `app.boatmedix.com` is hosted separately.
- Forms open a pre-addressed email to hello@boatmedix.com; nothing is stored on this site.

## Editing

Change the HTML files and push to `main`. GitHub Pages republishes within a minute or two.

| File | Page |
|---|---|
| `index.html` | Home — hero film "A Day on the Water", product story, plans |
| `boaters.html` | For Boaters |
| `dealers.html` | Redirects to the home page (dealer page removed) |
| `story.html` | Our Story |
| `get.html` | Get BoatMedix |
| `404.html` | Not-found page |
| `site.js` / `site.css` / `tokens.css` | Shared navigation, footer, styles and brand tokens |
| `phone.html` | The in-page product demo shown inside the phone frame on the home page |
| `media/` | Hero film (1080p and 720p), poster, share image |
| `our-story/`, `contact/`, `features/` | Redirects from the previous site's URLs |

See `DEPLOY.md` for the GitHub Pages and DNS cutover steps.

© 2026 BoatMedix LLC. BoatMedix™ · Never Boat Alone™
