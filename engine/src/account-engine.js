// ============================================================================
// Account engine: runs for ONE Pinterest account inside the hourly loop.
//   1. reads its row in the Accounts tab (on/off, cap, tab, media folder)
//   2. confirms the connected Pinterest account is the right one
//   3. if it is a posting hour: settles anything an interrupted run left in
//      "Posting", then checks and publishes at most ONE Ready pin (creating
//      its board/section first when the Boards tab plans it), and re-reads
//      the pin from Pinterest to verify account, board, text, link and media
//   4. once a day: syncs the account's boards into the Boards tab and the
//      statistics of recent pins into the Pins tab
//   5. records everything (row, Log tab, Accounts tab) and emails you
// It never re-publishes something that might already be live: anything it
// cannot confirm becomes "Needs review".
// ============================================================================

const HEALTH = {
  ok: 'OK', off: 'Off', reconnect: 'Reconnect Pinterest', wrongAccount: 'Wrong Pinterest account',
  queueEmpty: 'Queue empty', pinterestDown: 'Pinterest not responding', review: 'Pin needs review',
};

class StopRun extends Error {}

function createContext(inputs) {
  const tz = DEFAULT_TZ; // replaced by the Settings tab's time zone in loadControl
  const now = new Date();
  const staleOverride = Number(inputs.lockStaleMinutes);
  return {
    websiteJob: inputs.websiteJob && typeof inputs.websiteJob === "object" ? inputs.websiteJob : null,
    quietQueue: inputs.quietQueue === true,
    accountName: cellText(inputs.accountName),
    publish: inputs.publish === undefined || inputs.publish === null || cellText(inputs.publish) === '' ? true : isYes(inputs.publish, true),
    testFault: cellText(inputs.testFault),
    // Test-only: lets the test automation exceed the normal cap while running many live tests in one day.
    capOverride: Number(cellText(inputs.dailyCapOverride)) || 0,
    lockStaleMinutes: Number.isFinite(staleOverride) && cellText(inputs.lockStaleMinutes) !== '' ? staleOverride : LOCK_STALE_MINUTES,
    tz, now, today: localDate(now, tz), stamp: localStamp(now, tz),
    gTok: tokenOf(inputs.google), mailTok: tokenOf(inputs.gmail), pTok: tokenOf(inputs.pinterest), tgTok: secretOf(inputs.telegram),
    inputs: { gmail: inputs.gmail, telegram: inputs.telegram },
    sheetId: null, settings: { emailTo: '', emailEveryPin: true, lowQueue: 10 },
    acc: null, accCols: null, pinCols: null,
    state: { health: '', alerts: {}, username: undefined, lastPost: undefined, pinsLeft: undefined },
    emails: [], problemRows: [], logs: [], fatal: null,
    result: { account: cellText(inputs.accountName), outcome: 'nothing to do', notes: [] },
  };
}

export const code = async (inputs) => {
  if (inputs.skip === true || cellText(inputs.skip) === 'true') return { skipped: true };
  const ctx = createContext(inputs);
  try {
    await run(ctx);
  } catch (e) {
    if (!(e instanceof StopRun)) handleFailure(ctx, e);
  }
  try { await syncProducts(ctx); } catch (e) { ctx.result.notes.push(`products not updated: ${e.message}`); }
  await flush(ctx);
  if (ctx.websiteJob) {
    await websiteRequest(ctx.websiteJob.base, '/finish', {id:ctx.websiteJob.id,token:ctx.websiteJob.token,outcome:ctx.fatal ? 'error' : ctx.result.outcome});
  }
  if (ctx.fatal) throw new Error(ctx.fatal);
  return ctx.result;
};

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------
function inputsWebsite(ctx) { return Boolean(ctx.websiteJob); }

async function run(ctx) {
  if (!ctx.gTok) {
    ctx.fatal = 'The Google connection could not be loaded. Reconnect it in Activepieces > Connections.';
    throw new StopRun();
  }
  await loadControl(ctx);
  const { acc } = ctx;

  if (!acc.on) {
    setHealth(ctx, HEALTH.off);
    ctx.result.outcome = 'account is switched off';
    return;
  }
  // Switched back on (or brand new): start from OK; any problem found below overrides it.
  if ([HEALTH.off, 'New', ''].includes(ctx.state.health)) setHealth(ctx, HEALTH.ok);
  if (!ctx.pTok) {
    return needsReconnect(ctx, 'Activepieces could not load this account\'s Pinterest connection (it may have been deleted, or its login expired).');
  }

  // 1. Right account?
  let me;
  try {
    me = await pinterest.me(ctx.pTok);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'auth') return needsReconnect(ctx, 'Pinterest rejected the saved login.');
    throw e;
  }
  const connected = cellText(me.username);
  if (!acc.username) {
    ctx.state.username = connected;
    acc.username = connected;
  } else if (normalizeName(acc.username) !== normalizeName(connected)) {
    return wrongAccount(ctx, acc.username, connected);
  }

  if (ctx.publish && inputsWebsite(ctx)) {
    const allowed = await websiteRequest(ctx.websiteJob.base, '/authorize', {id:ctx.websiteJob.id,token:ctx.websiteJob.token});
    if (!allowed.allowed) { ctx.result.outcome = 'cancelled by website'; return; }
    if (allowed.batchPolicy && typeof allowed.batchPolicy.batchId === 'string' && Array.isArray(allowed.batchPolicy.excludedBatches)) ctx.websitePolicy = allowed.batchPolicy;
    // Only the protected posting authorization can override the runtime cap. Sheet defaults stay intact.
    if (Number.isInteger(allowed.dailyCap) && allowed.dailyCap > 0 && allowed.dailyCap <= 1440) ctx.acc.dailyCap = ctx.websitePolicy ? allowed.dailyCap : Math.max(ctx.acc.dailyCap, allowed.dailyCap);
  }
  if (ctx.publish) await publishNext(ctx);
  else ctx.result.outcome = 'daily sync only (not a posting hour)';
  if (!ctx.stopMaintenance) await dailyMaintenance(ctx);
}

async function publishNext(ctx) {
  const { acc } = ctx;
  // 2. Read the queue and give every row a stable Pin ID
  let rows = await readPins(ctx);
  await assignPinIds(ctx, rows);
  rows = await markDuplicateIds(ctx, rows);

  // 3. Settle anything an interrupted run left in "Posting"
  const stuck = rows.filter((r) => r.status === 'posting');
  if (stuck.length) {
    let boardsList = null;
    for (const r of stuck) {
      const lockAt = lockTime(r.lock);
      const ageMin = lockAt ? (ctx.now - lockAt) / 60000 : Infinity;
      if (ageMin < ctx.lockStaleMinutes) {
        ctx.result.outcome = 'skipped: another run is publishing for this account right now';
        ctx.stopMaintenance = true;
        log(ctx, '', 'Skipped', '', '', '', `Another run is publishing ${r.pinId} right now`);
        return;
      }
      if (!boardsList) boardsList = await pinterest.boards(ctx.pTok);
      await settleInterrupted(ctx, r, lockAt, boardsList);
    }
    rows = await readPins(ctx);
  }

  // 4. Daily cap
  const usedToday = rows.filter((r) => (r.status === 'done' && r.postedAt.startsWith(ctx.today)) ||
    (r.status === 'needs review' && r.lastAttempt.startsWith(ctx.today))).length;
  ctx.state.pinsLeft = rows.filter((r) => r.status === 'ready').length;
  if (usedToday >= acc.dailyCap) {
    ctx.result.outcome = `daily cap reached (${usedToday}/${acc.dailyCap})`;
    log(ctx, '', 'Daily cap', '', '', '', ctx.result.outcome);
    return;
  }

  // 5. Pick, check and publish the next Ready pin
  const ready = rows.filter((r) => r.status === 'ready' && !r.productPaused && (!ctx.websitePolicy || (ctx.websitePolicy.batchId ? r.batch === ctx.websitePolicy.batchId : !ctx.websitePolicy.excludedBatches.includes(r.batch))));
  if (!ready.length) {
    queueEmpty(ctx);
    log(ctx, '', 'Queue empty', '', '', '', 'No rows with Status Ready');
    return;
  }
  // '' = no date, null = unreadable date (planRow rejects it), otherwise "YYYY-MM-DD HH:MM".
  const due = ready.filter((r) => !r.publishAfter || r.publishAfter <= ctx.stamp);
  if (!due.length) {
    ctx.result.outcome = 'no pin is due yet (Publish after is in the future)';
    log(ctx, '', 'Nothing due', '', '', '', ctx.result.outcome);
    return;
  }

  const env = await loadEnvironment(ctx);
  const done = rows.filter((r) => r.status === 'done');
  let bad = 0;
  let finished = null;
  for (const row of due) {
    if (bad >= MAX_BAD_ROWS_PER_RUN) break;
    if (row.attempts >= MAX_ATTEMPTS) {
      await rejectRow(ctx, row, `Publishing was attempted ${row.attempts} times without success. Check the row, then reset Attempts to 0 and set Status to Ready.`);
      bad++;
      continue;
    }
    const plan = await planRow(ctx, row, env, done);
    if (plan.problems.length) {
      await rejectRow(ctx, row, plan.problems.join(' · '));
      bad++;
      continue;
    }
    const boardProblem = await ensurePlannedBoard(ctx, env, plan);
    if (boardProblem) {
      await rejectRow(ctx, row, boardProblem);
      bad++;
      continue;
    }
    const outcome = await publish(ctx, row, plan);
    if (outcome === 'published' || outcome === 'review') {
      finished = outcome;
      break;
    }
    if (outcome === 'stop') { ctx.stopMaintenance = true; return; }
    bad++;
  }

  const after = await readPins(ctx);
  ctx.state.pinsLeft = after.filter((r) => r.status === 'ready').length;
  if (finished === 'published') {
    ctx.result.outcome = 'published';
    backToNormal(ctx);
  } else if (finished === 'review') {
    ctx.result.outcome = 'needs review';
  } else if (ctx.result.outcome === 'nothing to do') {
    ctx.result.outcome = 'nothing published (every due row had a problem)';
  }
  if (ctx.state.pinsLeft === 0) queueEmpty(ctx);
  else if (ctx.state.pinsLeft <= ctx.settings.lowQueue) queueLow(ctx, ctx.state.pinsLeft);
}

