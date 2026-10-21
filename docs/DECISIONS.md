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

## 19 October 2026 — limited production deployment credential

The owner approved creating automation-github-deploy and storing it in GitHub’s production environment. Its only permissions are Pages Edit and D1 Edit for the selected Cloudflare account. This grants access to those services across that account; Cloudflare does not narrow this token to one Pages project or one D1 database. The existing website and automation credentials remain Cloudflare secrets.

## 20 October 2026 — reuse the setup people already have

- An Activepieces key triggers saved-connection and published-flow discovery. Recognized posting flows appear before the new-setup wizard. Use existing automation imports their settings into the website using provider reads only; publishing waits for Update automation.
- Preserve the original workspace markers, Sheet, posting hours and selected Telegram connection. Never ask for an existing bot token just to manage its flow. Adding or replacing a bot remains an explicit action.
- A separate automation can reuse a known saved recipient through its verified Google/Telegram connections inside the execution service. Bot credentials stay there. Missing or ambiguous recipients fail clearly; never guess the newest private chat.
- Add Pinterest account includes readable connection instructions, automatic detection, posting choices and Add & update automation. Updates use the same flow, preserve pause state and run a settings-only check before restoring the regular schedule. Prevent a second flow from posting the same already-running profile.

## 20 October 2026 — review the whole product before more coding

- The owner's stop instruction takes precedence over the earlier build approval. Review every reported issue before resuming application edits, production cleanup, pushes or deployments. Existing partial changes remain local. The three duplicate production drafts have not been removed.
- New requirements: whole-card navigation; a quiet queue with tracked/published/remaining pins and coverage; mixed no-link/product/category/store requests in one prompt; editable counts above the old arbitrary caps; distinct product and category destinations; product rotation and fresh, accurate creative across batches.
- Source URLs, optional batch instructions and example pins belong in New pins. This supersedes decision 12's account-level editing location. Optional reusable style presets can be selected in New pins; preserve existing saved images and batch snapshots.
- Account settings start collapsed. Only real net changes show green Save changes; reverting to the saved values leaves Hide settings. Retain the saved-key Continue/Change behavior, existing Telegram reuse, explicit existing/new creation choice, empty new setups and recoverable deletion requirements.
- The owner requested varied posting times and a new visual direction. Recommend stored, spaced timestamps inside chosen hours, not detection evasion. Access approval, service usage and minute-level scheduling remain proof tasks. No claim that the old hourly engine already supports this.
- Proposed direction: a calm editorial content workspace, borrowing queue clarity from Buffer and review focus from Planable while retaining readable Geist foundations. This direction, the new clickable prototype and the preferred scheduling architecture remain unapproved. See REBUILD-PLAN.md and RESEARCH.md. All current design-preview data is illustrative.

## 20 October 2026 — revised prototype authorized, black and English only

- Owner said to start work on the reviewed plan, with a black background instead of green and removal of French and Arabic. The next agreed stage is the complete revised clickable prototype; production rebuild approval follows that review.
- Use a pure black canvas, neutral dark surfaces and white main actions. Reserve green for a meaningful edit/save state. No green/teal background and no automatic appearance switch in the new design.
- English only. Remove the language picker and French/Arabic screens from the redesign. This supersedes earlier translation/RTL requirements; older release evidence remains historical.
- Prototype actions use sample state only. Existing unfinished application files stay untouched; no live posting, production draft cleanup or deployment during this stage.

## 20 October 2026 — real rebuild and production testing authorized

- Owner explicitly resumed the real build and requested production testing, superseding the previous review pause and prototype approval gate. Use the black English-only workspace and reviewed behavior.
- Test account is now hhdrahm@gmail.com and its connected Activepieces/Pinterest services. Ask the owner to sign in at the live-test stage, then verify actual connected identities and isolate tests. crochetsimplified.com is authorized as a content source. Do not infer that a similarly named old shared flow belongs to this account.
- Reset obsolete website test data after an inventory and private backup; preserve unrelated members and remote resources. Flexible posting times, manual execution, conservative editable defaults, accurate per-pin links and concise complete prompts require real proof.

## 20 October 2026 — stored minute-level scheduling

