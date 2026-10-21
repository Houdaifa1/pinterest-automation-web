# Pinterest Autopilot Web — complete handoff

Read this whole file before doing anything. It contains every decision the owner already made, what already exists and
works, and exactly what to build next. Current status, 21 Oct 2026: **the owner explicitly authorized the real rebuild, production deployment and thorough production testing. This supersedes the earlier review pause. Use the checked black English-only prototype in docs/prototype-v2/ as the visual reference. Finish and test the earlier unfinished source changes before deployment.**

The latest live-test identity is **hhdrahm@gmail.com**, previously verified on production with **@stunningcrochet**. On 21 October the owner requested another complete fresh start: all website member data and sessions were cleared after a verified private backup. The browser is now signed out. Sign in and reimport the existing setup for further acceptance; the prior website automation ID is no longer valid. Preserve the original running flow and its resources; use an isolated flow and Sheet for remaining publishing acceptance. **@crochet_simplified is excluded from test posting.** crochetsimplified.com is a content source, not permission to post to that excluded profile. Both website resets have verified private backups; the latest is .private-backups/before-reset-2026-10-21.sql. Respect the saved browser block on the old local prototype origin.

Latest checks: the exact adult-clothing category returns all 15 products with no unrelated links; the complete pattern catalog returns 102 across five pages. Store/catalog URLs alone are accepted with Choose products for me. Actual product selection happens in the creation session and must save a batch-scoped resolved plan before images, then reuse it on resume. Prompts adapt to any niche, retain exact-product and verified-offer checks and rotate products across parts. The measured 64-pin prompt is 57% shorter in characters; billed tokens are unmeasured. Gumroad's optional server scan remains unavailable in production; explicit recovery to automatic research or manual product URLs is provided. This is not proof of complete storefront access or generated-pin quality.

Outstanding acceptance: real generated image fidelity, actual revised-scheduler publication, deployed-flow deletion/recovery and dispatcher automatic releases. Do not describe these as finished based on prompt delivery or simulated tests.

Source URLs, optional briefs and example pins belong in New pins; account settings stay collapsed; mixed-source requests, catalog planning, clear queue coverage and varied scheduling follow REBUILD-PLAN.md. Black replaces the green canvas; English-only replaces French/Arabic requirements. Do not claim readiness without passing checks and actual publication evidence.

Current creation policy, 21 October: the owner explicitly removed the member-approval gate. New prompts must check this creation session's Google Drive/Sheets connections, exact Sheet/account/folder and write/upload permissions before research or images, then create, verify uploads and saved rows and set passing pins Ready automatically in the same run. Draft is temporary or for incomplete/failed pins only. Never promote unrelated old Drafts or directly publish from the content prompt. Older Draft-review requirements below are superseded. Access failures require the exact missing connection/permission; website sign-in is not creation-session Google access.

Current schedule policy, 21 October: the owner clarified that New pins scheduling applies only to that batch and returns to the account default afterward. The old global New pins Save & update editor is superseded. Use Account default / This batch only; persist the optional daily amount and varied/exact schedule with the batch. Queue supports correcting an existing tagged batch independently of cleared request history. Activate from actual Ready rows, retain its scope until eligible Ready rows finish, then return to the next batch/default without rewriting recurring account/Sheet settings. Protected authorization restricts the batch and exact runtime cap. Older engines need one same-flow settings-only update, initiated through the save action. Per-day plans preserve stable randomness, original/default one-off edits and removals and other profiles' jobs. Automatic spacing remains adaptive. The owner's existing cbd862ca-ef80-4f33-bb34-b0bba863721e batch requests six varied daily posts; account defaults remain five fixed times. Release/current-batch acceptance is in progress.

Current existing-settings policy, 21 October: existing-flow review shows saved API notification choices. Opening edits adopts the selected flow read-only first, preserving its recipient independently of website sign-in. Published provider changes refresh clean website settings on open; Refresh from Activepieces supports explicit reload, with revision-checked discard for conflicting website drafts. Unsupported workspace/structure/website-scheduler changes stop safely. Refresh never writes the remote flow. Website-only metadata/history remain local.

