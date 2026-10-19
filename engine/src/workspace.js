// ============================================================================
// Workspace: creates and repairs the Google Drive side of the autopilot.
//   - root folder "Pinterest Autopilot" (found again by a hidden marker)
//   - the control spreadsheet: Guide, Accounts, Plan, Boards, Products, Settings, Log
//   - per account: a "Pins – <name>" tab and a "Media – <name>" folder
// Safe to run every hour: it only adds what is missing and never deletes.
// ============================================================================

const RGB = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
};

const GUIDE_LINES = [
  ['PINTEREST AUTOPILOT — HOW IT WORKS'],
  [''],
  ['Every hour (06:00–23:00) the automation posts the next Ready pin of every account whose posting time it is,'],
  ['checks the pin is live, updates its row and emails you. Once a day it also syncs each account\'s boards and pin statistics.'],
  [''],
  ['ADD PINS'],
  ['Normally the Codex prompt from the Control Panel does this for you. By hand:'],
  ['1. Put the picture in the account\'s media folder (link in the Accounts tab). JPG or PNG, 1000 × 1500 recommended.'],
  ['2. Add a row in "Pins – <account>": Media (file name), Title, Board. Everything else is optional. Leave Pin ID empty.'],
  ['3. Set Status to Ready. Ready rows go out from top to bottom, one per posting time.'],
  [''],
  ['BOARDS (Boards tab)'],
  ['"On Pinterest" rows are read from Pinterest every day. To have a new board or section created automatically, add a row'],
  ['with Status "Planned" (Account, Board, optional Section and Board description). It is created the first time a pin needs it.'],
  ['A board that is neither on Pinterest nor Planned is never created: the pin is rejected, so a typo can never make a junk board.'],
  [''],
  ['STATUSES'],
  ['Draft · Ready · Posting (being published — do not edit) · Done · Error (read the Error column, fix, set Ready) · Needs review · Skip'],
  ['Needs review = the automation could not be sure the pin went live. It is NEVER re-published automatically.'],
  ['   Check the board: if the pin is there, paste its link into Pin URL and set Status to Done. If not, set Status back to Ready.'],
  [''],
  ['NEW PINS (Control Panel → New pins)'],
  ['Pick the account, add the free-pattern pages and how many pins each, copy the Codex prompt, paste it in a new Codex chat.'],
  ['Codex follows the account\'s growth plan (Plan tab), opens each page, downloads the free PDF, makes the pins and fills in'],
  ['Product, Link, Focus and Batch on every row. Pins go out in the order they were added.'],
  [''],
  ['PLAN (Plan tab)'],
  ['Codex\'s growth plan for each account: one micro-niche per row, in order (Next → In progress → Done). Codex updates it after'],
  ['every batch from the statistics. You can read it; you do not need to edit it.'],
  [''],
  ['PRODUCTS (Products tab)'],
  ['One row per page pins link to (free pattern or category). Codex adds the rows. Pins made, Pins posted and Status are kept'],
  ['by the automation. A pin with a Product but no Link gets that product\'s link. Set Status to Paused to stop a product.'],
  [''],
  ['ACCOUNTS'],
  ['On = Yes/No pauses an account. Posting times: whole hours between 06:00 and 23:00, e.g. 09:00, 13:00, 19:00.'],
  ['Daily cap = most pins per day. Niche = what the account is about. Links are set per batch in New pins, not here.'],
  ['To add an account: connect it in Activepieces, then add it in the Control Panel and import the new file it gives you.'],
  [''],
  ['EMAILS'],
  ['One address (Settings tab) gets every published pin, every problem and the daily report, by email and/or Telegram. If it stops arriving,'],
  ['the automation itself has a problem: open Activepieces → Runs.'],
  [''],
  ['Telegram (optional): notifications also, or only, in Telegram. Switch it in the Control Panel or in Settings.'],
  [''],
  ['DO NOT rename column headers or tabs, and do not type in grey columns.'],
];