- Use a lightweight Cloudflare Worker Cron Trigger to call a protected Pages dispatcher once per minute. It starts Activepieces only for due jobs, rather than running a full posting flow each minute. Credentials and Pinterest publishing stay in Activepieces.
- Store generated timestamps, claim each job once, recheck pause and applied revision immediately before publication, skip missed slots, and hold uncertain execution for review. Existing independent legacy flows are not converted automatically.
- Conservative editable starting schedule: three original pins a day, varied inside 09:00–21:00 with two-hour minimum spacing. This is a starting point, not a promised ranking strategy. Custom exact minutes and higher volume must fit the selected window and spacing; provider quotas still apply.
- Queue changes use actual Sheet snapshots and conflict-checked commands. A copied request or sent marker is never counted as queued content. Unposted pin removal is recoverable; already published Pinterest pins require a separate explicit action.

## 21 October 2026 — retain deep research in mixed content requests

- Mixed requests must retain the earlier research and creative process: inspect the designated Pinterest profile and existing content, verify source products, research current demand with dated sources, plan deliberate variety and inspect actual images and saved rows.
- A shorter prompt must not remove necessary work. Mixed product/category/no-link counts and destinations take precedence over the old single-micro-niche batch rule. New rows remain Draft until member review; copied instructions are not queued content. Missing private analytics or blocked research must be stated honestly.

## 21 October 2026 — existing flows and product discovery

- Existing-only setup must fail safely when a flow cannot be imported; it must never create a replacement flow implicitly. Import must preserve supported legacy names, caps and schedules.
- Removing a deployed automation pauses and verifies the remote removal before hiding the website record. Recoverable website settings remain available; restoration must not restart publishing automatically.
- Category scans stay inside that category's product pagination. Whole-site navigation, policy links and unrelated categories are not products. Incomplete access must be visible instead of silently representing a partial inventory as complete.

## 21 October 2026 — new scenes while preserving the product

- Owner explicitly rejected one product photograph repeatedly placed into different text templates. Content requests must call for genuinely different underlying scenes: camera angles, arrangements, poses, lighting, background and relevant use contexts.
- Wearable crochet should include believable on-body fashion mockups that preserve the garment. Print artwork should remain exact inside appropriate clothing, mug, bottle or other intended-use mockups. Digital resources need accurate previews/use scenes for their actual content; the selling platform does not determine the treatment.
- Small crochet color changes are allowed as creative inspiration. Do not advertise an imagined color as an available purchase option. Construction, silhouette and pattern remain exact; artwork lettering and design remain exact unless an edit is explicitly requested. Every output must be compared to source assets and to recent pins.

## 21 October 2026 — mixed product order and verified offer emphasis

- Owner requires product rotation within the saved queue. Eight selected products with eight pins each must rotate A1–H1, A2–H2 and so on, with exact per-product counts. Continue the sequence across resumable parts. Do not group rows by product or reorder existing live content implicitly.
- Make a genuinely free linked crochet pattern obvious in the image using a readable headline or badge. Product imagery remains prominent. Verify the actual offer; distinguish free web instructions, paid PDFs, samples, free shipping and zero-minimum optional-payment resources. Paid products use accurate product/benefit text instead.
- Adapt research, imagery and copy to actual item type, audience and each account's micro-niche. A platform name alone does not determine the product or its creative treatment. Complete access to Etsy/Gumroad catalogs remains a separate integration requirement.

## 21 October 2026 — whole-store research and efficient instructions

- A member can supply only a shop/catalog URL and a pin count. Automatic selection is the default for an otherwise empty store source; manual product selection remains available. Category sources can also choose automatic selection while retaining explicit overview counts.
- Automatic allocations are source-research scopes, not final product URLs. The creation session must inspect eligible real products, prioritize strong under-covered/newer items alongside relevant proven evergreen items, assign the exact requested count and then build the mixed product order. The website labels selection as pending; it must not invent a completed product plan or send every product pin to the store home.
- Use one adaptive workflow for every niche and actual content type. Animal/food/crochet/store examples are not boundaries or separate named-friend prompts.
- Token efficiency means a compact self-contained instruction set, shared research across a batch, targeted reads, reusable dated memory and bounded creation parts. Keep product/offer/image/saved-row checks. Prompt size is measurable; lower billed usage cannot be promised without measuring the actual creation session.

## 21 October 2026 — keep automatic selections stable

A store/category request begins with a research scope rather than invented product destinations. Before images, save the resolved product URLs, counts and mixed order in the account's batch-scoped Plan rows using existing headers. Resume reuses this plan, rechecks changed offers and holds unavailable allocated products instead of silently replacing them.