Current live acceptance, 21 October: the owner's Chrome identity is houdaifadrahm@gmail.com. Its original flow Z7mqzzY3SmpWq4MCCqEDE had a daily maintenance trigger and website callback referencing a record removed by the reset. The owner authorized fixing this live queue. Connect live queue repaired the same flow/Sheet through a successful settings-only run; complete snapshots show crochet_simplified 84 Ready and hdrahm 15 Done. Imported website-managed flows must show reconnect state, not imply publishing is healthy because ENABLED. Home and Queue now show actual recorded totals, stored slots and recent outcomes. d076e4b adds same-day one-slot Change time without rebuilding the flow; 138 checks and CI 39612556967 passed. The owner requested moving the existing Crochet Simplified 15:00 slot to 14:12 for a real execution test; this is permission for that existing-content timing test, not for injecting unrelated test pins into the account. The owner saved 14:10 instead: actual publication completed at 14:11:11 (run c8x95JTNze6lc1ysYJMB7); snapshot afterward has one Done and 83 Ready. See proof/live-slot-publication-2026-10-21.json. Day navigation and colored snapshot charts are released. The owner subsequently removed Add time and Enable day controls after a busy-update page failure; retain the date picker/arrows and existing-slot Change/Remove time. Concurrent reconciliation now returns pending instead of a page error. e6374c8 passed CI 39617991497 with 142 checks; the actual owner record/page recovered, original settings remain and no extra slots were added. Phone chart/calendar visual acceptance remains open.

---

## 1. Who the owner is and how to work with him
- Houdaifa (git name **hdrahm**). Not a programmer. Lives in Morocco (time zone: Africa/Casablanca = GMT+0 since 20 Sep 2026).
- He wants **world-class, production-grade** results and hates anything that "looks AI-generated", confusing, or half-done.
- Talk to him in **short, simple English**: numbered steps, tables, no jargon. Recommend one option when you ask.
- **Show, don't describe**: when discussing design, show real screenshots (real products, or real rendered screens).
- Never claim something works without proof (a passing test, a screenshot, a live check).
- Ask before anything risky or outward-facing (deploying, deleting, changing his live accounts).

## 2. What already exists (works in production today)
**The Pinterest Autopilot automation** — runs in **Activepieces cloud**, posts pins to Pinterest from a Google Sheet,
sends messages by email/Telegram, daily report. Its full source is copied into `engine/` (this repo is now its home).
- `engine/src/` — the automation's code steps (lib.js shared library, workspace.js, prepare.js, account-engine.js, report.js).
- `engine/tools/build.py` + `flowkit.py` — builds the Activepieces flow template (`dist/poster.template.json`) and the
  current Control Panel (`dist/Pinterest Autopilot.html`). Run: `python3 engine/tools/build.py` (from `engine/`).
- `engine/panel/` — today's Control Panel (single HTML file, `panel.html` + `generator.js`) and the **Codex prompt**
  template `codex-prompt.md`. `generator.js` holds all logic worth reusing: validation, the import file builder,
  categories (crochet / food / home / printables / diy / other), website mode, batches, the Codex prompt builder.
- `engine/tests/` — 40 automated tests (`node --test tests/engine.test.mjs` from `engine/`), with a fake Google/Pinterest/
  Telegram world (`fake-world.mjs`). Keep them green.
- `docs/automation-changes-log.md` — everything that was changed in the automation, in order.

**How the automation works**
- One Activepieces flow per "autopilot": schedule trigger every hour 06–23 (UTC for Morocco), steps:
  Google login → Gmail login → Telegram login (optional) → Prepare (creates/repairs the spreadsheet, applies the panel
  config once per version, decides who posts this hour) → loop over due accounts (Pinterest login by connection
  externalId → publish + daily sync) → daily report.
