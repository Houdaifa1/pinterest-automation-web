# Design research — 19 October 2026

## Recommendation, awaiting the owner

Keep the approved Vercel / Geist direction. Improve its readability and make the next action explicit. A sidebar alternative is worth comparing visually, but there is no evidence yet that it is better for this audience.

This is a design review, not a user study. No older participant has tested these proposals. Public examples were inspected without signing into any product. No live Activepieces, Google Sheet or Pinterest account was accessed. The home studies use the approved screenshot's sample names, numbers and times; these are not current results. Moroccan Kitchen is a sample, not a fourth account to add to the owner's live setup.

## What was examined

Compared home dashboards, task lists, setup, forms, status communication, navigation, typography, dark/light appearance and implementation fit. Priority: can a new user answer **Is it posting? What needs me? What do I do next?**

Sources below were opened or inspected on 2026-10-19. Captures are real browser screenshots of public pages, demos or official product imagery. Product imagery published by a company is not a hands-on test of its logged-in app. Earlier files 1–7 came from the handoff; their original capture dates and sources were not re-established here.

## Candidate comparison

These are engineering/design judgments for this project, not measured rankings.

| Candidate | What is good | Limitation for our users | What to take |
|---|---|---|---|
| **Vercel / Geist** | Quiet surfaces, strong black action, clear tabs, project cards | Small secondary text and icon menus need care; a developer dashboard is not a beginner guide | Keep the visual foundation; add explicit actions and readable text |
| **Linear** | Consistent placement, restrained icons, strong task hierarchy | Dense navigation and muted inactive labels demand familiarity | Predictable actions and reduced decoration; avoid copying its density |
| **Stripe** | Clear sections, review/edit pattern, requirements and validation drive setup | Business onboarding is more complex than our six steps | Plain setup progress, confirmed completion and review before going live |
| **Resend** | Focused lists, clear event statuses, careful surface details | Dark compact tables are less suitable as the first screen | Runs and history rows; respect light/dark preferences |
| **Cal.com** | Connect → configure → use; restrained black/white appearance | The public setup explanation is not proof of authenticated onboarding | A clear chain, useful defaults and direct scheduling choices |
| **Activepieces** | App icons, connection status, tested steps | A flow canvas exposes machinery our users should not have to manage | Detection/checklist language; keep the flow builder out of our home |
| **shadcn/ui** | Adaptable components, neutral palette, useful form/table patterns | Copying the demo adds irrelevant charts and controls | Building blocks, styled to Geist; no generic analytics template |
| **Radix Themes** | Consistent styled controls, color scales, sizing and variants | Its default accent styling changes the approved visual language | Alternative styled system; Radix Primitives remain the proposed behavior layer |
| **Untitled UI** | Clear headings, roomy forms, visible action cards | Full dashboard includes competing charts, content and sidebar extras; PRO examples need paid access | Spacing and action-card ideas; no paid dependency proposed |
| **GOV.UK** | Explicit tasks, readable labels, visible completion | Its government branding is not our desired visual identity | Setup recovery, concise labels, minimal statuses |
| **Award galleries** | Broad visual exploration | Screenshots and awards do not establish task success | Inspiration only; no evidence to replace Geist |

### 1. Vercel / Geist: strongest overall fit

