// ============================================================================
// Step "Post next pin": for ONE account, recover interrupted posts, pick the
// next Ready row, check it, post it, and record + email the result.
// Never throws: every problem ends up in the sheet, the Log tab and an email.
// ============================================================================

const HEALTH = {
  ok: 'OK',
  reconnect: 'Reconnect Pinterest',
  wrongAccount: 'Wrong Pinterest account',
  queueEmpty: 'Queue empty',
  pinterestDown: 'Pinterest not responding',
};

function createContext(inputs) {
  const acc = inputs.account || {};
  const control = inputs.control || {};
  const settings = control.settings || {};
  const tz = settings.tz || DEFAULT_TZ;
  const now = new Date();
  return {
    acc,
    control,
    settings,
    tz,
    now,
    today: localDate(now, tz),
    stamp: localStamp(now, tz),
    gTok: tokenOf(inputs.google),
    mailTok: tokenOf(inputs.gmail),
    pTok: tokenOf(inputs.pinterest),
    sheetId: control.sheetId,
    state: {
      health: acc.health || '',
      alerts: { ...(acc.alerts || {}) },
      username: acc.username || '',
      lastPost: undefined,
      pinsLeft: undefined,
    },
    emails: [],
    problemRows: [],
    logs: [],
    result: { account: acc.name, outcome: 'nothing to do', notes: [] },
    tab: null,
    cols: null,
  };
}

export const code = async (inputs) => {
  const ctx = createContext(inputs);
  try {
    await postNextPin(ctx);
  } catch (e) {
    handleFailure(ctx, e);
  }
  await flush(ctx);
  return ctx.result;
};