// ---------------------------------------------------------------------------
// Control sheet
// ---------------------------------------------------------------------------
async function loadControl(ctx) {
  const found = await drive.findByMarker(ctx.gTok, CONTROL_MARKER, 'application/vnd.google-apps.spreadsheet');
  if (!found.length) {
    ctx.fatal = 'The "Pinterest Autopilot" spreadsheet was not found in Google Drive. The Prepare step creates it; check that step\'s error in Activepieces → Runs.';
    throw new StopRun();
  }
  ctx.sheetId = found[0].id;
  const [settingsRows, accountRows] = await sheets.batchGet(ctx.gTok, ctx.sheetId, [
    `${quoteTab(TABS.settings)}!A1:C50`, `${quoteTab(TABS.accounts)}!A1:Z200`,
  ]);
  ctx.settings = readSettings(settingsRows);
  ctx.tz = ctx.settings.timeZone;
  ctx.today = localDate(ctx.now, ctx.tz);
  ctx.stamp = localStamp(ctx.now, ctx.tz);

  const head = headerMap(accountRows[0], ACCOUNT_REQUIRED_COLUMNS);
  if (head.missing.length) {
    setupProblem(ctx, `The Accounts tab is missing these columns: ${head.missing.join(', ')}. Restore the headers.`);
    throw new StopRun();
  }
  ctx.accCols = {};
  for (const c of ACCOUNT_COLUMNS) ctx.accCols[c] = head.idx(c);
  let rowIndex = -1;
  for (let i = 1; i < accountRows.length; i++) {
    if (normalizeName((accountRows[i] || [])[head.idx('Account')]) === normalizeName(ctx.accountName)) { rowIndex = i; break; }
  }
  if (rowIndex < 0) {
    setupProblem(ctx, `There is no row for "${ctx.accountName}" in the Accounts tab. Run Setup for this account again.`);
    throw new StopRun();
  }
  const r = accountRows[rowIndex] || [];
  const get = (c) => (head.idx(c) === undefined ? '' : r[head.idx(c)]);
  const slots = Math.max(1, parseHours(get('Posting times')).length || 5);
  const capRaw = Number(cellText(get('Daily cap')));
  let alerts = {};
  try { alerts = JSON.parse(cellText(get('Alerts')) || '{}') || {}; } catch (e) { alerts = {}; }
  ctx.acc = {
    rowNumber: rowIndex + 1,
    name: cellText(get('Account')),
    on: isYes(get('On'), false),
    username: cellText(get('Pinterest username')).replace(/^@/, ''),
    dailyCap: ctx.capOverride > 0 ? ctx.capOverride : (Number.isFinite(capRaw) && capRaw > 0 ? Math.floor(capRaw) : slots),
    pinsTab: cellText(get('Pins tab')) || `${PINS_TAB_PREFIX}${ctx.accountName}`,
    mediaFolderId: folderIdFromLink(get('Media folder')),
    defaultBoard: cellText(get('Default board')),
  };
  ctx.state.health = cellText(get('Health'));
  ctx.state.alerts = alerts;
  ctx.result.account = ctx.acc.name;
  await loadProducts(ctx);
}

// Products tab rows of this account: name -> { link, wanted, made, posted, status, rowNumber }.
async function loadProducts(ctx) {
  ctx.products = new Map();
  let values;
  try { values = await sheets.get(ctx.gTok, ctx.sheetId, `${quoteTab(TABS.products)}!A1:Z3000`); } catch (e) { return; }
  const head = headerMap(values[0], PRODUCT_COLUMNS);
  if (head.missing.length) return;
  ctx.productCols = {};
  for (const c of PRODUCT_COLUMNS) ctx.productCols[c] = head.idx(c);
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    const g = (c) => cellText(r[ctx.productCols[c]]);
    if (!g('Product') || normalizeName(g('Account')) !== normalizeName(ctx.acc.name)) continue;
    ctx.products.set(normalizeName(g('Product')), {
      rowNumber: i + 1, name: g('Product'), link: g('Link'), wanted: Number(g('Pins wanted')) || 0,
      made: g('Pins made'), posted: g('Pins posted'), status: g('Status'), updated: g('Updated'),
    });
  }
}

// Keeps Pins made / Pins posted / Status of this account's products in step with its Pins tab.
async function syncProducts(ctx) {
  if (!ctx.acc || !ctx.products || !ctx.products.size || !ctx.pinCols) return;
  const rows = await readPins(ctx);
  const tab = quoteTab(TABS.products);
  const writes = [];
  for (const [key, p] of ctx.products) {
    const mine = rows.filter((r) => normalizeName(r.product) === key && r.status !== 'skip');
    const made = mine.length;
    const posted = mine.filter((r) => r.status === 'done').length;
    const wanted = p.wanted || made;
    let status = PRODUCT_STATUS.posting;
    if (normalizeName(p.status) === normalizeName(PRODUCT_STATUS.paused)) status = PRODUCT_STATUS.paused;
    else if (wanted && posted >= wanted) status = PRODUCT_STATUS.done;
    else if (made < wanted) status = PRODUCT_STATUS.needs;
    const put = (col, value) => {
      if (ctx.productCols[col] !== undefined) writes.push({ range: `${tab}!${colLetter(ctx.productCols[col])}${p.rowNumber}`, values: [[value]] });
    };
    if (String(made) !== String(p.made) || String(posted) !== String(p.posted) || status !== p.status) {
      put('Pins made', made);
      put('Pins posted', posted);
      put('Status', status);
      put('Updated', ctx.stamp);
    }
  }
  if (writes.length) await sheets.write(ctx.gTok, ctx.sheetId, writes);
}

// ---------------------------------------------------------------------------
// Pins tab access (rows are always located by their Pin ID before writing)
// ---------------------------------------------------------------------------
async function readPins(ctx) {
  let values;
  try {
    values = await sheets.get(ctx.gTok, ctx.sheetId, `${quoteTab(ctx.acc.pinsTab)}!A1:AZ5000`);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'request') {
      setupProblem(ctx, `The tab "${ctx.acc.pinsTab}" was not found. Check the "Pins tab" cell in the Accounts tab.`);
      throw new StopRun();
    }
    throw e;
  }
  const head = headerMap(values[0], PIN_REQUIRED_COLUMNS);
  if (head.missing.length) {
    setupProblem(ctx, `The tab "${ctx.acc.pinsTab}" is missing these columns: ${head.missing.join(', ')}.`);
    throw new StopRun();
  }
  ctx.pinCols = {};
  for (const c of PIN_COLUMNS) ctx.pinCols[c] = head.idx(c); // optional columns may be undefined
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    const g = (c) => r[ctx.pinCols[c]];
    const row = {
      rowNumber: i + 1,
      pinId: cellText(g('Pin ID')),
      status: cellText(g('Status')).toLowerCase(),
      account: cellText(g('Account')),
      mediaType: cellText(g('Media type')) || MEDIA_TYPES.image,
      media: cellText(g('Media')),
      title: cellText(g('Title')),
      description: cellText(g('Description')),
      keywords: cellText(g('Keywords')),
      product: cellText(g('Product')),
      batch: cellText(g('Batch')),
      link: cellText(g('Link')),
      board: cellText(g('Board')),
      section: cellText(g('Board section')),
      altText: cellText(g('Alt text')),
      aiDisclosure: cellText(g('AI disclosure')),
      publishAfter: cellToLocalStamp(g('Publish after')),
      videoCover: cellText(g('Video cover')),
      cardTitles: cellText(g('Card titles')),
      cardLinks: cellText(g('Card links')),
      pinterestPinId: cellText(g('Pinterest Pin ID')),
      postedAt: cellText(g('Posted at')),
      attempts: Number(cellText(g('Attempts'))) || 0,
      lastAttempt: cellText(g('Last attempt')),
      lock: cellText(g('Lock')),
    };
    if (!row.pinId && !row.status && !row.title && !row.media) continue;
    if (row.product) {
      const p = ctx.products && ctx.products.get(normalizeName(row.product));
      if (!p) row.productMissing = !row.link;
      else {
        if (!row.link) row.link = p.link;
        row.productPaused = normalizeName(p.status) === normalizeName(PRODUCT_STATUS.paused);
      }
    }
    rows.push(row);
  }
  return rows;
}

