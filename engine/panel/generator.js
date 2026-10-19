// Control Panel logic: validation, the settings sent to the automation, the import file and the
// Codex prompts. Pure functions (no DOM) so the same code runs in the panel and in the tests.

export const FIRST_HOUR = 6;
export const LAST_HOUR = 23;
export const MAX_PER_DAY = LAST_HOUR - FIRST_HOUR + 1;
const CONNECTION_ID = /^[A-Za-z0-9]{21}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ACCOUNT_NAME = /^[A-Za-z0-9][A-Za-z0-9 _-]{0,29}$/;

export const DEFAULT_BRAND = 'Clean, bright and cozy; soft natural window light; colors that suit the subject; calm backgrounds (linen, wood, soft neutrals); premium craft-blog look.';

// Same fix as the automation (lib.js liveZone): Morocco is GMT+0 for good since 20 September 2026,
// but servers with older time-zone data still add one hour, so the schedule uses UTC there.
const ZONE_FIXES = [
  { zones: ['Africa/Casablanca', 'Africa/El_Aaiun'], from: Date.UTC(2026, 8, 20, 1), use: 'UTC' },
];

export function scheduleZone(tz, now = new Date()) {
  const fix = ZONE_FIXES.find((f) => f.zones.includes(tz) && now.getTime() >= f.from);
  return fix ? fix.use : tz;
}

