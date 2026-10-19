// ============================================================================
// Daily report (runs inside the hourly automation at the "Daily report time"):
// one email with, per account, today's published pins (picture grid), today's
// problems, the queue, the best pins by saves, and a warning for any account
// that did not run at its last posting time.
// ============================================================================

function thumb(url) {
  return String(url || '').replace('/564x/', '/236x/').replace('/1200x/', '/236x/').replace('/600x/', '/236x/');
}

const PROBLEM_RESULTS = ['Rejected', 'Rejected by Pinterest', 'Needs review', 'Login problem', 'Wrong account', 'Setup problem', 'Pinterest problem', 'Problem', 'Unconfirmed'];

// Latest posting hour today that is already in the past, as "YYYY-MM-DD HH:00".
function lastDueSlot(hours, tz, now) {
  const hour = localHour(now, tz);
  const past = hours.filter((h) => h <= hour);
  return past.length ? `${localDate(now, tz)} ${String(past[past.length - 1]).padStart(2, '0')}:00` : null;
}

function num(v) {
  const n = Number(cellText(v));
  return Number.isFinite(n) ? n : 0;
}

export const code = async (inputs) => {
  if (!(inputs.due === true || cellText(inputs.due) === 'true')) return { skipped: true };
  const gTok = tokenOf(inputs.google);
  const mailTok = tokenOf(inputs.gmail);
  if (!gTok) throw new Error('The Google Sheets connection could not be loaded.');
  const found = await drive.findByMarker(gTok, CONTROL_MARKER, 'application/vnd.google-apps.spreadsheet');
  if (!found.length) throw new Error('The "Pinterest Autopilot" spreadsheet was not found.');
  const sheetId = found[0].id;
  const sheetLink = found[0].webViewLink || `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;
  const [settingsRows, accountRows, logRows] = await sheets.batchGet(gTok, sheetId, [
    `${quoteTab(TABS.settings)}!A1:C50`, `${quoteTab(TABS.accounts)}!A1:Z200`, `${quoteTab(TABS.log)}!A1:I50000`,
  ]);
  const settings = readSettings(settingsRows);
  const tz = settings.timeZone;
  const now = new Date();
  const today = localDate(now, tz);

  const ah = headerMap(accountRows[0], ACCOUNT_REQUIRED_COLUMNS);
  const accounts = [];
  for (let i = 1; i < accountRows.length; i++) {
    const r = accountRows[i] || [];
    const g = (c) => (ah.idx(c) === undefined ? '' : cellText(r[ah.idx(c)]));
    if (!g('Account')) continue;
    accounts.push({
      name: g('Account'), on: isYes(g('On'), false), username: g('Pinterest username'), health: g('Health') || '—',
      pinsLeft: g('Pins left'), lastRun: g('Last run'), hours: parseHours(g('Posting times')),
      cap: Number(g('Daily cap')) || parseHours(g('Posting times')).length || 5, pinsTab: g('Pins tab'),
    });
  }

  // Best pins by saves (statistics are refreshed daily by the engine).
  const tabs = accounts.filter((a) => a.pinsTab);
  const pinTabs = tabs.length ? await sheets.batchGet(gTok, sheetId, tabs.map((a) => `${quoteTab(a.pinsTab)}!A1:AZ5000`)).catch(() => tabs.map(() => [])) : [];
  tabs.forEach((a, i) => {
    const values = pinTabs[i] || [];
    const h = headerMap(values[0], []);
    if (h.idx('Saves') === undefined) { a.best = []; return; }
    const g = (r, c) => cellText(r[h.idx(c)]);
    a.best = values.slice(1)
      .filter((r) => g(r, 'Status').toLowerCase() === 'done' && g(r, 'Pin URL'))
      .map((r) => ({ title: g(r, 'Title'), url: g(r, 'Pin URL'), saves: num(g(r, 'Saves')), clicks: num(g(r, 'Outbound clicks')), impressions: num(g(r, 'Impressions')), keyword: g(r, 'Target keyword') }))
      .filter((p) => p.impressions > 0 || p.saves > 0)
      .sort((x, y) => (y.saves - x.saves) || (y.clicks - x.clicks) || (y.impressions - x.impressions))
      .slice(0, 3);
  });

  const lh = headerMap(logRows[0], LOG_COLUMNS);
  const entries = logRows.slice(1).map((r) => {
    const g = (c) => cellText(r[lh.idx(c)]);
    return { time: g('Time'), account: g('Account'), pinId: g('Pin ID'), result: g('Result'), url: g('Pin URL'), details: g('Details'), image: g('Image') };
  });

  let totalPosted = 0;
  let totalProblems = 0;
  let stopped = 0;
  const tgLines = [];
  const cards = accounts.map((a) => {
    const mine = entries.filter((e) => e.account === a.name && e.time.startsWith(today));
    const posted = mine.filter((e) => e.result === 'Published');
    const problems = mine.filter((e) => PROBLEM_RESULTS.includes(e.result));
    totalPosted += posted.length;
    totalProblems += problems.length;
    let runWarning = '';
    if (a.on) {
      const due = lastDueSlot(a.hours, tz, now);
      if (due && (!a.lastRun || a.lastRun.slice(0, 13) < due.slice(0, 13))) {
        stopped++;
        runWarning = `<div style="background:#fff7ed;border:1px solid #fdba74;border-radius:8px;padding:8px 10px;margin:8px 0;font-size:13px;color:#9a3412;"><b>Did not run at ${esc(due.slice(11))}.</b> Last run: ${esc(a.lastRun || 'never')}. Check its Connection ID in the Accounts tab and the automation in Activepieces → Runs.</div>`;
      }
    }
    tgLines.push([
      `<b>${tgEsc(a.name)}</b>${a.username ? ` ${tgEsc(a.username)}` : ''} · ${tgEsc(a.on ? a.health || 'OK' : 'Off')}`,
      `   Published today: ${posted.length}/${a.cap} · Ready: ${tgEsc(a.pinsLeft || '0')}${problems.length ? ` · ⚠️ ${problems.length} problem${problems.length === 1 ? '' : 's'}` : ''}`,
      ...(runWarning ? [`   ⚠️ Did not run at its last posting time (last run: ${tgEsc(a.lastRun || 'never')})`] : []),
      ...(a.best || []).slice(0, 1).map((p) => `   ⭐ Best: ${tgEsc(p.title || 'pin')} (${p.saves} saves)`),
    ].join('\n'));
    const healthColor = a.health === 'OK' ? '#15803d' : (a.health === 'Off' ? '#71717a' : '#b45309');
    const grid = posted.length
      ? `<table style="border-collapse:collapse;"><tr>${posted.map((p, i) => `${i && i % 3 === 0 ? '</tr><tr>' : ''}<td style="padding:4px;vertical-align:top;width:160px;">
          <a href="${esc(p.url)}" style="text-decoration:none;color:#18181b;">
          ${p.image ? `<img src="${esc(thumb(p.image))}" alt="" width="150" style="display:block;border-radius:10px;width:150px;">` : ''}
          <div style="font-size:12px;line-height:1.3;margin-top:4px;">${esc(p.pinId)}</div>
          <div style="font-size:11px;color:#71717a;">${esc(p.time.slice(11))}</div></a></td>`).join('')}</tr></table>`
      : '<p style="color:#71717a;margin:6px 0;">Nothing published today.</p>';
    const probs = problems.length
      ? `<ul style="margin:8px 0 0;padding-left:18px;color:#b91c1c;font-size:13px;">${problems.map((p) => `<li>${esc(p.time.slice(11))} ${p.pinId ? `${esc(p.pinId)}: ` : ''}<b>${esc(p.result)}</b> — ${esc(p.details)}</li>`).join('')}</ul>`
      : '';
    const best = (a.best || []).length
      ? `<div style="font-size:13px;margin-top:10px;"><b>Best pins so far</b> (saves · outbound clicks · impressions)<ol style="margin:4px 0 0;padding-left:18px;">${a.best.map((p) => `<li>${link(p.url, p.title || 'pin')} — ${p.saves} · ${p.clicks} · ${p.impressions}${p.keyword ? ` <span style="color:#71717a;">(${esc(p.keyword)})</span>` : ''}</li>`).join('')}</ol></div>`
      : '';
    return `<div style="border:1px solid #e4e4e7;border-radius:12px;padding:14px;margin:0 0 14px;">
      <div style="font-size:16px;font-weight:600;">${esc(a.name)} <span style="color:#71717a;font-weight:400;font-size:13px;">${esc(a.username)}</span></div>
      <div style="font-size:13px;margin:4px 0 6px;"><span style="color:${healthColor};font-weight:600;">${esc(a.on ? a.health : 'Off')}</span>
        · published today: <b>${posted.length}/${a.cap}</b> · Ready in queue: <b>${esc(a.pinsLeft || '0')}</b> · last run: ${esc(a.lastRun || 'never')}</div>
      ${runWarning}${grid}${probs}${best}</div>`;
  }).join('');

  const active = accounts.filter((a) => a.on).length;
  const flags = [totalProblems ? `${totalProblems} problem${totalProblems === 1 ? '' : 's'}` : '', stopped ? `${stopped} not running` : ''].filter(Boolean).join(', ');
  const subject = `📋 Pinterest daily report ${today}: ${totalPosted} published${flags ? ` · ${flags}` : ''}`;
  const html = emailShell(`Daily report · ${today}`, `
    <p style="margin-top:0;">${totalPosted} pin${totalPosted === 1 ? '' : 's'} published today across ${active} active account${active === 1 ? '' : 's'}.</p>
    ${cards || '<p>No accounts are set up yet.</p>'}
    <p style="font-size:13px;color:#71717a;">Full history: ${link(sheetLink, 'open the spreadsheet')} → Log tab. If this report ever stops arriving, the automation itself needs attention (Activepieces → Runs).</p>`, '#18181b');
  const sent = await notify(channelsFrom(settings, mailTok, secretOf(inputs.telegram), inputs), {
    subject, html, links: [{ href: sheetLink, text: '📊 Open the spreadsheet' }],
    telegram: `📋 <b>Daily report · ${tgEsc(today)}</b>\n${totalPosted} pin${totalPosted === 1 ? '' : 's'} published today${flags ? ` · ${tgEsc(flags)}` : ''}\n\n${tgLines.join('\n\n') || 'No accounts are set up yet.'}`,
  });
  if (sent.failed.length) {
    try { await sheets.append(gTok, sheetId, `${quoteTab(TABS.log)}!A:I`, notifyFailureRows(localStamp(new Date(), settings.timeZone), '', sent.failed.map((f) => `Daily report not sent by ${f}`))); } catch (e) { /* the report result below still lists it */ }
  }
  if (sent.tried && sent.delivered === 0) throw new Error(`The daily report could not be delivered: ${sent.failed.join(' | ')}`);
  if (settings.rowOf.lastReport) {
    await sheets.write(gTok, sheetId, [{ range: `${quoteTab(TABS.settings)}!B${settings.rowOf.lastReport}`, values: [[today]] }]);
  }
  return { sentTo: [settings.notifyEmail ? settings.emailTo : '', settings.notifyTelegram ? 'Telegram' : ''].filter(Boolean), totalPosted, totalProblems, stopped, subject, failed: sent.failed };
};