function cell(ctx, column, rowNumber) {
  return `${quoteTab(ctx.acc.pinsTab)}!${colLetter(ctx.pinCols[column])}${rowNumber}`;
}

async function locateRow(ctx, pinId) {
  const letter = colLetter(ctx.pinCols['Pin ID']);
  const values = await sheets.get(ctx.gTok, ctx.sheetId, `${quoteTab(ctx.acc.pinsTab)}!${letter}1:${letter}5000`);
  const hits = [];
  for (let i = 1; i < values.length; i++) {
    if (cellText((values[i] || [])[0]) === pinId) hits.push(i + 1);
  }
  return hits.length === 1 ? hits[0] : null;
}

// Writes cells of the row whose Pin ID is pinId (wherever that row is now).
async function updateRow(ctx, pinId, updates) {
  const rowNumber = await locateRow(ctx, pinId);
  if (!rowNumber) {
    ctx.result.notes.push(`row ${pinId} could not be found to update`);
    return false;
  }
  await sheets.write(ctx.gTok, ctx.sheetId, Object.entries(updates).map(([c, v]) => ({ range: cell(ctx, c, rowNumber), values: [[v]] })));
  return true;
}

async function assignPinIds(ctx, rows) {
  const prefix = (ctx.acc.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'PIN');
  let max = 0;
  for (const r of rows) {
    const m = r.pinId.match(new RegExp(`^${prefix}-(\\d+)$`));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const data = [];
  for (const r of rows) {
    if (r.pinId) continue;
    max += 1;
    r.pinId = `${prefix}-${String(max).padStart(4, '0')}`;
    data.push({ range: cell(ctx, 'Pin ID', r.rowNumber), values: [[r.pinId]] });
  }
  if (data.length) await sheets.write(ctx.gTok, ctx.sheetId, data);
}

async function markDuplicateIds(ctx, rows) {
  const seen = new Map();
  const dupes = [];
  for (const r of rows) {
    if (seen.has(r.pinId)) dupes.push(r);
    else seen.set(r.pinId, r);
  }
  if (!dupes.length) return rows;
  const data = [];
  for (const r of dupes) {
    // Only rows that would be published need this; anything else was already reported or is not queued.
    if (r.status !== 'ready') continue;
    const msg = `Duplicate Pin ID "${r.pinId}" (also used in row ${seen.get(r.pinId).rowNumber}). Give this row a unique Pin ID or clear it.`;
    data.push({ range: cell(ctx, 'Status', r.rowNumber), values: [[STATUS.error]] }, { range: cell(ctx, 'Error', r.rowNumber), values: [[msg]] });
    r.status = 'error';
    problem(ctx, r, msg);
    log(ctx, r.pinId, 'Rejected', r.attempts, '', '', msg);
  }
  if (data.length) await sheets.write(ctx.gTok, ctx.sheetId, data);
  return rows;
}

function lockTime(lock) {
  const iso = cellText(lock).split('|')[1];
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

// ---------------------------------------------------------------------------
// Checking a row before publishing
// ---------------------------------------------------------------------------
async function loadEnvironment(ctx) {
  if (!ctx.acc.mediaFolderId) {
    setupProblem(ctx, 'The "Media folder" cell for this account in the Accounts tab is empty or not a Google Drive folder link.');
    throw new StopRun();
  }
  let files;
  try {
    files = await drive.listFolder(ctx.gTok, ctx.acc.mediaFolderId);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'request') {
      setupProblem(ctx, `The media folder could not be opened (${e.detail}). Check the "Media folder" link in the Accounts tab.`);
      throw new StopRun();
    }
    throw e;
  }
  const byName = new Map();
  for (const f of files) {
    const key = f.name.trim().toLowerCase();
    byName.set(key, byName.has(key) ? 'DUPLICATE' : f);
  }
  const boards = await pinterest.boards(ctx.pTok);
  const plan = await readBoardsTab(ctx);
  return { byName, boards, sections: new Map(), plan };
}

// ---------------------------------------------------------------------------
// Boards tab: "On Pinterest" rows mirror Pinterest; "Planned" rows may be created
// ---------------------------------------------------------------------------
async function readBoardsTab(ctx) {
  let values;
  try {
    values = await sheets.get(ctx.gTok, ctx.sheetId, `${quoteTab(TABS.boards)}!A1:H3000`);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'request') return { rows: [], cols: null };
    throw e;
  }
  const head = headerMap(values[0], BOARD_COLUMNS);
  if (head.missing.length) return { rows: [], cols: null };
  const cols = {};
  for (const c of BOARD_COLUMNS) cols[c] = head.idx(c);
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    const g = (c) => cellText(r[cols[c]]);
    if (!g('Board')) continue;
    rows.push({
      rowNumber: i + 1, account: g('Account'), board: g('Board'), section: g('Section'), description: g('Board description'),
      status: g('Status'), boardId: g('Board ID'), sectionId: g('Section ID'),
    });
  }
  return { rows: rows.filter((r) => normalizeName(r.account) === normalizeName(ctx.acc.name)), cols };
}

function boardCell(ctx, plan, column, rowNumber) {
  return `${quoteTab(TABS.boards)}!${colLetter(plan.cols[column])}${rowNumber}`;
}

// Creates the board and/or section a row needs when the Boards tab plans it. Returns a problem message or null.
async function ensurePlannedBoard(ctx, env, plan) {
  if (!plan.createBoard && !plan.createSection) return null;
  const writes = [];
  try {
    if (plan.createBoard) {
      // Re-read first: another run (or a person) may have just created it.
      env.boards = await pinterest.boards(ctx.pTok);
      let board = env.boards.find((b) => normalizeName(b.name) === normalizeName(plan.createBoard.name));
      if (!board) {
        board = await pinterest.createBoard(ctx.pTok, plan.createBoard.name, plan.createBoard.description);
        env.boards.push(board);
        log(ctx, '', 'Board created', '', '', '', `Board "${board.name}" created on @${ctx.acc.username} (planned in the Boards tab)`);
      }
      plan.board = board;
      for (const r of env.plan.rows.filter((x) => normalizeName(x.board) === normalizeName(board.name) && !x.section)) {
        writes.push({ range: boardCell(ctx, env.plan, 'Status', r.rowNumber), values: [[BOARD_STATUS.live]] },
          { range: boardCell(ctx, env.plan, 'Board ID', r.rowNumber), values: [[String(board.id)]] },
          { range: boardCell(ctx, env.plan, 'Updated', r.rowNumber), values: [[ctx.stamp]] });
      }
    }
    if (plan.createSection) {
      const sections = await pinterest.sections(ctx.pTok, plan.board.id);
      let section = sections.find((s) => normalizeName(s.name) === normalizeName(plan.createSection.name));
      if (!section) {
        section = await pinterest.createSection(ctx.pTok, plan.board.id, plan.createSection.name);
        log(ctx, '', 'Section created', '', '', '', `Section "${section.name}" created in board "${plan.board.name}"`);
      }
      env.sections.set(plan.board.id, [...sections.filter((s) => s.id !== section.id), section]);
      plan.section = section;
      for (const r of env.plan.rows.filter((x) => normalizeName(x.board) === normalizeName(plan.board.name) && normalizeName(x.section) === normalizeName(section.name))) {
        writes.push({ range: boardCell(ctx, env.plan, 'Status', r.rowNumber), values: [[BOARD_STATUS.live]] },
          { range: boardCell(ctx, env.plan, 'Board ID', r.rowNumber), values: [[String(plan.board.id)]] },
          { range: boardCell(ctx, env.plan, 'Section ID', r.rowNumber), values: [[String(section.id)]] },
          { range: boardCell(ctx, env.plan, 'Updated', r.rowNumber), values: [[ctx.stamp]] });
      }
    }
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'request') {
      const what = plan.createSection && plan.board ? `section "${plan.createSection.name}"` : `board "${(plan.createBoard || {}).name}"`;
      const rows = env.plan.rows.filter((x) => normalizeName(x.board) === normalizeName((plan.createBoard || plan.board).name));
      for (const r of rows) writes.push({ range: boardCell(ctx, env.plan, 'Status', r.rowNumber), values: [[BOARD_STATUS.error]] });
      if (writes.length && env.plan.cols) await sheets.write(ctx.gTok, ctx.sheetId, writes);
      return `Pinterest refused to create the planned ${what}: ${e.detail}`;
    }
    throw e;
  }
  if (writes.length && env.plan.cols) await sheets.write(ctx.gTok, ctx.sheetId, writes);
  return null;
}