// Everything in the Codex prompt that depends on what the account is about. "other" adapts to the niche text.
export const CATEGORIES = {
  crochet: {
    name: 'Crochet & knitting',
    audience: 'US Pinterest users (mostly women 25–55) looking for crochet and knitting ideas, gifts and projects. US English, US crochet terms.',
    linkLabel: 'free pattern page: open it, download the free PDF pattern, see STEP 4',
    pageRules: `1. Open the page. Find the free PDF pattern (download button or link), download it to a temporary folder and read it:
   render the pages to images and look at them, and read the text. If there is no PDF, or it needs an email or a login,
   use the page's photos and text instead and say so in the report.
2. Note the facts: what it is (which animal / flower / item), key features, colors, size, yarn and hook, difficulty, what
   the PDF includes.`,
    productExample: 'Free Mini Bunny Pattern',
    sameKind: 'it must clearly be the same kind of thing. A cat pattern gets a crochet cat, never a dog or a generic animal.',
    planExample: 'for mini crochet animals: bunnies → frogs → cats → bats before Halloween → …',
    focusExample: 'the free bunny pattern → "crochet bunnies"',
    boardExample: 'Crochet Bunny Patterns',
    formats: ` F1 Hero shot — the finished piece, close and sharp, styled scene.
 F2 Numbered list — "12 Cute Crochet Bunny Ideas": a 4–6 tile grid of variations, number large.
 F3 Step-by-step — 3–4 panels from yarn to finished piece.
 F4 In real life — the piece in a real home setting.
 F5 Occasion / gift — wrapped as a gift or styled for a moment 30–60 days ahead.
 F6 Detail — macro of stitches and texture with a small label.
 F7 Color story — the same piece in 3–5 colorways.
 F8 Quick-win hook — "Crochet This in One Evening" (only if true for this kind of project).
 F9 Editorial — a beautiful photo with very little text.
 F10 Before/after — yarn on one side, finished piece on the other.`,
    ctaTruth: 'the patterns are free, so it is true',
    ctaWords: '"FREE PATTERN", "FREE PDF PATTERN", "FREE CROCHET PATTERN" or "DOWNLOAD FREE PDF"; FREE is always among the most visible words',
    ctaStyle: 'yarn-ball badge, stitched ribbon, tag, sticker, banner',
    imageRules: `   - subject: the exact piece, yarn (cotton, worsted, chunky, velvet…), visible stitches, colors from the palette
   - composition: vertical 2:3, the piece fills 55–70% of the frame, clear focal point, calm area for the text
   - camera and light: lens, angle (flat lay, 45°, eye level), soft natural light, shallow depth of field, true colors
   - realism: real yarn fibers and slight fuzz, consistent stitches, small natural irregularities, real materials (wood,
     linen, ceramic, paper); not felt, plastic, clay or 3D render
   - no people, faces, hands, logos, watermarks, brand names or stray text in the photo`,
    shapeCheck: 'correct shapes (right animal / flower, anatomy, petals, symmetry)',
    titleNote: 'link lines may include "Free Pattern" or "Free PDF".',
    descCta: 'Tap to download the free PDF pattern.',
    saveCta: 'Save it for your next project.',
    styleExample: 'F2 list · L5 grid · CTA ribbon · pastel bunnies on linen',
  },
  food: {
    name: 'Food & recipes',
    audience: 'US Pinterest users (mostly women 25–55) looking for recipes, dinner ideas and food inspiration. US English; US measurements (cups, °F) with metric in brackets when useful.',
    linkLabel: 'recipe page: open it and read the recipe (and its free PDF / recipe card if it has one), see STEP 4',
    pageRules: `1. Open the page and read the recipe: dish name, ingredients with amounts, steps, total time, servings, cuisine and
   occasion. If the page offers a free PDF or recipe card, download it to a temporary folder and read it too (render the
   pages to images). If the page cannot be read, say so in the report and use only what you could see.
2. Note the facts you may use on pins: the exact dish, its key ingredients, real cooking time and servings, difficulty,
   and what makes it special. Never invent ingredients, times or servings that the recipe does not have.`,
    productExample: 'Moroccan Chicken Tagine Recipe',
    sameKind: 'it must clearly be the same dish. A chicken tagine recipe gets a chicken tagine, never couscous or a different dish.',
    planExample: 'for Moroccan recipes: chicken tagines → couscous → Moroccan salads → harira and soups → Ramadan iftar dishes before Ramadan → Moroccan pastries before Eid → …',
    focusExample: 'the lemon chicken tagine page → "Moroccan chicken tagines"',
    boardExample: 'Moroccan Tagine Recipes',
    formatRule: 'EVERY pin uses this one design, the owner\'s signature recipe infographic. Vary the dish, the photos and the small details, never the design system:',
    layoutRule: 'Layout: always the recipe infographic above (vary only the details listed there).',
    formats: ` RECIPE INFOGRAPHIC — exactly this design, 1000 × 1500 (vertical 2:3):
 • Background: warm cream paper (#F8F2E7), flat, with a very faint paper texture.
 • Top, centered, full width:
   - a small ornament: one 8-point zellige star (terracotta #C4552D and deep teal #0E4D45) between two thin deep-teal
     lines;
   - the dish name in 2 lines, big bold serif (DM Serif Display or Playfair Display Bold), deep teal #0E4D45, at least
     ~70 px tall, for example "Moroccan" / "Chermoula Sardines";
   - one italic serif subline in terracotta #C4552D, about 40 px, for example "Crisp Fish & Fragrant Herbs";
   - a second, identical ornament under the subline.
 • Center: the HERO photo, the finished dish seen from above on a round Moroccan ceramic plate (cream glaze, deep-teal
   and terracotta geometric border), the food arranged beautifully (radial, stacked or in its tagine), fresh garnish
   (parsley or cilantro sprigs, lemon wedges), one piece cut open to show the inside when that makes sense, a loose herb
   sprig beside the plate and a cream linen napkin with thin teal stripes tucked under one side. Soft natural window
   light, gentle shadows, true appetizing colors. The plate is the biggest element on the pin.
 • Left and right of the hero: 6 numbered step tiles in two columns, read in zig-zag order (left: 1, 3, 5; right: 2,
   4, 6). Each tile, top to bottom:
   - a filled deep-teal circle with a white number, and next to it the step name in bold teal serif, 2–3 words, about
     30 px ("Gather Ingredients", "Clean & Butterfly", "Mix the Chermoula", "Fill & Pair", "Coat & Fry", "Drain & Serve");
   - a rounded-corner landscape photo (about 4:3) of exactly that step: ingredients in small ceramic bowls on a light
     surface, prep on a wooden board, mixing in a patterned Moroccan bowl, cooking in a black pan or tagine, serving;
     the same warm light and color grading as the hero;
   - a 1–2 line caption in a clean sans-serif (Inter or Source Sans 3), dark grey #2E2E2E, at least ~22 px, saying
     exactly what happens in that step ("Clean sardines, cilantro, parsley, garlic, cumin, paprika, lemon, olive oil,
     flour.").
 • Bottom center: the same zellige-star ornament between two thin lines.
 • Steps: use the REAL steps of the recipe, in the right order, condensed to 6 (4 only when the recipe is truly
   shorter, then the tiles grow). Step 1 shows only the recipe's real ingredients.
 Better than the example:
 • the dish name is readable on a phone thumbnail (high contrast, at most 4 words per line);
 • captions are short, concrete and consistent in length; no tiny text;
 • every photo shares one light direction and one color grade, so the pin looks like a single professional shoot;
 • link pins: a terracotta ribbon right above the bottom ornament with the call to action in cream capitals
   ("GET THE FULL RECIPE"), clearly visible but never covering a photo.
 Variety without breaking the design: the dish and every photo are new each time; the plate border can switch between
 deep teal, cobalt blue, saffron and terracotta patterns; the napkin stripe color and garnish change; the subline changes.
 Build it like this: generate the hero photo (1:1, overhead) and each step photo (4:3) separately WITHOUT any text, then
 compose the whole pin with Python + Pillow (exact fonts, exact spelling, exact positions). Fonts: download the free
 Google Fonts named above if they are missing.`,
    ctaTruth: 'only promise what the page gives: the full recipe; say FREE only if the page offers a free PDF or recipe card',
    ctaWords: '"GET THE RECIPE", "FULL RECIPE", "EASY RECIPE INSIDE" or (only if the page offers one) "FREE RECIPE CARD"',
    ctaStyle: 'recipe-card tag, ribbon, round stamp, zellige-pattern badge, banner',
    imageRules: `   - every photo (hero and steps) shows the real dish or the real step of the recipe, appetizing and true to life:
     real texture (glaze, char, steam, crumbs, juices), the garnish the recipe uses
   - authentic setting for the cuisine (for Moroccan food: patterned ceramic plates and bowls, tagine pots, zellige,
     brass, wooden boards, cream linen), consistent across all photos of the pin
   - hero: 1:1, overhead, the plate fills most of the frame; steps: 4:3, the action clearly visible
   - camera and light: soft natural window light from one side, gentle shadows, true colors, one color grade for all
   - realism: real food photography; never plastic-looking, melted or impossible food, never ingredients the recipe
     does not use
   - no people, faces, hands, logos, watermarks, brand names or any text inside the photos`,
    shapeCheck: 'correct food (the right dish, real ingredients, believable portions, no strange shapes) and, on infographics, steps that match the real recipe in the right order',
    titleNote: 'never promise a time, serving count or ingredient the recipe does not have.',
    descCta: 'Tap for the full recipe.',
    saveCta: 'Save it for your next dinner.',
    styleExample: 'F0 infographic (b) · hero + 6 steps · CTA ribbon · chermoula sardines on zellige plate',
  },
  home: {
    name: 'Home & decor',
    audience: 'US Pinterest users (mostly women 25–55) looking for home decor, room ideas and styling inspiration. US English.',
    linkLabel: 'page: open it and read what it offers (and its free PDF / guide if it has one), see STEP 4',
    pageRules: `1. Open the page and read what it offers (product, idea, guide). If it offers a free PDF or guide, download it to a
   temporary folder and read it (render the pages to images). If the page cannot be read, say so in the report.
2. Note the facts you may use: what it is, style, colors, materials, room, size, price level, what is included.`,
    productExample: 'Cozy Boho Living Room Guide',
    sameKind: 'it must clearly be the same kind of thing (the same room type, style and item).',
    planExample: 'cozy living rooms → small bedrooms → entryways → fall decor before fall → holiday decor before December → …',
    focusExample: 'the boho living room page → "boho living rooms"',
    boardExample: 'Boho Living Room Ideas',
    formats: ` F1 Hero room — one beautiful room or corner, the idea clearly visible.
 F2 Numbered list — "15 Cozy Living Room Ideas": a 4–6 tile grid.
 F3 Step-by-step — 3–4 panels of a makeover or styling steps.
 F4 Shop the look — the room plus the key pieces around it.
 F5 Season / occasion — styled for a moment 30–60 days ahead.
 F6 Detail — close-up of texture, material or styling.
 F7 Color story — the same room in 3–4 palettes.
 F8 Quick-win hook — "Refresh Your Entry in a Weekend" (only if true).
 F9 Editorial — a calm, beautiful interior with very little text.
 F10 Before/after — the space before and after.`,
    ctaTruth: 'only promise what the page gives',
    ctaWords: '"SEE THE IDEAS", "GET THE LOOK", "FREE GUIDE" (only if the page gives one) or "SHOP THE LOOK" (only for shoppable pages)',
    ctaStyle: 'label, ribbon, tag, sticker, banner',
    imageRules: `   - subject: a believable, beautiful real interior or object in the account's style and palette
   - composition: vertical 2:3, clear focal point, calm area for the text
   - camera and light: wide or detail shot, soft natural light, straight verticals, true colors
   - realism: real materials and proportions, real furniture that could exist; no impossible architecture
   - no people, faces, logos, watermarks, brand names or stray text in the photo`,
    shapeCheck: 'correct, believable rooms and objects (proportions, perspective, real furniture)',
    titleNote: 'never promise what the page does not give.',
    descCta: 'Tap to see all the ideas.',
    saveCta: 'Save it for your next refresh.',
    styleExample: 'F2 list · L5 grid · CTA tag · warm boho living rooms',
  },
  printables: {
    name: 'Printables & planners',
    audience: 'US Pinterest users (mostly women 25–55) looking for printables, planners, worksheets and organizing ideas. US English.',
    linkLabel: 'printable page: open it, download the free printable / PDF, see STEP 4',
    pageRules: `1. Open the page. Find the free printable or PDF (download button or link), download it to a temporary folder and read
   it: render the pages to images and look at them. If there is no download, or it needs an email or a login, use the
   page's images and text instead and say so in the report.
2. Note the facts: what it is (planner, checklist, worksheet…), pages, sizes, who it is for, colors and style.`,
    productExample: 'Free Weekly Meal Planner Printable',
    sameKind: 'it must clearly be the same printable (same type, purpose and look family).',
    planExample: 'weekly planners → meal planners → cleaning checklists → back-to-school printables before August → holiday planners before November → …',
    focusExample: 'the weekly meal planner page → "meal planner printables"',
    boardExample: 'Free Planner Printables',
    formats: ` F1 Hero mockup — the printable on a desk or clipboard, clearly readable.
 F2 Numbered list — "8 Free Planner Printables": a grid of pages.
 F3 How to use — 3–4 panels showing it in use.
 F4 In real life — printed and used at home.
 F5 Season / occasion — styled for a moment 30–60 days ahead.
 F6 Detail — close-up of a useful section.
 F7 Color story — the printable in 3 color versions.
 F8 Quick-win hook — "Plan Your Week in 10 Minutes" (only if true).
 F9 Editorial — a beautiful desk scene with very little text.
 F10 Before/after — messy schedule vs. planned week.`,
    ctaTruth: 'the printables are free, so it is true',
    ctaWords: '"FREE PRINTABLE", "FREE DOWNLOAD", "PRINT IT FREE" or "FREE PDF"; FREE is always among the most visible words',
    ctaStyle: 'paper tag, washi-tape label, sticker, ribbon, banner',
    imageRules: `   - subject: a realistic mockup of the printable (paper texture, clipboard, desk, pen), the printable's real look
   - composition: vertical 2:3, the printable fills 50–70% of the frame, clear focal point, calm area for the text
   - camera and light: overhead or 45°, soft natural light, true colors
   - realism: real paper and desk items; the printable's own text is not readable in the photo (add text with Pillow)
   - no people, faces, logos, watermarks, brand names or stray text in the photo`,
    shapeCheck: 'correct printable look (straight paper, realistic mockup, no warped pages)',
    titleNote: 'link lines may include "Free Printable".',
    descCta: 'Tap to download the free printable.',
    saveCta: 'Save it for later.',
    styleExample: 'F1 mockup · L1 top band · CTA washi label · pastel planner on oak desk',
  },
  diy: {
    name: 'DIY & crafts',
    audience: 'US Pinterest users (mostly women 25–55) looking for DIY projects, craft ideas and tutorials. US English.',
    linkLabel: 'tutorial page: open it, read it and download its free PDF / template if it has one, see STEP 4',
    pageRules: `1. Open the page and read the tutorial (materials, steps, time, difficulty). If it offers a free PDF or template,
   download it to a temporary folder and read it (render the pages to images). If the page cannot be read, say so.
2. Note the facts you may use: the exact project, materials, real time, difficulty, what is included.`,
    productExample: 'Free Paper Flower Template',
    sameKind: 'it must clearly be the same project.',
    planExample: 'paper flowers → mason jar crafts → kids crafts → fall wreaths before fall → holiday crafts before December → …',
    focusExample: 'the paper flower tutorial → "paper flowers"',
    boardExample: 'Paper Flower Tutorials',
    formats: ` F1 Hero shot — the finished project, close and sharp, styled scene.
 F2 Numbered list — "12 Easy Paper Flower Ideas": a grid of variations.
 F3 Step-by-step — 3–4 numbered panels from materials to finished project.
 F4 In real life — the project used in a real home.
 F5 Occasion / gift — styled for a moment 30–60 days ahead.
 F6 Detail — close-up of texture and technique.
 F7 Color story — the project in 3–5 colors.
 F8 Quick-win hook — "Make This in 20 Minutes" (only if true).
 F9 Editorial — a beautiful photo with very little text.
 F10 Before/after — materials on one side, finished project on the other.`,
    ctaTruth: 'only promise what the page gives; say FREE only for free downloads',
    ctaWords: '"FREE TEMPLATE", "FREE TUTORIAL", "STEP-BY-STEP INSIDE" or "DOWNLOAD FREE PDF" (only if the page offers it)',
    ctaStyle: 'craft tag, paper ribbon, stamp, sticker, banner',
    imageRules: `   - subject: the exact finished project, real materials and textures, colors from the palette
   - composition: vertical 2:3, the project fills 55–70% of the frame, clear focal point, calm area for the text
   - camera and light: flat lay, 45° or eye level; soft natural light, shallow depth of field, true colors
   - realism: real craft materials with small natural irregularities; not plastic or 3D render
   - no people, faces, hands, logos, watermarks, brand names or stray text in the photo`,
    shapeCheck: 'correct, believable project (real materials, believable construction)',
    titleNote: 'never promise a time or result the tutorial does not give.',
    descCta: 'Tap for the full tutorial.',
    saveCta: 'Save it for your next project.',
    styleExample: 'F3 steps · L6 panels · CTA craft tag · pastel paper flowers on linen',
  },
  other: {
    name: 'Other (Codex adapts to the niche)',
    audience: 'US Pinterest users interested in this niche (decide the exact audience from your research). US English.',
    linkLabel: 'page: open it, read what it offers (and download its free PDF if it has one), see STEP 4',
    pageRules: `1. Open the page and read what it offers. If it offers a free PDF or download, download it to a temporary folder and read
   it (render the pages to images). If the page cannot be read, say so in the report.
2. Note the facts you may use on pins: what it is, key features, who it is for, what is included. Never invent facts.`,
    productExample: 'short name of what the page offers',
    sameKind: 'it must clearly show the same thing the page is about.',
    planExample: 'the 10–20 most promising micro-niches of this niche, seasonal ones placed 30–60 days before their season',
    focusExample: 'the topic of those pages',
    boardExample: 'a board name people really search in this niche',
    formats: ` F1 Hero shot — the subject as the clear focal point, styled scene.
 F2 Numbered list — "10 Best … Ideas": a 4–6 tile grid of variations.
 F3 Step-by-step — 3–4 numbered panels.
 F4 In real life — the subject in a real setting.
 F5 Occasion — styled for a moment 30–60 days ahead.
 F6 Detail — a close-up with a small label.
 F7 Variations — the same subject in 3–5 versions.
 F8 Quick-win hook — a fast, true benefit.
 F9 Editorial — a beautiful photo with very little text.
 F10 Before/after.
 Adapt these formats to what works best in this niche (STEP 5 research).`,
    ctaTruth: 'only promise what the page gives; say FREE only for free things',
    ctaWords: 'the strongest true call to action for this page (for example "FREE GUIDE", "SEE ALL IDEAS", "GET IT HERE")',
    ctaStyle: 'tag, ribbon, sticker, badge, banner that fit the niche',
    imageRules: `   - subject: exactly what the pin is about, attractive and true to life, colors from the palette
   - composition: vertical 2:3, the subject fills 55–70% of the frame, clear focal point, calm area for the text
   - camera and light: a fitting angle, soft natural light, shallow depth of field, true colors
   - realism: believable, real-looking materials and proportions; not plastic or 3D render
   - no people, faces, hands, logos, watermarks, brand names or stray text in the photo`,
    shapeCheck: 'correct, believable subject (right thing, real proportions)',
    titleNote: 'never promise what the page does not give.',
    descCta: 'Tap to see it all.',
    saveCta: 'Save it for later.',
    styleExample: 'F1 hero · L1 top band · CTA tag · palette scene',
  },
};

