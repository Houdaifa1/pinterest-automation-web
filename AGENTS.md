# AGENTS.md — rules for any AI engineer working here

1. Read `docs/HANDOFF.md` fully, then `docs/PROGRESS.md`. They are the source of truth.
2. The owner (hdrahm) is not a programmer: short simple English, numbered steps, show real screenshots, recommend one
   option when asking. Never claim something works without proof.
3. Commits: small, after each working step, exactly `hdrahm<oct 19> : plain sentence of what changed`
   (lower-case month, day without leading zero). **No AI mention anywhere** — no co-author lines, no "generated with",
   nothing in commit messages, code, comments or docs.
4. Never commit secrets. Never touch the owner's live Activepieces flows, spreadsheet or Pinterest accounts without asking.
5. Update `docs/PROGRESS.md` after every step (status, date, proof) and at the end of every session (next step, open
   problems). Record decisions in `docs/DECISIONS.md`, research in `docs/RESEARCH.md` with sources.
6. Keep the `engine/` tests green: `cd engine && python3 tools/build.py && node --test tests/engine.test.mjs`.
7. Style: Vercel's Geist design system (see `docs/design-references/`). No app code before the owner approves the
   design research and the prototype.