// ---------------------------------------------------------------------------
// Main flow
// ---------------------------------------------------------------------------
async function postNextPin(ctx) {
  const { acc } = ctx;
  if (!ctx.gTok) throw new Error('The Google connection could not be loaded.');

  if (!ctx.pTok) {
    const reason = acc.connectionIdGiven === false
      ? 'The "Pinterest connection ID" cell for this account is empty in the Accounts tab.'
      : 'Activepieces could not load this Pinterest connection (it may have been deleted or its login expired).';
    return needsReconnect(ctx, reason);
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
  if (!ctx.state.username) {
    ctx.state.username = connected;
  } else if (normalizeName(ctx.state.username) !== normalizeName(connected)) {
    return wrongAccount(ctx, ctx.state.username, connected);
  }

  // 2. Read the queue
  const sheet = await readPins(ctx);
  if (!sheet) return;
  let rows = sheet.rows;

  // 3. Finish anything an interrupted run left in "Posting"
  const stuck = rows.filter((r) => r.status === 'posting');
  for (const r of stuck) {
    const lockAt = lockTime(r.lock);
    const ageMin = lockAt ? (ctx.now - lockAt) / 60000 : Infinity;
    if (ageMin < LOCK_STALE_MINUTES) {
      ctx.result.outcome = 'skipped: another run is posting for this account right now';
      return;
    }
    await recoverRow(ctx, r, lockAt);
  }
  if (stuck.length) {
    const reread = await readPins(ctx);
    if (!reread) return;
    rows = reread.rows;
  }

  // 4. Daily safety limit
  const postedToday = rows.filter((r) => r.status === 'done' && r.postedAt.startsWith(ctx.today)).length;
  if (postedToday >= ctx.settings.maxPerDay) {
    ctx.result.outcome = `daily limit reached (${postedToday}/${ctx.settings.maxPerDay})`;
    ctx.state.pinsLeft = countReady(rows, ctx.today);
    return;
  }

  // 5. Pick the next Ready pin
  const candidates = rows.filter((r) => r.status === 'ready');
  if (!candidates.length) {
    ctx.state.pinsLeft = 0;
    queueEmpty(ctx);
    return;
  }

  if (!ctx.acc.imagesFolderId) {
    return setupProblem(ctx, 'The "Images folder" cell for this account in the Accounts tab is empty or not a Google Drive folder link.');
  }
  let files;
  try {
    files = await drive.listFolder(ctx.gTok, ctx.acc.imagesFolderId);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'request') {
      return setupProblem(ctx, `The Images folder could not be opened (${e.detail}). Check the "Images folder" link in the Accounts tab.`);
    }
    throw e;
  }
  const filesByName = new Map();
  for (const f of files) {
    const key = f.name.trim().toLowerCase();
    filesByName.set(key, filesByName.has(key) ? 'DUPLICATE' : f);
  }
  const boards = await pinterest.boards(ctx.pTok);
  const boardsByName = new Map(boards.map((b) => [normalizeName(b.name), b]));

  const done = rows.filter((r) => r.status === 'done');
  const doneByImage = new Map(done.map((r) => [r.image.toLowerCase(), r]));
  const doneByTitle = new Map(done.map((r) => [normalizeName(r.title), r]));

  let badRows = 0;
  let posted = null;
  for (const row of candidates) {
    if (badRows >= MAX_BAD_ROWS_PER_RUN) break;

    const notBefore = cellToISODate(row.notBeforeRaw);
    if (notBefore && notBefore > ctx.today) continue; // scheduled for later

    const file = filesByName.get(row.image.toLowerCase());
    const problems = validateRow(ctx, row, notBefore, file, doneByImage, doneByTitle);
    if (problems.length) {
      await markError(ctx, row, problems.join(' · '));
      badRows++;
      continue;
    }

    const boardName = row.board || ctx.acc.defaultBoard;
    let board = boardsByName.get(normalizeName(boardName));
    if (board && board.privacy === 'SECRET') {
      await markError(ctx, row, `Board "${board.name}" is secret. The automation can only post to public boards.`);
      badRows++;
      continue;
    }
    let boardNote = '';
    if (!board) {
      try {
        board = await pinterest.createBoard(ctx.pTok, boardName);
      } catch (e) {
        if (e instanceof ApiError && e.kind === 'request') {
          await markError(ctx, row, `Could not create board "${boardName}": ${e.detail}`);
          badRows++;
          continue;
        }
        throw e;
      }
      boardsByName.set(normalizeName(board.name), board);
      boardNote = `New board "${board.name}" created`;
      newBoardCreated(ctx, board.name, row);
    }

    const outcome = await postRow(ctx, row, file, board, boardNote);
    if (outcome === 'posted') {
      posted = row;
      break;
    }
    if (outcome === 'stop') return;
    badRows++;
  }

  const reread = await readPins(ctx);
  if (!reread) return;
  const fresh = reread.rows;
  ctx.state.pinsLeft = countReady(fresh, ctx.today);
  if (posted) {
    ctx.result.outcome = `posted row ${posted.rowNumber}`;
    backToNormal(ctx);
    if (ctx.state.pinsLeft === 0) queueEmpty(ctx);
    else if (ctx.state.pinsLeft <= ctx.settings.lowQueue) queueLow(ctx, ctx.state.pinsLeft);
  } else if (!fresh.some((r) => r.status === 'ready')) {
    queueEmpty(ctx);
  } else if (ctx.result.outcome === 'nothing to do') {
    ctx.result.outcome = 'no pin is due yet (check "Not before" dates and Error rows)';
  }
}

