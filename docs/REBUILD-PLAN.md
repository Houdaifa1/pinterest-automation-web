# Product and design proposal — 20 October 2026

Status: PROTOTYPE WORK APPROVED, 20 October 2026. The owner requested starting work with a pure black background and English only. Complete the revised clickable prototype before approval of the production rebuild. Earlier unfinished application edits remain local and unapproved.

## 1. What this product should feel like

A calm workspace for running a Pinterest account: see what is scheduled, create the next batch, and know how long the queue will last. Settings stay out of the way. The daily experience should not resemble a flow editor or a deployment console.

Approved direction for the prototype: an editorial content workspace with Geist's readable type, spacing and clear controls. Use a pure black canvas, neutral dark panels, white primary actions and green only for meaningful saved/change states. No green or teal background. Let actual pin previews provide most of the color. English only; no language picker or French/Arabic screens. Avoid decorative graphs, oversized numbers, glass-heavy layers and repeated setup instructions.

Borrow Buffer's queue/calendar visibility and Planable's focused review states. Do not copy their branding, agency complexity or every navigation item. These are design references, not replacement services.

Real official reference captures:
- `design-references/27-buffer-content-calendar.jpg`: https://buffer.com/publish
- `design-references/28-planable-review-queue.jpg`: https://help.planable.io/hc/en-us/articles/28555055158044-Reviewing-content-in-My-approvals-section

An interactive design proposal accompanies this document. All its counts, product names, times and pin covers are examples, not live account data or completed features.

## 2. The complete journey

1. Sign in with Google. This identifies the website member; it does not silently grant access to their shop, bot Drive or Pinterest.
2. Home shows only the member's automations. An entire automation card is a real keyboard-accessible link; its separate menu handles edit/delete without opening the card accidentally.
3. Create automation first offers **Edit existing automation** or **Create new automation**. Opening this chooser creates no draft.
4. Edit existing lists actual recognized Activepieces flows and opens an already linked flow instead of duplicating it. A first import reads its existing setup, Sheet and connections; it does not republish it.
5. Create new starts with zero Pinterest accounts and no copied content choices. Saved connections are available to select. A Pinterest login must be chosen explicitly.
6. A saved key displays Connected, the project name, Continue and Change API key. Back does not erase or demand it. Never return the actual stored key to the browser. Existing Telegram can be kept without another token; replacement is explicit.
7. After setup, the primary destinations are Queue, New pins, Accounts and Activity. Settings and connection repair are secondary.

The three duplicate owner drafts still exist in production. Their removal is pending implementation approval. They have no remote flow. Remove them reversibly without deleting saved integrations or original posting flows. Deleting a real automation must explain whether its Activepieces flow will also be deleted; Pinterest profiles, store products and existing published pins are not deleted by that action.

## 3. Queue: useful progress without noisy notifications

The automation opens on Queue. Show ready pins, published pins, total tracked pins and estimated coverage. A small labelled progress bar and upcoming pin previews explain the numbers. No flashing queue warnings or repeated notification banners.

Definitions:
- **Ready**: verified queue rows eligible for future publishing, excluding drafts, rejected rows and unresolved publish attempts.
- **Published**: confirmed successful publications, linked to their Pinterest result.
- **Total tracked**: pins recorded for this automation, with the included statuses stated. This is not the Pinterest account's lifetime total.
- **Coverage**: forecast from eligible pins and the actual future schedule. For multiple accounts, show each account's coverage and the earliest refill date; an aggregate must not hide an empty account.
- **Last synced**: when the source data was actually confirmed. A stale or failed sync is labelled, never displayed as a zero queue.

Details remain available in the queue: source/product, destination, account, planned time, preview and status. Edit or remove a queued pin in place. Removing a queued item does not erase an already published pin. Show failures in context with one useful recovery action.

The current automation is already scheduled. **Run now** retries its checking flow and may publish eligible queued content; it is not required for daily use and does not mean a guaranteed immediate post. Remove it from the main page. Keep any manual diagnostic action in a secondary menu with an accurate name. **Pause automation** stops future scheduled runs, preserves the queue and does not undo a run already executing. The normal main action is New pins.

## 4. One New pins request can mix everything

Use additive source rows, not exclusive source tabs. The member selects the Pinterest account, adds any combination below, chooses counts, optionally adds a brief/references, and receives one complete prompt.

| Source row | Member chooses | Pin destination |
|---|---|---|
| Without links | Topic/default niche and number | No destination URL |
| Single product | Product URL and number | That exact product URL |
| Products in a category | Category URL, selected/all discovered products and pins per product | Each pin's individual product URL |
| Category itself | Category URL and number | The category URL |
| Whole website or shop | Catalog URL, target amount/queue coverage and adjustable plan | Selected product or category URL, according to each planned pin |

