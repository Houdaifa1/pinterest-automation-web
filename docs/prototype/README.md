# Clickable prototype

Local English review of the approved clearer Geist direction. All names, queue counts, members, service results and deployment stages are sample data. No backend or live account actions.

## Open

The review server is running at http://127.0.0.1:8766/ while the owner reviews it. If a later session needs to restart it, run from the project folder:

```sh
python3 -m http.server 8766 --bind 127.0.0.1 --directory docs/prototype
```

Do not enter real API keys or bot tokens in this preview. Use the sample buttons.

## Review journey

1. Try setup → Google entry, workspace connection, optional Telegram, login mismatch recovery, detected Pinterest account, review and deploy.
2. Open Stunning Crochet → pause/resume, run preview, Accounts → Edit, Review & apply.
3. Accounts → Edit style → add/remove images and optional style notes. Images remain local to this preview.
4. New pins → page links, no-link pins or website rounds → Prepare batch. Copy a prompt or download the prompt and reference images together.
5. History → copy again, mark sent, make similar, delete with Undo; Setup changes → restore as a draft.
6. Runs → inspect a result or recover an expired Pinterest login. Settings → notifications, connections, report time and deletion confirmation.
7. Admin → review fictional members, block/unblock or remove website access. Website access is separate from external Google/Pinterest accounts.
8. Your settings → light/dark/device appearance. Help → empty-home example.

Reset preview clears the sample changes. Drafts, history and appearance otherwise stay on this device.

## What is functional locally

- Navigation, forms, draft review, confirmations and sample state changes.
- Image file selection, validation and thumbnails; local draft persistence.
- Clipboard text copy; duplicate-free batch history with copy counts.
- ZIP download containing a prompt, manifest and reference image files.

Service verification, Google sign-in, deployment, live posting, moderation enforcement and spreadsheet access are simulations. The local ZIP is a deliberate attachment handoff, not automatic private image delivery. The three illustrated example pins are original interface fixtures, not a generated client batch.

## Evidence and limits

- [qa-results.json](qa-results.json): 14 interaction checks passed; 20 screen routes checked at 1440px, 390px and 320px, with no page overflow after the Runs fix. These are observed browser checks, not a production test suite.
- [package-proof.json](package-proof.json): ZIP integrity passed; prompt, manifest and three image files present; image bytes matched the example source assets.
- [screenshots/](screenshots/): 13 real browser captures, including phone, dark appearance, login recovery and repeated-copy history.
- JavaScript syntax check: `node --check docs/prototype/prototype.js`. Existing engine build/tests passed earlier this session (40/40); engine files were not changed.

English only in this review. French, Arabic/RTL, real security boundaries, cloud image storage, receiving-session image access, production performance, full accessibility and beginner acceptance remain build-stage work. No production readiness is claimed.

## Approval boundary

This prototype is ready for owner review. Its approval is pending. HANDOFF 3.4 requires that approval before app implementation.