Official [introduction](https://vercel.com/geist/introduction), [typography](https://vercel.com/geist/typography), [tabs](https://vercel.com/geist/tabs) and [drawer](https://vercel.com/geist/drawer) document the foundation and component behavior. Its hierarchy already matches our small collection of autopilots. Keep the top bar, underline tabs, borders and black primary actions. Avoid adopting developer terminology or tiny controls simply to imitate the source.

The approved HTML has 13–14px body/detail text, 32px buttons, a vague “Add New…” label, an unlabeled grid button and an exact Vercel triangle. Proposed refinements: 16px body, 44px main controls, “Add autopilot,” visible “Open”/“Continue setup,” and an original loop mark. Preserve the approved original file for comparison.

### 2. Linear: hierarchy, not density

Linear's designers describe reducing distracting navigation weight and making controls consistent in [A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) (12 March 2026). The official before/after image is saved. This supports restraint, but does not prove that subdued labels and compact controls suit new users. Its [start guide](https://linear.app/docs/start-guide) offers a demo and onboarding resources. Our proposal should make essential actions discoverable without learning shortcuts.

### 3. Stripe: strongest setup reference

The public [embedded onboarding demo](https://docs.stripe.com/connect/embedded-onboarding) shows a review screen with clear groups and Edit buttons. Its documented flow adapts to requirements, validates data and supports localization. This suggests a setup where detected logins determine what remains, and a final review shows accounts, schedule and notifications. The saved screenshot is a public read-only demo with Stripe's fictional data, not the owner's account. The modern logged-in Stripe dashboard was not inspected; no claim is made that its current home has a particular checklist.

### 4. Resend: excellent event lists

[Rebranding Resend](https://resend.com/blog/rebranding-resend) (1 July 2025) includes an actual published dashboard image: a clear event table with restrained status color. We captured that official image in the browser. [Introducing Light Mode](https://resend.com/blog/introducing-light-mode) explains that some users found dark mode difficult and describes deliberate color adjustments. Borrow status clarity for Runs; keep automatic appearance plus an eventual user override as a proposal. Do not copy premium material effects into routine settings.

### 5. Cal.com and Activepieces: reduce setup work

[Cal.com](https://cal.com) publicly explains three stages: connect a calendar, set availability, choose how to meet. The saved screenshot is that public explainer, not an authenticated wizard. Its [onboarding embed documentation](https://cal.com/docs/atoms/onboarding-embed) describes a contained setup flow. Our six steps should feel similarly continuous, while retaining external OAuth where required.

Activepieces documents [connections](https://www.activepieces.com/docs/admin-guide/guides/connections) and [building flows](https://www.activepieces.com/docs/flows/building-flows). Its illustrated builder clearly labels triggers/actions. Our users should see which login is connected and whether posting succeeded. They should not need to understand nodes or step outputs. These are design findings only; API-key capabilities still need the separate permissioned proof.

### 6. Systems: distinguish appearance from behavior

The [shadcn dashboard](https://ui.shadcn.com/examples/dashboard) is a component showcase, not a home we should copy. Its charts and table controls are unnecessary for two autopilots. [shadcn's MIT license](https://github.com/shadcn-ui/ui/blob/main/LICENSE.md) permits adaptation with its notices retained.

[Radix Themes](https://www.radix-ui.com/themes/docs/theme/overview) is a styled library; [Radix Primitives accessibility](https://www.radix-ui.com/primitives/docs/overview/accessibility) explains behavior such as focus, keyboard interaction and semantics. Those primitives can support a Geist appearance; using them does not certify our finished app as accessible. The [official dashboard example](https://www.radix-ui.com/themes/example-dashboard) is saved for comparison.

[Untitled UI dashboards](https://www.untitledui.com/react/components/dashboards) offer strong spacing and visible action cards. The [public preview](https://www.untitledui.com/react/iframe/dashboards/dashboard-01) is captured. Its [CLI documentation](https://www.untitledui.com/react/docs/cli) distinguishes PRO examples. Use it as a visual reference; no purchase or copied PRO implementation is proposed.

### 7. Raycast, galleries and independent usability guidance

Raycast's [UI reference](https://developers.raycast.com/api-reference/user-interface) centers on lists, forms and action panels. Its [settings manual](https://manual.raycast.com/settings) and [Interface Size release](https://www.raycast.com/changelog/macos/0-66) describe scaling text and controls together. The saved Raycast image is a promotional release illustration, not an app screenshot. A direct manual image preview was blocked; no substitute was presented as an app capture.

The inspected [Awwwards SaaS gallery](https://www.awwwards.com/websites/saas/) mixes marketing sites, UI showcases and other entries. Visual novelty alone is not sufficient reason to change a daily-use dashboard.

[Nielsen Norman Group's older-adult research](https://www.nngroup.com/articles/usability-for-senior-citizens/) and [report overview](https://www.nngroup.com/reports/senior-citizens-on-the-web/) identify readability and interaction difficulties. Only public material was read, not the paid report. Age does not determine skill; we still need actual users to test our tasks.

The [GOV.UK multiple-task pattern](https://design-system.service.gov.uk/patterns/complete-multiple-tasks/) recommends clear task names and statuses for work completed across sessions. Adapt its recovery principles; our required dependency order still follows HANDOFF.

## Concrete design proposals to test

1. Keep Geist, but use 16px body text with generous line spacing. Use Mono for times and numbers only; choose and test an Arabic companion font later.
2. Main buttons/fields: aim for at least 44px height. This is our comfort target. WCAG 2.2 AA's [minimum target rule](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html) is 24×24px with exceptions, not 44px.
3. Normal text: minimum 4.5:1 contrast; large text 3:1, following [WCAG contrast guidance](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). Test every state in each appearance; do not infer compliance from a screenshot.
4. Make “Needs you” the first useful content, with the account names and one direct action. Keep it compact when nothing needs attention.
5. Keep the meaningful numbers: posted, waiting, next post and errors. No decorative charts. “Next post” must eventually explain which account it refers to.
6. Use words alongside status dots. Show “Checking…” and “Could not check” honestly; never show a green connection merely because a token was pasted.
7. Setup: one task per page, “Step 4 of 6,” saved progress, Back, and the next required action. Explain why Continue is unavailable in nearby text. Reconnection errors retain entered settings.
8. Review before Deploy; show confirmed stages and the actual first-run result. On failure show what succeeded, what failed and one recovery action.
9. Draft changes autosave, while Apply makes them live. Explain this distinction; do not call a saved draft “unsaved.” Keep version restore available.
10. Mobile: single column, meaningful action labels, no hover-only controls. Validate keyboard focus, 200% text size, [320px reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), long French labels and Arabic RTL in the later prototype. No such implementation proof exists yet.

## Screenshot inventory

All files are under `docs/design-references/`. New browser captures use a 1440×1000 desktop viewport so dashboard structure can be compared. Some public examples are wider than the viewport; captures preserve what the page actually showed. Screenshots remain reference material, not product assets.

| File | Provenance / what it proves |
|---|---|
| `7-vercel-style-home.png` | Previously approved project home; sample data |
| `08-geist-official.jpg` | Live official system introduction; reference appearance |
| `09-linear-official-refresh.jpg` | Official 2026 before/after sidebar image opened in its article |
| `10-shadcn-dashboard-official.jpg` | Live public component demo |
| `11-resend-official-dashboard.jpg` | Browser view of official [dashboard image](https://cdn.resend.com/posts/rebranding-resend-10.jpg) from the rebrand article |
| `12-radix-dashboard-official.jpg` | Live official styled dashboard/component example |
| `13-stripe-official-onboarding-demo.jpg` | Live public read-only onboarding review demo; fictional data |
| `14-untitled-official-dashboard.jpg` | Live public dashboard preview; sample data |
| `15-cal-official-setup-explainer.jpg` | Public marketing explanation of setup; not an app screenshot |
| `16-activepieces-official-builder.jpg` | Official annotated flow-builder image inside documentation |
| `17-raycast-official-interface-size.jpg` | Official promotional image about interface scaling; not an app screenshot |
| `18-govuk-official-task-list.jpg` | Official running task-list example |
| `19-awwwards-saas-gallery.jpg` | Real public award-gallery page |

## Review status

Research, source captures and home studies are complete. The owner approved the single recommended B screen on 19 October 2026. App implementation has not started; the separately authorized API proof is next.

### Rendered options

| Option | View | Assessment |
|---|---|---|
| A — approved Geist | [Original at matching viewport](design-references/20-approved-home-same-viewport.jpg) | Most compact; preserves the existing approval |
| **B — clearer Geist, recommended** | [Rendered screen](design-references/21-home-geist-clearer.jpg), [static HTML](design-references/home-study-geist.html) | Keeps the approved character; promotes the next task, increases body text and exposes card actions |
| C — soft sidebar | [Rendered screen](design-references/22-home-sidebar-alternative.jpg), [static HTML](design-references/home-study-sidebar.html) | Borrows visible navigation and spacing from Stripe/Untitled UI; uses more width and changes the approved visual direction |

Compare [A and B](design-references/23-home-comparison.jpg), then [B and C](design-references/25-geist-sidebar-comparison.jpg). The [review page](design-references/home-comparison.html) links full-size images. The [reference shortlist](design-references/reference-shortlist.html) and [all references](design-references/all-references.html) label every source. These HTML files are standalone research documents, not the clickable prototype or app implementation. Buttons in the home studies do not perform actions.

C is an alternative to assess, not a claim that a sidebar is proven better. B is the stronger design hypothesis for the existing audience: the main task appears before the statistics, and Open / Continue setup require less guessing. This still needs validation with the owner and beginner users.

### Proof and limits

- Inspected desktop renders at 1440×1000; sample accounts and statistics appear in A, B and C. Preserved the original approved HTML and PNG unchanged.
- Inspected B at 390×844 and saved the [full phone screen](design-references/26-geist-mobile-study.jpg). Measured document width = viewport width = 390px; no horizontal page overflow in that check.
- Desktop B measurement: document width = viewport width = 1440px; font status loaded; body text 16px; both primary buttons 44px high; three sample cards present. This proves the rendered layout only.
- Source pages, live component demos and official imagery were inspected visually. Raycast's saved promotional image is not counted as an app UI screenshot.
- Engine build and all 40 existing engine tests passed (0 failed). No engine source files changed.
- Not tested here: functional navigation, API requests, usability with older participants, Arabic/French, complete keyboard behavior, complete contrast audit, dark mode or all responsive sizes. These belong to the permissioned API proof and later approved prototype/build stages.
- Owner chose B and authorized live tests on the current Hdrahm's Platform → @stunningcrochet setup. Crochet Simplified is excluded. Next: API-key proof, then the full clickable prototype and its separate approval.

## Pin-style references and API proof preparation — 19 October 2026

### Confirmed locally

- `engine/panel/panel.html:726` calls `navigator.clipboard.writeText(text)`. This copies text, not image files; see [Clipboard writeText documentation](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText). A reference link only helps if the receiving session can open the actual image.
- `engine/panel/generator.js` stores `brand` as text and inserts it as `BRAND_STYLE`. There is no reference-image list in `emptyAccount` or the generated prompt values.
- `engine/panel/codex-prompt.md` already includes a per-account Style guide, existing-pin review, trend research and format/layout variety. Add image-reference inspection to that workflow rather than replacing it. Its generic requirement of at least five formats also needs to scale to small batches.
- `engine/panel/panel.html` currently appends a history entry on every copy. Do not carry that behavior into the website; the existing decision requires recopying to update the original entry.
- Requirements and acceptance criteria: [PRODUCT-REQUIREMENTS.md](PRODUCT-REQUIREMENTS.md). Image handoff and storage are unproven; no working upload feature or automatic image attachment is claimed.

### Live proof scope and current evidence

- The owner confirmed the currently open Chrome account: Hdrahm's Platform, Pinterest connection and profile @stunningcrochet. Testing/posting there is authorized. @crochet_simplified is excluded.
- Chrome inspection showed the Pinterest, Gmail, Google Sheets and Telegram Bot connections marked Active. This is UI evidence only; it does not prove API-key access.
- Current official [List Connections](https://www.activepieces.com/docs/endpoints/connections/list) and [List Flow Runs](https://www.activepieces.com/docs/endpoints/flow-runs/list) documentation describe API-key authorization. These are documented claims; live key-authenticated results must still be recorded separately.
- Start with metadata and read-only calls, then use a separate identifiable test flow/connection to prove import, publish, pause/resume, run and outputs. Use harmless sample output for flow controls; a live pin is only needed for the later publishing acceptance test. Never substitute a browser session token for the API-key proof.

## Live API-key proof — 19 October 2026

**Result:** all five HANDOFF 3.3 capabilities were exercised using the platform API key, without a browser session token. Credential-free machine-readable evidence: [proof report](proof/activepieces-api-key-2026-10-19.json). Raw responses remain in private temporary storage and are not repository artifacts.

| Check | Observed result |
|---|---|
| List connections | HTTP 200; four original connections, display names and account identifiers available; Pinterest identity matched the approved @stunningcrochet target |
| Create Telegram SECRET_TEXT connection | HTTP 201, ACTIVE; separately named Autopilot Website Telegram Proof; credential absent from response; no message sent |
| Import, publish, pause and resume | HTTP 200 for each; imported flow valid; status changed to ENABLED and DISABLED as requested |
| Run now | HTTP 200 from retry with ON_LATEST_VERSION; distinct production run succeeded using revision 3 instead of the seed's revision 2; downstream output confirmed fullFlow=true, revision=3, writes=0 |
| Read runs and outputs | HTTP 200 for run listing and details; completed sample steps and outputs available |

The isolated Autopilot Website API Proof flow contains only a schedule and two sample code steps, with no app connections. A temporary minute schedule supplied the initial successful run. It was paused in a finally block, then replaced with an annual schedule; final state is DISABLED. The existing posting flow's complete version, published version and status matched the before-test fingerprint. No pins, spreadsheet rows or messages were written. The test connection remains clearly named and unused.

### Run-now constraint

The cloud test-step endpoint returned HTTP 500: its API-key principal was used as a user foreign key. The UI's full Test Flow route uses a user-authenticated socket, so it is not a substitute for this API-key proof. The supported retry endpoint with ON_LATEST_VERSION starts the whole latest flow from the beginning with the retained seed's trigger data. It is suitable for this schedule-trigger flow, whose trigger data does not select an account or content batch. Do not use FROM_FAILED_STEP for Run now.

Deployment must obtain and retain a successful scheduled run before enabling Run now. A missing or expired seed requires another scheduled bootstrap. The first schedule can take several minutes; show actual progress and keep Run now unavailable until confirmed. Check retention and plan behavior in the real backend stage. This proof does not establish zero-wait initial deployment or permanent seed availability.

Primary sources: official [flow-run service and retry implementation](https://github.com/activepieces/activepieces/blob/main/packages/server/api/src/app/flows/flow-run/flow-run-service.ts), [web run client](https://github.com/activepieces/activepieces/blob/main/packages/web/src/features/flow-runs/api/flow-runs-api.ts), [sample-data controller](https://github.com/activepieces/activepieces/blob/main/packages/server/api/src/app/flows/step-run/sample-data.controller.ts). Live responses, rather than source alone, establish the results above. Source paths can change upstream.

### Reliability and credential handling

- One publish attempt failed with a worker-cache file-rename error. Re-reading state and retrying succeeded. Later publish requests succeeded. The backend needs bounded retries and state reconciliation rather than showing success on the first request.
- Existing run outputs included plaintext login credentials. **Never proxy raw step outputs to the browser, admin, logs or error reports.** Build explicit allowlisted summaries for posting counts, stages and safe messages. API response metadata also needs filtering.
- Telegram creation reused the chosen test platform's existing bot credential from a prior run output. Automatic approval review initially rejected that reuse; the owner then explicitly approved this exact credential source and duplication. The subsequent approved request succeeded. No other credential reuse is authorized by this specific exception.
- API key is kept only in ignored local configuration with restrictive file permissions. Proof documents contain no keys, bot tokens, connection identifiers or private emails.

Primary sources: official [connection list](https://www.activepieces.com/docs/endpoints/connections/list), [connection upsert](https://www.activepieces.com/docs/endpoints/connections/upsert), [flow update](https://www.activepieces.com/docs/endpoints/flows/update), [run list](https://www.activepieces.com/docs/endpoints/flow-runs/list).

### What this does not prove

No production-grade website, Google sign-in, encryption service, account isolation, live Pinterest posting, reference-image delivery or end-user Telegram notification was implemented or accepted by these tests. Those need their own later evidence. Next is the local clickable prototype with sample data; its approval precedes app implementation.

## Clickable prototype evidence — 19 October 2026

Implemented a local review artifact in [prototype/](prototype/README.md), using the approved Geist direction and the setup/recovery principles above. It contains the English journeys and sample service states, not an application backend. All live-account and service actions are simulations.

Observed browser checks: 14 interactions passed, including a blocked setup step, mismatched-login recovery, full setup preview, pause/resume/run, draft/apply, local image upload, repeat-copy history, restoring as a draft, member controls and appearance. Twenty routes were measured at 1440px, 390px and 320px. One Runs overflow at 320px came from an absolutely positioned screen-reader label inside the scrolling table; positioning the table container fixed it. Final measurements have no document overflow. Evidence and limitations: [qa-results.json](prototype/qa-results.json). This is not a complete accessibility or performance audit.

The downloaded example ZIP passed integrity checks and contained prompt.txt, manifest.json and three reference SVG files whose bytes matched the local example assets. The prompt names references and requires stopping if they cannot be opened. [Package proof](prototype/package-proof.json). This proves a local attachment-package path, not automatic private reference delivery or the receiving session's ability to inspect a user's cloud files.

Thirteen actual browser screenshots are saved in [prototype/screenshots/](prototype/screenshots/). The illustrated pin layouts are interface examples, not real client generation output. English only: French/Arabic and RTL acceptance remain future work, as do real Google sign-in, ownership, encryption, moderation enforcement, deployment and live publishing.

Prototype review is now the approval gate. Do not re-open the approved home-style choice or start the backend before that review.

## Account-addition and creation clarity review — 19 October 2026

Owner feedback identified three specific failures: “Prepare batch” hid its output, style notes demanded unnecessary writing, and account addition had no obvious starting action. Revised the local prototype to expose Add Pinterest account, use Get Codex prompt, remove the style brief, default topics from the niche and explain setup → content creation → scheduled posting.

Checked the official [new-connection dialog](https://github.com/activepieces/activepieces/blob/main/packages/web/src/app/connections/new-connection-dialog.tsx) and [create/edit connection dialog](https://github.com/activepieces/activepieces/blob/main/packages/web/src/app/connections/create-edit-connection-dialog.tsx). The normal UI selects an authenticated service, opens its connection form, and uses Save to persist it. The guide now includes that Save step. This source check does not prove a free direct-to-Pinterest OAuth URL or a completed new website sign-in flow; normal Activepieces login remains the established approach.

Evidence: [clarity walkthrough](prototype/clarity-review-results.json), [revised package](prototype/revised-package-proof.json), real screenshots 14–20. Thirteen focused checks passed, including account addition/activation, duplicate recovery, separate references, inferred style instructions and duplicate-free history. Eighteen affected page/dialog layout measurements had no page overflow. Engine build and all 40 existing engine tests passed again. These are local preview and fake-service engine results; real website authentication, image generation, private reference access, production performance and unassisted beginner usability still need acceptance evidence.

## Production integration checks — 19 October 2026

- Actual website backend: key verification and connection discovery both returned HTTP 200 on the authorized test platform. Credential absence was checked in the returned JSON. A Worker fetch initially failed with redirect:error; manual redirects plus rejection of non-success responses passed the live check and avoid forwarding credentials to a redirected host.
- Official project connection route is /projects/:projectId/connections; the API-key route is /platform/api-keys. Sources: https://github.com/activepieces/activepieces/blob/main/packages/web/src/lib/route-utils.ts, https://github.com/activepieces/activepieces/blob/main/packages/web/src/app/guards/project-route-wrapper.tsx, https://github.com/activepieces/activepieces/blob/main/packages/web/src/app/routes/platform-routes.tsx.
- Custom Activepieces external connection names can exceed the old panel's 21-character check (37 characters in the completed proof). Website ownership/service checks precede its compatible flow builder; the existing panel's validation is unchanged.
- D1 free individual databases are limited to 500 MB. Reference storage is bounded, not unlimited. Source: https://developers.cloudflare.com/d1/platform/limits/.
- The current official runtime test package is @cloudflare/vitest-plugin. Source: https://github.com/cloudflare/workers-sdk/tree/main/fixtures/vitest-plugin-examples. Registry dependency audit returned zero vulnerabilities. The test configuration is separate from local credentials.
- Verified Cloudflare resources: Pages project pinterest-automations; D1 database pinterest-automations in WEUR. The reduced login has Pages/D1 write and account/user/zone read. No DNS-write or billing-write permission was requested.

## 19 October 2026 — public source and deployment on push

- The owner requested public source and automatic deployment. A checked main-branch release uses GitHub Actions and Wrangler direct upload, supported by Cloudflare’s [Pages CI guide](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/). The credential needs Pages Edit plus D1 Edit for database migrations, limited to the owner’s selected account.
- Checks and deployment are separate jobs. Pull requests do not run the production job. Official actions are pinned to verified full commit hashes, following GitHub’s [secure-use guidance](https://docs.github.com/en/actions/reference/security/secure-use). The production environment accepts main only. Secrets are not stored in source or included in screenshots.
- The first GitHub build/test job passed. Deployment initially stopped because its token was absent. The Cloudflare token summary was reviewed in Chrome: only D1 Edit and Pages Edit for one account. Creation approval and the first successful pipeline remain pending at this point; a prepared workflow alone is not deployment proof.

## 20 October 2026 — deployment result and supported artifact runtimes

- Push-triggered run [39417494219](https://github.com/Houdaifa1/pinterest-automation-web/actions/runs/39417494219) passed both jobs, including migrations, Pages upload and production checks. This establishes actual automatic deployment, beyond a prepared workflow.
- GitHub warned that the older artifact actions used a deprecated runtime. Checked the official [upload v7.0.2 release](https://github.com/actions/upload-artifact/releases/tag/v7.0.2) and [download v8.0.2 release](https://github.com/actions/download-artifact/releases/tag/v8.0.2), resolved each tag to its own repository’s commit, and read both action definitions: Node 24. Pin these maintained commits and verify the same artifact transfer in the following run.

## 20 October 2026 — existing setup discovery

- Activepieces connection metadata identifies saved services but does not expose bot credentials. Re-entering a token is unnecessary when keeping an existing flow. Sources: [connection get](https://www.activepieces.com/docs/endpoints/connections/get), [connection controller](https://github.com/activepieces/activepieces/blob/main/packages/server/api/src/app/app-connection/app-connection.controller.ts).
- Read published versions rather than an unpublished draft when finding a saved setup. The flow endpoint supports versionId; list results identify the published version. Sources: [get flow](https://www.activepieces.com/docs/endpoints/flows/get), [list flows](https://www.activepieces.com/docs/endpoints/flows/list).
- Successful runs can identify the Sheet without returning credential-bearing outputs to the browser. Use allowlisted Sheet URLs and a matching flow identifier. Source: [get run](https://www.activepieces.com/docs/endpoints/flow-runs/get).
- The approved test platform returned two recognizable saved posting flows. Local browser adoption preserved the original flow's published version, trigger hash and enabled state. Adding a second profile and applying its configuration is covered with simulated provider calls; the original live flow was not republished.
- Discovery supports this project's posting-engine format, not arbitrary third-party flows. Projects above the bounded discovery limit return an explicit error. Category and website settings absent from old flow exports cannot be reconstructed exactly; retained local choices are preserved and inferred categories remain editable.

## 20 October 2026 — content workspace review, not an implementation release

The owner paused application work and requested one complete plan, corrections to unrealistic assumptions, and a new visual direction. The resulting proposal is [REBUILD-PLAN.md](REBUILD-PLAN.md). No live account was accessed or changed for this research. Existing unfinished application changes have not been validated or deployed by this review.

### Real design references and comparison

| Reference | Useful lesson for this product | Limitation |
|---|---|---|
| Approved Geist home, `design-references/7-vercel-style-home.png` and later option B | Clear hierarchy, restrained controls, readable type and predictable navigation | A deployment-dashboard structure foregrounds system objects rather than the member's next content task |
| [Buffer Publish](https://buffer.com/publish) | Calendar/list switching, upcoming content and visible publishing schedules | Its full multi-channel product would add unnecessary concepts here |
| [Planable approvals](https://help.planable.io/hc/en-us/articles/28555055158044-Reviewing-content-in-My-approvals-section) | A focused queue separates content waiting for review from approved work | Team and agency approval machinery is excessive for a single account owner |

Judgment: the better direction for this audience is a content workspace with Geist's clarity. Show pins, queue coverage and the next post first. Keep connections and diagnostics secondary. Warm neutral surfaces, a restrained teal action and actual pin thumbnails can give the app character without decorative charts or glass. This is a recommendation, not a measured usability result. Independent beginner acceptance remains required.

Real browser captures saved during the review:

- `design-references/27-buffer-content-calendar.jpg`: the official Buffer Publish page at its calendar demonstration. A vendor marketing illustration of its product, not our interface.
- `design-references/28-planable-review-queue.jpg`: the official Planable help page's opened product screenshot, showing review columns. A real vendor reference, not an invented competing screen.
- `design-references/29-workspace-proposal.jpg`: our rendered Queue concept at a 1024px browser viewport.
- `design-references/30-mixed-new-pins-proposal.jpg`: our rendered mixed-source concept, using five no-link pins, five product pins, twelve category-product pins and three category overview pins.
- `design-references/31-new-pins-phone-proposal.jpg`: our rendered 320px browser view with optional batch notes/references expanded. The wrapper leaves 288px for the product itself.

The last three are clearly labelled proposals with example counts, covers, products and times. They are not production screenshots or completed integration proof. The accompanying interactive proposal demonstrates only selected interface states; a complete revised clickable prototype follows owner agreement.

### Catalog access and truthful planning

The [Etsy developer documentation](https://developers.etsy.com/) describes different application access paths and prohibits retrieving data by sidestepping the API with screen scraping. Authorized catalog access or member-provided product data is the proposed route. A shop URL alone cannot promise complete listing discovery. The direct document render was intermittent during review; its official indexed content supplied the relevant access and scraping statements. No shop integration was created or tested.

[Gumroad's API](https://gumroad.com/api) is the official integration starting point; its [account-settings help](https://gumroad.com/help/article/67-the-settings-menu.html) describes creating an application. The API page returned no useful extracted body in this review. Exact product-list access, pagination, permissions and private-sales access remain unverified. Do not claim a store URL provides them.

[Pinterest organic reporting](https://developers.pinterest.com/docs/analytics-and-reports/organic-reporting/) documents analytics capabilities. It does not establish this member's granted permissions, complete historic pin coverage or access to every manually published pin. The current pins-list document returned only a page shell. Verify access and pagination in an isolated later proof. The planner must show history coverage, source dates and missing data; not found in an incomplete scan must not become never posted. Creative variation must preserve the actual product and supported claims.

### Scheduling, access and cost

[Pinterest's current guidelines](https://policy.pinterest.com/en/community-guidelines) prohibit unapproved automation, repetitive/deceptive content and evasion of spam controls. Vary times for sensible spacing and user preference; do not promise invisibility or account safety. A working connection does not prove production access approval. The page announces a November 12, 2026 update; that future policy was not treated as already effective on October 20.

[Activepieces flow control](https://www.activepieces.com/docs/build-pieces/piece-reference/flow-control) documents persisted waitpoints and timed resumption. This is a custom-piece execution API, not proof that the existing code steps can pause simply by adding the same calls. [Execution limits](https://www.activepieces.com/docs/install/reference/limits) distinguish active runtime from paused delay time. Verify available pieces, cancellation and delayed-run behavior on the actual account before choosing this architecture.

The official [webhook piece](https://www.activepieces.com/pieces/webhook) and [Cloudflare cron documentation](https://developers.cloudflare.com/workers/configuration/cron-triggers/) support investigating a durable website schedule that dispatches only due jobs to Activepieces. Reliability, signatures, ownership, leases, repeat protection, uncertain-result reconciliation, timing lateness and pause behavior are project requirements, not capabilities established merely by reading those pages.

The current [Activepieces pricing page](https://www.activepieces.com/pricing) contradicts itself about free credit resets: its allowance/FAQ use monthly wording while its comparison/overage text also says daily. Do not infer the member's quota from these conflicting statements. Check the actual account later. High-frequency empty runs could waste the allowance. No paid plan or new service was purchased.

### Review proof and limitations

Observed in the rendered concept: mixed total 25; changing the no-link amount to 100 gives 120; removing the category's individual-product portion gives 108. Account settings start collapsed, a real edit shows Save changes, and restoring the original value hides Save. Whole-card navigation opens Queue; Create offers existing/new and the new preview contains no Pinterest accounts. Queue and New pins had no horizontal overflow at the narrow review width.

These are local design interactions only. There is no catalog fetch, reference upload, prompt delivery, production save, deletion, publishing, analytics sync or scheduling execution behind this concept. The product-selection count is explicitly an example; the later prototype must show discovered product choices. Evidence: `docs/proof/workspace-proposal-review.json`. Application source fingerprints are compared separately to verify the review did not alter it. The existing engine tests were not rerun for a documentation/design-only step.

## 20 October 2026 — black English-only clickable prototype

The owner approved starting the revised prototype, changed the canvas to black and removed French/Arabic. This supersedes the earlier green/teal visual treatment and translation scope. The implementation is separate from application source in docs/prototype-v2/; its service states and catalogs are fictional.

Observed evidence in qa-results.json: 42 browser checks passed, including saved-key Back/Continue, an empty new setup, existing Telegram reuse, mixed source totals and distinct destinations, repeat-safe prompt history, reviewed output arriving in parts, net-change account editing, deletion recovery, stale/empty/expired states, external-change review and keyboard focus behavior. Twenty-one measurements at 320px, 390px and 1440px had no horizontal overflow. A local image upload produced its thumbnail and could be removed. No browser console errors or warnings were observed at the inspected point.

The real downloaded package passed ZIP integrity and reference-byte comparisons. It held 25 requested pins across no-link, single-product, category-product and category-overview groups, the account niche, the prompt, manifest and three named images. This proves the local explicit-attachment path only. No content-creation session, live shop, real Pinterest history or production callback was used.

Walkthrough corrections: copying a prompt must not claim creation started; unchanged requests retain a batch ID; changed schedules retain actual past publication times; different Pinterest accounts keep separate request drafts; restored pins wait for review; phone member actions use stacked cards instead of hidden table columns; number edits and category toggles preserve scroll. Keep selected product URLs distinct from category destinations, and do not claim complete catalog/history access from a URL alone.

Seven real captures are in docs/prototype-v2/screenshots/. They show black product surfaces and illustrative pin covers, not real generated client pins. Browser access was declined; owner-approved retries still reported a saved origin permission/managed-policy block. Optional unverified sticky dialog-header/action CSS was removed, retaining the inspected layout and normal dialog scrolling. No alternative port, browser, indirect control or policy workaround was attempted. The temporary viewport was reset and the existing tab retained without frame access.

Engine build and all 40 existing engine tests passed. JavaScript syntax and whitespace checks passed. These are prototype and simulated-engine results, not a production-readiness claim. Existing live publication, private reference delivery and unassisted beginner acceptance requirements remain open.

## Real rebuild verification — 20 October 2026

- Cloudflare's [scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/) confirms that Cron Triggers invoke a Worker's scheduled handler. Pages does not provide this handler. Use a separate lightweight dispatcher; do not relabel the existing hourly flow as arbitrary-minute scheduling.
- Activepieces [waitpoints](https://www.activepieces.com/docs/install/architecture/waitpoints) and [flow control](https://www.activepieces.com/docs/build-pieces/piece-reference/flow-control) document durable delays through piece context. This does not establish that the deployed generic code steps can use that context.
- Read the live [Crochet Simplified homepage](https://crochetsimplified.com/) and fetched /patterns/ successfully. /sitemap.xml returned the site's HTML not-found page, so a generic sitemap assumption is wrong. The initial link scan must disclose its page boundary, let the user select real products, and support missing links. This bounded scan is not complete catalog/history proof.
- [Gumroad API](https://gumroad.com/api) again returned no extracted documentation through web access. Do not claim complete seller access from a pasted store URL. Etsy/Gumroad scans require their supported connection or member-supplied product links/catalog data.

## 21 October 2026 — catalog structure verified in the source website

- Inspected the real [Crochet Simplified catalog](https://crochetsimplified.com/patterns/) in the browser: it advertises 102 patterns and uses numbered next pages such as /patterns/page/2/#patterns. Product cards contain individual /patterns/slug/ addresses and h3 titles. The first page alone is not the complete inventory.
- Inspected the [Crochet Flowers category](https://crochetsimplified.com/patterns/category/crochet-flowers/): nine product cards, including Daisy Bouquet, Forget-Me-Not Bouquet, Large Red Rose, Mini Tulip, Rose Bouquet, Small Sunflower, Spring Flower Bouquet, Sunflower Bouquet and Wired Tulip Bouquet. Category chips and footer policy links must be excluded. Its structured data includes breadcrumbs, which are not product evidence.
- The website's sitemap.xml served an HTML not-found view in this inspection. A successful HTTP status alone is insufficient to identify a sitemap. Backend pagination and the final product counts still require verification through the deployed scanner.