const DEFAULT_FORMAT_RULE = 'Use at least 5 different formats:';
const DEFAULT_LAYOUT_RULE = 'Layouts (never the same twice in a row, max 3 of one per batch): L1 top text band · L2 bottom text band · L3 side label ·\nL4 floating label · L5 grid with center label · L6 numbered panels · L7 minimal text.';

export function categoryOf(a) {
  return CATEGORIES[a && a.category] || CATEGORIES.crochet;
}

export function hourLabel(h) {
  return `${String(h).padStart(2, '0')}:00`;
}

export function slug(name) {
  return String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pin';
}

// n posting hours spread evenly, preferring 09:00–21:00 and widening only when needed.
export function spreadHours(n) {
  const count = Math.max(1, Math.min(MAX_PER_DAY, Math.round(n) || 1));
  let start = 9;
  let end = 21;
  while (end - start + 1 < count) {
    if (start > FIRST_HOUR) start--;
    if (end - start + 1 < count && end < LAST_HOUR) end++;
  }
  if (count === 1) return [12];
  const out = new Set();
  for (let i = 0; i < count; i++) out.add(Math.round(start + (i * (end - start)) / (count - 1)));
  let h = start;
  while (out.size < count && h <= end) { out.add(h); h++; }
  return [...out].sort((a, b) => a - b);
}