async function resolveMedia(ctx, env, ref) {
  const byName = env.byName.get(ref.toLowerCase());
  if (byName === 'DUPLICATE') return { error: `There are two files named "${ref}" in the media folder` };
  if (byName) return { file: byName };
  const id = driveIdFromText(ref);
  if (id) {
    try {
      const f = await drive.file(ctx.gTok, id);
      if (f.trashed) return { error: `Drive file "${ref}" is in the trash` };
      return { file: f };
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'request') return { error: `Drive file "${ref}" was not found or the bot account cannot open it` };
      throw e;
    }
  }
  return { error: `"${ref}" is not in this account's media folder` };
}

async function planRow(ctx, row, env, done) {
  const p = [];
  const plan = { problems: p, files: [], board: null, section: null, aiValues: [] };

  if (row.account && normalizeName(row.account) !== normalizeName(ctx.acc.name)) {
    p.push(`This row is for account "${row.account}" but it is in the tab of "${ctx.acc.name}"`);
  }
  if (!row.title) p.push('Title is empty');
  else if (row.title.length > LIMITS.title) p.push(`Title is ${row.title.length} characters (max ${LIMITS.title})`);
  const desc = finalDescription(row.description, row.keywords);
  if (desc.length > LIMITS.description) p.push(`Description + keywords is ${desc.length} characters (max ${LIMITS.description})`);
  if (row.altText.length > LIMITS.altText) p.push(`Alt text is ${row.altText.length} characters (max ${LIMITS.altText})`);
  if (row.productMissing) p.push(`Product "${row.product}" is not in the Products tab for this account (add it there, or fill in Link)`);
  if (row.link && (row.link.length > LIMITS.link || !isValidLink(row.link))) p.push('Link must be a full web address starting with https://');
  if (row.publishAfter === null) p.push('"Publish after" is not a readable date (use YYYY-MM-DD or YYYY-MM-DD HH:MM)');
  const ai = AI_DISCLOSURE_OPTIONS[normalizeName(row.aiDisclosure)];
  if (ai === undefined) p.push(`AI disclosure "${row.aiDisclosure}" is not one of: None, AI modified, Synthetic performer, AI modified + Synthetic performer`);
  else plan.aiValues = ai;

  // Media
  const type = normalizeName(row.mediaType);
  plan.type = type === 'carousel' ? 'carousel' : (type === 'video' ? 'video' : (type === 'image' ? 'image' : null));
  if (!plan.type) p.push(`Media type "${row.mediaType}" must be Image, Carousel or Video`);
  const refs = splitList(row.media, /[,\n]+/);
  if (!refs.length) p.push('Media is empty (type the file name from the media folder, or a Google Drive file link)');
  if (plan.type === 'image' && refs.length > 1) p.push('Image pins take exactly one file (use Media type Carousel for 2–5 images)');
  if (plan.type === 'carousel' && (refs.length < LIMITS.carouselMin || refs.length > LIMITS.carouselMax)) p.push(`A carousel needs ${LIMITS.carouselMin}–${LIMITS.carouselMax} images (found ${refs.length})`);
  if (plan.type === 'video' && refs.length > 1) p.push('Video pins take exactly one video file');
  for (const ref of refs) {
    const m = await resolveMedia(ctx, env, ref);
    if (m.error) { p.push(m.error); continue; }
    const f = m.file;
    if (plan.type === 'video') {
      if (!VIDEO_MIME.includes(f.mimeType)) p.push(`"${f.name}" must be an MP4 or M4V video (it is ${f.mimeType})`);
      if (Number(f.size || 0) > LIMITS.videoBytes) p.push(`"${f.name}" is larger than ${LIMITS.videoBytes / 1048576} MB (this automation's video limit)`);
      const ms = f.videoMediaMetadata && Number(f.videoMediaMetadata.durationMillis);
      if (ms && (ms / 1000 < LIMITS.videoMinSeconds || ms / 1000 > LIMITS.videoMaxSeconds)) p.push(`"${f.name}" is ${Math.round(ms / 1000)} s long (Pinterest needs ${LIMITS.videoMinSeconds} s – ${LIMITS.videoMaxSeconds / 60} min)`);
    } else {
      if (!IMAGE_MIME.includes(f.mimeType)) p.push(`"${f.name}" must be a JPG or PNG (it is ${f.mimeType}). Pinterest accepts other formats in its app, but not through the API`);
      if (Number(f.size || 0) > LIMITS.imageBytes) p.push(`"${f.name}" is larger than 20 MB`);
    }
    plan.files.push(f);
  }
  if (plan.type === 'video' && row.videoCover && !/^\d+(\.\d+)?$/.test(row.videoCover)) {
    const c = await resolveMedia(ctx, env, row.videoCover);
    if (c.error) p.push(`Video cover: ${c.error}`);
    else if (!IMAGE_MIME.includes(c.file.mimeType)) p.push('Video cover must be a JPG or PNG image, or a number of seconds');
    else plan.cover = c.file;
  }
  if (plan.type !== 'carousel' && (row.cardTitles || row.cardLinks)) p.push('Card titles / Card links only apply to Carousel pins');
  if (plan.type === 'carousel') {
    plan.cardTitles = splitList(row.cardTitles, '|');
    plan.cardLinks = splitList(row.cardLinks, '|');
    if (plan.cardTitles.length && plan.cardTitles.length !== refs.length) p.push(`Card titles has ${plan.cardTitles.length} entries but there are ${refs.length} images (separate them with |)`);
    if (plan.cardLinks.length && plan.cardLinks.length !== refs.length) p.push(`Card links has ${plan.cardLinks.length} entries but there are ${refs.length} images (separate them with |)`);
    if (plan.cardLinks.some((l) => !isValidLink(l))) p.push('Every card link must start with https://');
    if (plan.cardTitles.some((t) => t.length > LIMITS.title)) p.push(`Card titles must be at most ${LIMITS.title} characters each`);
  }

  // Board: must exist and be public, or be planned in the Boards tab (then it is created just before publishing).
  const boardName = row.board || ctx.acc.defaultBoard;
  // Only "Planned" (or blank-status) rows count: a board deleted on Pinterest on purpose is never re-created.
  const plannedRows = env.plan.rows.filter((x) => normalizeName(x.board) === normalizeName(boardName) &&
    [normalizeName(BOARD_STATUS.planned), ''].includes(normalizeName(x.status)));
  const sectionPlanned = (name) => plannedRows.some((x) => normalizeName(x.section) === normalizeName(name));
  if (!boardName) p.push('Board is empty and this account has no Default board');
  else {
    const board = env.boards.find((b) => normalizeName(b.name) === normalizeName(boardName));
    if (!board) {
      const planned = plannedRows.find((x) => !x.section) || plannedRows[0];
      if (!planned) p.push(`Board "${boardName}" is not on @${ctx.acc.username} and not planned in the Boards tab. A board is only created when the Boards tab plans it, so a typo never creates a junk board: fix the name, or add the board to the Boards tab with Status "Planned"`);
      else {
        plan.createBoard = { name: planned.board, description: (plannedRows.find((x) => x.description) || {}).description || '' };
        if (row.section) {
          if (sectionPlanned(row.section)) plan.createSection = { name: plannedRows.find((x) => normalizeName(x.section) === normalizeName(row.section)).section };
          else p.push(`Board section "${row.section}" is not planned for board "${planned.board}" in the Boards tab`);
        }
      }
    } else if (board.privacy && board.privacy !== 'PUBLIC') p.push(`Board "${board.name}" is ${String(board.privacy).toLowerCase()} — only public boards are allowed`);
    else {
      plan.board = board;
      if (row.section) {
        if (!env.sections.has(board.id)) env.sections.set(board.id, await pinterest.sections(ctx.pTok, board.id));
        const section = env.sections.get(board.id).find((s) => normalizeName(s.name) === normalizeName(row.section));
        if (section) plan.section = section;
        else if (sectionPlanned(row.section)) plan.createSection = { name: plannedRows.find((x) => normalizeName(x.section) === normalizeName(row.section)).section };
        else p.push(`Board section "${row.section}" does not exist in board "${board.name}" and is not planned in the Boards tab`);
      }
    }
  }

  // Duplicates of something already published
  const mediaKey = refs.map((r) => r.toLowerCase()).sort().join('|');
  const dupe = done.find((d) => d.pinId !== row.pinId && (
    (d.media && splitList(d.media, /[,\n]+/).map((r) => r.toLowerCase()).sort().join('|') === mediaKey) ||
    (d.title && normalizeName(d.title) === normalizeName(row.title))));
  if (dupe) p.push(`Duplicate of ${dupe.pinId} (same ${normalizeName(dupe.title) === normalizeName(row.title) ? 'title' : 'media'}), published ${dupe.postedAt || 'earlier'}`);

  plan.description = desc;
  return plan;
}

