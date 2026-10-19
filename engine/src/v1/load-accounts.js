// ============================================================================
// Step "Load accounts": finds the control spreadsheet, reads Settings and the
// Accounts tab, and returns the accounts that are switched On.
// ============================================================================

function parseSettings(rows) {
  const map = {};
  for (const r of rows || []) {
    const key = cellText(r[0]).toLowerCase();
    if (key) map[key] = r[1];
  }
  const yes = (v, dflt) => (cellText(v) === '' ? dflt : /^(yes|y|true|on|1)$/i.test(cellText(v)));
  const num = (v, dflt) => {
    const n = Number(cellText(v));
    return Number.isFinite(n) && n >= 0 ? n : dflt;
  };
  let tz = cellText(map['time zone']) || DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
  } catch (e) {
    tz = DEFAULT_TZ;
  }
  return {
    emailTo: cellText(map['send emails to']),
    emailEveryPin: yes(map['email every published pin'], true),
    lowQueue: num(map['low-queue warning'], 10),
    maxPerDay: num(map['max pins per account per day'], 5) || 5,
    tz,
  };
}

function parseAlerts(v) {
  try {
    const o = JSON.parse(cellText(v) || '{}');
    return o && typeof o === 'object' ? o : {};
  } catch (e) {
    return {};
  }
}

export const code = async (inputs) => {
  const gTok = tokenOf(inputs.google);
  if (!gTok) {
    throw new Error('The Google connection could not be loaded. In Activepieces > Connections, reconnect the Google Sheets connection.');
  }
  const found = await drive.findByMarker(gTok, CONTROL_MARKER, 'application/vnd.google-apps.spreadsheet');
  if (!found.length) {
    throw new Error('The "Pinterest Autopilot" spreadsheet was not found in Google Drive. Run the "Pinterest Autopilot – Setup" automation first.');
  }
  const sheetId = found[0].id;
  const [settingsRows, accountRows] = await sheets.batchGet(gTok, sheetId, [
    `${quoteTab(TABS.settings)}!A1:C50`,
    `${quoteTab(TABS.accounts)}!A1:Z200`,
  ]);
  const settings = parseSettings(settingsRows);
  const head = headerMap(accountRows[0], ACCOUNT_COLUMNS);
  if (head.missing.length) {
    const msg = `The Accounts tab is missing these columns: ${head.missing.join(', ')}. Restore the column headers.`;
    await sendEmail(tokenOf(inputs.gmail), {
      to: settings.emailTo,
      subject: '⚙️ Pinterest Autopilot: setup problem',
      html: emailShell('Setup problem', `<p>${esc(msg)}</p><p>Nothing was posted. Posting resumes as soon as this is fixed.</p>`, '#b45309'),
    }).catch(() => {});
    throw new Error(msg);
  }

  const col = (name) => colLetter(head.idx(name));
  const accountCols = {
    username: col('Pinterest username'), health: col('Health'), lastPost: col('Last post'),
    pinsLeft: col('Pins left'), alerts: col('Alerts'),
  };
  const accounts = [];
  const writes = [];
  for (let i = 1; i < accountRows.length; i++) {
    const r = accountRows[i] || [];
    const name = cellText(r[head.idx('Account')]);
    if (!name) continue;
    const rowNumber = i + 1;
    const health = cellText(r[head.idx('Health')]);
    const on = /^(yes|y|on|true|1)$/i.test(cellText(r[head.idx('On')]));
    if (!on) {
      if (health !== 'Off') {
        writes.push({ range: `${quoteTab(TABS.accounts)}!${accountCols.health}${rowNumber}`, values: [['Off']] });
      }
      continue;
    }
    accounts.push({
      rowNumber,
      name,
      connectionId: cellText(r[head.idx('Pinterest connection ID')]) || 'missing-connection-id',
      connectionIdGiven: Boolean(cellText(r[head.idx('Pinterest connection ID')])),
      pinsTab: cellText(r[head.idx('Pins tab')]) || `${PINS_TAB_PREFIX}${name}`,
      imagesFolderId: folderIdFromLink(r[head.idx('Images folder')]),
      defaultBoard: cellText(r[head.idx('Default board')]),
      username: cellText(r[head.idx('Pinterest username')]).replace(/^@/, ''),
      health,
      alerts: parseAlerts(r[head.idx('Alerts')]),
    });
  }
  await sheets.write(gTok, sheetId, writes);

  return {
    control: { sheetId, sheetUrl: found[0].webViewLink, settings, accountCols },
    accounts,
    accountNames: accounts.map((a) => a.name),
  };
};