- Logins are read with the `read_connection` piece using each connection's **externalId**.
- The panel's settings travel inside the flow as a JSON `config` (version string; applied once; several automations may
  share one spreadsheet and only handle their own accounts).
- Spreadsheet "Pinterest Autopilot" (in the bot Google Drive): tabs Guide, Accounts, Plan, Boards, Products, Settings, Log,
  and one "Pins – <account>" tab per account. Codex (ChatGPT Plus) fills pins via the prompt; the automation posts them.
- Content creation is done by **Codex** with the prompt from the panel's **New pins** tab (batches: page links × counts,
  "no link" pins, or website mode "next rounds"). Categories change the prompt (food = recipe infographic design, etc.).
  Website mode: Codex reads the site catalog every batch, keeps a Plan of product / category / winner rounds, counts
  existing pins (also hand-made ones on the live profile), 6 pins per round by default.

**The owner's live setup**
- Two Activepieces accounts (both run the latest automation version):
  - "Houdaifa's Platform" — project `hiVhlYjsprdzojpqRbqTr`, flow `Z7mqzzY3SmpWq4MCCqEDE` — accounts **hdrahm** + **crochet**
    (crochet = @crochet_simplified, the Pinterest version of crochetsimplified.com). Email only (no Telegram login).
  - "Hdrahm's Platform" — project `CiHSeSLHmcEvrPwJxz4MR`, flow `XzwY8dymDzP3dszCe23u8` — account **stunningcrochet**.
    Email + Telegram.
- Both share one spreadsheet. Friends (3–4) run their own copies (one friend: Moroccan food recipes).
- **Activepieces API keys exist on these free platforms** (`GET /api/v1/api-keys` returns 200; one key was created
  15 Oct 2026). This is the foundation of the new website.

## 3. What to build: the website
A private web app at **`automation.houdaifa.dev`** that replaces the HTML Control Panel. Like entering Activepieces or
Vercel: you sign in, see your **Autopilots**, click one, see everything, change things, apply them, run them.

### 3.1 Decisions already made (do not re-open unless you find something clearly better — then propose it)
| Topic | Decision |
|---|---|
| Hosting | **Cloudflare** (Pages for the app, Workers/Pages Functions for the API). Free tier. `hudaifa.dev` DNS must be on Cloudflare (check; moving DNS is free). |
| Sign-in | **Open sign-up with Google** ("Continue with Google", own OAuth/OIDC in the Worker, scopes `openid email profile` only — no Google review needed). No invite list. Needs a short privacy page. Optionally email one-time code. |
| Admin | An **Admin** page only for `houdaifadrahm@gmail.com`: all users (email, name, sign-up, last active, autopilots, accounts, deployed or not), totals, **block / unblock / remove website access** with confirmation. Blocking revokes website sessions and website actions. Removing website access never deletes Google or Pinterest accounts. Admin never sees API keys or tokens. |
| Data | **Cloudflare D1** (SQLite). Everything keyed by the signed-in user; server checks ownership on every request. Autosave; setup versions (restore); no file save/open ever again. Rate limits against abuse. "Delete my account". |
| Activepieces | Each user pastes an **Activepieces API key** once. Stored **encrypted** (AES-GCM, key in a Worker secret), never returned to the browser. With it the server does everything: list connections (by name/email — **no connection IDs shown anywhere**), create the **Telegram** connection from the bot token, create/update/publish the flow, pause/resume, "Run now", read runs. |
| Telegram | User pastes the **bot token** on our site → we verify with Telegram `getMe`, create the Activepieces connection ourselves, open his bot (t.me link), detect "Start", send a test message. |
| Cost | $0 (Cloudflare free plans; only the domains he already pays). |
| Style | **Vercel's own design system "Geist"** — exactly like the Vercel dashboard (see `docs/design-references/7-vercel-style-home.png` and `approved-home-vercel-style.html`, which the owner approved). On 19 Oct the owner approved the clearer Geist refinement: `docs/design-references/21-home-geist-clearer.jpg` and `home-study-geist.html`. Use that as the current home direction. Geist + Geist Mono fonts, Vercel greys, black primary buttons, status dots, top bar with "/" breadcrumb, tabs with black underline, search + "Add New…", cards. Own small logo (never Vercel's triangle). Automatic dark mode. Recommended implementation: **shadcn/ui-style components themed with Geist tokens** (Radix primitives + Tailwind) — but see 3.4: first research better options. |
| Languages | English, Arabic (proper right-to-left), French — one language at a time, never mixed. |
| Users | Built for people like the owner's 60-year-old father: impossible to get wrong. |