// Posts one validated row. Returns 'posted', 'failed' (row marked Error, try next) or 'stop'.
async function postRow(ctx, row, file, board, boardNote) {
  const key = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const lock = `${key}|${ctx.now.toISOString()}`;
  await writeCells(ctx, row.rowNumber, { Status: 'Posting', Lock: lock });

  let data;
  try {
    data = await drive.downloadBase64(ctx.gTok, file.id);
  } catch (e) {
    const where = (await findRowByLock(ctx, key)) || row.rowNumber;
    if (e instanceof ApiError && e.kind === 'request') {
      await writeCells(ctx, where, { Status: 'Error', Lock: '', Note: `Picture could not be downloaded from Drive: ${e.detail}` });
      problemEmail(ctx, row, `Picture could not be downloaded from Drive: ${e.detail}`);
      ctx.logs.push(logRow(ctx, 'Error', where, row.title, board.name, '', '', `Picture download failed: ${e.detail}`));
      return 'failed';
    }
    await writeCells(ctx, where, { Status: 'Ready', Lock: '' });
    throw e;
  }
  const payload = {
    board_id: board.id,
    title: row.title,
    description: finalDescription(row.description, row.tags),
    media_source: { source_type: 'image_base64', content_type: file.mimeType, data },
  };
  if (row.link) payload.link = row.link;
  if (row.altText) payload.alt_text = row.altText;

  let pin;
  try {
    pin = await pinterest.createPin(ctx.pTok, payload);
  } catch (e) {
    const where = await findRowByLock(ctx, key);
    if (e instanceof ApiError && e.kind === 'auth') {
      if (where) await writeCells(ctx, where, { Status: 'Ready', Lock: '' });
      needsReconnect(ctx, 'Pinterest rejected the saved login while posting.');
      return 'stop';
    }
    if (e instanceof ApiError && e.kind === 'request') {
      if (where) await writeCells(ctx, where, { Status: 'Error', Lock: '', Note: `Pinterest refused this pin: ${e.detail}` });
      problemEmail(ctx, row, `Pinterest refused this pin: ${e.detail}`);
      ctx.logs.push(logRow(ctx, 'Error', where || row.rowNumber, row.title, board.name, '', '', `Pinterest refused: ${e.detail}`));
      return 'failed';
    }
    if (e instanceof ApiError && e.status === 429) {
      if (where) await writeCells(ctx, where, { Status: 'Ready', Lock: '' });
      pinterestDown(ctx, 'Pinterest asked us to slow down (rate limit). The pin stays in the queue.');
      return 'stop';
    }
    // Timeout / server error: Pinterest may or may not have created the pin. Leave the row in
    // "Posting"; the next run checks the board and either confirms it or puts it back in the queue.
    pinterestDown(ctx, `Pinterest did not answer clearly (${e.message}). The next run will check whether the pin went up.`);
    ctx.logs.push(logRow(ctx, 'Unconfirmed', where || row.rowNumber, row.title, board.name, '', '', 'Will be checked on the next run'));
    return 'stop';
  }

  const where = (await findRowByLock(ctx, key)) || row.rowNumber;
  const url = pinUrl(pin.id);
  await writeCells(ctx, where, { Status: 'Done', 'Posted at': ctx.stamp, 'Pin link': url, Note: boardNote, Lock: '' });
  ctx.state.lastPost = ctx.stamp;
  ctx.state.alerts.transientFails = 0;
  const image = pinImage(pin, '600x');
  ctx.logs.push(logRow(ctx, 'Posted', where, row.title, board.name, url, image, boardNote));
  if (ctx.settings.emailEveryPin) successEmail(ctx, row, board.name, url, image);
  return 'posted';
}

async function recoverRow(ctx, row, lockAt) {
  const boardName = row.board || ctx.acc.defaultBoard;
  let match = null;
  try {
    const boards = await pinterest.boards(ctx.pTok);
    const board = boards.find((b) => normalizeName(b.name) === normalizeName(boardName));
    if (board) {
      const since = (lockAt ? lockAt.getTime() : 0) - 2 * 60000;
      const pins = await pinterest.boardPins(ctx.pTok, board.id, 100);
      match = pins.find((p) => normalizeName(p.title) === normalizeName(row.title) &&
        new Date(/Z$/.test(p.created_at) ? p.created_at : `${p.created_at}Z`).getTime() >= since) || null;
      if (match) {
        const url = pinUrl(match.id);
        await writeCells(ctx, row.rowNumber, { Status: 'Done', 'Posted at': ctx.stamp, 'Pin link': url, Note: 'Confirmed after an interrupted run', Lock: '' });
        ctx.state.lastPost = ctx.stamp;
        const image = pinImage(match, '600x');
        ctx.logs.push(logRow(ctx, 'Posted', row.rowNumber, row.title, board.name, url, image, 'Confirmed after an interrupted run'));
        if (ctx.settings.emailEveryPin) successEmail(ctx, row, board.name, url, image);
        return;
      }
    }
  } catch (e) {
    if (e instanceof ApiError && e.kind !== 'request') throw e;
  }
  await writeCells(ctx, row.rowNumber, { Status: 'Ready', Lock: '', Note: 'Put back in the queue after an interrupted run (it was not on Pinterest)' });
  ctx.logs.push(logRow(ctx, 'Re-queued', row.rowNumber, row.title, boardName, '', '', 'Interrupted run; pin was not on Pinterest'));
}