export function emptyAccount() {
  return {
    id: Math.random().toString(36).slice(2, 10), name: '', username: '', connection: '', niche: '', general: false, category: 'crochet', source: 'niche', website: '', pinsPerProduct: 6,
    useLink: false, link: '', pinsPerDay: 5, hours: spreadHours(5), brand: '', pinsPerRun: 15, on: true,
  };
}

export function defaultState() {
  return {
    emailTo: '', botEmail: '', timeZone: 'Africa/Casablanca', reportHour: 22, emailEveryPin: true, lowQueue: 10,
    notifyEmail: true, notifyTelegram: false, telegram: '',
    google: '', gmail: '', accounts: [], sameSchedule: false, sharedPinsPerDay: 5, sharedHours: spreadHours(5),
    batch: { accountId: '', lines: [newLine('link')] }, batches: [],
  };
}

// One line of a "New pins" batch: a page link (kind "link") or pins without a link (kind "free"), and how many pins.
export function newLine(kind = 'link', count = 5) {
  return { id: Math.random().toString(36).slice(2, 10), kind, url: '', count };
}

export const MAX_BATCH = 40;
const PAGE_URL = /^https:\/\/[^\s/]+\.[^\s]+$/;

// Errors of the New pins tab: { 'batch:account' | 'batch:lines' | 'batch:total' | 'batch:line:<id>:url' | ...: { code } }.
export function validateBatch(state) {
  const e = {};
  const b = state.batch || { lines: [] };
  if (!state.accounts.some((a) => a.id === b.accountId)) e['batch:account'] = { code: 'pickAccount' };
  const lines = b.lines || [];
  const account = state.accounts.find((a) => a.id === b.accountId);
  if (!lines.length) e['batch:lines'] = { code: 'lines' };
  const seen = new Set();
  for (const l of lines) {
    const url = String(l.url || '').trim();
    if (l.kind === 'link') {
      if (!PAGE_URL.test(url)) e[`batch:line:${l.id}:url`] = { code: 'pageUrl' };
      else if (seen.has(url.toLowerCase())) e[`batch:line:${l.id}:url`] = { code: 'urlDup' };
      seen.add(url.toLowerCase());
    }
    if (l.kind === 'next' && !(account && account.source === 'website')) e[`batch:line:${l.id}:count`] = { code: 'nextNeedsWebsite' };
    else if (!(l.count >= 1 && l.count <= (l.kind === 'next' ? 5 : 30))) e[`batch:line:${l.id}:count`] = { code: 'lineCount' };
    else if (l.kind === 'next' && l.perRound && !(l.perRound >= 3 && l.perRound <= 15)) e[`batch:line:${l.id}:count`] = { code: 'perProduct' };
  }
  const total = lines.reduce((n, l) => n + linePins(l, account), 0);
  if (total > MAX_BATCH) e['batch:total'] = { code: 'batchTotal' };
  return e;
}