async function rejectRow(ctx, row, message) {
  await updateRow(ctx, row.pinId, { Status: STATUS.error, Error: message });
  problem(ctx, row, message);
  log(ctx, row.pinId, 'Rejected', row.attempts, '', '', message);
}

// ---------------------------------------------------------------------------
// Publishing
// ---------------------------------------------------------------------------
async function buildPayload(ctx, row, plan) {
  const payload = { board_id: plan.board.id, title: row.title };
  if (plan.section) payload.board_section_id = plan.section.id;
  if (plan.description) payload.description = plan.description;
  if (row.link) payload.link = row.link;
  if (row.altText) payload.alt_text = row.altText;
  if (plan.aiValues.length) payload.ai_disclosures = { values: plan.aiValues };

  if (plan.type === 'image') {
    const buf = await drive.download(ctx.gTok, plan.files[0].id);
    const type = sniffImageType(buf);
    if (!type) throw new RowProblem(`"${plan.files[0].name}" is not a real JPG or PNG file (its content does not match)`);
    payload.media_source = { source_type: 'image_base64', content_type: type, data: buf.toString('base64') };
  } else if (plan.type === 'carousel') {
    const items = [];
    for (let i = 0; i < plan.files.length; i++) {
      const buf = await drive.download(ctx.gTok, plan.files[i].id);
      const type = sniffImageType(buf);
      if (!type) throw new RowProblem(`"${plan.files[i].name}" is not a real JPG or PNG file`);
      const item = { content_type: type, data: buf.toString('base64') };
      if (plan.cardTitles[i]) item.title = plan.cardTitles[i];
      if (plan.cardLinks[i]) item.link = plan.cardLinks[i];
      items.push(item);
    }
    payload.media_source = { source_type: 'multiple_image_base64', items };
  } else {
    const file = plan.files[0];
    const buf = await drive.download(ctx.gTok, file.id);
    const seconds = mp4DurationSeconds(buf);
    if (seconds !== null && (seconds < LIMITS.videoMinSeconds || seconds > LIMITS.videoMaxSeconds)) {
      throw new RowProblem(`"${file.name}" is ${Math.round(seconds)} s long (Pinterest needs ${LIMITS.videoMinSeconds} s – ${LIMITS.videoMaxSeconds / 60} min)`);
    }
    const upload = await pinterest.registerVideo(ctx.pTok);
    await uploadToPinterestS3(upload, buf, file.name, file.mimeType || 'video/mp4');
    let status = 'registered';
    for (let i = 0; i < 36 && !['succeeded', 'failed'].includes(status); i++) {
      await sleep(i === 0 ? 3000 : 5000);
      status = (await pinterest.mediaStatus(ctx.pTok, upload.media_id)).status;
    }
    if (status !== 'succeeded') throw new RowProblem(`Pinterest could not process the video "${file.name}" (status: ${status})`);
    const source = { source_type: 'video_id', media_id: String(upload.media_id) };
    if (plan.cover) {
      const cover = await drive.download(ctx.gTok, plan.cover.id);
      source.cover_image_content_type = sniffImageType(cover) || 'image/jpeg';
      source.cover_image_data = cover.toString('base64');
    } else if (row.videoCover) {
      source.cover_image_key_frame_time = Math.floor(Number(row.videoCover));
    }
    payload.media_source = source;
  }
  return payload;
}

class RowProblem extends Error {}

async function publish(ctx, row, plan) {
  const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const lockAt = new Date();
  const attempt = row.attempts + 1;
  await updateRow(ctx, row.pinId, {
    Status: STATUS.posting, Lock: `${key}|${lockAt.toISOString()}`, Attempts: attempt, 'Last attempt': ctx.stamp, Error: '',
  });
  // Lock then verify: if a parallel run grabbed the same row, back off.
  const where = await locateRow(ctx, row.pinId);
  const current = where ? (await sheets.get(ctx.gTok, ctx.sheetId, cell(ctx, 'Lock', where)))[0] : null;
  if (!current || !cellText(current[0]).startsWith(`${key}|`)) {
    ctx.result.outcome = 'skipped: another run took this pin';
    return 'stop';
  }
  if (ctx.testFault === 'crash-after-lock') throw new Error('TEST: simulated crash after locking the row');

  let payload;
  try {
    payload = await buildPayload(ctx, row, plan);
  } catch (e) {
    if (e instanceof RowProblem || (e instanceof ApiError && e.kind === 'request')) {
      const msg = e instanceof RowProblem ? e.message : `Media problem: ${e.detail}`;
      await updateRow(ctx, row.pinId, { Status: STATUS.error, Error: msg, Lock: '' });
      problem(ctx, row, msg);
      log(ctx, row.pinId, 'Rejected', attempt, '', '', msg);
      return 'failed';
    }
    await updateRow(ctx, row.pinId, { Status: STATUS.ready, Lock: '' });
    throw e;
  }

  let pin;
  try {
    if (ctx.testFault === 'timeout-before-publish') throw new ApiError('Pinterest', 0, 'TEST: simulated timeout before the publish request reached Pinterest', '');
    pin = await pinterest.createPin(ctx.pTok, payload);
    if (ctx.testFault === 'crash-after-publish') throw new Error('TEST: simulated crash right after Pinterest published the pin');
    if (ctx.testFault === 'timeout-after-publish') throw new ApiError('Pinterest', 0, 'TEST: simulated lost response after Pinterest published the pin', '');
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'auth') {
      await updateRow(ctx, row.pinId, { Status: STATUS.ready, Lock: '' });
      needsReconnect(ctx, 'Pinterest rejected the saved login while publishing.');
      return 'stop';
    }
    if (e instanceof ApiError && e.status === 429) {
      await updateRow(ctx, row.pinId, { Status: STATUS.ready, Lock: '' });
      pinterestDown(ctx, 'Pinterest asked us to slow down (rate limit). The pin stays in the queue.');
      log(ctx, row.pinId, 'Rate limited', attempt, '', '', 'Back in the queue');
      return 'stop';
    }
    if (e instanceof ApiError && e.kind === 'request') {
      const msg = `Pinterest refused this pin: ${e.detail}`;
      await updateRow(ctx, row.pinId, { Status: STATUS.error, Error: msg, Lock: '' });
      problem(ctx, row, msg);
      log(ctx, row.pinId, 'Rejected by Pinterest', attempt, '', '', e.detail);
      return 'failed';
    }
    if (!(e instanceof ApiError)) throw e; // unexpected crash: row stays "Posting" and the next run settles it
    // Timeout / server error: Pinterest may or may not have published it. Look before doing anything else.
    log(ctx, row.pinId, 'Unconfirmed', attempt, '', '', `No clear answer from Pinterest (${e.message}); checking the board`);
    const found = await findPublished(ctx, row, plan.board, lockAt, true);
    if (found) return finalize(ctx, row, found.id, payload, plan, attempt, 'Confirmed on Pinterest after an unclear response');
    return needsReview(ctx, row, attempt, 'Pinterest did not confirm the publish request and the pin was not found on the board. It may still appear. Check the board: if the pin is there, paste its link into "Pin URL" and set Status to Done; if not, set Status back to Ready.');
  }
  return finalize(ctx, row, pin.id, payload, plan, attempt, '');
}