// ---------------------------------------------------------------------------
// Sheet access
// ---------------------------------------------------------------------------
async function readPins(ctx) {
  const tabRange = `${quoteTab(ctx.acc.pinsTab)}!A1:Z5000`;
  let values;
  try {
    values = await sheets.get(ctx.gTok, ctx.sheetId, tabRange);
  } catch (e) {
    if (e instanceof ApiError && e.kind === 'request') {
      setupProblem(ctx, `The tab "${ctx.acc.pinsTab}" was not found in the spreadsheet. Check the "Pins tab" cell in the Accounts tab.`);
      return null;
    }
    throw e;
  }
  const head = headerMap(values[0], PIN_COLUMNS);
  if (head.missing.length) {
    setupProblem(ctx, `The tab "${ctx.acc.pinsTab}" is missing these columns: ${head.missing.join(', ')}.`);
    return null;
  }
  ctx.cols = {};
  for (const c of PIN_COLUMNS) ctx.cols[c] = head.idx(c);
  const get = (r, c) => r[ctx.cols[c]];
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const r = values[i] || [];
    const row = {
      rowNumber: i + 1,
      status: cellText(get(r, 'Status')).toLowerCase(),
      image: cellText(get(r, 'Image')),
      title: cellText(get(r, 'Title')),
      description: cellText(get(r, 'Description')),
      tags: cellText(get(r, 'Tags')),
      link: cellText(get(r, 'Link')),
      board: cellText(get(r, 'Board')),
      altText: cellText(get(r, 'Alt text')),
      notBeforeRaw: get(r, 'Not before'),
      postedAt: cellText(get(r, 'Posted at')),
      lock: cellText(get(r, 'Lock')),
    };
    if (!row.status && !row.title && !row.image) continue;
    rows.push(row);
  }
  return { rows };
}

async function writeCells(ctx, rowNumber, updates) {
  const data = Object.entries(updates).map(([name, value]) => ({
    range: `${quoteTab(ctx.acc.pinsTab)}!${colLetter(ctx.cols[name])}${rowNumber}`,
    values: [[value]],
  }));
  await sheets.write(ctx.gTok, ctx.sheetId, data);
}

async function findRowByLock(ctx, key) {
  const letter = colLetter(ctx.cols.Lock);
  const values = await sheets.get(ctx.gTok, ctx.sheetId, `${quoteTab(ctx.acc.pinsTab)}!${letter}1:${letter}5000`);
  for (let i = 1; i < values.length; i++) {
    if (cellText((values[i] || [])[0]).startsWith(`${key}|`)) return i + 1;
  }
  return null;
}