const SETTINGS_ROWS = [
  ['Send emails to', 'Every notification and the daily report go to this address.'],
  ['Email every published pin', 'Yes = an email with the picture for every published pin. No = only problems and the daily report.'],
  ['Low-queue warning', 'Warn when an account has this many Ready pins left (or fewer).'],
  ['Time zone', 'Time zone for posting times, dates and the daily report (e.g. Africa/Casablanca, America/New_York).'],
  ['Daily report time', 'Hour of the daily report email (06:00–23:00).'],
  ['Last report', 'Filled automatically.'],
  ['Config applied', 'Filled automatically: which Control Panel file was applied last.'],
  ['Notify by email', 'Yes = notifications by email (needs the Gmail connection).'],
  ['Notify by Telegram', 'Yes = notifications in Telegram (needs the Telegram Bot connection).'],
  ['Telegram chat ID', 'Filled automatically after you press Start in your bot. Clear it to switch to another Telegram chat.'],
];

function header(sid, cols, color) {
  return {
    repeatCell: {
      range: { sheetId: sid, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: cols },
      cell: { userEnteredFormat: { backgroundColor: RGB(color || '#18181b'), textFormat: { bold: true, foregroundColor: RGB('#ffffff') }, verticalAlignment: 'MIDDLE', wrapStrategy: 'WRAP' } },
      fields: 'userEnteredFormat(backgroundColor,textFormat,verticalAlignment,wrapStrategy)',
    },
  };
}

function widths(sid, pxList) {
  return pxList.map((px, i) => ({
    updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: px }, fields: 'pixelSize' },
  }));
}

function listRule(range, values, strict) {
  return { setDataValidation: { range, rule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, strict: Boolean(strict), showCustomUi: true } } };
}