// Pins of a line: a "next" line counts products (each gets the account's pins per product).
export function linePins(l, account) {
  const n = Number(l.count) || 0;
  return l.kind === 'next' ? n * (Number(l.perRound) || (account && account.pinsPerProduct) || 6) : n;
}

export function batchTotal(batch, account) {
  return ((batch && batch.lines) || []).reduce((n, l) => n + linePins(l, account), 0);
}

// The schedule an account really uses (its own, or the shared one).
export function scheduleOf(state, a) {
  const perDay = state.sameSchedule ? state.sharedPinsPerDay : a.pinsPerDay;
  const hours = state.sameSchedule ? state.sharedHours : a.hours;
  return { perDay: Number(perDay) || 0, hours: [...new Set(hours || [])].sort((x, y) => x - y) };
}

// Returns { field: { code, n? } } for everything that blocks generating the files.
// Codes: email, id, idDup, idSame, name, nameDup, niche, link, hours, perDay, perRun, accounts, channel.
export function validate(state) {
  const e = {};
  const v = (s) => String(s || '').trim();
  const useEmail = state.notifyEmail !== false;
  const useTelegram = Boolean(state.notifyTelegram);
  if (!useEmail && !useTelegram) e.channels = { code: 'channel' };
  if (useEmail && !EMAIL.test(v(state.emailTo))) e.emailTo = { code: 'email' };
  if (!EMAIL.test(v(state.botEmail))) e.botEmail = { code: 'email' };
  if (!(state.reportHour >= FIRST_HOUR && state.reportHour <= LAST_HOUR)) e.reportHour = { code: 'hours', n: 1 };
  if (!CONNECTION_ID.test(v(state.google))) e.google = { code: 'id' };
  if (useEmail) {
    if (!CONNECTION_ID.test(v(state.gmail))) e.gmail = { code: 'id' };
    else if (v(state.google) === v(state.gmail)) e.gmail = { code: 'idSame' };
  }
  if (useTelegram) {
    if (!CONNECTION_ID.test(v(state.telegram))) e.telegram = { code: 'id' };
    else if ([v(state.google), useEmail ? v(state.gmail) : ''].includes(v(state.telegram))) e.telegram = { code: 'idDup' };
  }
  if (state.sameSchedule) {
    const s = scheduleOf(state, {});
    if (!(s.perDay >= 1 && s.perDay <= MAX_PER_DAY)) e.sharedPinsPerDay = { code: 'perDay' };
    else if (s.hours.length !== s.perDay) e.sharedHours = { code: 'hours', n: s.perDay };
  }
  if (!state.accounts.length) e.accounts = { code: 'accounts' };
  const names = new Set();
  const conns = new Set([v(state.google), useEmail ? v(state.gmail) : '', useTelegram ? v(state.telegram) : ''].filter(Boolean));
  state.accounts.forEach((a) => {
    const p = `account:${a.id}:`;
    const n = v(a.name);
    if (!ACCOUNT_NAME.test(n)) e[`${p}name`] = { code: 'name' };
    else if (names.has(n.toLowerCase())) e[`${p}name`] = { code: 'nameDup' };
    names.add(n.toLowerCase());
    const c = v(a.connection);
    if (!CONNECTION_ID.test(c)) e[`${p}connection`] = { code: 'id' };
    else if (conns.has(c)) e[`${p}connection`] = { code: 'idDup' };
    conns.add(c);
    if (a.source === 'website') {
      if (!/^https:\/\/[^\s/]+\.[^\s]+$/.test(v(a.website))) e[`${p}website`] = { code: 'pageUrl' };
      if (!(a.pinsPerProduct >= 3 && a.pinsPerProduct <= 15)) e[`${p}pinsPerProduct`] = { code: 'perProduct' };
    } else if (!a.general && !v(a.niche)) e[`${p}niche`] = { code: 'niche' };
    if (!state.sameSchedule) {
      const s = scheduleOf(state, a);
      if (!(s.perDay >= 1 && s.perDay <= MAX_PER_DAY)) e[`${p}pinsPerDay`] = { code: 'perDay' };
      else if (s.hours.length !== s.perDay) e[`${p}hours`] = { code: 'hours', n: s.perDay };
    }
  });
  return e;
}