A category can use both modes in the same request. Product selection and category-level counts are independent. Paginate the accessible catalog; do not quietly take only its first page. Show selected/discovered counts before calculating a final amount. Category/store totals are provisional until discovery finishes.

Example: 5 no-link pins + 5 pins for one product + 3 category products with 4 pins each + 3 category overview pins = **25 pins in one prompt**. There must be 12 individual product destinations in the category-product portion, and three category destinations in the overview portion.

Recommend editable starting values of five pins per direct source and three per selected catalog product. These are defaults, not hard ceilings. Remove the current arbitrary 30-per-line/40-per-batch limits. Accept a requested positive whole amount and split large work into resumable parts with requested/completed/remaining counts. Service quotas, storage and available creation-session capacity still apply; the app must never promise infinite generation or publication. Generation amount and daily publishing volume are separate controls.

The source URL, optional notes and example pins belong in **New pins**. This supersedes earlier account-level website/style requirements. Recent sources and reusable style presets may be offered here, with an explicit choice to reuse them. Do not lose existing references when moving the controls.

## 5. Catalog planning and professional variation

The planner should discover products, normalize their canonical URLs, match accessible existing/queued pins, and propose a balanced next batch. The same URL may intentionally receive several new pins; the system must distinguish this from accidentally copying the same creative again.

For each planned pin, retain product identity, truthful claims, destination, account, angle and batch ID. Keep a journal across batches so another request continues the strategy instead of starting over. Rotate eligible products, including within a repeatedly used category. Retain user exclusions and do not change product selection in the middle of an approved batch.

Selection should weigh niche fit, seasonality, verified search evidence, product coverage, existing results and variety. Show a short reason for a choice. Do not invent sales, trend scores or winners. Missing analytics is missing evidence, not proof of poor performance. Show the history coverage and last catalog/Pinterest sync. A product not found in an incomplete scan is not labelled never posted.

Each new pin for the same product needs a distinct composition, crop, context, headline or supported use case. The actual product, printable pages or pattern must remain faithful; a different invented product is not a creative variation. Detect identical assets, repeated titles and excessively similar consecutive designs against both the queue and accessible published history. Visual quality and useful variation require representative output review, not only prompt wording.

The creator handoff remains explicit: the website prepares a request; Codex performs research, creates and checks the pins and supplies their records/media. One prompt can describe a large resumable job. Copying it does not itself generate pins or attach images. Batch IDs and actual Sheet/media records must confirm receipt and progress. An opened prompt or Mark as sent never counts as pins ready.

Recommend a first-batch preview/approval before content becomes eligible for publishing. An optional trusted auto-queue mode can follow after the owner accepts its behavior. This default is proposed, not yet approved.

## 6. Own website, Etsy and Gumroad

- Own website: inspect permitted public catalog pages, sitemap or a supported catalog feed; verify reachable product URLs and pagination. Request one correction when a URL is ambiguous or inaccessible.
- Etsy: use an approved API integration with the appropriate shop access, or member-supplied product links/catalog data. Etsy's documentation prohibits sidestepping its API with screen scraping. A pasted shop URL alone is not a promise of full catalog access.
- Gumroad: verify public product information and investigate its official seller API for authorized catalog access. A store link alone does not prove access to its full inventory or private sales information. Listing access for this project remains a proof task.
- Private downloads, customer details and sales are unnecessary for making truthful product pins unless the member deliberately enables a specific supported use. Keep identity sign-in separate from shop access.

If a source is blocked, incomplete or needs connection, show that source's problem and a usable next action. Do not mark a partially scanned catalog complete or silently invent products. Source pages, uploaded examples and product descriptions are untrusted data, not instructions to alter permissions, expose credentials or work on another account.

