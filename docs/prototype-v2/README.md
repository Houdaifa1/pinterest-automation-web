# Black English-only prototype

Complete review flow for the revised content workspace. The owner approved this prototype stage on 20 October 2026, replacing the green background and French/Arabic scope. Production rebuild approval is still pending.

All accounts, catalogs, counts, publication records, service responses and member actions are examples. This prototype never calls Activepieces, Pinterest, Telegram, Google sign-in or a store API. Do not enter real keys or tokens.

## Open

```sh
python3 -m http.server 8872 --bind 127.0.0.1 --directory docs/prototype-v2
```

Open http://127.0.0.1:8872/. The local server was left running for review. This is separate from the website development server and the live site.

## Review the journey

1. Click the whole Stunning Crochet card. Queue shows tracked, published, ready and review counts, estimated coverage, saved times and upcoming examples. More contains pause/resume, a queue check, settings and deletion.
2. Create automation offers Edit existing or Create new before creating any draft. Existing opens the saved example. New starts with no selected Pinterest accounts. Back keeps the connection and Continue; replacing a key is explicit. The saved Telegram bot needs no token again.
3. New pins starts with one no-link source. Add product, category and website/shop sources in any combination. Category selection lists example products; choose pins per product and category overview pins independently. Product destinations and category destinations remain separate.
4. Add optional notes and example images in New pins. Upload JPG/PNG/WebP images or choose the three supplied illustrations. References remain on this device. Changing Pinterest accounts retains separate request drafts rather than mixing notes and pictures.
5. Review the request, get the prompt, copy again or download its ZIP. Reopening the unchanged builder keeps its batch ID. Copying does not mark creation complete or add ready pins. The download explicitly packages the images; plain text copying does not attach them.
6. Preview states → Example batch received demonstrates incoming output. Activity → Review pins → Add reviewed pins to queue advances the same request. Large examples arrive in parts of up to 25; requested, queued and remaining amounts stay separate. This is a simulation, not actual content generation or receipt.
7. Accounts start collapsed. A true edit shows a green Save changes action. Reverting the value hides Save. Save validates the posting window/spacing. Navigation protects unsaved edits. Past publication times remain unchanged when future scheduling is edited.
8. Remove a queued pin and restore it from Activity into Needs review. Delete an automation and restore it from Removed automations; it stays paused. The optional remote-flow deletion choice explains that restoring would create an unfinished setup instead of bringing a deleted flow back.
9. Preview states includes loading, stale queue data, expired access, a failed save with retry, an external change requiring a choice, and an empty queue. Reset restores the fictional starting data, not production data.
10. Your account opens settings, owner member review, privacy and sign-out on phones as well as desktops. Google entry and member block/unblock/removal are simulated. Public sign-up has no invitation step.

## What is checked

- [qa-results.json](qa-results.json): 42 observed browser checks passed, and 21 layout measurements had no horizontal overflow. Widths include 320px, 390px and 1440px. Checks wait for route content before inspecting it.
- In-place count editing and a category-mode toggle retained scroll position at 320px. Keyboard checks cover the skip link and dialog Escape/return focus. No console warnings/errors were observed in the inspected session.
- [package-proof.json](package-proof.json): the actual downloaded ZIP passed integrity checks, contained the prompt/manifest/three images, and its reference bytes matched the local fixtures. It retained the mixed product/category/no-link destinations and the account niche.
- [screenshots/](screenshots/): seven real browser captures. Pin covers and products are clearly labelled illustrations/examples. The saved-key/Telegram captures preserve earlier review moments; the black Queue and mixed-builder captures show the final main-screen layout.
- JavaScript syntax check passes. Engine build and all 40 existing engine tests pass; these tests use simulated services. Production source was not changed.

## Browser access limitation

Browser permission for http://127.0.0.1:8872 was declined after the checks above. Later retries, explicitly approved by the owner, still reported a saved permission/managed-policy block. Frame actions stopped; no alternate surface, port or indirect control was used. Optional unverified sticky dialog-header/action CSS was removed, retaining the previously inspected layout. Long dialogs use their normal internal scroll. No pending phone-layout claim depends on the removed polish.

The temporary viewport override was reset and the existing preview tab retained without accessing its page. The local preview server remains running; no production service was accessed or deployed.

## Boundaries

This is not a production release or security audit. Catalog discovery, complete Pinterest history, trend evidence, actual product-image fidelity, cloud reference delivery, batch callbacks, provider conflict handling, real timezone dispatch, costs and duplicate-proof publishing still require the isolated integration proofs in REBUILD-PLAN.md. An unassisted beginner session remains required.

The three unwanted production drafts have not been removed. Existing unfinished application changes and migrations remain outside this prototype. The live website still has its previous release; removing its language controls happens in the approved production rebuild.

Geist is bundled locally under the license in assets/GEIST-LICENSE.txt. No external font request is needed.