export function buildConfig(state, version) {
  return {
    version,
    shareWith: String(state.emailTo || '').trim(),
    settings: {
      emailTo: String(state.emailTo || '').trim(),
      notifyEmail: state.notifyEmail !== false,
      notifyTelegram: Boolean(state.notifyTelegram),
      emailEveryPin: Boolean(state.emailEveryPin),
      lowQueue: Number(state.lowQueue) || 0,
      timeZone: state.timeZone,
      reportHour: Number(state.reportHour),
    },
    accounts: state.accounts.map((a) => {
      const s = scheduleOf(state, a);
      return {
        name: String(a.name).trim(),
        connection: String(a.connection).trim(),
        niche: a.general ? `General – trending ${categoryOf(a).name.toLowerCase()} niches${a.niche ? ` (${String(a.niche).trim()})` : ''}` : String(a.niche).trim(),
        link: '',
        hours: s.hours,
        dailyCap: s.hours.length,
        on: a.on !== false,
      };
    }),
  };
}

const PLACEHOLDERS = ['__GOOGLE_CONNECTION__', '__GMAIL_CONNECTION__', '__TELEGRAM_CONNECTION__', '__TIME_ZONE__', '__CONFIG__'];

// Removes a step from the main chain (a channel that is not used gets no login step at all).
function dropStep(trigger, name) {
  let prev = trigger;
  while (prev && prev.nextAction) {
    if (prev.nextAction.name === name) {
      prev.nextAction = prev.nextAction.nextAction;
      return;
    }
    prev = prev.nextAction;
  }
}