## 21 October 2026 — complete website fresh start requested again

The owner explicitly requested emptying all website member data so everyone can start fresh. Back up and verify before clearing application data, retain schema/migrations and leave external Activepieces flows, Sheets and Pinterest untouched. All website sessions and stored schedule jobs are removed. Members must sign in and reconnect/import; independently scheduled remote flows are not stopped by a website database reset.

## 21 October 2026 — verified pins become Ready without a member-approval step

The owner explicitly changed the Draft-review policy. Before content research or image generation, verify this creation session's Google Drive/Sheets connections, correct identity or delegated access, exact Sheet/account/folder, edit/upload permissions and required tools/references. A website Google login or Activepieces connection alone is insufficient. Stop on required missing access with the specific connection/permission needed.

Create and inspect each pin, upload it, stage the new row as Draft during verification, read back media/row/order and set only passing batch rows Ready in the same run. Read back Ready before counting success. No approval or continue message between internal parts. Failed/incomplete pins remain Draft with a reason; do not promote unrelated old Drafts, rewrite already received pins, alter schedules or publish directly. Ready means eligible under the existing active schedule, not proof of posting. Saved requests refresh to the new workflow on recopy without changing identity or inputs.

## 21 October 2026 — schedule editing in New pins

The owner requested the selected Pinterest account's schedule beside content creation. Keep schedule controls collapsed behind one clear summary, preserve the account-setup editor and use the same shared controls. A deliberate Save & update action saves the selected account and updates its existing remote flow, preserving paused/running state; saving a content request alone must not change publishing. Varied daily scheduling is the default with adaptive spacing; exact times and custom spacing remain possible. New creation amount never silently changes daily publishing volume. Existing explicitly custom schedules remain valid unless changed; automatic settings recalculate when count/window changes. No claims of human impersonation, evasion or universally optimal timing.

## 21 October 2026 — edit the selected saved setup after adoption

Existing-flow review must show its saved notification choices, never a blank setup's defaults. Opening notification/account edits first adopts the selected flow read-only, then edits the actual imported settings. Returning to the key keeps the saved connection. Existing-only intent never creates a replacement remote flow.

## 21 October 2026 — published Activepieces settings are authoritative

The owner explicitly rejects replacing imported settings with sign-in defaults or hardcoded values. Read the selected published flow and connection metadata through Activepieces. Automatically refresh clean website state when the published version changes; retain website-only metadata. Conflicts need an explicit choice before discarding website drafts. A visible Refresh from Activepieces action reloads published settings; unpublished provider drafts are excluded. Unsupported structure/workspace/website-scheduler changes fail clearly. Saved requests and website-only media/history remain website data.

## 21 October 2026 — show connected scheduling and actual queue evidence

The owner requires per-account counts on home cards, queue order, stored posting minutes and visible recent outcomes. An ENABLED remote flow is not proof of successful publishing. Importing a flow that references a removed website callback must expose reconnect state and a same-flow settings-only repair, never silently leave daily maintenance looking healthy. Exact stored slots and provisional pin allocations must be distinguished; paused products/future dates and final publishing validation remain authoritative.

## 21 October 2026 — move one upcoming time without changing daily settings

The owner requested a 15:00 → 14:12 test. Provide an inline per-slot time editor for the slot's existing date; leave recurring settings and other slots untouched. The website dispatcher already reads stored due jobs, so a one-slot edit does not require rebuilding or running Activepieces. Save is revision/timestamp checked and refuses past, started or conflicting slots. Daily schedule edits remain a separate control in New pins. The requested real publication test uses the owner's existing content, not newly injected test pins.

## 21 October 2026 — manage individual posting days

The owner requests previous/next day navigation, optional date selection and additional editable posting minutes per day. Keep recurring defaults separate. Extra slots increase only the protected allowance for that day; the engine accepts this only from its existing single-use website authorization. Enable the updated engine through a same-flow settings-only update, preserving content and recurring Sheet caps. Removing a time leaves its pins queued. Stored added/removed/moved slots survive unrelated settings changes.

Statistics use a consistent green Posted / blue Ready / amber Needs attention color key, a ring with the tracked total and a segmented bar on account cards. Keep numbers, labels and accessible descriptions. Charts summarize verified Sheet snapshots; they do not imply an unrecorded trend or forecast.
