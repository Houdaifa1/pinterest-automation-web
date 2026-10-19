# Pinterest Autopilot Web — complete handoff

Read this whole file before doing anything. It contains every decision the owner already made, what already exists and
works, and exactly what to build next. Status at handoff (19 Oct 2026): **planning finished, nothing of the website is
built yet.**

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
A private web app at **`autopilot.hudaifa.dev`** that replaces the HTML Control Panel. Like entering Activepieces or
Vercel: you sign in, see your **Autopilots**, click one, see everything, change things, apply them, run them.

### 3.1 Decisions already made (do not re-open unless you find something clearly better — then propose it)
| Topic | Decision |
|---|---|
| Hosting | **Cloudflare** (Pages for the app, Workers/Pages Functions for the API). Free tier. `hudaifa.dev` DNS must be on Cloudflare (check; moving DNS is free). |
| Sign-in | **Open sign-up with Google** ("Continue with Google", own OAuth/OIDC in the Worker, scopes `openid email profile` only — no Google review needed). No invite list. Needs a short privacy page. Optionally email one-time code. |
| Admin | An **Admin** page only for `houdaifadrahm@gmail.com`: all users (email, name, sign-up, last active, autopilots, accounts, deployed or not), totals, **block / unblock**. Admin never sees API keys or tokens. |
| Data | **Cloudflare D1** (SQLite). Everything keyed by the signed-in user; server checks ownership on every request. Autosave; setup versions (restore); no file save/open ever again. Rate limits against abuse. "Delete my account". |
| Activepieces | Each user pastes an **Activepieces API key** once. Stored **encrypted** (AES-GCM, key in a Worker secret), never returned to the browser. With it the server does everything: list connections (by name/email — **no connection IDs shown anywhere**), create the **Telegram** connection from the bot token, create/update/publish the flow, pause/resume, "Run now", read runs. |
| Telegram | User pastes the **bot token** on our site → we verify with Telegram `getMe`, create the Activepieces connection ourselves, open his bot (t.me link), detect "Start", send a test message. |
| Cost | $0 (Cloudflare free plans; only the domains he already pays). |
| Style | **Vercel's own design system "Geist"** — exactly like the Vercel dashboard (see `docs/design-references/7-vercel-style-home.png` and `approved-home-vercel-style.html`, which the owner approved). Geist + Geist Mono fonts, Vercel greys, black primary buttons, status dots, top bar with "/" breadcrumb, tabs with black underline, search + "Add New…", cards. Own small logo (never Vercel's triangle). Automatic dark mode. Recommended implementation: **shadcn/ui-style components themed with Geist tokens** (Radix primitives + Tailwind) — but see 3.4: first research better options. |
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
  Changes autosave; a bar "You have unsaved changes → **Apply**" (like Vercel's Redeploy) = update flow + publish +
  run once + show "Applied. Next post 15:00". New Pinterest connections in Activepieces appear by themselves.
- New pins: today's batch builder (account, page links × counts, pins without link, website "next rounds × pins per
  round"), total + days, **Copy Codex prompt**. History: copying the **same** batch again updates the same entry
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
6. Deploy to `autopilot.hudaifa.dev`, move his two autopilots in, his friends sign up and go through the wizard alone.

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
