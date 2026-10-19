# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-10-19 | Website replaces the HTML Control Panel; hosted on Cloudflare at autopilot.hudaifa.dev | Free, fast everywhere, his DNS provider |
| 2 | 2026-10-19 | Open sign-up with Google (own OAuth), Admin page only for the owner | Anyone can use it; no 50-seat limit |
| 3 | 2026-10-19 | Cloudflare D1, everything per user, autosave + versions | No more saving/opening answer files |
| 4 | 2026-10-19 | Activepieces API key per user, stored encrypted; server does everything by API, no connection IDs | IDs and bookmarklets confused his friends |
| 5 | 2026-10-19 | Telegram: paste bot token on our site, we create the connection | Friends pasted tokens where IDs were expected |
| 6 | 2026-10-19 | Style = Vercel's Geist design system (approved screenshot) | He wants a world-class, not AI-looking UI |
| 7 | 2026-10-19 | History never duplicates a copied batch | Re-copying made duplicate entries |
| 8 | 2026-10-19 | Logins are made in Activepieces (OAuth), our site detects them live | Google/Pinterest only allow sign-in on their screens |
| 9 | 2026-10-19 | Research choice → permissioned Activepieces API-key proof → clickable prototype approval → real build | Owner explicitly confirmed this sequence for the current session |

## Pending owner choice — 2026-10-19

The design review proposes A (existing approved Geist), B (clearer Geist, recommended), or C (soft sidebar).
See `docs/RESEARCH.md` and `docs/design-references/home-comparison.html`.
No new style has been approved. Decision 6 remains the baseline until the owner chooses.
