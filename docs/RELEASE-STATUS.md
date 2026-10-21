# Release status — 21 October 2026

All committed website fixes through d93debf are deployed at https://automation.houdaifa.dev. GitHub run 39582332517 passed Build and test and Deploy production. The checked release includes 78 runtime checks, ten flow-execution checks and 41 engine checks. Public health, private-access and development-login restrictions pass.

## Bugs found and fixed

| Problem | Fix | Proof and limits |
|---|---|---|
| Choosing an existing setup could fall through to creating a new remote flow when import failed | Existing-only intent cannot deploy a new flow; an explicit new-setup choice is required | Automated regression; real read-only import succeeded without creating another flow |
| Some existing Pinterest profiles did not import | Accept supported legacy names with spaces and daily caps different from posting-hour counts | Automated legacy regression and real @stunningcrochet import; the friend's specific account was not inspected |
| Existing Telegram setup requested another bot token | Reuse the selected saved connection; show token entry only for adding/replacing a bot | Browser reuse proof; fresh-bot end-to-end acceptance remains separate |
| Back to the first setup step could demand the API key again | Saved connection shows Continue and optional Change API key | Real production Back/Continue check |
| Adding an account/update failure could trap the user | Guided connection detection, saved draft and explicit retry/update action | Browser guide proof; real second-profile update not verified |
| Telegram polling could show stale or premature errors | Wait for a selected connection, ignore old responses and clear recovered Telegram errors only | Checked implementation; whole-product checks pass |
| Repeated create/deploy/import retries could duplicate managed flows | Reuse operation identity and created flow, bind imported flows, reject duplicate active profiles | Automated retries/isolation checks and read-only existing-flow proof |
| Delete could fail on an empty successful provider response | Accept empty success, pause first, verify remote absence, then archive settings | Automated provider sequence; live draft remove/restore passed; live deployed-flow deletion remains unverified |
| Returning home or changing pin modes was confusing and could jump scroll | Clear Automations breadcrumb, whole-card navigation and preserved in-place focus/scroll | Saved real browser/layout checks; black workspace deployed |
| New setups inherited unwanted accounts and settings were visually crowded | New setups start empty; reuse only available connections; collapsed settings with net-change save state | Automated isolation/empty setup checks and prototype/browser evidence |
| Category scanning included privacy/navigation/unrelated recommendations | Product-card/listing discovery, related-section exclusion and strict category membership | Exact adult-clothing category: 15/15, no missing or unrelated URLs |
| Catalog scans missed later pages | Follow category-preserving pagination, including Next inside navigation | Real catalog: 102 products across five pages; flower category: nine |
| Partial/blocked listings could misrepresent inventory | Report incomplete/unknown totals and unavailable access; offer explicit automatic research or manual links | Automated access cases; real unavailable Gumroad scan recovered to a successful request |
| A store URL alone could not prepare a product request | Default automatic research with editable count; manual exact selection remains available | Real Etsy, Gumroad and independent-catalog request delivery; actual selection is done by the creation session |
| Product allocations encouraged blocks of the same product | Deterministic round-robin order across creation parts and mixed Sheet insertion instructions | All 64 slots of eight products × eight pins tested; real first-25 preview checked |
| Old saved requests kept outdated short instructions | Refresh prompt revision from immutable saved inputs without changing batch identity | Real saved-request read-back and API regression |
| Creative instructions allowed repetitive scenes or unsupported offer claims | Require source comparison, distinct underlying imagery, exact products and verified free/paid/file-type facts | Delivered prompt inspected; rendered image quality is not yet verified |
| Large repeated instructions wasted request space | Shared compact workflow, reusable dated research and bounded order preview | Same saved 64-pin prompt: 26,225 → 11,259 characters, 57% shorter; billed usage not measured |
| Automatic product selection could change when resuming | Save/reuse resolved batch product URL/count/order plan before images; hold unavailable products | Delivered revision 2026-10-21.7 and automated directive check; execution acceptance remains open |
| Changing a schedule could block replacement slots or reroll other accounts | Atomic revision/job migration, future cancelled-slot replacement and unchanged-account job preservation | Automated multi-account regression; actual revised-schedule publication remains unverified |
| Schedule editing required leaving content creation | Collapsed New pins controls shared with account setup/settings, adaptive gaps and exact clocks | Local real UI/API checks at 320/390/1440px; same-flow running/paused updates with simulated provider |
| Hour-only scheduling could not represent requested minutes/varied times | Stored minute jobs, spacing, single-use claims, pause/version checks, missed-slot skips and uncertain-response holds | Automated scheduler/engine checks; dispatcher deployed; actual revised-schedule publication still unverified |

These are confirmed code mechanisms and verified release changes. They do not prove the exact cause of every error on a friend's inaccessible account. New capabilities and prompt requirements are identified above where the issue was a missing feature rather than an observed provider failure.

## Can friends start?

Google sign-up is open. Friends can sign in, reconnect their Activepieces project and choose an existing automation or a separate new setup. Start with a small reviewed batch. The website prepares research/creation instructions; it does not create images in the background. The creation session checks its Google Drive/Sheets access first, verifies uploaded media and saved rows and marks passing pins Ready automatically. Incomplete pins remain Draft with a reason; no member-approval step is required for verified pins.

Existing remote automations are not automatically rebuilt by deploying this website. Read-only import preserves their original engine and schedule. Updating a remote flow is a separate explicit member action.

Remaining before a broad unattended-use recommendation: actual generated-pin fidelity, revised-scheduler live publication, deployed-flow deletion/recovery and automatic dispatcher releases. Full Etsy/Gumroad server inventory access is not certified. The real Gumroad server scan remains unavailable, with an explicit research/manual-link recovery.

## Fresh database

The owner requested clearing all website data on 21 October. A private verified backup was saved first. All 20 application-data tables now have zero rows, including members, sessions, automations, integrations, saved requests and scheduling jobs. Schema and migration history remain. See proof/database-reset-2026-10-21.json.

Everyone must sign in and reconnect/import again. External Activepieces flows, Google Sheets and Pinterest accounts were not deleted or edited. Independently scheduled remote flows can continue; the database reset removes website-managed jobs and saved access, not external schedules.

## Automatic Ready policy update

The owner explicitly changed the previous Draft-review policy on 21 October. Workflow revision 2026-10-21.8 verifies the creation session's Google identity/access and exact Sheet/folder permissions before research/images, then marks only verified batch rows Ready with saved-status read-back. It does not promote unrelated old Drafts or directly publish. Internal Pin IDs may be supplied uniquely by the batch; the engine fills blanks. Pinterest Pin ID is a separate engine-managed result, never invented by the prompt.
