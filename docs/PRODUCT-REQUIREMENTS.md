# Product requirements — 19 October 2026

## Approved direction

Home option B (clearer Geist) is approved. The full clickable prototype still needs separate approval after the API proof. Keep the owner-facing explanation short: one recommendation, one screen, one decision at a time.

## Open sign-up and owner control

- Anyone with a Google account can sign up; no invitation list. Keep sign-in scopes limited to identity. External automation logins remain a separate setup step.
- Owner-only Admin lists website members, activity, autopilots and deployment status. Offer Block, Unblock and Remove access. Confirm removal, record moderation actions, and revoke website sessions immediately on block/removal.
- Owner controls website access, not a member's Google or Pinterest account. Blocking website access does not by itself pause an independently running Activepieces flow; any flow action must be explicit and have a verified result.
- Enforce roles and ownership on the server. Members cannot access another member's keys, references, history or automations. Admin never receives stored API keys or tokens.

## Pin-style references per Pinterest account

### Simple user flow

1. Open the Pinterest account card → Picture style.
2. Add example pins; show thumbnails, upload progress and Remove. Accept multiple references, including the owner's example of three pictures. Exact limits will be set after storage and upload checks.
3. Save automatically. No written style field or design brief. The user adds images; Codex infers the visual identity from them.
4. In New pins, show “Uses your saved style” and reference thumbnails. The normal batch action must carry a versioned reference list and style instructions into the creation workflow.

Default behavior: keep the brand identity and create variety. Do not force beginners to configure creativity sliders or write a long art brief. Accounts without references use an identity developed from their niche and recent profile. Do not require the user to write style instructions.

### Identity and variety

- Extract palette, type treatment, photo mood, spacing and recognizable brand details from the references. Do not copy their complete composition.
- Keep product facts and the account's niche accurate. Vary composition, crop, scene, background, headline structure, color balance and content angle across the batch.
- Compare planned pins with the recent feed and queued batches. Avoid repeated adjacent layouts and near-duplicate headlines, images or ideas. Scale variety requirements to the batch size; one pin cannot use five formats.
- Research relevant current searches, seasonal demand and visual patterns; record sources and dates. Missing research access must be reported rather than described as a checked trend.
- Use account performance as evidence, not a guarantee of growth. Do not rewrite the core identity automatically because of one high-impression pin.
- Show a representative batch preview during the later acceptance test. Style resemblance and useful variety need visual review; text instructions alone do not prove either.

### Reference handoff: required proof

Current Copy prompt uses `navigator.clipboard.writeText`, so it copies text only. A copied filename, private application URL or inaccessible link is not an attached image.

Preferred workflow to investigate: the copied prompt identifies reference files that the connected content-creation session can actually open, without exposing the images publicly. The existing bot Drive is a candidate, not a verified solution. Check upload permissions, account isolation, image-reading support and storage quotas before choosing it. Do not widen Google sign-in scopes silently.

If reference access cannot be verified, offer an explicit prompt-and-images download/attachment handoff. Do not label a text-only copy as “images included.” Native clipboard attachment behavior across browsers and the receiving app also needs an actual test before becoming the primary path.

Creation must stop with one useful recovery action if required references cannot be opened. Never silently ignore uploaded references or replace them with generic style instructions.

### Implementation requirements, after prototype approval

- Private owner/account-scoped media records; bounded decoded image sizes and upload quotas; validate actual image content, sanitize filenames and strip unnecessary metadata.
- Exact media storage provider, retention and costs remain unproven. Keep within the agreed free-tier goal; do not promise unlimited uploads or buy a paid service.
- Stable reference IDs and content hashes, a style version, and a batch snapshot. History must preserve which style/reference version a batch used.
- Recopying the same batch updates its copy count. Changed style/reference versions must not silently alter an earlier history entry.
- Protect uploads and reference instructions as untrusted content. They cannot change account ownership or authorize posting elsewhere.

## Clear account addition and creation outcome

- Home and Accounts both expose **Add Pinterest account**. An existing workspace is selected by name only; skip that choice when there is only one.
- Guide the user to Activepieces Connections → New Connection → Pinterest → sign in → Save. Detect the saved connection, fill sensible settings and offer Review & activate. A repeated connection must lead to the existing account, not create a duplicate.
- The direct connection deep link and real OAuth return/detection still need end-to-end proof in the real build. Do not claim the local sign-in simulation proves them.
- Replace “Prepare batch” with **Get Codex prompt**. Describe its output as ready-to-paste instructions plus the selected account's reference images, never finished pins.
- Pin ideas default to the saved niche. The user selects the amount or supplies page links; they do not write instructions.
- Setup completion explains the outcome: a configured posting automation and its Google Sheet. Next: use the prompt and reference images in Codex, review the pins, have Codex fill the Sheet, then automatic posting follows the saved schedule.
- The local attachment package requires unzip/attach steps. Automatic private image access remains a required feasibility check for a smoother production handoff; do not imply that plain text copying attaches files.

## Production acceptance

- One task per setup screen; short labels, readable controls, clear progress, automatic resume and useful recovery. Prefer detected choices over IDs or manual typing.
- Validate the full journey with a beginner: Google sign-up, connections, first batch, apply changes and recover from an expired login. Include the owner's father/friends if available.
- Measure loading and interaction performance on a phone and an ordinary connection. Avoid shipping decorative charts, unnecessary scripts or motion that blocks work. Respect reduced motion.
- Test keyboard use, zoom, phone layouts, English/French/Arabic, right-to-left layout and dark/light appearances. The existing home screenshots are not proof of the full application.
- Test expired credentials, repeated clicks, failed deploy stages, interrupted runs, quota limits, upload failures, duplicate batch copies, ownership checks, blocking/removal and recovery. Use repeat-safe actions and clear outcomes.
- Keep the engine tests green. Fix technical defects as their stage is reached; do not claim production readiness before live and multi-user acceptance evidence exists.

## Current test authorization

The owner confirmed the account currently open in Chrome: **Hdrahm's Platform → @stunningcrochet**. Earlier spoken “Ash Dreams” referred to this setup and was clarified explicitly. Tests and posting are authorized there. **@crochet_simplified is excluded.** Do not switch back to the earlier hdrahm target or run a shared flow that could publish to an excluded account. A shared spreadsheet still requires exact account scoping for any write.