function greyRange(range) {
  return { repeatCell: { range, cell: { userEnteredFormat: { backgroundColor: RGB('#f4f4f5'), textFormat: { foregroundColor: RGB('#52525b') } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } };
}

// Tabs that only need a header row (+ widths, grey automatic columns). Added to new and older
// spreadsheets alike; an existing tab is never touched except for missing columns.
const SIMPLE_TABS = [
  { title: TABS.plan, after: TABS.accounts, columns: PLAN_COLUMNS, color: '#0d9488', widths: [120, 60, 220, 420, 260, 100, 100, 100, 320], status: PLAN_STATUS },
  { title: TABS.products, after: TABS.boards, columns: PRODUCT_COLUMNS, color: '#ea580c', widths: [120, 240, 320, 90, 90, 90, 110, 130], auto: 'Pins made',
    status: Object.values(PRODUCT_STATUS) },
];

async function ensureSimpleTabs(gTok, sheetId) {
  let meta = await sheets.meta(gTok, sheetId);
  for (const t of SIMPLE_TABS) {
    const titles = (meta.sheets || []).map((x) => x.properties.title);
    if (titles.includes(t.title)) {
      const head = await sheets.get(gTok, sheetId, `${quoteTab(t.title)}!1:1`);
      await ensureColumns(gTok, sheetId, t.title, head[0], t.columns);
      continue;
    }
    const index = titles.indexOf(t.after) + 1 || titles.length;
    const added = await sheets.batchUpdate(gTok, sheetId, [{ addSheet: { properties: { title: t.title, index, gridProperties: { rowCount: 1000, columnCount: t.columns.length, frozenRowCount: 1 }, tabColor: RGB(t.color) } } }]);
    const sid = added.replies[0].addSheet.properties.sheetId;
    await sheets.write(gTok, sheetId, [{ range: `${quoteTab(t.title)}!A1`, values: [t.columns] }]);
    const col = (n) => t.columns.indexOf(n);
    const requests = [header(sid, t.columns.length, t.color), ...widths(sid, t.widths),
      listRule({ sheetId: sid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: col('Status'), endColumnIndex: col('Status') + 1 }, t.status, false)];
    if (t.auto) requests.push(greyRange({ sheetId: sid, startRowIndex: 1, startColumnIndex: col(t.auto), endColumnIndex: t.columns.length }));
    await sheets.batchUpdate(gTok, sheetId, requests);
    meta = await sheets.meta(gTok, sheetId);
  }
}

// Finds (or creates) the root folder and the control spreadsheet.
async function ensureWorkspace(gTok, settings) {
  const created = [];
  let root = (await drive.findByMarker(gTok, ROOT_MARKER, 'application/vnd.google-apps.folder'))[0];
  if (!root) {
    root = await drive.createFolder(gTok, 'Pinterest Autopilot', null, ROOT_MARKER);
    created.push('folder "Pinterest Autopilot"');
  }
  let sheet = (await drive.findByMarker(gTok, CONTROL_MARKER, 'application/vnd.google-apps.spreadsheet'))[0];
  let sheetId;
  if (!sheet) {
    sheetId = await createControlSheet(gTok, settings, root.id);
    created.push('spreadsheet "Pinterest Autopilot"');
    await ensureSimpleTabs(gTok, sheetId);
  } else {
    sheetId = sheet.id;
    await repairControlSheet(gTok, sheetId);
  }
  return { rootId: root.id, rootLink: root.webViewLink || `https://drive.google.com/drive/folders/${root.id}`, sheetId, created };
}

async function createControlSheet(gTok, settings, rootId) {
  const res = await http('Google Sheets', SHEETS, {
    method: 'POST', token: gTok,
    json: {
      properties: { title: 'Pinterest Autopilot', locale: 'en_US', timeZone: settings.timeZone || DEFAULT_TZ },
      sheets: [
        { properties: { title: TABS.guide, index: 0, gridProperties: { rowCount: 60, columnCount: 1 }, tabColor: RGB('#18181b') } },
        { properties: { title: TABS.accounts, index: 1, gridProperties: { rowCount: 50, columnCount: ACCOUNT_COLUMNS.length, frozenRowCount: 1, frozenColumnCount: 1 }, tabColor: RGB('#2563eb') } },
        { properties: { title: TABS.boards, index: 2, gridProperties: { rowCount: 500, columnCount: BOARD_COLUMNS.length, frozenRowCount: 1 }, tabColor: RGB('#7c3aed') } },
        { properties: { title: TABS.settings, index: 3, gridProperties: { rowCount: 20, columnCount: 3, frozenRowCount: 1 }, tabColor: RGB('#71717a') } },
        { properties: { title: TABS.log, index: 4, gridProperties: { rowCount: 2000, columnCount: LOG_COLUMNS.length, frozenRowCount: 1 }, tabColor: RGB('#71717a') } },
      ],
    },
  });
  const sheetId = res.spreadsheetId;
  const ids = {};
  for (const s of res.sheets) ids[s.properties.title] = s.properties.sheetId;

  const file = await drive.get(gTok, sheetId, 'id,parents');
  await drive.update(gTok, sheetId, { properties: { autopilot: CONTROL_MARKER } },
    `addParents=${rootId}${file.parents && file.parents.length ? `&removeParents=${file.parents.join(',')}` : ''}`);

  const values = {
    'Send emails to': settings.emailTo || '',
    'Email every published pin': settings.emailEveryPin === false ? 'No' : 'Yes',
    'Low-queue warning': Number.isFinite(settings.lowQueue) ? settings.lowQueue : 10,
    'Time zone': settings.timeZone || DEFAULT_TZ,
    'Daily report time': formatHours([Number.isFinite(settings.reportHour) ? settings.reportHour : 22]),
    'Last report': '',
    'Config applied': '',
    'Notify by email': settings.notifyEmail === false ? 'No' : 'Yes',
    'Notify by Telegram': settings.notifyTelegram ? 'Yes' : 'No',
    'Telegram chat ID': '',
  };
  await sheets.write(gTok, sheetId, [
    { range: `${quoteTab(TABS.guide)}!A1`, values: GUIDE_LINES },
    { range: `${quoteTab(TABS.accounts)}!A1`, values: [ACCOUNT_COLUMNS] },
    { range: `${quoteTab(TABS.boards)}!A1`, values: [BOARD_COLUMNS] },
    { range: `${quoteTab(TABS.settings)}!A1`, values: [['Setting', 'Value', 'What it does'], ...SETTINGS_ROWS.map(([k, help]) => [k, values[k], help])] },
    { range: `${quoteTab(TABS.log)}!A1`, values: [LOG_COLUMNS] },
  ]);

  const acc = ids[TABS.accounts];
  const col = (n) => ACCOUNT_COLUMNS.indexOf(n);
  const autoCols = { sheetId: acc, startRowIndex: 1, startColumnIndex: col('Health'), endColumnIndex: ACCOUNT_COLUMNS.length };
  const one = (n) => ({ sheetId: acc, startRowIndex: 1, endRowIndex: 50, startColumnIndex: col(n), endColumnIndex: col(n) + 1 });
  const boards = ids[TABS.boards];
  const bcol = (n) => BOARD_COLUMNS.indexOf(n);
  const bAuto = { sheetId: boards, startRowIndex: 1, startColumnIndex: bcol('Board ID'), endColumnIndex: BOARD_COLUMNS.length };
  await sheets.batchUpdate(gTok, sheetId, [
    { repeatCell: { range: { sheetId: ids[TABS.guide], startRowIndex: 0, endRowIndex: 1 }, cell: { userEnteredFormat: { textFormat: { bold: true, fontSize: 14 } } }, fields: 'userEnteredFormat.textFormat' } },
    ...widths(ids[TABS.guide], [1200]),
    header(acc, ACCOUNT_COLUMNS.length, '#2563eb'),
    ...widths(acc, [120, 55, 150, 190, 220, 220, 200, 80, 140, 220, 150, 220, 130, 130, 75, 110, 320]),
    greyRange(autoCols), greyRange({ sheetId: acc, startRowIndex: 1, startColumnIndex: col('Pinterest username'), endColumnIndex: col('Pinterest username') + 1 }),
    greyRange({ sheetId: acc, startRowIndex: 1, startColumnIndex: col('Pins tab'), endColumnIndex: col('Media folder') + 1 }),
    listRule(one('On'), ['Yes', 'No'], true),
    { addProtectedRange: { protectedRange: { range: autoCols, description: 'Filled automatically by the automation', warningOnly: true } } },
    header(boards, BOARD_COLUMNS.length, '#7c3aed'),
    ...widths(boards, [120, 230, 180, 320, 120, 170, 170, 130]),
    greyRange(bAuto),
    listRule({ sheetId: boards, startRowIndex: 1, endRowIndex: 500, startColumnIndex: bcol('Status'), endColumnIndex: bcol('Status') + 1 }, [BOARD_STATUS.planned, BOARD_STATUS.live, BOARD_STATUS.error], false),
    header(ids[TABS.settings], 3, '#52525b'),
    ...widths(ids[TABS.settings], [240, 260, 640]),
    listRule({ sheetId: ids[TABS.settings], startRowIndex: 2, endRowIndex: 3, startColumnIndex: 1, endColumnIndex: 2 }, ['Yes', 'No'], true),
    greyRange({ sheetId: ids[TABS.settings], startRowIndex: 6, endRowIndex: 8, startColumnIndex: 1, endColumnIndex: 2 }),
    listRule({ sheetId: ids[TABS.settings], startRowIndex: 8, endRowIndex: 10, startColumnIndex: 1, endColumnIndex: 2 }, ['Yes', 'No'], true),
    header(ids[TABS.log], LOG_COLUMNS.length, '#52525b'),
    ...widths(ids[TABS.log], [130, 110, 120, 140, 65, 150, 260, 520]),
    { addProtectedRange: { protectedRange: { range: { sheetId: ids[TABS.log] }, description: 'Written automatically by the automation', warningOnly: true } } },
  ]);
  return sheetId;
}

// Older spreadsheets: add the Boards tab, missing columns and missing Settings rows.
async function repairControlSheet(gTok, sheetId) {
  const meta = await sheets.meta(gTok, sheetId);
  const titles = new Set((meta.sheets || []).map((s) => s.properties.title));
  if (!titles.has(TABS.boards)) {
    const added = await sheets.batchUpdate(gTok, sheetId, [{ addSheet: { properties: { title: TABS.boards, gridProperties: { rowCount: 500, columnCount: BOARD_COLUMNS.length, frozenRowCount: 1 }, tabColor: RGB('#7c3aed') } } }]);
    const sid = added.replies[0].addSheet.properties.sheetId;
    await sheets.write(gTok, sheetId, [{ range: `${quoteTab(TABS.boards)}!A1`, values: [BOARD_COLUMNS] }]);
    await sheets.batchUpdate(gTok, sheetId, [header(sid, BOARD_COLUMNS.length, '#7c3aed'), ...widths(sid, [120, 230, 180, 320, 120, 170, 170, 130])]);
  }
  const [accHead, settingRows] = await sheets.batchGet(gTok, sheetId, [`${quoteTab(TABS.accounts)}!1:1`, `${quoteTab(TABS.settings)}!A1:C50`]);
  await ensureColumns(gTok, sheetId, TABS.accounts, accHead[0], ACCOUNT_COLUMNS);
  const have = new Set(settingRows.map((r) => cellText(r[0]).toLowerCase()));
  const defaults = { 'Time zone': DEFAULT_TZ, 'Daily report time': '22:00', 'Notify by email': 'Yes', 'Notify by Telegram': 'No' };
  const add = SETTINGS_ROWS.filter(([k]) => !have.has(k.toLowerCase())).map(([k, help]) => [k, defaults[k] || '', help]);
  if (add.length) await sheets.write(gTok, sheetId, [{ range: `${quoteTab(TABS.settings)}!A${settingRows.length + 1}`, values: add }]);
  await ensureSimpleTabs(gTok, sheetId);
}

// Makes sure an account row has its Pins tab (with every column) and its media folder.
// Returns the updates to write into the Accounts row (Pins tab / Media folder) if anything was created.
async function provisionAccount(gTok, sheetId, rootId, tabTitles, name, row) {
  const updates = {};
  const tabName = cellText(row.pinsTab) || `${PINS_TAB_PREFIX}${name}`;
  if (!cellText(row.pinsTab)) updates['Pins tab'] = tabName;
  if (!tabTitles.has(tabName)) {
    await createPinsTab(gTok, sheetId, tabName, name);
    tabTitles.add(tabName);
  } else {
    const head = await sheets.get(gTok, sheetId, `${quoteTab(tabName)}!1:1`);
    await ensureColumns(gTok, sheetId, tabName, head[0], PIN_COLUMNS);
  }
  if (!folderIdFromLink(row.mediaFolder)) {
    const folderName = `${IMAGES_FOLDER_PREFIX}${name}`;
    const q = `'${rootId}' in parents and name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
    const existing = (await http('Google Drive', `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,webViewLink)`, { token: gTok })).files || [];
    const folder = existing[0] || await drive.createFolder(gTok, folderName, rootId, null);
    updates['Media folder'] = folder.webViewLink || `https://drive.google.com/drive/folders/${folder.id}`;
  }
  return updates;
}

async function createPinsTab(gTok, sheetId, tabName, accountName) {
  const added = await sheets.batchUpdate(gTok, sheetId, [{
    addSheet: { properties: { title: tabName, gridProperties: { rowCount: 1000, columnCount: PIN_COLUMNS.length, frozenRowCount: 1, frozenColumnCount: 1 }, tabColor: RGB('#e60023') } },
  }]);
  const sid = added.replies[0].addSheet.properties.sheetId;
  const col = (n) => PIN_COLUMNS.indexOf(n);
  const L = (n) => colLetter(col(n));
  await sheets.write(gTok, sheetId, [{ range: `${quoteTab(tabName)}!A1`, values: [PIN_COLUMNS] }]);

  const rng = (c1, c2) => ({ sheetId: sid, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: c1, endColumnIndex: c2 });
  const one = (n) => rng(col(n), col(n) + 1);
  const all = rng(0, PIN_COLUMNS.length);
  const fill = (range, formula, bg, bold) => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [range], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: { backgroundColor: RGB(bg), ...(bold ? { textFormat: { bold: true } } : {}) } } } } });
  const text = (range, formula, fg) => ({ addConditionalFormatRule: { index: 0, rule: { ranges: [range], booleanRule: { condition: { type: 'CUSTOM_FORMULA', values: [{ userEnteredValue: formula }] }, format: { textFormat: { foregroundColor: RGB(fg) } } } } } });
  const S = `$${L('Status')}2`;
  const managed = rng(col('Pinterest Pin ID'), PIN_COLUMNS.length);
  const w = {
    'Pin ID': 120, Status: 105, Account: 100, 'Media type': 95, Media: 200, Title: 240, Description: 320, Keywords: 180, Link: 200,
    Board: 170, 'Board section': 130, 'Alt text': 200, 'AI disclosure': 120, 'Publish after': 130, 'Video cover': 100,
    'Card titles': 140, 'Card links': 140, 'Target keyword': 180, Idea: 220, 'Picture style': 160,
    'Pinterest Pin ID': 150, 'Pin URL': 230, 'Posted at': 125, Attempts: 75, 'Last attempt': 125, Error: 340, Lock: 60,
    Impressions: 95, Saves: 70, 'Pin clicks': 80, 'Outbound clicks': 100, 'Stats updated': 110,
  };
  await sheets.batchUpdate(gTok, sheetId, [
    header(sid, PIN_COLUMNS.length, '#e60023'),
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 42 }, fields: 'pixelSize' } },
    ...PIN_COLUMNS.map((c, i) => ({ updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: i, endIndex: i + 1 }, properties: { pixelSize: w[c] || 120 }, fields: 'pixelSize' } })),
    { repeatCell: { range: one('Description'), cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: one('Error'), cell: { userEnteredFormat: { wrapStrategy: 'WRAP' } }, fields: 'userEnteredFormat.wrapStrategy' } },
    { repeatCell: { range: one('Publish after'), cell: { userEnteredFormat: { numberFormat: { type: 'DATE_TIME', pattern: 'yyyy-mm-dd hh:mm' } } }, fields: 'userEnteredFormat.numberFormat' } },
    { repeatCell: { range: managed, cell: { userEnteredFormat: { backgroundColor: RGB('#f4f4f5'), textFormat: { foregroundColor: RGB('#52525b') } } }, fields: 'userEnteredFormat(backgroundColor,textFormat)' } },
    { repeatCell: { range: one('Pin ID'), cell: { userEnteredFormat: { textFormat: { bold: true } } }, fields: 'userEnteredFormat.textFormat' } },
    listRule(one('Status'), ['Draft', 'Ready', 'Done', 'Error', 'Needs review', 'Skip', 'Posting'], false),
    listRule(one('Media type'), ['Image', 'Carousel', 'Video'], true),
    listRule(one('AI disclosure'), ['None', 'AI modified', 'Synthetic performer', 'AI modified + Synthetic performer'], true),
    listRule(one('Account'), [accountName], false),
    { setDataValidation: { range: one('Publish after'), rule: { condition: { type: 'DATE_IS_VALID' }, strict: false, showCustomUi: true } } },
    { addProtectedRange: { protectedRange: { range: managed, description: 'Filled automatically by the automation', warningOnly: true } } },
    { updateDimensionProperties: { range: { sheetId: sid, dimension: 'COLUMNS', startIndex: col('Lock'), endIndex: col('Lock') + 1 }, properties: { hiddenByUser: true }, fields: 'hiddenByUser' } },
    text(all, `=OR(${S}="Draft",${S}="Skip")`, '#a1a1aa'),
    fill(all, `=${S}="Posting"`, '#fef3c7'),
    fill(all, `=${S}="Done"`, '#dcfce7'),
    fill(all, `=${S}="Needs review"`, '#ffedd5'),
    fill(all, `=${S}="Error"`, '#fee2e2'),
    fill(rng(col('Media'), col('Title') + 1), `=AND(${S}="Ready",OR($${L('Media')}2="",$${L('Title')}2=""))`, '#fca5a5', true),
    fill(one('Link'), `=AND($${L('Link')}2<>"",NOT(REGEXMATCH($${L('Link')}2,"^https?://")))`, '#fca5a5', true),
    fill(one('Alt text'), `=LEN($${L('Alt text')}2)>500`, '#fca5a5', true),
    fill(rng(col('Description'), col('Keywords') + 1), `=LEN($${L('Description')}2)+LEN($${L('Keywords')}2)>780`, '#fca5a5', true),
    fill(one('Title'), `=LEN($${L('Title')}2)>100`, '#fca5a5', true),
  ]);
}
