// ============================================================================
// Prepare: first step of every hourly run.
//   1. creates or repairs the spreadsheet, tabs and folders
//   2. applies the Control Panel settings once per panel file (by version)
//   3. decides which accounts publish this hour, and which need their daily
//      board + statistics sync
//   4. decides whether the daily report is due
// ============================================================================

const TELEGRAM_HELP = 'Filled automatically after you press Start in your bot. Clear it to switch to another Telegram chat.';
const TELEGRAM_WAITING = '⚠️ Not connected yet: open your bot in Telegram and press Start. The next run connects it.';

function appliedVersions(cell) {
  return String(cell || '').split(/[\s,]+/).filter(Boolean);
}

function parseConfig(raw) {
  if (!raw) return null;
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(String(raw)); } catch (e) { throw new Error('The Control Panel settings inside this automation are damaged. Generate the file again in the Control Panel and re-import it.'); }
}

export const code = async (inputs) => {
  const gTok = tokenOf(inputs.google);
  const mailTok = tokenOf(inputs.gmail);
  const tgTok = secretOf(inputs.telegram);
  if (!gTok) throw new Error('The Google Sheets connection could not be loaded. Check it in Activepieces → Connections.');
  const config = parseConfig(inputs.config) || { settings: {}, accounts: [] };
  if ((config.settings?.telegramRecipientSheet || config.settings?.requireTelegramRecipient) && config.settings.notifyTelegram && !tgTok) throw new Error('Reconnect the selected Telegram bot in Activepieces before updating.');
  if (config.settings?.telegramRecipientSheet && config.settings.notifyTelegram && tgTok) {
    const sourceId = String(config.settings.telegramRecipientSheet);
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(sourceId)) throw new Error('The existing Telegram setup could not be verified.');
    const [rows] = await sheets.batchGet(gTok, sourceId, [`${quoteTab(TABS.settings)}!A1:C50`]);
    const existing = readSettings(rows);
    if (!existing.notifyTelegram || !/^\d+$/.test(existing.telegramChat)) throw new Error('Open your existing automation and finish its Telegram setup before using this bot.');
    config.settings.telegramChat = existing.telegramChat;
  }
  const now = new Date();
  const result = { due: [], reportDue: false, notes: [], created: [] };

  const ws = await ensureWorkspace(gTok, config.settings || {});
  result.created.push(...ws.created);
  const sheetLink = `https://docs.google.com/spreadsheets/d/${ws.sheetId}/edit`;
  result.spreadsheet = sheetLink;

  let [settingRows, accountRows] = await sheets.batchGet(gTok, ws.sheetId, [`${quoteTab(TABS.settings)}!A1:C50`, `${quoteTab(TABS.accounts)}!A1:Z200`]);
  let settings = readSettings(settingRows);
  if (config.settings?.requireTelegramRecipient && config.settings.notifyTelegram && !/^\d+$/.test(settings.telegramChat)) throw new Error('The saved Telegram recipient is missing. Add or replace the bot in Notifications.');

  // ---- Apply the Control Panel file once (identified by its version) ----
  // Several automations may share one spreadsheet (e.g. one per Activepieces account): the cell keeps
  // the last versions applied, so they never re-apply each other's files every hour.
  let applied = false;
  if (config.version && !appliedVersions(settings.configApplied).includes(config.version)) {
    await applyConfig(gTok, ws, config, settingRows, accountRows);
    applied = true;
    [settingRows, accountRows] = await sheets.batchGet(gTok, ws.sheetId, [`${quoteTab(TABS.settings)}!A1:C50`, `${quoteTab(TABS.accounts)}!A1:Z200`]);
    settings = readSettings(settingRows);
  }

  const tz = settings.timeZone;
  const today = localDate(now, tz);
  const hour = localHour(now, tz);
  const hourStamp = `${today} ${String(hour).padStart(2, '0')}:`;

  // ---- Every account: provision, then decide what it does this hour ----
  const own = new Map((config.accounts || []).map((a) => [normalizeName(cellText(a.name)), cellText(a.connection)]));
  const isMine = (name) => !own.size || own.has(normalizeName(name));
  const ownConnection = (name) => own.get(normalizeName(name)) || '';

  const head = headerMap(accountRows[0], ACCOUNT_COLUMNS);
  const meta = await sheets.meta(gTok, ws.sheetId);
  const tabTitles = new Set((meta.sheets || []).map((s) => s.properties.title));
  const writes = [];
  const put = (rowNumber, col, value) => {
    if (head.idx(col) !== undefined) writes.push({ range: `${quoteTab(TABS.accounts)}!${colLetter(head.idx(col))}${rowNumber}`, values: [[value]] });
  };
  const accounts = [];
  const websiteBase = config.settings?.website;
  const websiteState = websiteBase && !config.settings?.maintenance ? await websiteRequest(websiteBase, '/claim', {}) : {jobs:[], commands:[]};
  result.websiteJobs = websiteState.jobs;
  result.websiteCommands = websiteBase ? await applyWebsiteCommands(gTok, ws.sheetId, config, websiteState.commands) : [];

  for (let i = 1; i < accountRows.length; i++) {
    const r = accountRows[i] || [];
    const g = (c) => (head.idx(c) === undefined ? '' : cellText(r[head.idx(c)]));
    const name = g('Account');
    if (!name) continue;
    // Accounts set up by another automation sharing this spreadsheet are theirs: never touch them here.
    if (!isMine(name)) continue;
    const row = { pinsTab: g('Pins tab'), mediaFolder: g('Media folder') };
    try {
      const updates = await provisionAccount(gTok, ws.sheetId, ws.rootId, tabTitles, name, row);
      for (const [c, v] of Object.entries(updates)) put(i + 1, c, v);
      if (Object.keys(updates).length) result.created.push(`account "${name}" (${Object.keys(updates).join(', ')})`);
    } catch (e) {
      result.notes.push(`could not prepare account "${name}": ${e.message}`);
      put(i + 1, 'Health', `Setup problem: ${e.message}`.slice(0, 200));
      continue;
    }
    let alerts = {};
    try { alerts = JSON.parse(g('Alerts') || '{}') || {}; } catch (e) { alerts = {}; }
    const on = isYes(g('On'), false);
    const connection = g('Connection ID') || ownConnection(name);
    const hours = parseHours(g('Posting times'));
    if (on && !connection) {
      put(i + 1, 'Health', 'Setup problem: the Connection ID is empty (copy it from Activepieces → Connections)');
      continue;
    }
    const websiteJob = websiteState.jobs.find(j => j.name === name);
    const publish = on && (websiteBase ? Boolean(websiteJob) : hours.includes(hour) && !g('Last run').startsWith(hourStamp));
    const sync = on && alerts.synced !== today;
    accounts.push({ name, on, hours });
    if (publish || sync) result.due.push({ name, connection, publish, ...(websiteJob ? {websiteJob:{...websiteJob,base:websiteBase}} : {}) });
  }
  if (writes.length) await sheets.write(gTok, ws.sheetId, writes);

  result.reportDue = hour === settings.reportHour && settings.lastReport !== today;

  // ---- Telegram: find the chat once (the person presses Start in their bot) ----
  let tgWelcome = false;
  if (settings.notifyTelegram && tgTok && !settings.telegramChat && settings.rowOf.telegramChat) {
    try {
      const chat = await telegram.findChat(tgTok);
      if (chat) {
        await sheets.write(gTok, ws.sheetId, [{ range: `${quoteTab(TABS.settings)}!B${settings.rowOf.telegramChat}`, values: [[chat]] }]);
        settings.telegramChat = chat;
        tgWelcome = true;
      } else {
        result.notes.push('Telegram is on, but nobody has pressed Start in the bot yet');
      }
      // Show the state next to the Telegram chat ID cell, so a silent Telegram is never a mystery.
      const helpRow = settings.rowOf.telegramChat;
      const want = settings.telegramChat ? TELEGRAM_HELP : TELEGRAM_WAITING;
      if (cellText((settingRows[helpRow - 1] || [])[2]) !== want) {
        await sheets.write(gTok, ws.sheetId, [{ range: `${quoteTab(TABS.settings)}!C${helpRow}`, values: [[want]] }]);
      }
    } catch (e) {
      result.notes.push(`Telegram: ${e.message}`);
    }
  }
  if (settings.notifyTelegram && !tgTok && inputs.telegram !== '') result.notes.push('Telegram is on, but the Telegram Bot connection could not be loaded');
  result.hour = `${String(hour).padStart(2, '0')}:00 ${tz}`;

  // ---- Tell the user the workspace is ready (first run / new panel file) ----
  if (ws.created.length || applied || tgWelcome) {
    const ch = channelsFrom(settings, mailTok, tgTok, inputs);
    if (!(ws.created.length || applied)) ch.email = false; // only Telegram just got connected
    try {
      const title = ws.created.length ? '✅ Pinterest Autopilot is set up' : (applied ? '✅ Pinterest Autopilot settings updated' : '✅ Telegram connected to Pinterest Autopilot');
      const sent = await notify(ch, {
        subject: title,
        links: [{ href: sheetLink, text: '📊 Open the spreadsheet' }, { href: ws.rootLink, text: '📁 Open the Google Drive folder' }],
        telegram: [
          `<b>${tgEsc(title)}</b>`,
          '',
          tgWelcome ? 'Telegram is connected. You will get a message here for every published pin, every problem and the daily report.' : 'The settings from your Control Panel file were applied.',
          '',
          `👤 Accounts: ${tgEsc(accounts.map((a) => `${a.name}${a.on ? '' : ' (off)'}`).join(', ') || 'none yet')}`,
          ...accounts.filter((a) => a.on).map((a) => `🕒 ${tgEsc(a.name)}: ${tgEsc(formatHours(a.hours) || 'no posting times')}`),
          `📋 Daily report: ${tgEsc(formatHours([settings.reportHour]))} (${tgEsc(tz)})`,
        ].join('\n'),
        html: emailShell(ws.created.length ? 'Your Pinterest Autopilot is ready' : 'New settings applied', `
          <p>${ws.created.length ? 'The spreadsheet and picture folders were created in Google Drive.' : 'The settings from your Control Panel file were applied.'}</p>
          ${detailRows([
            ['Spreadsheet', link(sheetLink, 'Open the spreadsheet')],
            ['Folder', link(ws.rootLink, 'Open the Google Drive folder')],
            ['Accounts', esc(accounts.map((a) => `${a.name}${a.on ? '' : ' (off)'}`).join(', ') || 'none yet')],
            ['Time zone', esc(tz)],
            ['Daily report', esc(formatHours([settings.reportHour]))],
          ])}
          <p style="margin-top:14px;"><b>Next:</b> paste each account's Codex prompt (from the Control Panel) into its own new Codex chat to create the first pins. Each account posts at its posting times, one pin per time.</p>`, '#15803d'),
      });
      if (sent.failed.length) {
        result.notes.push(`setup message: ${sent.failed.join(' | ')}`);
        await sheets.append(gTok, ws.sheetId, `${quoteTab(TABS.log)}!A:I`, notifyFailureRows(localStamp(now, tz), '', sent.failed.map((f) => `Setup message not sent by ${f}`)));
      }
    } catch (e) {
      result.notes.push(`setup message failed: ${e.message}`);
    }
  }
  if (config.settings?.maintenance) {
    result.due = [];
    result.reportDue = false;
  }
  return result;
};