// Re-reads the pin from Pinterest and checks it matches what was sent.
async function finalize(ctx, row, pinId, payload, plan, attempt, note) {
  const url = pinUrl(pinId);
  let got = null;
  try {
    got = await pinterest.getPin(ctx.pTok, pinId);
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
  }
  const issues = [];
  if (!got) issues.push('the pin could not be read back from Pinterest');
  else {
    if (String(got.board_id) !== String(plan.board.id)) issues.push(`board is ${got.board_id}, expected ${plan.board.id}`);
    if (plan.section && String(got.board_section_id) !== String(plan.section.id)) issues.push('board section differs');
    const owner = got.board_owner && got.board_owner.username;
    if (owner && normalizeName(owner) !== normalizeName(ctx.acc.username)) issues.push(`account is @${owner}, expected @${ctx.acc.username}`);
    if (normalizeText(got.title) !== normalizeText(payload.title)) issues.push('title differs');
    if (payload.description && normalizeText(got.description) !== normalizeText(payload.description)) issues.push('description differs');
    if (payload.link && normalizeUrl(got.link) !== normalizeUrl(payload.link)) issues.push(got.link ? `link is ${got.link}` : 'Pinterest removed the destination link');
    if (payload.alt_text && got.alt_text !== undefined && normalizeText(got.alt_text) !== normalizeText(payload.alt_text)) issues.push('alt text differs');
    const media = got.media || {};
    if (plan.type === 'carousel' && !(Array.isArray(media.items) && media.items.length === payload.media_source.items.length)) issues.push('carousel images missing');
    if (plan.type === 'image' && !media.images) issues.push('image missing');
    if (plan.type === 'video' && media.media_type && !/video/i.test(media.media_type)) issues.push(`media type is ${media.media_type}`);
  }
  if (issues.length) {
    await updateRow(ctx, row.pinId, {
      Status: STATUS.review, 'Pinterest Pin ID': String(pinId), 'Pin URL': url, 'Posted at': ctx.stamp, Lock: '',
      Error: `Published, but the check found: ${issues.join('; ')}`,
    });
    ctx.state.lastPost = ctx.stamp;
    log(ctx, row.pinId, 'Needs review', attempt, pinId, url, `Published; check found: ${issues.join('; ')}`);
    reviewEmail(ctx, row, `It was published (${url}), but the automatic check found: ${issues.join('; ')}. Look at the pin; if it is fine, set Status to Done.`);
    setHealth(ctx, HEALTH.review);
    return 'review';
  }
  await updateRow(ctx, row.pinId, {
    Status: STATUS.done, 'Pinterest Pin ID': String(pinId), 'Pin URL': url, 'Posted at': ctx.stamp, Error: note, Lock: '',
  });
  ctx.state.lastPost = ctx.stamp;
  ctx.state.alerts.transientFails = 0;
  const image = pinImage(got);
  log(ctx, row.pinId, 'Published', attempt, pinId, url, [plan.type, plan.board.name, note].filter(Boolean).join(' · '), image);
  if (ctx.settings.emailEveryPin) successEmail(ctx, row, plan, url, image);
  return 'published';
}

async function needsReview(ctx, row, attempt, message) {
  await updateRow(ctx, row.pinId, { Status: STATUS.review, Error: message, Lock: '' });
  log(ctx, row.pinId, 'Needs review', attempt, '', '', message);
  reviewEmail(ctx, row, message);
  setHealth(ctx, HEALTH.review);
  return 'review';
}

// Looks on the board for a pin with this row's title created after the lock was taken.
async function findPublished(ctx, row, board, since, waitFirst) {
  const delays = waitFirst ? CONFIRM_DELAYS_MS : [0];
  for (const d of delays) {
    if (d) await sleep(d);
    const pins = await pinterest.boardPins(ctx.pTok, board.id, 100);
    const after = (since ? since.getTime() : 0) - 2 * 60000;
    const matches = pins.filter((p) => normalizeText(p.title) === normalizeText(row.title) &&
      new Date(/Z$/.test(p.created_at) ? p.created_at : `${p.created_at}Z`).getTime() >= after);
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) return null;
  }
  return null;
}

async function settleInterrupted(ctx, row, lockAt, boards) {
  const boardName = row.board || ctx.acc.defaultBoard;
  const board = boards.find((b) => normalizeName(b.name) === normalizeName(boardName));
  if (board) {
    const found = await findPublished(ctx, row, board, lockAt, false);
    if (found) {
      const url = pinUrl(found.id);
      await updateRow(ctx, row.pinId, { Status: STATUS.done, 'Pinterest Pin ID': String(found.id), 'Pin URL': url, 'Posted at': ctx.stamp, Error: 'Confirmed on Pinterest after an interrupted run', Lock: '' });
      ctx.state.lastPost = ctx.stamp;
      log(ctx, row.pinId, 'Published', row.attempts, found.id, url, 'Confirmed on Pinterest after an interrupted run', pinImage(found));
      if (ctx.settings.emailEveryPin) successEmail(ctx, row, { type: normalizeName(row.mediaType) || 'image', board, section: null }, url, pinImage(found));
      return;
    }
  }
  await needsReview(ctx, row, row.attempts, `A previous run stopped while publishing this pin and it was not found on ${board ? `board "${board.name}"` : 'its board'}. It was NOT re-published automatically. Check Pinterest: if the pin is there, paste its link into "Pin URL" and set Status to Done; if not, set Status back to Ready.`);
}

// ---------------------------------------------------------------------------
// Once a day: boards -> Boards tab, statistics -> Pins tab
// ---------------------------------------------------------------------------
async function dailyMaintenance(ctx) {
  if (ctx.state.alerts.synced === ctx.today) return;
  try {
    await syncBoards(ctx);
    await refreshStats(ctx);
    ctx.state.alerts.synced = ctx.today;
  } catch (e) {
    if (e instanceof StopRun) throw e;
    if (e instanceof ApiError && e.service === 'Pinterest' && e.kind === 'auth') throw e;
    // Not worth an alert: it is retried at the next hourly run.
    ctx.result.notes.push(`daily sync incomplete: ${e.message}`);
    log(ctx, '', 'Sync problem', '', '', '', `Daily board/statistics sync incomplete, retried next hour: ${e.message}`);
  }
}

async function syncBoards(ctx) {
  const plan = await readBoardsTab(ctx);
  if (!plan.cols) return;
  const boards = (await pinterest.boards(ctx.pTok)).filter((b) => !b.privacy || b.privacy === 'PUBLIC').slice(0, 80);
  const writes = [];
  const appends = [];
  const mark = (r, boardId, sectionId) => {
    if (r.status !== BOARD_STATUS.live) writes.push({ range: boardCell(ctx, plan, 'Status', r.rowNumber), values: [[BOARD_STATUS.live]] });
    if (r.boardId !== String(boardId)) writes.push({ range: boardCell(ctx, plan, 'Board ID', r.rowNumber), values: [[String(boardId)]] });
    if (sectionId && r.sectionId !== String(sectionId)) writes.push({ range: boardCell(ctx, plan, 'Section ID', r.rowNumber), values: [[String(sectionId)]] });
  };
  const row = (board, section, description, boardId, sectionId) => {
    const out = [];
    const values = { Account: ctx.acc.name, Board: board, Section: section, 'Board description': description, Status: BOARD_STATUS.live, 'Board ID': String(boardId), 'Section ID': sectionId ? String(sectionId) : '', Updated: ctx.stamp };
    for (const c of BOARD_COLUMNS) out[plan.cols[c]] = values[c];
    return Array.from(out, (v) => (v === undefined ? '' : v));
  };
  for (const b of boards) {
    const same = plan.rows.filter((r) => normalizeName(r.board) === normalizeName(b.name));
    const boardRows = same.filter((r) => !r.section);
    if (!boardRows.length) appends.push(row(b.name, '', cellText(b.description), b.id, ''));
    else boardRows.forEach((r) => mark(r, b.id, ''));
    const sections = await pinterest.sections(ctx.pTok, b.id);
    for (const s of sections) {
      const sectionRows = same.filter((r) => normalizeName(r.section) === normalizeName(s.name));
      if (!sectionRows.length) appends.push(row(b.name, s.name, '', b.id, s.id));
      else sectionRows.forEach((r) => mark(r, b.id, s.id));
    }
  }
  if (writes.length) await sheets.write(ctx.gTok, ctx.sheetId, writes);
  if (appends.length) await sheets.append(ctx.gTok, ctx.sheetId, `${quoteTab(TABS.boards)}!A:A`, appends);
}