function lockTime(lock) {
  const iso = cellText(lock).split('|')[1];
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

function countReady(rows, today) {
  return rows.filter((r) => r.status === 'ready').length;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
function validateRow(ctx, row, notBefore, file, doneByImage, doneByTitle) {
  const p = [];
  if (!row.title) p.push('Title is empty');
  else if (row.title.length > LIMITS.title) p.push(`Title is ${row.title.length} characters (max ${LIMITS.title})`);
  const desc = finalDescription(row.description, row.tags);
  if (desc.length > LIMITS.description) p.push(`Description + tags is ${desc.length} characters (max ${LIMITS.description})`);
  if (row.altText.length > LIMITS.altText) p.push(`Alt text is ${row.altText.length} characters (max ${LIMITS.altText})`);
  if (row.link && (row.link.length > LIMITS.link || !isValidLink(row.link))) p.push('Link must be a full web address starting with https://');
  if (notBefore === null) p.push('"Not before" date is not readable (use YYYY-MM-DD)');
  if (!row.board && !ctx.acc.defaultBoard) p.push('No board: fill the Board column or set a Default board for this account');
  if (!row.image) p.push('Image is empty (type the picture\'s file name)');
  else if (!file) p.push(`Picture "${row.image}" is not in this account's Images folder`);
  else if (file === 'DUPLICATE') p.push(`There are two files named "${row.image}" in the Images folder`);
  else {
    if (!['image/jpeg', 'image/png'].includes(file.mimeType)) p.push(`Picture "${row.image}" must be a JPG or PNG (it is ${file.mimeType})`);
    if (Number(file.size || 0) > LIMITS.imageBytes) p.push(`Picture "${row.image}" is larger than 20 MB`);
  }
  const sameImage = row.image && doneByImage.get(row.image.toLowerCase());
  if (sameImage) p.push(`This picture was already posted (row ${sameImage.rowNumber}, ${sameImage.postedAt})`);
  const sameTitle = row.title && doneByTitle.get(normalizeName(row.title));
  if (sameTitle) p.push(`This title was already posted (row ${sameTitle.rowNumber}, ${sameTitle.postedAt})`);
  return p;
}

async function markError(ctx, row, message) {
  await writeCells(ctx, row.rowNumber, { Status: 'Error', Note: message });
  ctx.logs.push(logRow(ctx, 'Error', row.rowNumber, row.title, row.board || ctx.acc.defaultBoard, '', '', message));
  problemEmail(ctx, row, message);
}

// ---------------------------------------------------------------------------
// Account health + alerts
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

function needsReconnect(ctx, reason) {
  ctx.result.outcome = 'needs reconnect';
  const changed = setHealth(ctx, HEALTH.reconnect);
  ctx.logs.push(logRow(ctx, 'Problem', '', '', '', '', '', `Login problem: ${reason}`));
  if (alertOncePerDay(ctx, 'reconnect') || changed) {
    issueEmail(ctx, `🔌 ${ctx.acc.name}: Pinterest login needs reconnecting`, emailShell('Pinterest login needs reconnecting', `
      <p>${esc(reason)}</p>
      <p><b>Fix (1 minute):</b> open Activepieces → <b>Connections</b> → find this account's Pinterest connection → click <b>Reconnect</b> and log in again.</p>
      <p>Nothing is lost: pins stay in the queue and posting resumes by itself at the next posting time.</p>`, '#b45309'));
  }
}

function wrongAccount(ctx, expected, connected) {
  ctx.result.outcome = 'wrong account';
  const changed = setHealth(ctx, HEALTH.wrongAccount);
  ctx.logs.push(logRow(ctx, 'Problem', '', '', '', '', '', `Connected to @${connected}, expected @${expected}`));
  if (alertOncePerDay(ctx, 'wrongAccount') || changed) {
    issueEmail(ctx, `🛑 ${ctx.acc.name}: wrong Pinterest account connected`, emailShell('Wrong Pinterest account', `
      <p>This account's connection logs in as <b>@${esc(connected)}</b>, but the sheet expects <b>@${esc(expected)}</b>. Nothing was posted, so no pin went to the wrong account.</p>
      <p><b>Fix:</b> reconnect the Pinterest connection while logged in as @${esc(expected)}. If you switched accounts on purpose, clear the "Pinterest username" cell in the Accounts tab.</p>`, '#b91c1c'));
  }
}

function setupProblem(ctx, message) {
  ctx.result.outcome = 'setup problem';
  setHealth(ctx, `Setup problem: ${message}`.slice(0, 200));
  ctx.logs.push(logRow(ctx, 'Problem', '', '', '', '', '', message));
  if (alertOncePerDay(ctx, 'setup')) {
    issueEmail(ctx, `⚙️ ${ctx.acc.name}: setup problem`, emailShell('Setup problem', `<p>${esc(message)}</p><p>Nothing was posted for this account. Posting resumes as soon as this is fixed.</p>`, '#b45309'));
  }
}

function pinterestDown(ctx, message) {
  ctx.result.outcome = 'pinterest problem';
  setHealth(ctx, HEALTH.pinterestDown);
  const fails = (Number(ctx.state.alerts.transientFails) || 0) + 1;
  ctx.state.alerts.transientFails = fails;
  ctx.logs.push(logRow(ctx, 'Problem', '', '', '', '', '', message));
  if (fails >= 2 && alertOncePerDay(ctx, 'pinterestDown')) {
    issueEmail(ctx, `⚠️ ${ctx.acc.name}: Pinterest is not responding`, emailShell('Pinterest is not responding', `
      <p>${esc(message)}</p><p>This has happened ${fails} times in a row. Usually Pinterest recovers by itself; the automation keeps trying at every posting time and nothing is lost.</p>`, '#b45309'));
  }
}

function queueEmpty(ctx) {
  ctx.result.outcome = ctx.result.outcome === 'nothing to do' ? 'queue empty' : ctx.result.outcome;
  setHealth(ctx, HEALTH.queueEmpty);
  if (alertOncePerDay(ctx, 'queueEmpty')) {
    queueEmail(ctx, `⚠️ ${ctx.acc.name}: no pins left to post`, emailShell('No pins left', `
      <p>There are no rows with Status <b>Ready</b> left in the "${esc(ctx.acc.pinsTab)}" tab.</p>
      <p>Add new rows (and their pictures in the Images folder) and set them to Ready. Posting continues automatically.</p>`, '#b45309'));
  }
}

function queueLow(ctx, left) {
  if (alertOncePerDay(ctx, 'queueLow')) {
    const days = Math.max(1, Math.floor(left / (ctx.settings.maxPerDay || 5)));
    queueEmail(ctx, `⚠️ ${ctx.acc.name}: only ${left} pins left`, emailShell('Queue running low', `
      <p>Only <b>${left}</b> Ready pins left in "${esc(ctx.acc.pinsTab)}". That lasts about ${days} day${days === 1 ? '' : 's'}.</p>
      <p>Add more rows and pictures when you can.</p>`, '#b45309'));
  }
}

function backToNormal(ctx) {
  setHealth(ctx, HEALTH.ok);
  const alerted = ctx.state.alerts.openIssue;
  ctx.state.alerts.openIssue = false;
  ctx.state.alerts.reconnect = '';
  ctx.state.alerts.wrongAccount = '';
  ctx.state.alerts.setup = '';
  ctx.state.alerts.pinterestDown = '';
  if (alerted) {
    queueEmail(ctx, `✅ ${ctx.acc.name}: back to normal`, emailShell('Back to normal', '<p>A pin was just published for this account, so the earlier problem is solved. No action needed.</p>', '#15803d'));
  }
}

function newBoardCreated(ctx, name, row) {
  ctx.logs.push(logRow(ctx, 'New board', row.rowNumber, row.title, name, '', '', 'Board did not exist, so it was created'));
  queueEmail(ctx, `🆕 ${ctx.acc.name}: new board "${name}" created`, emailShell('New board created', `
    <p>Row ${row.rowNumber} asked for board <b>${esc(name)}</b>, which did not exist yet, so it was created (public).</p>
    <p>If that was a typo, rename or delete the board on Pinterest and fix the Board column.</p>`, '#2563eb'));
}

function successEmail(ctx, row, boardName, url, image) {
  const left = ctx.state.pinsLeft;
  queueEmail(ctx, `✅ ${ctx.acc.name}: "${row.title}" is live`, emailShell(`Published on ${ctx.acc.name}`, `
    ${image ? `<a href="${esc(url)}"><img src="${esc(image)}" alt="" width="260" style="display:block;margin:0 auto 16px;border-radius:12px;max-width:100%;"></a>` : ''}
    ${detailRows([
      ['Title', esc(row.title)],
      ['Board', esc(boardName)],
      ['Posted', esc(ctx.stamp)],
      ['Pin', link(url, 'Open on Pinterest')],
      ['Link', row.link ? link(row.link) : ''],
      ['Queue', '__PINS_LEFT__'],
    ])}`));
}

function problemEmail(ctx, row, message) {
  ctx.problemRows.push({ row: row.rowNumber, title: row.title, image: row.image, message });
}

function problemRowsEmail(ctx) {
  const list = ctx.problemRows;
  if (!list.length) return null;
  const subject = list.length === 1
    ? `❌ ${ctx.acc.name}: pin not posted (row ${list[0].row})`
    : `❌ ${ctx.acc.name}: ${list.length} pins not posted`;
  const items = list.map((p) => `<div style="border:1px solid #fecaca;background:#fef2f2;border-radius:10px;padding:10px 12px;margin:0 0 10px;">
      ${detailRows([
        ['Row', String(p.row)],
        ['Title', esc(p.title || '(empty)')],
        ['Picture', esc(p.image || '(empty)')],
        ['Problem', `<b>${esc(p.message)}</b>`],
      ])}</div>`).join('');
  return {
    subject,
    html: emailShell('Pin not posted', `${items}
      <p style="margin-top:12px;">${list.length === 1 ? 'The row is' : 'These rows are'} marked <b>Error</b> in the "${esc(ctx.acc.pinsTab)}" tab. Fix ${list.length === 1 ? 'it' : 'them'} and set Status back to <b>Ready</b>. The queue keeps going with the next pins.</p>`, '#b91c1c'),
  };
}

function queueEmail(ctx, subject, html) {
  ctx.emails.push({ subject, html });
}

// Marks that an alert about a problem state went out, so a later success sends "back to normal".
function issueEmail(ctx, subject, html) {
  ctx.state.alerts.openIssue = true;
  queueEmail(ctx, subject, html);
}

function logRow(ctx, result, row, title, board, url, image, details) {
  return [ctx.stamp, ctx.acc.name, result, row === '' ? '' : String(row || ''), title || '', board || '', url || '', image || '', details || ''];
}

function handleFailure(ctx, e) {
  if (e instanceof ApiError && e.service === 'Pinterest' && e.kind === 'auth') return needsReconnect(ctx, 'Pinterest rejected the saved login.');
  if (e instanceof ApiError && e.service === 'Pinterest' && e.kind === 'transient') return pinterestDown(ctx, e.message);
  const message = e && e.message ? e.message : String(e);
  ctx.result.outcome = 'error';
  ctx.result.notes.push(message);
  setHealth(ctx, `Problem: ${message}`.slice(0, 200));
  ctx.logs.push(logRow(ctx, 'Problem', '', '', '', '', '', message));
  if (alertOncePerDay(ctx, `problem:${message.slice(0, 40)}`)) {
    issueEmail(ctx, `⚠️ ${ctx.acc.name}: posting problem`, emailShell('Posting problem', `
      <p>${esc(message)}</p><p>Nothing is lost: the automation tries again at the next posting time. If this keeps happening, forward this email to whoever set up the automation.</p>`, '#b45309'));
  }
}

// ---------------------------------------------------------------------------
// Write everything back (each part guarded so one failure can't block the rest)
// ---------------------------------------------------------------------------
async function flush(ctx) {
  const { acc, state } = ctx;
  const cols = ctx.control.accountCols || {};
  const left = state.pinsLeft;
  if (ctx.gTok && ctx.sheetId && acc.rowNumber) {
    const tab = quoteTab(TABS.accounts);
    const data = [];
    const put = (letter, value) => {
      if (letter && value !== undefined) data.push({ range: `${tab}!${letter}${acc.rowNumber}`, values: [[value]] });
    };
    put(cols.username, state.username ? `@${state.username}` : undefined);
    put(cols.health, state.health);
    put(cols.lastPost, state.lastPost);
    put(cols.pinsLeft, left);
    put(cols.alerts, JSON.stringify(pruneAlerts(state.alerts, ctx.today)));
    try { await sheets.write(ctx.gTok, ctx.sheetId, data); } catch (e) { ctx.result.notes.push(`account write failed: ${e.message}`); }
    if (ctx.logs.length) {
      try { await sheets.append(ctx.gTok, ctx.sheetId, `${quoteTab(TABS.log)}!A:I`, ctx.logs); } catch (e) { ctx.result.notes.push(`log write failed: ${e.message}`); }
    }
  }
  const grouped = problemRowsEmail(ctx);
  if (grouped) ctx.emails.unshift(grouped);
  const leftText = left === undefined ? '' : `${left} pins left${left > 0 ? ` (about ${Math.max(1, Math.floor(left / (ctx.settings.maxPerDay || 5)))} days)` : ''}`;
  for (const m of ctx.emails) {
    try {
      await sendEmail(ctx.mailTok, { to: ctx.settings.emailTo, subject: m.subject, html: m.html.replace('__PINS_LEFT__', esc(leftText)) });
    } catch (e) {
      ctx.result.notes.push(`email failed: ${e.message}`);
    }
  }
  ctx.result.emails = ctx.emails.map((m) => m.subject);
}

// Keeps the Alerts cell small: drops one-per-day markers from earlier days.
function pruneAlerts(alerts, today) {
  const out = {};
  for (const [k, v] of Object.entries(alerts || {})) {
    const isDate = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (k.startsWith('problem:') && v !== today) continue;
    if (isDate && v !== today && !['reconnect', 'wrongAccount', 'setup', 'pinterestDown'].includes(k)) continue;
    if (v === '' || v === 0 || v === false) continue;
    out[k] = v;
  }
  return out;
}
