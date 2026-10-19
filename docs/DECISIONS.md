# Decisions

| # | Date | Decision | Why |
|---|---|---|---|
| 1 | 2026-10-19 | Website replaces the HTML Control Panel; hosted on Cloudflare at automation.houdaifa.dev | Free, fast everywhere, his DNS provider |
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

The home style is approved. The full clickable prototype exists and is being revised; it has not been approved. Build order remains decision 9. Reference-image delivery and storage require proof before promising a one-copy handoff.

## API proof implementation findings — 19 October 2026

- For schedule-trigger Run now, use ON_LATEST_VERSION retry of a retained scheduled run; never resume only the failed step. Deployment must obtain a seed before exposing the action. This route was proved with a new successful run and changed version. No broad architecture change is made.
- Website responses must use allowlisted summaries because Activepieces run outputs can contain credentials. Admin does not receive raw run outputs.
- Owner approved reusing the selected test platform's existing Telegram bot credential from a prior run output for one separately named test connection. That connection is ACTIVE and unused; no message was sent.

## Prototype review boundary — 19 October 2026

The English clickable prototype is ready for review; it is not approved yet. Sign-in/setup shows a focused header, with dashboard tabs reserved for the workspace. A local prompt-and-images download demonstrates an explicit attachment handoff while private automatic delivery remains unproved. Example references are clearly labeled. Production architecture, reference storage and localization decisions are unchanged.

## Owner clarity corrections — 19 October 2026

- Remove “What should we keep?” entirely. Uploaded references define the style; Codex infers palette, lettering and mood. No written style brief.
- Make **Add Pinterest account** the visible home and Accounts action. Keep service identifiers hidden; guide external login and Save, detect the connection, fill defaults, then activate. Reconnecting an existing account must not duplicate it.
- Rename **Prepare batch** to **Get Codex prompt**. Show the distinction between a ready-to-paste prompt, creating pins in Codex, and scheduled publishing from the Sheet. Without-link topics use the account's niche automatically.
- Explain the final setup result: automation + Sheet, then first content creation. Owner requested a complete walkthrough and production accuracy, not ease alone. The local walkthrough and 40 engine tests passed; real website integration and unassisted beginner acceptance remain pending. These corrections are not full prototype approval.

## Prototype approval and interface vocabulary — 19 October 2026

- Owner approved the prototype and explicitly requested the real build and live deployment. Continue without asking for prototype approval again.
- Call the product objects **Automations**. Each automation contains clearly labeled **Pinterest accounts**. Cards list those profiles; the unrelated Moroccan Kitchen sample is removed from the owner preview.
- Home action creates an automation. Add Pinterest account is scoped to an automation card or its Pinterest accounts page.
- Global navigation is Automations; the automation’s local first tab is Summary. A visible Automations breadcrumb returns home.
- In-place edits and pin-source changes preserve scroll position and control focus. Only page navigation resets scroll.

## Live address — 19 October 2026

The owner explicitly renamed the live site to Automation. Use **automation.houdaifa.dev**, under the domain confirmed in his Cloudflare account. This supersedes the earlier address. Repository paths and legacy external flow identifiers remain compatible.

## New automation isolation and reference storage — 19 October 2026

- New website automations use unique Drive workspace markers and their own Sheets. This prevents setup tests or independent automations from changing each other's global Sheet settings. Existing live flows and their shared Sheet remain untouched. Importing an existing flow must preserve its original workspace explicitly.
- Reference images use private D1 blobs with per-account/member/global limits. The copied prompt contains 24-hour, batch-scoped image links. Anyone holding a link can read only the referenced image; blocking the owner revokes access. Text copying is not an attachment. A live receiving-session image check is required before calling this handoff verified.
- The first scheduled bootstrap run is dated once, rather than repeated every minute. A confirmed completion restores the hourly schedule. Website callbacks and signed-in status checks both resume the same saved deployment stage.

## 19 October 2026 — public source and deployment on push

The owner explicitly changed repository visibility to public and requested a complete README plus automatic Cloudflare deployment on each main-branch push. Use GitHub Actions with checks before deployment, pinned action commits, read-only repository permissions and a production environment secret. Pull requests must never receive the deployment credential. This replaces the earlier private-repository instruction. Keep website identity and automation keys in Cloudflare secrets; use only a limited Cloudflare deployment credential in GitHub.