async function refreshStats(ctx) {
  const rows = await readPins(ctx);
  if (ctx.pinCols.Impressions === undefined || ctx.pinCols['Stats updated'] === undefined) return;
  const oldest = daysAgo(ctx.now, ctx.tz, 89);
  const recent = rows
    .filter((r) => r.status === 'done' && r.pinterestPinId && r.postedAt && r.postedAt.slice(0, 10) >= oldest)
    .sort((a, b) => (a.postedAt < b.postedAt ? 1 : -1))
    .slice(0, 60);
  if (!recent.length) return;
  const writes = [];
  for (const r of recent) {
    let t;
    try {
      t = await pinterest.pinStats(ctx.pTok, r.pinterestPinId, r.postedAt.slice(0, 10), ctx.today);
    } catch (e) {
      if (e instanceof ApiError && e.kind === 'request') {
        // e.g. a personal (non-business) account: statistics are not available, nothing else is affected.
        log(ctx, '', 'Stats unavailable', '', '', '', `Pinterest statistics could not be read (${e.detail}). A Pinterest business account is needed for statistics.`);
        break;
      }
      throw e;
    }
    const at = (c, v) => { if (ctx.pinCols[c] !== undefined) writes.push({ range: cell(ctx, c, r.rowNumber), values: [[v]] }); };
    at('Impressions', t.IMPRESSION);
    at('Saves', t.SAVE);
    at('Pin clicks', t.PIN_CLICK);
    at('Outbound clicks', t.OUTBOUND_CLICK);
    at('Stats updated', ctx.today);
  }
  if (!writes.length) return;
  // Rows may have moved since they were read: only write if every Pin ID is still on the same row.
  const letter = colLetter(ctx.pinCols['Pin ID']);
  const ids = await sheets.get(ctx.gTok, ctx.sheetId, `${quoteTab(ctx.acc.pinsTab)}!${letter}1:${letter}5000`);
  const moved = recent.some((r) => cellText((ids[r.rowNumber - 1] || [])[0]) !== r.pinId);
  if (moved) {
    ctx.result.notes.push('statistics skipped: rows moved while reading, retried next hour');
    throw new Error('rows moved while statistics were being read');
  }
  await sheets.write(ctx.gTok, ctx.sheetId, writes);
}

// ---------------------------------------------------------------------------
// Health + alerts
// ---------------------------------------------------------------------------
function setHealth(ctx, value) {
  const changed = ctx.state.health !== value;
  ctx.state.health = value;
  return changed;
}

function alertOncePerDay(ctx, key) {
  if (ctx.state.alerts[key] === ctx.today) return false;
  ctx.state.alerts[key] = ctx.today;
  return true;
}

function issueEmail(ctx, subject, html) {
  ctx.state.alerts.openIssue = true;
  ctx.emails.push({ subject, html, alert: true });
}

function needsReconnect(ctx, reason) {
  ctx.result.outcome = 'needs reconnect';
  const changed = setHealth(ctx, HEALTH.reconnect);
  log(ctx, '', 'Login problem', '', '', '', reason);
  if (alertOncePerDay(ctx, 'reconnect') || changed) {
    issueEmail(ctx, `🔌 ${ctx.acc.name}: Pinterest login needs reconnecting`, emailShell('Pinterest login needs reconnecting', `
      <p>${esc(reason)}</p>
      <p><b>Fix (1 minute):</b> open Activepieces → <b>Connections</b> → this account's Pinterest connection → <b>Reconnect</b>, and log in to <b>@${esc(ctx.acc.username || ctx.acc.name)}</b>.</p>
      <p>Nothing is lost: pins stay in the queue and posting resumes at the next posting time.</p>`, '#b45309'));
  }
}

function wrongAccount(ctx, expected, connected) {
  ctx.result.outcome = 'wrong account';
  const changed = setHealth(ctx, HEALTH.wrongAccount);
  log(ctx, '', 'Wrong account', '', '', '', `Connected to @${connected}, expected @${expected}`);
  if (alertOncePerDay(ctx, 'wrongAccount') || changed) {
    issueEmail(ctx, `🛑 ${ctx.acc.name}: wrong Pinterest account connected`, emailShell('Wrong Pinterest account', `
      <p>This automation's Pinterest connection logs in as <b>@${esc(connected)}</b>, but the Accounts tab expects <b>@${esc(expected)}</b>. Nothing was published.</p>
      <p><b>Fix:</b> reconnect the connection while logged in as @${esc(expected)}. If the account changed on purpose, update "Pinterest username" in the Accounts tab.</p>`, '#b91c1c'));
  }
}

function setupProblem(ctx, message) {
  ctx.result.outcome = 'setup problem';
  setHealth(ctx, `Setup problem: ${message}`.slice(0, 200));
  log(ctx, '', 'Setup problem', '', '', '', message);
  if (alertOncePerDay(ctx, 'setup')) {
    issueEmail(ctx, `⚙️ ${ctx.acc ? ctx.acc.name : ctx.accountName}: setup problem`, emailShell('Setup problem', `<p>${esc(message)}</p><p>Nothing was published for this account. Posting resumes as soon as this is fixed.</p>`, '#b45309'));
  }
}

function pinterestDown(ctx, message) {
  ctx.result.outcome = 'pinterest problem';
  setHealth(ctx, HEALTH.pinterestDown);
  const fails = (Number(ctx.state.alerts.transientFails) || 0) + 1;
  ctx.state.alerts.transientFails = fails;
  log(ctx, '', 'Pinterest problem', '', '', '', message);
  if (fails >= 2 && alertOncePerDay(ctx, 'pinterestDown')) {
    issueEmail(ctx, `⚠️ ${ctx.acc.name}: Pinterest is not responding`, emailShell('Pinterest is not responding', `
      <p>${esc(message)}</p><p>This happened ${fails} times in a row. The automation keeps trying at every posting time; nothing is lost.</p>`, '#b45309'));
  }
}

function queueEmpty(ctx) {
  if (ctx.result.outcome === 'nothing to do') ctx.result.outcome = 'queue empty';
  if (![HEALTH.review].includes(ctx.state.health)) setHealth(ctx, HEALTH.queueEmpty);
  if (!ctx.quietQueue && alertOncePerDay(ctx, 'queueEmpty')) {
    ctx.emails.push({ alert: true, subject: `⚠️ ${ctx.acc.name}: no pins left to publish`, html: emailShell('No pins left to publish', `
      ${detailRows([
        ['Account', esc(`${ctx.acc.name} (@${ctx.acc.username || ctx.acc.name})`)],
        ['Queue tab', esc(ctx.acc.pinsTab)],
        ['Ready rows', '0'],
        ['Checked at', esc(ctx.stamp)],
      ])}
      <p style="margin-top:14px;">There are no rows with Status <b>Ready</b> left, so nothing will be published at the next posting times.</p>
      <p><b>To continue:</b> put the pictures in this account's media folder, add one row per pin in "${esc(ctx.acc.pinsTab)}", and set Status to <b>Ready</b>. Publishing resumes automatically at the next posting time. You get this reminder at most once a day.</p>`, '#b45309') });
  }
}

function queueLow(ctx, left) {
  if (!ctx.quietQueue && alertOncePerDay(ctx, 'queueLow')) {
    const days = Math.max(1, Math.floor(left / (ctx.acc.dailyCap || 5)));
    ctx.emails.push({ alert: true, subject: `⚠️ ${ctx.acc.name}: only ${left} pins left`, html: emailShell('Queue running low', `
      <p>Only <b>${left}</b> Ready pins left in "${esc(ctx.acc.pinsTab)}" — about ${days} day${days === 1 ? '' : 's'} at ${ctx.acc.dailyCap} a day.</p>`, '#b45309') });
  }
}

function backToNormal(ctx) {
  setHealth(ctx, HEALTH.ok);
  const alerted = ctx.state.alerts.openIssue;
  for (const k of ['openIssue', 'reconnect', 'wrongAccount', 'setup', 'pinterestDown']) delete ctx.state.alerts[k];
  if (alerted) {
    ctx.emails.push({ subject: `✅ ${ctx.acc.name}: back to normal`, html: emailShell('Back to normal', `
      ${detailRows([
        ['Account', esc(`${ctx.acc.name} (@${ctx.acc.username || ctx.acc.name})`)],
        ['Status', 'OK'],
        ['Last publish', esc(ctx.stamp)],
      ])}
      <p style="margin-top:14px;">A pin was just published for this account, so the problem reported earlier is solved. Publishing continues at the normal posting times. No action needed.</p>`, '#15803d') });
  }
}