async function applyConfig(gTok, ws, config, settingRows, accountRows) {
  const s = config.settings || {};
  const current = readSettings(settingRows);
  const writes = [];
  const setRow = (key, value) => {
    const row = current.rowOf[key];
    if (row && value !== undefined && value !== null) writes.push({ range: `${quoteTab(TABS.settings)}!B${row}`, values: [[value]] });
  };
  if (s.emailTo) setRow('emailTo', s.emailTo);
  if (s.emailEveryPin !== undefined) setRow('emailEveryPin', s.emailEveryPin ? 'Yes' : 'No');
  if (Number.isFinite(s.lowQueue)) setRow('lowQueue', s.lowQueue);
  if (s.timeZone && validTimeZone(s.timeZone)) setRow('timeZone', s.timeZone);
  if (Number.isFinite(s.reportHour)) setRow('reportTime', formatHours([s.reportHour]));
  if (s.notifyEmail !== undefined) setRow('notifyEmail', s.notifyEmail ? 'Yes' : 'No');
  if (s.notifyTelegram !== undefined) setRow('notifyTelegram', s.notifyTelegram ? 'Yes' : 'No');
  if (s.telegramChat && /^\d+$/.test(String(s.telegramChat))) setRow('telegramChat', String(s.telegramChat));
  setRow('configApplied', [config.version, ...appliedVersions(current.configApplied).filter((v) => v !== config.version)].slice(0, 10).join(', '));

  const head = headerMap(accountRows[0], ACCOUNT_COLUMNS);
  const rowsByName = new Map();
  for (let i = 1; i < accountRows.length; i++) {
    const name = cellText((accountRows[i] || [])[head.idx('Account')]);
    if (name) rowsByName.set(normalizeName(name), i + 1);
  }
  const appends = [];
  for (const a of config.accounts || []) {
    const name = cellText(a.name);
    if (!name) continue;
    const values = {
      On: a.on === false ? 'No' : 'Yes',
      'Connection ID': cellText(a.connection),
      ...(a.username ? {'Pinterest username': '@' + cellText(a.username).replace(/^@/, '')} : {}),
      Niche: cellText(a.niche),
      Link: cellText(a.link),
      'Posting times': formatHours((a.hours || []).filter((h) => h >= FIRST_HOUR && h <= LAST_HOUR)),
      'Daily cap': Number(a.dailyCap) || (a.hours || []).length || 5,
    };
    const rowNumber = rowsByName.get(normalizeName(name));
    if (rowNumber) {
      for (const [c, v] of Object.entries(values)) {
        if (head.idx(c) !== undefined) writes.push({ range: `${quoteTab(TABS.accounts)}!${colLetter(head.idx(c))}${rowNumber}`, values: [[v]] });
      }
    } else {
      const row = ACCOUNT_COLUMNS.map((c) => {
        if (c === 'Account') return name;
        if (c === 'Health') return 'New';
        if (c === 'Alerts') return '{}';
        return values[c] !== undefined ? values[c] : '';
      });
      // Written by header position so it lands correctly even in an older (migrated) column order.
      const ordered = [];
      for (const c of ACCOUNT_COLUMNS) ordered[head.idx(c)] = row[ACCOUNT_COLUMNS.indexOf(c)];
      appends.push(Array.from(ordered, (v) => (v === undefined ? '' : v)));
    }
  }
  if (writes.length) await sheets.write(gTok, ws.sheetId, writes);
  if (appends.length) await sheets.append(gTok, ws.sheetId, `${quoteTab(TABS.accounts)}!A:A`, appends);

  // Share the whole folder for editing with the person who set it up (no notification email).
  const shareWith = cellText(config.shareWith || s.emailTo);
  if (shareWith) {
    const perms = await http('Google Drive', `${DRIVE}/files/${ws.rootId}/permissions?fields=permissions(emailAddress,role)`, { token: gTok });
    const already = (perms.permissions || []).some((p) => cellText(p.emailAddress).toLowerCase() === shareWith.toLowerCase());
    if (!already) {
      await http('Google Drive', `${DRIVE}/files/${ws.rootId}/permissions?sendNotificationEmail=false`, {
        method: 'POST', token: gTok, json: { role: 'writer', type: 'user', emailAddress: shareWith },
      });
    }
  }
}
