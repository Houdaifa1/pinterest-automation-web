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

| 10 | 2026-10-19 | Approve the clearer Geist home (option B) as the design direction | Owner approved the single recommended screen; see docs/design-references/21-home-geist-clearer.jpg |
| 11 | 2026-10-19 | Open Google sign-up without invites; owner can review every website member, block/unblock and remove website access | Owner reaffirmed public sign-up and moderation control; removal must not delete a member’s Google or Pinterest account |
| 12 | 2026-10-19 | Each Pinterest account can have uploaded pin-style references and its own saved style | Owner requested image examples, consistent identity, fresh layouts, trend-informed variation and no repetitive feed |
| 13 | 2026-10-19 | Keep setup brief and guided; speed, readable controls and beginner task completion are release requirements | Owner wants his father and friends to use it independently |
| 14 | 2026-10-19 | Live test target is Hdrahm’s Platform → @stunningcrochet only, explicitly confirmed by the owner after checking Chrome | Latest confirmed instruction replaces the earlier hdrahm test target; Crochet Simplified is explicitly excluded |

## Approval boundary

The home style is approved. The full clickable prototype has not been built or approved. Build order remains decision 9. Reference-image delivery and storage require proof before promising a one-copy handoff.

## API proof implementation findings — 19 October 2026

- For schedule-trigger Run now, use ON_LATEST_VERSION retry of a retained scheduled run; never resume only the failed step. Deployment must obtain a seed before exposing the action. This route was proved with a new successful run and changed version. No broad architecture change is made.
- Website responses must use allowlisted summaries because Activepieces run outputs can contain credentials. Admin does not receive raw run outputs.
- Owner approved reusing the selected test platform's existing Telegram bot credential from a prior run output for one separately named test connection. That connection is ACTIVE and unused; no message was sent.

## Prototype review boundary — 19 October 2026

The English clickable prototype is ready for review; it is not approved yet. Sign-in/setup shows a focused header, with dashboard tabs reserved for the workspace. A local prompt-and-images download demonstrates an explicit attachment handoff while private automatic delivery remains unproved. Example references are clearly labeled. Production architecture, reference storage and localization decisions are unchanged.