// Code steps read a removed login step as an empty value, which they treat as "channel off".
function blankInputs(step, name) {
  for (; step; step = step.nextAction) {
    const input = step.settings && step.settings.input;
    if (input && step.type === 'CODE') {
      for (const [k, v] of Object.entries(input)) if (v === `{{${name}['output']}}`) input[k] = '';
    }
    if (step.firstLoopAction) blankInputs(step.firstLoopAction, name);
  }
}

function deepReplace(value, map) {
  if (typeof value === 'string') return Object.prototype.hasOwnProperty.call(map, value) ? map[value] : value;
  if (Array.isArray(value)) return value.map((v) => deepReplace(v, map));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = deepReplace(v, map);
    return out;
  }
  return value;
}

// The Activepieces import file: the template with this person's IDs, time zone and settings.
export function buildImportFile(templateText, state, version) {
  const template = JSON.parse(templateText);
  const config = buildConfig(state, version);
  const filled = deepReplace(template, {
    __GOOGLE_CONNECTION__: String(state.google).trim(),
    __GMAIL_CONNECTION__: String(state.gmail || '').trim(),
    __TELEGRAM_CONNECTION__: String(state.telegram || '').trim(),
    __TIME_ZONE__: scheduleZone(state.timeZone),
    __CONFIG__: JSON.stringify(config),
  });
  const trigger = filled.flows[0].trigger;
  if (state.notifyEmail === false) { dropStep(trigger, 'step_2'); blankInputs(trigger, 'step_2'); }
  if (!state.notifyTelegram) { dropStep(trigger, 'step_tg'); blankInputs(trigger, 'step_tg'); }
  const text = JSON.stringify(filled);
  const left = PLACEHOLDERS.filter((p) => text.includes(`"${p}"`));
  if (left.length) throw new Error(`The template still has blanks: ${left.join(', ')}`);
  return JSON.stringify(filled, null, 1);
}