### 3.2 Screens and features
**Top level (Vercel-style):** top bar (logo / account name + plan badge / Feedback / avatar), tabs **Overview ·
New pins · History · Settings** (+ Admin for the owner). Overview = search + "Add New…" + a "Last 24 hours" box (pins
posted, waiting, next post, errors) + a "Needs you" box + **autopilot cards** (name, accounts, status pill: Running /
Needs pins / Setup step n of 6 / Stopped, last post, category).

**Inside an autopilot:** tabs **Overview · Accounts · New pins · Runs · History · Settings**.
- Overview: status in plain words + Today numbers + big buttons **Run now · Pause/Resume · New pins**.
- Accounts: one card per Pinterest account — posting times (click hours or "N a day, spread evenly"), pins per day,
  category, pins come from (niche / my website + pins per product, default 6), niche, picture style, on/off.
  Pin style: uploaded example pins, thumbnail previews and simple removal; no written style field or design brief; each account owns its references and style version. Keep recognizable identity while varying scenes, layouts, crops and headlines; trend research must cite current evidence. Copied prompts must identify the correct references and verify image access; plain text copying alone does not attach image files. See `docs/PRODUCT-REQUIREMENTS.md` for the proposed handoff and proof gates.
  Changes autosave as drafts; a bar "Changes ready → **Apply**" (like Vercel's Redeploy) = update flow + publish +
  run once + show "Applied. Next post 15:00". New Pinterest connections in Activepieces appear by themselves.
- New pins: today's batch builder (account, page links × counts, pins without link, website "next rounds × pins per
  round"), total + days, **Get Codex prompt** (ready-to-paste instructions, not finished pins; include reference handoff). History: copying the **same** batch again updates the same entry
  ("copied 2×") — never duplicates; "Mark as sent", "Copy again", "Make similar", delete.
- Runs: every Activepieces run (time, ✓/✕, what happened in plain words), failures explained with a **Fix** button.
- History: batches + every setup change with **Restore**.
- Settings: notifications (email / Telegram, report time), logins (dropdowns, no IDs), time zone, pause, delete
  (also removes the Activepieces flow after a clear confirmation).

**First-time setup = one wizard, a perfect chain, no back-and-forth (Stripe checklist + Vercel auto-detection):**
1. Sign in with Google.
2. Connect Activepieces: button opens the exact API-keys page in a new tab, 3 short steps, paste → verified instantly
   ("✅ Connected to Houdaifa's Platform"). Link to create an Activepieces account if needed.
3. Notifications: email; Telegram on/off → paste bot token (BotFather guide) → we do the rest.
4. Connect logins in Activepieces: live checklist (Google Sheets, Gmail, Pinterest ×N, Telegram) that **ticks itself**
   by polling the API; shows which email each uses; catches mistakes ("Gmail and Sheets use different accounts").
5. Pinterest accounts: cards created automatically from the detected Pinterest logins, smart defaults.
6. Go live: **Deploy** with live progress (created ✓ published ✓ first run ✓ spreadsheet ✓ → Open spreadsheet), then
   "Make your first pins". One-time guide: connect Codex to the bot Google Drive.
"Can't go wrong" rules: one thing per screen; paste anything (we recognise keys/tokens/links and put them in the right
place); choices instead of typing; every error has exactly one next action; autosave + resume on any device + Undo;
Continue only lights up when the API confirms the step; big readable text; works on phone; any browser.

### 3.3 Things to PROVE first (before building on them) — on the owner's account, with his permission
With an Activepieces API key, can the server:
1. list connections with display names / account emails (`GET /api/v1/app-connections?projectId=…`);
2. create a SECRET_TEXT connection (Telegram Bot) (`POST /api/v1/app-connections`);
3. update a flow (`POST /api/v1/flows/{id}` with `{type:"IMPORT_FLOW", request:{displayName, trigger, schemaVersion}}`),
   publish it (`{type:"LOCK_AND_PUBLISH", request:{}}`), pause/resume (`{type:"CHANGE_STATUS", request:{status}}`);
4. start a run on demand ("Run now") — find the right way for a schedule-trigger flow;
5. read runs and step outputs (`GET /api/v1/flow-runs?projectId=…`, `GET /api/v1/flow-runs/{id}`).
(These endpoints were used successfully with a browser session token; confirm they work with an API key.) Write the
results to `docs/RESEARCH.md`. If something is impossible, propose the simplest alternative and ask.

### 3.4 Build order (each step ends with proof he can see)
0. **Design research first (his explicit request — the first thing you do):** deep-search the best-designed
   dashboard / automation / onboarding products and design systems (Vercel Geist, Linear, Stripe, Raycast, Resend,
   Cal.com, Activepieces, shadcn/ui, Radix Themes, Untitled UI, etc.). Show him **real screenshots** of the best
   candidates and an honest comparison with the approved Vercel/Geist direction; if something is truly better, show it
   rendered with his data. He decides. No app code before he approves.
1. The API proof (3.3).
2. Clickable prototype of every screen in the approved style (fake data, no backend) → he clicks through and corrects.
3. Backend: D1 schema, Google sign-in, sessions, ownership checks, encryption of keys, rate limits, Admin API. Tests
   (including "user A cannot read user B").
4. Setup wizard with live detection + Deploy (reusing `engine/` to build the flow and the Codex prompts).
5. Autopilot pages: Apply / Run now / Pause, Runs, New pins (no duplicate history), History + Restore, Settings.
6. Deploy to `automation.houdaifa.dev`, move his two autopilots in, his friends sign up and go through the wizard alone.

## 4. Repository rules
- **Tracking files** (keep them current, they are how Codex and Claude hand work to each other):
  `AGENTS.md` (rules), `docs/HANDOFF.md` (this), `docs/PROGRESS.md` (every step: status, date, who, proof),
  `docs/DECISIONS.md` (one entry per decision), `docs/RESEARCH.md` (findings with sources).
  Start every session by reading AGENTS.md, PROGRESS.md and the end of HANDOFF/PROGRESS; end every session by updating
  PROGRESS.md with "done / half-done / next step / open problems".
- **Commits**: small, after each working step, in his exact style and with **no AI mention anywhere** (no co-author
  lines, no "generated by", nothing in code comments or docs either):
  `hdrahm<oct 19> : what changed, in plain words` (lower-case month, day without zero, then a short plain sentence).
  Git author is already set in this repo: `hdrahm <129623963+Houdaifa1@users.noreply.github.com>`.
- Never commit secrets (API keys, tokens, connection IDs with emails, `.dev.vars`). Use `.dev.vars` / Worker secrets.
- Only permissively licensed libraries and open fonts (Geist is OFL).
- Never touch his live Activepieces flows, spreadsheet or Pinterest accounts without asking first.
- Keep `engine/` tests green; the live automation is built from `engine/`.

## 5. How the live automations are updated today (until the website does it)
1. `cd engine && python3 tools/build.py` → `dist/poster.template.json`.
2. Read the live flow (Activepieces API `GET /api/v1/flows/{id}`): its connection externalIds (steps `step_1` Google,
   `step_2` Gmail, `step_tg` Telegram) and the `config` input of `step_3`. Save that config to a local JSON file
   (never commit it: it holds emails and IDs).
3. `node tools/make-import.mjs dist/poster.template.json out.json <google> <gmail or -> <telegram or -> Africa/Casablanca config.json`
   (`-` = that login is not used; the step is removed). Keep the same config version to avoid a "settings updated"
   message, or a new version to re-apply settings.
4. Import into the existing flow (UI: name menu → Import; or API `IMPORT_FLOW`), **Publish**, then **Test Flow** once.
   Check the spreadsheet (new tabs/columns) and the run result.
Changes only in `engine/panel/` (Codex prompt, categories, website mode) do NOT need a re-import: they only change the
Control Panel file (`dist/Pinterest Autopilot.html`, also copied by hand to the owner's Desktop folder
"Pinterest Autopilot/Pinterest Autopilot Control Panel.html", which friends use today).

## 6. Practical lessons (learned the hard way)
- Morocco moved to GMT+0 on 20 Sep 2026; Activepieces/Node/Chrome still think GMT+1 → `liveZone`/`scheduleZone`
  map Africa/Casablanca to UTC. Gmail/Chrome show times one hour ahead of his real clock; trust the Mac clock.
- Activepieces cloud starts scheduled runs 2–7 minutes late. Normal.
- The owner's two Activepieces accounts share ONE spreadsheet; each automation only handles the accounts in its own
  config, and "Config applied" keeps a list of versions (never re-apply each other's settings).
- Activepieces does not show connection IDs in its UI (that is why the old panel needed a bookmark). The website must
  hide IDs completely.
- Codex wrote rows at row 1001 once (below 1,000 empty dropdown rows): prompts must say "write right under the last
  filled row".
- Teachers Pay Teachers banned AI content (Oct 2026) — irrelevant here, but do not suggest TpT.
- Free Activepieces credits: about 1 per run; the hourly flow uses ~540/month per account, inside the free 1,000.
- Friends sign up to Activepieces by invitation into their own platform; one friend runs a Moroccan-food account.

## 7. Access the owner gives you
- **GitHub:** create a **private** repository (suggested name `pinterest-autopilot-web` on his account Houdaifa1), add it
  as `origin`, push `main`. Commits keep his style and author; never add AI co-author lines. Ask before making anything public.
- **Cloudflare:** you may create the Pages/Workers project, the D1 database, DNS for `automation.houdaifa.dev` and any
  API token you need (least privilege, named clearly, e.g. "autopilot-web deploy"). Store every secret only as a
  Worker/Pages secret or in a local `.dev.vars` (git-ignored): Google OAuth client id/secret, session secret,
  encryption key for the Activepieces API keys. Never print secrets in chat, logs or commits.
- **Google Cloud:** the Google sign-in client (OAuth consent screen with `openid email profile`, authorised redirect
  `https://automation.houdaifa.dev/auth/callback` plus the local dev URL). Walk him through any step only he can click.
- Ask before: deploying to the live domain the first time, changing his live Activepieces flows, deleting anything.

## 8. Latest session requirements and live-test scope — 19 Oct 2026

- Home option B is approved; do not ask the owner to compare the research options again.
- Open Google sign-up, no invites. Owner moderation controls, fast guided screens and pin-style image references are required.
- The current content workflow is: copy a prompt into Codex → create images/rows → Activepieces publishes queued pins. Style-reference generation belongs to the creation workflow.
- Latest live-test authorization: **Hdrahm’s Platform → @stunningcrochet only**, verified in Chrome and explicitly confirmed by the owner. This replaces the earlier hdrahm target. **Never publish test pins to Crochet Simplified.**
- Owner allowed live posting tests on the chosen test account. Do not run a shared production flow that could publish on excluded accounts. Prefer an isolated test flow with a verified single-account allowlist.
- User authorization is recorded; routine tests within this scope do not need another permission question. New security-sensitive browser grants still follow tool policy.
- API-key proof completed: docs/proof/activepieces-api-key-2026-10-19.json and docs/RESEARCH.md. Run now works through ON_LATEST_VERSION retry of a retained scheduled seed; bootstrap and retention recovery are required. The original flow is unchanged and the separate proof flow is paused.
- Activepieces run outputs can contain credentials. The website must expose allowlisted summaries only.
- Clickable prototype ready: docs/prototype/README.md and http://127.0.0.1:8766/. All service operations are simulated. Local uploads, copy counts and prompt-and-images ZIP are demonstrated. Owner approval is pending; no app implementation before it.
- Next: owner prototype review, then backend in build order. French/Arabic, private reference delivery/storage and production acceptance remain build work. Test evidence: docs/prototype/qa-results.json and package-proof.json.

## 9. Latest prototype corrections — 19 October 2026

- Owner found “Prepare batch” and account addition confusing. Home/Accounts now show **Add Pinterest account**. The guide includes Activepieces New Connection → Pinterest → sign in → Save, automatic detection/defaults and Review & activate. All connection actions in the prototype are simulated.
- “What should we keep?” is removed. References drive automatic style inference; no user-written style brief. No-link batches use the saved niche.
- **Get Codex prompt** clearly describes the deliverable. Intended completed-product sequence: setup creates the automation + Sheet → Codex creates and reviews pins using references → Codex fills the Sheet → scheduled posting.
- Latest evidence: docs/prototype/clarity-review-results.json (13 focused checks and 18 layout measurements), revised-package-proof.json, screenshots 14–20. Engine build and all 40 tests passed again.
- Real Google/Pinterest website connection, media delivery, image generation acceptance, security and production performance are not proved by the preview. Full prototype approval remains pending. Continue the owner's review before backend implementation.

## 10. Current approval and terminology — 19 October 2026

The owner explicitly approved the prototype and requested going live. This is authorization to implement and deploy the website; do not ask for prototype approval or first-deployment permission again. The protected live-account scope remains unchanged.

Use **Automation** throughout the interface. One automation contains one or more **Pinterest accounts**. Show account handles and their count inside each automation card. Remove unrelated friend examples from the owner’s workspace. Create automation is the home action; Add Pinterest account belongs to its automation. Use global Automations navigation, local Summary, and a visible breadcrumb home. In-place edits and pin-mode changes must preserve scroll and focus.

Next: verify those corrections, then backend and real UI, live integration tests and deployment. Passing preview tests does not establish production readiness.

### 21 October 2026 — creative requirement clarification

The owner requires fresh product photography/mockup concepts, not the same photograph under different text templates. Keep product identity exact while varying supported camera angles, positions, settings, styling and lighting. Wearable crochet can use believable flattering adult fashion mockups; artwork can use appropriate clothing/mug/bottle mockups preserving the exact design; digital resources need truthful actual previews and suitable use contexts. Small crochet color variations are explicitly allowed as inspiration, without claiming unverified purchase options. Compare output against source product references and reject product mismatch or near-duplicate scenes. Shared rules are in server/pin-creative-direction.ts and are included in both website prompt formats.


### 21 October 2026 — rotation and accurate offer text

The owner requires mixed product order: eight products × eight pins must rotate A1–H1, A2–H2, and so on. The first 25 slots are previewed by the website; the prompt must preserve that sequence across creation parts and Sheet insertion. Destination allocation lists are counts, not posting blocks. Do not silently rearrange existing live content. Keep verified free crochet patterns obvious in the image using readable, proportionate headline/badge text. Distinguish free web instructions from paid PDFs, paid products, samples, free shipping and optional-payment resources. Adapt copy, imagery and research to actual item type and the account's micro-niche, not just Etsy/Gumroad/store labels. Exact external store/category cases need their actual URLs and access; generic prompts do not establish full catalog integration. See server/pin-order.ts, server/pin-content-strategy.ts and docs/RESEARCH.md.
