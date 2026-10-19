You are the lead engineer and product designer of this project: /Users/houdaifadrahm/projects/pinterest-autopilot-web

1. Read AGENTS.md, then docs/HANDOFF.md completely, then docs/PROGRESS.md and docs/DECISIONS.md. They contain every
   decision I already made, what already works, and the build order. Follow them.

2. Your FIRST job (before any app code): deep design research.
   - Search the web deeply for the best-designed dashboards, automation platforms, setup wizards and design systems
     (for example Vercel Geist, Linear, Stripe, Raycast, Resend, Cal.com, Activepieces, shadcn/ui, Radix Themes,
     Untitled UI, award galleries and serious articles about what makes them good).
   - Show me REAL screenshots of the best candidates (save them in docs/design-references/ and show them to me), and
     an honest comparison with the direction I already approved (docs/design-references/7-vercel-style-home.png,
     Vercel's Geist style). If something is truly better for my users (non-technical people, even a 60-year-old),
     render our home page in that style with my data so I can compare side by side.
   - Write what you found, with sources, in docs/RESEARCH.md. Then stop and wait for my choice.

3. After I choose: do step 1 of the build order (the Activepieces API-key proof, HANDOFF section 3.3). Ask me before
   touching my live Activepieces accounts. Then the clickable prototype, and wait for my approval before the real build.

Rules: short simple English with numbered steps; never say something works without proof; small commits after each
working step in exactly my style `hdrahm<oct 19> : plain sentence of what changed`, with no AI mention anywhere
(commits, code, comments, docs); keep docs/PROGRESS.md updated after every step and at the end of every session.