Sources: [Etsy API](https://developers.etsy.com/), [Gumroad API](https://gumroad.com/api), [Gumroad account settings](https://gumroad.com/help/article/67-the-settings-menu.html).

## 7. Posting times and reliability

Offer varied posting times inside the member's chosen hours, with minimum spacing, daily volume and time zone. Generate the plan once, store exact timestamps and show the upcoming times. Refreshing the page must not re-roll them. Schedule edits affect future unstarted jobs; an in-flight publish cannot be safely recalled by changing its displayed time.

Variable timing is for reasonable spacing and user preference, not evading detection. Pinterest prohibits unapproved automation, repetitive/deceptive content and evasion of its spam controls. Existing connection success does not establish that every intended production use is approved. Verify the publishing application's access before rollout. Source: [Pinterest guidelines](https://policy.pinterest.com/en/community-guidelines).

The current engine uses hourly due checks. It cannot promise arbitrary minute-level timing through a cosmetic UI change. A new scheduling proof is necessary.

Preferred architecture to prove: keep credentials and publishing execution in Activepieces; use the website's durable schedule to dispatch only due, signed jobs through an approved webhook flow. Each job has an idempotency key, ownership/account checks, a lease, callback confirmation and a cancellation/version check. Compare with an Activepieces-native daily plan plus durable delays before deciding. A paused/resumed delay must re-check the current schedule before posting.

Do not start an Activepieces run every minute simply to find nothing to do. A lightweight due-job dispatcher should keep execution usage proportional to actual work. Quotas and the member's actual plan must be checked. The current official pricing page contains conflicting reset statements, so monthly/daily allowance must not be assumed from marketing alone.

After a timeout with an uncertain Pinterest result, verify whether the pin exists before retrying. If it cannot be resolved, leave one Needs review item; do not risk a duplicate. Resuming after downtime must not dump all missed slots at once. Preserve quiet hours, spacing and the daily cap. Measure real lateness; do not promise publication at an exact second.

Sources: [Activepieces flow control](https://www.activepieces.com/docs/build-pieces/piece-reference/flow-control), [execution limits](https://www.activepieces.com/docs/install/reference/limits), [webhooks](https://www.activepieces.com/pieces/webhook), [pricing](https://www.activepieces.com/pricing), [Cloudflare cron](https://developers.cloudflare.com/workers/configuration/cron-triggers/).

## 8. Account editing and the interface contract

Accounts contain identity/connection, default niche and posting schedule. They do not contain the website batch URL, a compulsory written style brief or example-pin upload controls.

Every account starts collapsed. Settings opens only that account. Compare normalized current values with the saved values, not keystroke count: delete a letter and put it back, or select the original option, and there is no change. A true edit shows a green border plus labelled Save changes and Cancel. No edit shows Hide settings. Editing a field must not republish a flow. Saving should report whether the website and Activepieces update both finished; failed application retains a recoverable draft with Retry.

Connection lists refresh from Activepieces. A replaced, expired, deleted or externally changed flow must not silently leave a false Running badge. Reconcile external changes and detect draft/version conflicts; never overwrite changes in either system without a clear resolution. An absent remote flow gets a clear removed state, not a newly created duplicate.

Use short labels, predictable Back navigation, preserved focus/scroll, visible keyboard focus, large touch targets and solid readable surfaces. Motion responds immediately and remains interruptible. Support reduced motion, phone widths and text zoom. Use the owner's fixed black theme and English only. This replaces the earlier automatic light/dark and French/Arabic/RTL scope. Loading preserves layout; unavailable data is not a fake successful count.

## 9. Build order after approval

| Step | Deliverable | Required proof |
|---|---|---|
| 1 | Agree this behavior and visual direction | Owner identifies omissions and approves the complete proposal |
| 2 | Complete new clickable prototype | Whole-card navigation, creation choice, saved-key Back/Continue, mixed requests, account dirty states, deletion recovery, empty/error/loading views |
| 3 | Prove risky integrations in isolation | Permitted catalog access, historical pin coverage, actual queue counts, resumable creation handoff, varied scheduling/usage, pause/cancel/retry behavior |
| 4 | Implement data and publishing contracts | Catalog/product IDs, per-pin destination, batch snapshots, content states, durable schedule and conflict-safe Activepieces reconciliation |
| 5 | Implement the approved interface | Useful progress, mixed builder, optional brief/examples, collapsed accounts and accessible English phone behavior |
| 6 | End-to-end acceptance and rollout | Actual completed mixed batch and destinations, unchanged protected accounts, no duplicates after injected failures, honest queue coverage, unassisted beginner completion |

Only after the prototype and integration proofs should the corresponding production rebuild proceed. Do not change original flows or the shared Sheet merely to demonstrate the proposal. Test scope remains the isolated @stunningcrochet setup; Crochet Simplified is excluded.

Acceptance examples include amounts above the old limits; mixed product/category/no-link destinations; repeated requests for the same product with fresh creative; product rotation; incomplete catalog/history states; source changes during generation; account switch/reference isolation; zero-change Save behavior; failed saves and navigation recovery; exact planned timestamps and delayed-run handling; and duplicate/timeout protection.

## 10. Current implementation state

This is a proposed rebuild, not a claim that these features exist. The last verified application release is recorded in PROGRESS.md. Earlier partially written saved-key/creation/draft-removal code is still uncommitted and unpublished; do not deploy it as part of this design review. Do not delete the three production drafts during the review pause.

Next action: build the complete black, English-only clickable prototype authorized by the owner, then obtain its approval before the production rebuild. No live-account change is required for this prototype stage.