function batchId(now) {
  const p = (n) => String(n).padStart(2, '0');
  return `B${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
}

// The Codex prompt for one batch of one account. Without a batch: one "no link" line of the account's usual size.
// "Pins come from: My website": the account represents a website; Codex works through its catalog, product by product.
function websiteRule(site, ppp) {
  const base = site.replace(/\/$/, '');
  return `
══════════ WEBSITE MODE — THIS ACCOUNT REPRESENTS ${site} ══════════
This Pinterest account is the Pinterest version of ${site}. Work like a senior Pinterest manager for this website. Nothing
here is fixed: the website changes (new products, new categories), the results change, and the plan follows them.
Never do the same work twice.

STEP 0W — CATALOG, WHAT EXISTS, WHAT WINS, AND THE WEBSITE PLAN (this replaces STEP 3's micro-niche plan):
1. Catalog, EVERY batch (the website changes): read ${base}/sitemap.xml (and the sitemaps it lists); if there is none,
   the menu and listing pages. List every product page (title, URL, free download or not) and every category /
   collection page with the products it contains (Christmas, small animals, beginner, …). New products and new
   categories since the last batch are added to the plan; removed pages are marked Dropped.
2. Products tab: add a row for every product page and every category page that is not there yet (Account, Product =
   the page title, Link = its URL, Pins wanted: ${ppp} for a product, your choice for a category). Never remove or rename.
3. What is already on Pinterest: open the live profile and its pins (pins made by hand count). A page is covered for a
   round when it already has pins for that round's angle on the profile or in the spreadsheet. Match by link, otherwise
   by title and picture.
4. What wins (read it before planning, every batch):
   - this account's pins: statistics in the Pins tab (saves and outbound clicks first, then impressions) and the saves
     visible on the live profile, including pins that were not made by this automation;
   - the niche: pins that are clearly taking off in Pinterest search for these products and categories (many saves,
     shown at the top, repeated by many creators). Inspiration only: never copy another creator's pin.
   For every winner, note WHY it wins (format, layout, headline style, colors, product, season) in its plan row Result.
5. The website plan ("Plan" tab, this account's rows; create it the first time, update it every batch):
   - one row per ROUND. A round = one page + one angle: Order, Focus ("Mini Bunny — first round", "Christmas category
     — roundup of 4", "Mini Bunny — round 2: colorways"), Why (demand evidence + the page's key facts in one line), Boards,
     Status (Next / In progress / Done / Dropped), Started, Finished, Result.
   - PRODUCT rounds: every product gets a first round of ${ppp} pins (all linking to the product page).
   - CATEGORY rounds: categories get their own pins linking to the CATEGORY page: roundups that show several of its
     products in one pin ("4 Free Christmas Crochet Patterns", "6 Mini Animals to Crochet This Weekend"), category
     hero scenes, gift guides, "start here" beginner sets. Bigger and more searched categories get more rounds; each
     round uses a different selection of products and a different style, so no two category pins look the same.
   - WINNER rounds: whatever wins (a product, a category, a format, a headline style, a color story) gets new rounds of
     NEW pins built on why it wins: new picture, new scene, new angle, new headline, never a copy. A product whose pins
     win gets a "round 2" (and more later if it keeps winning); a winning format is used for other products too.
   - ORDER: seasonal products and categories 30–60 days before their season first, then winner rounds, then the highest
     search demand, then the newest. Mix product, category and winner rounds so the feed stays varied.
   - Done rows stay with their Result, so the plan is the complete history.
6. This batch: the "next product" lines take the next Next rows of the plan, in order (one row = one round). Set them to
   In progress with the Started date and Done with the Finished date when their pins are written.
7. No redundant work: reuse the facts saved in the plan; download a product's PDF only once (or when its facts are
   missing); never make a pin, angle or picture that already exists.
8. Style: the account's look must match the website and the pins already on the profile. In STEP 2, build (or check) the
   style guide from the existing pins and the website's own colors, fonts and photo style; let winning styles lead.
Each round = one focus. Every pin gets: the exact link of its page (product or category), a keyword-researched title
and description, keywords (tags), alt text, the right board, and Product / Focus / Batch filled in.
`;
}

export function buildCodexPrompt(promptTemplate, state, account, batch, now = new Date()) {
  const a = account;
  const name = String(a.name).trim();
  const s = scheduleOf(state, a);
  const website = a.source === 'website';
  const lines = (batch && batch.lines && batch.lines.length) ? batch.lines : [website ? newLine('next', 1) : newLine('free', a.pinsPerRun || 15)];
  const total = lines.reduce((n, l) => n + linePins(l, a), 0);
  const ppp = a.pinsPerProduct || 6;
  const perDay = s.hours.length || 1;
  const user = String(a.username || '').trim().replace(/^@/, '');
  const c = categoryOf(a);
  const lineText = lines.map((l, i) => (l.kind === 'next'
    ? `${i + 1}. The next ${l.count} round${l.count === 1 ? '' : 's'} of the website plan (product, category or winner rounds), ${l.perRound || ppp} pins each (= ${l.count * (l.perRound || ppp)} pins): taken from the plan in STEP 0W, then treat each round's page like a link line (STEP 4); every pin gets the call to action of STEP 7`
    : l.kind === 'link'
    ? `${i + 1}. ${l.count} pins → link: ${String(l.url).trim()} (${c.linkLabel}; every pin gets the call to action of STEP 7)`
    : `${i + 1}. ${l.count} pins → No link (same micro-niche as this batch, chosen in STEP 3; no call-to-action wording)`)).join('\n');
  const values = {
    ACCOUNT_NAME: name,
    PINTEREST_USERNAME: user ? `@${user}` : 'username shown in the Accounts tab',
    PROFILE_URL: user ? `https://www.pinterest.com/${user}/` : 'the profile of the username in the Accounts tab',
    NICHE: a.general ? `General ${c.name.toLowerCase()}${a.niche ? ` (${String(a.niche).trim()})` : ''}` : String(a.niche).trim(),
    NICHE_RULE: a.general
      ? `GENERAL account: the growth plan covers the ${c.name.toLowerCase()} topics with the most search interest now and coming up; still only ONE micro-niche per batch.`
      : 'Stay strictly inside this niche. The growth plan splits it into micro-niches; ONE micro-niche per batch.',
    BRAND_STYLE: String(a.brand || '').trim() || 'none — design the look yourself in STEP 2',
    PINS_PER_DAY: String(perDay),
    POSTING_TIMES: s.hours.map(hourLabel).join(', '),
    TIME_ZONE: state.timeZone,
    BOT_EMAIL: String(state.botEmail).trim(),
    FILE_PREFIX: slug(name),
    BATCH_ID: batchId(now),
    BATCH_TOTAL: String(total),
    BATCH_DAYS: String(Math.max(1, Math.ceil(total / perDay))),
    BATCH_LINES: lineText,
    SOURCE_RULE: website ? websiteRule(String(a.website).trim(), ppp) : '',
    CATEGORY_NAME: c.name,
    AUDIENCE: c.audience,
    PAGE_RULES: c.pageRules,
    PRODUCT_EXAMPLE: c.productExample,
    SAME_KIND_RULE: c.sameKind,
    PLAN_EXAMPLE: c.planExample,
    FOCUS_EXAMPLE: c.focusExample,
    BOARD_EXAMPLE: c.boardExample,
    FORMATS: c.formats,
    FORMAT_RULE: c.formatRule || DEFAULT_FORMAT_RULE,
    LAYOUT_RULE: c.layoutRule || DEFAULT_LAYOUT_RULE,
    CTA_TRUTH: c.ctaTruth,
    CTA_WORDS: c.ctaWords,
    CTA_STYLE: c.ctaStyle,
    IMAGE_RULES: c.imageRules,
    SHAPE_CHECK: c.shapeCheck,
    TITLE_NOTE: c.titleNote,
    DESC_CTA: c.descCta,
    SAVE_CTA: c.saveCta,
    STYLE_EXAMPLE: c.styleExample,
  };
  return promptTemplate.replace(/\{\{([A-Z_]+)\}\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(values, k) ? values[k] : m));
}

export function newVersion(now = new Date()) {
  return `${now.toISOString().slice(0, 19)}Z-${Math.random().toString(36).slice(2, 7)}`;
}