function successEmail(ctx, row, plan, url, image) {
  const board = plan.board.name + (plan.section ? ` › ${plan.section.name}` : '');
  ctx.emails.push({
    image,
    links: [{ href: url, text: '📌 Open the pin' }],
    telegram: [
      `✅ <b>New pin published</b> · ${tgEsc(ctx.acc.name)}${ctx.acc.username ? ` (@${tgEsc(ctx.acc.username)})` : ''}`,
      '',
      `<b>${tgEsc(row.title)}</b>`,
      '',
      `🗂 ${tgEsc(board)}`,
      `🕒 ${tgEsc(ctx.stamp)}`,
      `🔗 ${row.link ? tgEsc(row.link) : 'No link'}`,
      '📦 __PINS_LEFT__',
      `🆔 ${tgEsc(row.pinId)}`,
    ].join('\n'),
    subject: `✅ ${ctx.acc.name}: "${row.title}" is live`,
    html: emailShell(`Published on @${ctx.acc.username}`, `
    ${image ? `<a href="${esc(url)}"><img src="${esc(image)}" alt="" width="260" style="display:block;margin:0 auto 16px;border-radius:12px;max-width:100%;"></a>` : ''}
    ${detailRows([
      ['Pin ID', esc(row.pinId)],
      ['Title', esc(row.title)],
      ['Type', esc(plan.type === 'carousel' ? `Carousel (${(plan.files || []).length} images)` : (plan.type === 'video' ? 'Video' : 'Image'))],
      ['Board', esc(plan.board.name + (plan.section ? ` › ${plan.section.name}` : ''))],
      ['Published', esc(ctx.stamp)],
      ['Pin', link(url, 'Open on Pinterest')],
      ['Link', row.link ? link(row.link) : ''],
      ['Queue', '__PINS_LEFT__'],
    ])}`),
  });
}

function reviewEmail(ctx, row, message) {
  issueEmail(ctx, `⚠️ ${ctx.acc.name}: pin ${row.pinId} needs review`, emailShell('Pin needs review', `
    ${detailRows([['Pin ID', esc(row.pinId)], ['Title', esc(row.title)], ['Board', esc(row.board || ctx.acc.defaultBoard)]])}
    <p style="margin-top:14px;"><b>${esc(message)}</b></p>
    <p>It will not be published again automatically.</p>`, '#c2410c'));
}

function problem(ctx, row, message) {
  ctx.problemRows.push({ pinId: row.pinId, row: row.rowNumber, title: row.title, media: row.media, message });
}

function problemRowsEmail(ctx) {
  const list = ctx.problemRows;
  if (!list.length) return null;
  const subject = list.length === 1 ? `❌ ${ctx.acc.name}: pin ${list[0].pinId} was rejected` : `❌ ${ctx.acc.name}: ${list.length} pins were rejected`;
  const items = list.map((p) => `<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:10px 12px;margin:0 0 10px;">
      ${detailRows([['Pin ID', esc(p.pinId)], ['Row', String(p.row)], ['Title', esc(p.title || '(empty)')], ['Media', esc(p.media || '(empty)')], ['Problem', `<b>${esc(p.message)}</b>`]])}</div>`).join('');
  return {
    alert: true,
    subject,
    html: emailShell('Pins rejected before publishing', `${items}
      <p>Nothing was published for ${list.length === 1 ? 'this row' : 'these rows'}. ${list.length === 1 ? 'It is' : 'They are'} marked <b>Error</b> in "${esc(ctx.acc.pinsTab)}". Fix ${list.length === 1 ? 'it' : 'them'} and set Status back to <b>Ready</b>.</p>`, '#b91c1c'),
  };
}

function log(ctx, pinId, result, attempt, pinterestPinId, url, details, image) {
  ctx.logs.push([ctx.stamp, ctx.acc ? ctx.acc.name : ctx.accountName, pinId || '', result, attempt === '' || attempt === undefined ? '' : String(attempt), pinterestPinId ? String(pinterestPinId) : '', url || '', details || '', image || '']);
}

function handleFailure(ctx, e) {
  if (e instanceof ApiError && e.service === 'Pinterest' && e.kind === 'auth') return needsReconnect(ctx, 'Pinterest rejected the saved login.');
  if (e instanceof ApiError && e.service === 'Pinterest' && e.kind === 'transient') return pinterestDown(ctx, e.message);
  const message = e && e.message ? e.message : String(e);
  ctx.result.outcome = 'error';
  ctx.result.notes.push(message);
  if (e instanceof ApiError && /Google/.test(e.service) && e.kind === 'auth') ctx.fatal = `Google login problem: ${message}`;
  if (!ctx.acc) {
    ctx.fatal = ctx.fatal || message;
    return;
  }
  setHealth(ctx, `Problem: ${message}`.slice(0, 200));
  log(ctx, '', 'Problem', '', '', '', message);
  if (alertOncePerDay(ctx, `problem:${message.slice(0, 40)}`)) {
    issueEmail(ctx, `⚠️ ${ctx.acc.name}: publishing problem`, emailShell('Publishing problem', `
      <p>${esc(message)}</p><p>Nothing is lost. Anything left half-done is checked at the next posting time and never published twice.</p>`, '#b45309'));
  }
}

function pruneAlerts(alerts, today) {
  const out = {};
  for (const [k, v] of Object.entries(alerts || {})) {
    if (k.startsWith('problem:') && v !== today) continue;
    if (['queueLow', 'queueEmpty'].includes(k) && v !== today) continue;
    if (v === '' || v === 0 || v === false || v === undefined) continue;
    out[k] = v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Write everything back (each part guarded); then send emails
// ---------------------------------------------------------------------------
async function flush(ctx) {
  const { acc, state } = ctx;
  if (ctx.gTok && ctx.sheetId && acc && ctx.accCols) {
    const tab = quoteTab(TABS.accounts);
    const data = [];
    const put = (col, value) => {
      if (ctx.accCols[col] !== undefined && value !== undefined) data.push({ range: `${tab}!${colLetter(ctx.accCols[col])}${acc.rowNumber}`, values: [[value]] });
    };
    if (state.username) put('Pinterest username', `@${state.username}`);
    put('Health', state.health);
    put('Last run', ctx.stamp);
    put('Last post', state.lastPost);
    put('Pins left', state.pinsLeft);
    put('Alerts', JSON.stringify(pruneAlerts(state.alerts, ctx.today)));
    try { await sheets.write(ctx.gTok, ctx.sheetId, data); } catch (e) { ctx.result.notes.push(`account write failed: ${e.message}`); ctx.fatal = ctx.fatal || `Could not update the Accounts tab: ${e.message}`; }
    if (ctx.logs.length) {
      try { await sheets.append(ctx.gTok, ctx.sheetId, `${quoteTab(TABS.log)}!A:I`, ctx.logs); } catch (e) { ctx.result.notes.push(`log write failed: ${e.message}`); }
    }
  }
  const grouped = problemRowsEmail(ctx);
  if (grouped) ctx.emails.unshift(grouped);
  const left = state.pinsLeft;
  const cap = acc ? acc.dailyCap : 5;
  const leftText = left === undefined ? '' : `${left} pins left${left > 0 ? ` (about ${Math.max(1, Math.floor(left / cap))} days)` : ''}`;
  const failed = [];
  const ch = channelsFrom(ctx.settings, ctx.mailTok, ctx.tgTok, ctx.inputs);
  const sheetLink = ctx.sheetId ? [{ href: `https://docs.google.com/spreadsheets/d/${ctx.sheetId}/edit`, text: '📊 Open the spreadsheet' }] : [];
  const notSent = [];
  for (const m of ctx.emails) {
    const sent = await notify(ch, {
      subject: m.subject, image: m.image, links: [...(m.links || []), ...sheetLink],
      html: withSheetLink(ctx, m.html.replace('__PINS_LEFT__', esc(leftText))),
      telegram: m.telegram ? m.telegram.replace('__PINS_LEFT__', tgEsc(leftText || 'Queue unknown')) : undefined,
    });
    for (const f of sent.failed) {
      ctx.result.notes.push(`notification failed (${f})`);
      notSent.push(`"${m.subject}" not sent by ${f}`);
    }
    if (m.alert && (sent.tried === 0 || sent.delivered === 0)) failed.push(m.subject);
  }
  if (notSent.length && ctx.gTok && ctx.sheetId) {
    try { await sheets.append(ctx.gTok, ctx.sheetId, `${quoteTab(TABS.log)}!A:I`, notifyFailureRows(ctx.stamp, acc ? acc.name : ctx.accountName, notSent)); } catch (e) { ctx.result.notes.push(`log write failed: ${e.message}`); }
  }
  ctx.result.emails = ctx.emails.map((m) => m.subject);
  // If an alert reached nobody, fail the run so Activepieces' own failure alert reaches you.
  if (failed.length && !ctx.fatal) ctx.fatal = `Could not deliver these alerts by email or Telegram: ${failed.join(' | ')}`;
}

// Every email ends with a link to the control spreadsheet.
function withSheetLink(ctx, html) {
  if (!ctx.sheetId) return html;
  const a = link(`https://docs.google.com/spreadsheets/d/${ctx.sheetId}/edit`, 'Open the Pinterest Autopilot spreadsheet');
  return html.replace('<div style="text-align:center;color:#a1a1aa;font-size:12px;padding:12px;">', `<div style="text-align:center;font-size:13px;padding:14px 12px 0;">${a}</div><div style="text-align:center;color:#a1a1aa;font-size:12px;padding:12px;">`);
}
