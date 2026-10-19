import test from 'node:test';
import assert from 'node:assert/strict';
import { FakeWorld, fakeJpeg, fakePng, fakeMp4 } from './fake-world.mjs';

globalThis.__AP_CONFIRM_DELAYS__ = [1, 1];
const load = (name) => import(`../dist/steps/${name}.mjs`);
const lib = await import('../dist/lib.mjs');
const PIN = lib.PIN_COLUMNS;

const TZ = 'Africa/Casablanca';
const OWNER = 'owner@example.com';
const TIMES = ['09:00', '12:00', '15:00', '18:00', '21:00'];
const today = () => lib.localDate(new Date(), TZ);
const clone = (o) => JSON.parse(JSON.stringify(o));

let versionSeq = 0;
function config(accounts, settings = {}) {
  return {
    version: `test-${++versionSeq}`,
    shareWith: 'me@example.com',
    settings: { emailTo: OWNER, emailEveryPin: true, lowQueue: 10, timeZone: TZ, reportHour: 22, ...settings },
    accounts: accounts.map((a) => ({ hours: [9, 12, 15, 18, 21], dailyCap: 5, on: true, niche: 'salads', link: '', ...a })),
  };
}

async function runPrepare(w, cfg) {
  const prepare = await load('prepare');
  return prepare.code(clone({ google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail }, config: cfg }));
}

async function makeWorld({ name = 'hdrahm', conn = 'pin-conn-1', defaultBoard = '' } = {}) {
  const w = new FakeWorld();
  w.install();
  w.boards.push({ id: 'b-main', name: 'Main board', privacy: 'PUBLIC', owner: 'p-token-1' });
  w.boards.push({ id: 'b-secret', name: 'Private stuff', privacy: 'SECRET', owner: 'p-token-1' });
  w.sections['b-main'] = [{ id: 's-1', name: 'Salads' }];
  w.accountsCfg = [];
  await addAccount(w, { name, conn, defaultBoard });
  return w;
}

async function addAccount(w, { name, conn, defaultBoard = '' }) {
  w.accountsCfg.push({ name, connection: conn });
  const res = await runPrepare(w, config(w.accountsCfg));
  if (defaultBoard) setAccount(w, 'Default board', defaultBoard, name);
  return res;
}

async function runEngine(w, extra = {}, { name = 'hdrahm', conn = 'pin-conn-1' } = {}) {
  const tok = w.connections[conn];
  const engine = await load('account-engine');
  return engine.code(clone({
    google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail },
    pinterest: tok ? { access_token: tok } : undefined,
    accountName: name, ...extra,
  }));
}

const headerObj = (header, row) => Object.fromEntries(header.map((h, i) => [h, row && row[i] !== undefined ? row[i] : '']));
function account(w, name = 'hdrahm') {
  const rows = w.rows('Accounts');
  return headerObj(rows[0], rows.find((r) => r && r[0] === name));
}
function setAccount(w, field, value, name = 'hdrahm') {
  const rows = w.rows('Accounts');
  rows.find((r) => r && r[0] === name)[rows[0].indexOf(field)] = value;
}
const tabOf = (name) => `Pins – ${name}`;
function rowById(w, id, name = 'hdrahm') {
  const rows = w.rows(tabOf(name));
  return headerObj(rows[0], rows.find((r) => r && r[0] === id));
}
function rowAt(w, n, name = 'hdrahm') {
  const rows = w.rows(tabOf(name));
  return headerObj(rows[0], rows[n - 1]);
}
function addRows(w, rows, name = 'hdrahm', start) {
  const grid = w.rows(tabOf(name));
  let at = start || grid.length + 1;
  for (const o of rows) {
    grid[at - 1] = PIN.map((h) => (o[h] === undefined ? '' : o[h]));
    at++;
  }
}
const folderOf = (w, name = 'hdrahm') => lib.folderIdFromLink(account(w, name)['Media folder']);
function files(w, names, opts = {}, name = 'hdrahm') {
  for (const n of names) w.addImage(folderOf(w, name), n, opts);
}
function readyRow(n, extra = {}) {
  return { Status: 'Ready', 'Media type': 'Image', Media: `p${n}.jpg`, Title: `Pin number ${n}`, Description: `Description ${n}`, Keywords: 'summer salad, healthy', Link: 'https://example.com/post', Board: 'Main board', ...extra };
}
const logRows = (w) => w.rows('Log').slice(1).map((r) => headerObj(w.rows('Log')[0], r));

// ---------------------------------------------------------------------------
test('helpers: keywords, dates, links, file sniffing', () => {
  assert.equal(lib.formatKeywords('summer salad, #healthy, ,  dinner-ideas; Été'), '#summersalad #healthy #dinnerideas #Été');
  assert.equal(lib.finalDescription('Hello', 'a, b'), 'Hello\n\n#a #b');
  assert.equal(lib.cellToLocalStamp('2026-12-05'), '2026-12-05 00:00');
  assert.equal(lib.cellToLocalStamp('2026-12-05 14:30'), '2026-12-05 14:30');
  assert.equal(lib.cellToLocalStamp('05/12/2026 08:05'), '2026-12-05 08:05');
  assert.equal(lib.cellToLocalStamp(46296.5), '2026-10-01 12:00');
  assert.equal(lib.cellToLocalStamp('soon'), null);
  assert.equal(lib.isValidLink('https://example.com/a'), true);
  assert.equal(lib.isValidLink('www.example.com'), false);
  assert.equal(lib.driveIdFromText('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUv/view?usp=sharing'), '1AbCdEfGhIjKlMnOpQrStUv');
  assert.equal(lib.driveIdFromText('photo.jpg'), '');
  assert.deepEqual(lib.imageSize(fakePng(1000, 1500)), { width: 1000, height: 1500 });
  assert.deepEqual(lib.imageSize(fakeJpeg(800, 1200)), { width: 800, height: 1200 });
  assert.equal(lib.sniffImageType(fakeJpeg(1, 1)), 'image/jpeg');
  assert.equal(lib.sniffImageType(Buffer.from('GIF89a')), null);
  assert.equal(lib.mp4DurationSeconds(fakeMp4(7.5)), 7.5);
  assert.equal(lib.normalizeUrl('https://Houdaifa.dev/'), 'https://houdaifa.dev');
});

test('prepare: creates the workspace, applies the panel settings once, provisions accounts; safe to re-run', async () => {
  const w = await makeWorld();
  assert.deepEqual(w.book().tabs.map((t) => t.title).sort(), ['Accounts', 'Boards', 'Guide', 'Log', 'Pins – hdrahm', 'Plan', 'Products', 'Settings']);
  const acc = account(w);
  assert.equal(acc['Connection ID'], 'pin-conn-1');
  assert.equal(acc['Posting times'], TIMES.join(', '));
  assert.equal(acc['Daily cap'], 5);
  assert.equal(acc.Niche, 'salads');
  assert.ok(lib.folderIdFromLink(acc['Media folder']), 'media folder created');
  assert.equal(w.rows('Pins – hdrahm')[0].join('|'), PIN.join('|'));
  const settings = Object.fromEntries(w.rows('Settings').slice(1).map((r) => [r[0], r[1]]));
  assert.equal(settings['Send emails to'], OWNER);
  assert.equal(settings['Time zone'], TZ);
  assert.equal(settings['Daily report time'], '22:00');
  assert.equal(settings['Config applied'], `test-${versionSeq}`);
  const root = [...w.files.values()].find((f) => f.properties.autopilot === 'root-folder');
  assert.deepEqual(root.shared, ['me@example.com']);
  assert.ok(w.sent.some((m) => m.subject.includes('is set up')), 'setup email sent');

  // Same panel file again: nothing re-applied (a person's later edit in the sheet survives).
  setAccount(w, 'Niche', 'edited by hand');
  const sameVersion = config(w.accountsCfg);
  sameVersion.version = `test-${versionSeq - 1}`;
  w.rows('Settings').find((r) => r[0] === 'Config applied')[1] = sameVersion.version;
  await runPrepare(w, sameVersion);
  assert.equal(account(w).Niche, 'edited by hand');
  assert.equal(w.books.size, 1);
  assert.equal(root.shared.length, 1, 'not shared twice');

  // A new panel file with a second account: added, provisioned, first account updated.
  w.connections['pin-conn-2'] = 'p-token-2';
  await addAccount(w, { name: 'florals', conn: 'pin-conn-2' });
  assert.equal(w.rows('Accounts').filter((r) => r && r[0] === 'hdrahm').length, 1);
  assert.equal(account(w, 'florals')['Connection ID'], 'pin-conn-2');
  assert.ok(w.tab('Pins – florals'));
  assert.equal(account(w).Niche, 'salads', 'new panel file wins over the hand edit');
  assert.equal(w.boards.length, 2, 'no board created');
});

test('prepare: decides who posts this hour (posting time, same-hour guard, daily sync)', async () => {
  const w = await makeWorld();
  const hour = Number(lib.localStamp(new Date(), TZ).slice(11, 13));
  const cfg = config([{ name: 'hdrahm', connection: 'pin-conn-1', hours: [hour] }]);
  let out = await runPrepare(w, cfg);
  const inWindow = hour >= 6 && hour <= 23;
  assert.deepEqual(out.due, [{ name: 'hdrahm', connection: 'pin-conn-1', publish: inWindow }]);
  setAccount(w, 'Last run', `${lib.localDate(new Date(), TZ)} ${String(hour).padStart(2, '0')}:00`);
  setAccount(w, 'Alerts', JSON.stringify({ synced: lib.localDate(new Date(), TZ) }));
  out = await runPrepare(w, cfg);
  assert.deepEqual(out.due, [], 'already ran this hour and already synced today');
  setAccount(w, 'On', 'No');
  setAccount(w, 'Alerts', '{}');
  out = await runPrepare(w, cfg);
  assert.deepEqual(out.due, [], 'switched off');
  setAccount(w, 'On', 'Yes');
  setAccount(w, 'Connection ID', '');
  out = await runPrepare(w, cfg);
  assert.deepEqual(out.due, [{ name: 'hdrahm', connection: 'pin-conn-1', publish: false }], 'empty cell: the Control Panel file still knows the login');
});

test('two automations sharing one spreadsheet: each handles only its own accounts and applies its file once', async () => {
  const w = await makeWorld();
  const hour = Number(lib.localStamp(new Date(), TZ).slice(11, 13));
  const mine = config([{ name: 'hdrahm', connection: 'pin-conn-1', hours: [hour] }]);
  const theirs = config([{ name: 'friend', connection: 'pin-conn-9', hours: [hour] }]);
  w.sent.length = 0;
  for (let i = 0; i < 3; i++) {
    const a = await runPrepare(w, mine);
    const b = await runPrepare(w, theirs);
    assert.deepEqual(a.due.map((d) => d.name), ['hdrahm'], 'only its own account');
    assert.deepEqual(b.due.map((d) => [d.name, d.connection]), [['friend', 'pin-conn-9']], 'never the other automation\'s account');
  }
  const updated = w.sent.filter((m) => /settings updated/.test(m.subject));
  assert.equal(updated.length, 2, 'each file is applied once, not every hour');
  const applied = Object.fromEntries(w.rows('Settings').slice(1).map((r) => [r[0], r[1]]))['Config applied'];
  assert.ok(applied.includes(mine.version) && applied.includes(theirs.version));
  const names = w.rows('Accounts').slice(1).map((r) => r[0]);
  assert.deepEqual(names.sort(), ['friend', 'hdrahm']);
});

test('publishes one image pin, verifies it, records it by Pin ID, emails with picture', async () => {
  const w = await makeWorld();
  addRows(w, [
    { Status: 'Draft', Media: 'draft.jpg', Title: 'Draft pin', Board: 'Main board' },
    readyRow(1, { 'Alt text': 'A bowl of salad', 'Board section': 'salads', 'AI disclosure': 'AI modified' }),
    readyRow(2),
  ]);
  files(w, ['p1.jpg', 'p2.jpg']);
  const res = await runEngine(w);
  assert.equal(res.outcome, 'published');
  assert.equal(w.pins.length, 1, 'only one pin per run');
  const p = w.pins[0];
  assert.equal(p.payload.media_source.source_type, 'image_base64');
  assert.equal(p.payload.media_source.content_type, 'image/jpeg');
  assert.equal(p.payload.description, 'Description 1\n\n#summersalad #healthy');
  assert.equal(p.payload.board_id, 'b-main');
  assert.equal(p.payload.board_section_id, 's-1');
  assert.deepEqual(p.payload.ai_disclosures, { values: ['AI_MODIFIED'] });
  assert.equal(p.payload.alt_text, 'A bowl of salad');

  const r = rowAt(w, 3);
  assert.equal(r['Pin ID'], 'HDRAHM-0002');
  assert.equal(rowAt(w, 2)['Pin ID'], 'HDRAHM-0001', 'every row got a stable ID');
  assert.equal(r.Status, 'Done');
  assert.equal(r['Pinterest Pin ID'], p.id);
  assert.equal(r['Pin URL'], `https://www.pinterest.com/pin/${p.id}/`);
  assert.equal(r.Attempts, 1);
  assert.ok(r['Posted at'].startsWith(today()));
  assert.equal(r.Lock, '');

  const acc = account(w);
  assert.equal(acc.Health, 'OK');
  assert.equal(acc['Pins left'], 1);
  assert.ok(acc['Last run'].startsWith(today()));
  const log = logRows(w).find((l) => l.Result === 'Published');
  assert.equal(log['Pin ID'], 'HDRAHM-0002');
  assert.match(log.Image, /i\.pinimg\.com/);
  const mail = w.sent.find((m) => m.subject.includes('is live'));
  assert.match(mail.html, /<img src="https:\/\/i\.pinimg\.com/);
  assert.match(mail.from, /Pinterest Autopilot <bot@example\.com>/);
  assert.equal(mail.to, OWNER);
  assert.equal(w.boards.length, 2, 'no board created');
});

test('carousel: 2–5 images become ONE multi-image pin with card titles and links', async () => {
  const w = await makeWorld();
  addRows(w, [{ ...readyRow(1), 'Media type': 'Carousel', Media: 'c1.jpg, c2.png, c3.jpg', 'Card titles': 'Bowl | Salad | Dressing', 'Card links': 'https://a.com | https://b.com | https://c.com' }]);
  files(w, ['c1.jpg', 'c3.jpg']);
  files(w, ['c2.png'], { mimeType: 'image/png' });
  await runEngine(w);
  assert.equal(w.pins.length, 1);
  const ms = w.pins[0].payload.media_source;
  assert.equal(ms.source_type, 'multiple_image_base64');
  assert.equal(ms.items.length, 3);
  assert.equal(ms.items[1].content_type, 'image/png');
  assert.equal(ms.items[2].title, 'Dressing');
  assert.equal(ms.items[0].link, 'https://a.com');
  assert.equal(rowAt(w, 2).Status, 'Done');
});

test('video: uploads to Pinterest, waits for processing, publishes with a cover image', async () => {
  const w = await makeWorld();
  addRows(w, [{ ...readyRow(1), 'Media type': 'Video', Media: 'clip.mp4', 'Video cover': 'cover.jpg' }]);
  files(w, ['clip.mp4'], { mimeType: 'video/mp4' });
  files(w, ['cover.jpg']);
  await runEngine(w);
  assert.equal(w.pins.length, 1);
  const ms = w.pins[0].payload.media_source;
  assert.equal(ms.source_type, 'video_id');
  assert.equal(ms.media_id, '9000');
  assert.equal(ms.cover_image_content_type, 'image/jpeg');
  assert.ok(w.media['9000'].uploaded);
  assert.equal(rowAt(w, 2).Status, 'Done');
});

test('invalid rows are rejected with specific reasons, nothing published, one grouped email', async () => {
  const w = await makeWorld();
  w.sent.length = 0;
  addRows(w, [
    readyRow(1, { Title: '' }),
    readyRow(2, { Media: 'nope.jpg' }),
    readyRow(3, { Media: 'anim.gif' }),
    readyRow(4, { Link: 'www.example.com' }),
    readyRow(5, { Board: 'Main bord' }),
  ]);
  files(w, ['p1.jpg', 'p4.jpg', 'p5.jpg']);
  files(w, ['anim.gif'], { mimeType: 'image/gif' });
  await runEngine(w);
  assert.equal(w.pins.length, 0);
  assert.match(rowAt(w, 2).Error, /Title is empty/);
  assert.match(rowAt(w, 3).Error, /"nope\.jpg" is not in this account's media folder/);
  assert.match(rowAt(w, 4).Error, /must be a JPG or PNG \(it is image\/gif\)/);
  assert.match(rowAt(w, 5).Error, /Link must be a full web address/);
  assert.match(rowAt(w, 6).Error, /Board "Main bord" is not on @hdrahm and not planned in the Boards tab/);
  assert.equal(w.boards.length, 2, 'typo board was NOT created');
  for (let i = 2; i <= 6; i++) assert.equal(rowAt(w, i).Status, 'Error');
  const grouped = w.sent.filter((m) => m.subject.includes('rejected'));
  assert.equal(grouped.length, 1);
  assert.match(grouped[0].subject, /5 pins were rejected/);
});

test('more rejections: private board, missing section, AI value, wrong account, carousel count, card links, date', async () => {
  const w = await makeWorld();
  addRows(w, [
    readyRow(1, { Board: 'Private stuff' }),
    readyRow(2, { 'Board section': 'Desserts' }),
    readyRow(3, { 'AI disclosure': 'maybe' }),
    readyRow(4, { Account: 'someone else' }),
    readyRow(5, { 'Media type': 'Carousel', Media: 'p5.jpg' }),
  ]);
  files(w, ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg']);
  await runEngine(w);
  assert.match(rowAt(w, 2).Error, /is secret — only public boards/);
  assert.match(rowAt(w, 3).Error, /Board section "Desserts" does not exist/);
  assert.match(rowAt(w, 4).Error, /AI disclosure "maybe"/);
  assert.match(rowAt(w, 5).Error, /for account "someone else"/);
  assert.match(rowAt(w, 6).Error, /A carousel needs 2–5 images \(found 1\)/);

  addRows(w, [
    { ...readyRow(6), 'Media type': 'Carousel', Media: 'p6.jpg, p7.jpg', 'Card links': 'https://a.com' },
    readyRow(8, { 'Publish after': 'next week' }),
  ]);
  files(w, ['p6.jpg', 'p7.jpg', 'p8.jpg']);
  await runEngine(w);
  assert.match(rowAt(w, 7).Error, /Card links has 1 entries but there are 2 images/);
  assert.match(rowAt(w, 8).Error, /"Publish after" is not a readable date/);
  assert.equal(w.pins.length, 0);
});

test('duplicates: same title as a published pin, and a duplicate Pin ID, are rejected', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2, { Title: 'Pin number 1', Media: 'p2.jpg' })]);
  files(w, ['p1.jpg', 'p2.jpg']);
  await runEngine(w);
  await runEngine(w);
  assert.equal(w.pins.length, 1);
  assert.match(rowAt(w, 3).Error, /Duplicate of HDRAHM-0001 \(same title\)/);

  addRows(w, [readyRow(3, { 'Pin ID': 'HDRAHM-0001' })]);
  files(w, ['p3.jpg']);
  await runEngine(w);
  assert.match(rowAt(w, 4).Error, /Duplicate Pin ID "HDRAHM-0001"/);
  assert.equal(w.pins.length, 1);
  const before = w.sent.filter((m) => m.subject.includes('rejected')).length;
  await runEngine(w);
  assert.equal(w.sent.filter((m) => m.subject.includes('rejected')).length, before, 'an already-reported duplicate is not reported again');
});

test('a file that claims to be a JPG but is not is rejected before publishing', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg'], { content: Buffer.from('this is text, not a picture') });
  await runEngine(w);
  assert.equal(w.pins.length, 0);
  assert.equal(rowAt(w, 2).Status, 'Error');
  assert.match(rowAt(w, 2).Error, /not a real JPG or PNG/);
});

test('"Publish after" in the future waits; earlier rows keep going', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1, { 'Publish after': '2099-01-01 09:00' }), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  await runEngine(w);
  assert.equal(rowAt(w, 2).Status, 'Ready');
  assert.equal(rowAt(w, 3).Status, 'Done');
});

test('Pinterest refusing a pin: Error with Pinterest\'s message, next pin still published', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  w.createPinPlan.push({ status: 400, message: 'Sorry, this link is blocked' });
  await runEngine(w);
  assert.match(rowAt(w, 2).Error, /Pinterest refused this pin: Sorry, this link is blocked/);
  assert.equal(rowAt(w, 3).Status, 'Done');
  assert.equal(w.pins.length, 1);
});

test('expired login: rows untouched, one alert per day, then "back to normal"', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  w.revokedPinterestTokens.add('p-token-1');
  await runEngine(w);
  await runEngine(w);
  assert.equal(rowAt(w, 2).Status, 'Ready');
  assert.equal(account(w).Health, 'Reconnect Pinterest');
  assert.equal(w.sent.filter((m) => m.subject.includes('needs reconnecting')).length, 1);
  w.revokedPinterestTokens.delete('p-token-1');
  await runEngine(w);
  assert.equal(rowAt(w, 2).Status, 'Done');
  assert.equal(account(w).Health, 'OK');
  assert.equal(w.sent.filter((m) => m.subject.includes('back to normal')).length, 1);
});

test('disconnected account (connection could not be loaded) is reported, nothing touched', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  const res = await runEngine(w, {}, { conn: 'missing-connection' });
  assert.equal(res.outcome, 'needs reconnect');
  assert.equal(rowAt(w, 2).Status, 'Ready');
  assert.ok(w.sent.some((m) => m.subject.includes('needs reconnecting')));
});

test('wrong Pinterest account connected: nothing published', async () => {
  const w = await makeWorld();
  setAccount(w, 'Pinterest username', '@someoneelse');
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  await runEngine(w);
  assert.equal(w.pins.length, 0);
  assert.equal(account(w).Health, 'Wrong Pinterest account');
  assert.ok(w.sent.some((m) => m.subject.includes('wrong Pinterest account')));
});

test('unclear answer after publishing: confirmed on the board → Done, never posted twice', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  w.createPinPlan.push({ status: 500, message: 'Internal error', createAnyway: true });
  await runEngine(w);
  assert.equal(w.pins.length, 1);
  assert.equal(rowAt(w, 2).Status, 'Done');
  assert.match(rowAt(w, 2).Error, /Confirmed on Pinterest after an unclear response/);
  await runEngine(w);
  assert.equal(w.pins.length, 2, 'next run publishes the NEXT pin, not the same one again');
});

test('unclear answer and pin not found → Needs review + alert, never re-published', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  w.createPinPlan.push({ status: 502, message: 'Bad gateway' });
  await runEngine(w);
  assert.equal(rowAt(w, 2).Status, 'Needs review');
  assert.ok(w.sent.some((m) => m.subject.includes('needs review')));
  await runEngine(w);
  assert.equal(w.pins.length, 0, 'not re-published');
});

test('test faults: lost response after publish → Done; timeout before publish → Needs review', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  await runEngine(w, { testFault: 'timeout-after-publish' });
  assert.equal(rowAt(w, 2).Status, 'Done');
  await runEngine(w, { testFault: 'timeout-before-publish' });
  assert.equal(rowAt(w, 3).Status, 'Needs review');
  assert.equal(w.pins.length, 1);
});

test('interrupted run: busy while fresh, then confirmed (if published) or Needs review (if not)', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  await runEngine(w, { testFault: 'crash-after-publish' });
  assert.equal(rowAt(w, 2).Status, 'Posting');
  assert.equal(w.pins.length, 1);
  const busy = await runEngine(w);
  assert.match(busy.outcome, /another run is publishing/);
  await runEngine(w, { lockStaleMinutes: 0 });
  assert.equal(rowAt(w, 2).Status, 'Done');
  assert.match(rowAt(w, 2).Error, /Confirmed on Pinterest after an interrupted run/);
  assert.equal(w.pins.length, 2, 'row 2 confirmed (not re-posted), row 3 published in the same run');

  addRows(w, [readyRow(3)]);
  files(w, ['p3.jpg']);
  await runEngine(w, { testFault: 'crash-after-lock', dailyCapOverride: 10 });
  assert.equal(rowAt(w, 4).Status, 'Posting');
  await runEngine(w, { lockStaleMinutes: 0, dailyCapOverride: 10 });
  assert.equal(rowAt(w, 4).Status, 'Needs review');
  assert.equal(w.pins.length, 2);
});

test('rows moved while publishing are still updated correctly (by Pin ID)', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1), readyRow(2)]);
  files(w, ['p1.jpg', 'p2.jpg']);
  w.onCreatePin = () => { w.rows(tabOf('hdrahm')).splice(1, 0, ['HDRAHM-9999', 'Draft', '', 'Image', 'new.jpg', 'Inserted above']); };
  await runEngine(w);
  assert.equal(rowById(w, 'HDRAHM-0001').Status, 'Done');
  assert.equal(rowById(w, 'HDRAHM-9999').Status, 'Draft', 'the inserted row was not touched');
  assert.equal(rowById(w, 'HDRAHM-0002').Status, 'Ready');
});

test('verification: if Pinterest drops the link, the pin is flagged Needs review', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  w.stripLinks = true;
  await runEngine(w);
  const r = rowAt(w, 2);
  assert.equal(r.Status, 'Needs review');
  assert.match(r.Error, /Pinterest removed the destination link/);
  assert.ok(r['Pin URL'], 'pin URL still recorded');
});

test('daily cap and on/off switch', async () => {
  const w = await makeWorld();
  setAccount(w, 'Daily cap', 2);
  addRows(w, [readyRow(1), readyRow(2), readyRow(3)]);
  files(w, ['p1.jpg', 'p2.jpg', 'p3.jpg']);
  await runEngine(w);
  await runEngine(w);
  const third = await runEngine(w);
  assert.match(third.outcome, /daily cap reached \(2\/2\)/);
  assert.equal(w.pins.length, 2);

  setAccount(w, 'On', 'No');
  setAccount(w, 'Daily cap', 5);
  const off = await runEngine(w);
  assert.equal(off.outcome, 'account is switched off');
  assert.equal(account(w).Health, 'Off');
  assert.equal(w.pins.length, 2);
  setAccount(w, 'On', 'Yes');
  setAccount(w, 'Daily cap', 2);
  await runEngine(w);
  assert.equal(account(w).Health, 'OK', 'switching back on clears "Off" even when the cap stops the run');
});

test('queue empty / low warnings once per day; too many failed attempts stops retrying', async () => {
  const w = await makeWorld();
  setAccount(w, 'Daily cap', 5);
  await runEngine(w);
  await runEngine(w);
  assert.equal(w.sent.filter((m) => m.subject.includes('no pins left')).length, 1);

  addRows(w, [readyRow(1, { Attempts: 3 })]);
  files(w, ['p1.jpg']);
  await runEngine(w);
  assert.match(rowAt(w, 2).Error, /attempted 3 times/);
});

test('an alert that reaches nobody fails the run (so Activepieces alerts you)', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1, { Title: '' })]);
  files(w, ['p1.jpg']);
  w.gmailDown = true;
  await assert.rejects(runEngine(w), /Could not deliver these alerts by email or Telegram/);
});

function setSetting(w, label, value) {
  w.rows('Settings').find((r) => r[0] === label)[1] = value;
}

test('Telegram: chat found after Start, pins arrive with the picture, email can be switched off', async () => {
  const w = await makeWorld();
  setSetting(w, 'Notify by Telegram', 'Yes');
  setSetting(w, 'Notify by email', 'No');
  w.telegramUpdates = [{ update_id: 1, message: { chat: { id: 555, type: 'private' }, text: '/start' } }];
  const prepare = await load('prepare');
  const out = await prepare.code(clone({ google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail }, telegram: { secret_text: 'tg-token' }, config: config(w.accountsCfg) }));
  const settings = Object.fromEntries(w.rows('Settings').slice(1).map((r) => [r[0], r[1]]));
  assert.equal(settings['Telegram chat ID'], '555');
  assert.ok(w.telegramSent.some((m) => /Telegram connected|set up|settings updated/.test(m.text)), 'welcome message in Telegram');
  assert.equal(out.notes.filter((n) => /Telegram/.test(n)).length, 0);
  // The panel file just applied says email on: switch it off again in the sheet, as a person would.
  setSetting(w, 'Notify by email', 'No');

  w.sent.length = 0;
  w.telegramSent.length = 0;
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  const res = await runEngine(w, { telegram: { secret_text: 'tg-token' } });
  assert.equal(res.outcome, 'published');
  assert.equal(w.sent.length, 0, 'no email when email is off');
  const live = w.telegramSent.find((m) => /New pin published/.test(m.text));
  assert.equal(live.method, 'sendPhoto');
  assert.equal(live.chat, '555');
  assert.match(live.photo, /i\.pinimg\.com/);
  assert.ok(live.html);
  assert.match(live.text, /pins left/);
  assert.doesNotMatch(live.text, /__PINS_LEFT__|<a |<td|<table/);
  assert.match(live.buttons[0].url, /^https:\/\/www\.pinterest\.com\/pin\//);
  assert.ok(live.buttons.some((b) => /spreadsheet/.test(b.text)));

  // Telegram refuses the picture and the formatting: the message still arrives as plain text with the links.
  w.telegramSent.length = 0;
  w.telegramRefuseHtml = true;
  w.telegramRefusePhoto = true;
  addRows(w, [readyRow(2)]);
  files(w, ['p2.jpg']);
  await runEngine(w, { telegram: { secret_text: 'tg-token' } });
  const plain = w.telegramSent.find((m) => /New pin published/.test(m.text));
  assert.ok(plain && !plain.html && plain.method === 'sendMessage', 'plain-text fallback');
  assert.match(plain.text, /https:\/\/www\.pinterest\.com\/pin\//);
});

test('Telegram not delivered: a "Notification failed" row explains it in the Log tab; waiting chat shown in Settings', async () => {
  const w = await makeWorld();
  setSetting(w, 'Notify by Telegram', 'Yes');
  const prepare = await load('prepare');
  await prepare.code(clone({ google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail }, telegram: { secret_text: 'tg-token' }, config: config(w.accountsCfg) }));
  const chatRow = w.rows('Settings').find((r) => r[0] === 'Telegram chat ID');
  assert.match(chatRow[2], /press Start/);
  assert.match(chatRow[2], /Not connected yet/);
  const failedRows = w.rows('Log').filter((r) => r[3] === 'Notification failed');
  assert.ok(failedRows.some((r) => /telegram: no Telegram chat yet/.test(r[7])), 'setup message failure logged');

  // After Start, the next run connects it and restores the help text.
  w.telegramUpdates = [{ update_id: 1, message: { chat: { id: 777, type: 'private' }, text: '/start' } }];
  await prepare.code(clone({ google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail }, telegram: { secret_text: 'tg-token' }, config: config(w.accountsCfg) }));
  const after = w.rows('Settings').find((r) => r[0] === 'Telegram chat ID');
  assert.equal(after[1], '777');
  assert.doesNotMatch(after[2], /Not connected yet/);
  assert.ok(w.telegramSent.some((m) => /Telegram is connected/.test(m.text)));

  // Telegram broken during a pin: email still arrives and the Log says why Telegram did not.
  w.telegramDown = true;
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  await runEngine(w, { telegram: { secret_text: 'tg-token' } });
  const pinFail = w.rows('Log').filter((r) => r[3] === 'Notification failed' && /is live/.test(r[7]));
  assert.equal(pinFail.length, 1);
  assert.match(pinFail[0][7], /telegram: .*chat not found/);
});

test('Morocco time zone: GMT+0 since 20 September 2026 even on servers with older time-zone data', async () => {
  const lib = await import('../dist/lib.mjs');
  const oct = new Date('2026-10-16T09:31:00Z');
  assert.equal(lib.localStamp(oct, 'Africa/Casablanca'), '2026-10-16 09:31');
  assert.equal(lib.localStamp(new Date('2026-08-01T09:00:00Z'), 'Africa/Casablanca'), '2026-08-01 10:00', 'summer 2026 was still GMT+1');
  assert.equal(lib.localStamp(oct, 'Europe/Paris'), '2026-10-16 11:31', 'other zones unchanged');
  const gen = await import('../panel/generator.js');
  assert.equal(gen.scheduleZone('Africa/Casablanca', oct), 'UTC');
  assert.equal(gen.scheduleZone('America/New_York', oct), 'America/New_York');
});

test('Telegram down while email works: alerts still delivered, run does not fail; both down: run fails', async () => {
  const w = await makeWorld();
  setSetting(w, 'Notify by Telegram', 'Yes');
  setSetting(w, 'Telegram chat ID', '555');
  addRows(w, [readyRow(1, { Title: '' })]);
  files(w, ['p1.jpg']);
  w.telegramDown = true;
  const res = await runEngine(w, { telegram: { secret_text: 'tg-token' } });
  assert.ok(w.sent.some((m) => m.subject.includes('rejected')), 'email still sent');
  assert.ok(res.notes.some((n) => /telegram: .*chat not found/.test(n)));
  addRows(w, [readyRow(2, { Title: '' })]);
  w.gmailDown = true;
  await assert.rejects(runEngine(w, { telegram: { secret_text: 'tg-token' } }), /Could not deliver/);
});


test('two accounts stay isolated', async () => {
  const w = await makeWorld();
  w.connections['pin-conn-2'] = 'p-token-2';
  w.pinterestUsers['p-token-2'] = 'decorbyh';
  w.boards.push({ id: 'b-home', name: 'Home', privacy: 'PUBLIC', owner: 'p-token-2' });
  await addAccount(w, { name: 'Decor', conn: 'pin-conn-2', defaultBoard: 'Home' });
  addRows(w, [readyRow(1)]);
  addRows(w, [readyRow(7, { Board: '' })], 'Decor');
  files(w, ['p1.jpg']);
  files(w, ['p7.jpg'], {}, 'Decor');
  w.revokedPinterestTokens.add('p-token-1');
  await runEngine(w);
  await runEngine(w, {}, { name: 'Decor', conn: 'pin-conn-2' });
  assert.equal(rowAt(w, 2).Status, 'Ready');
  assert.equal(rowAt(w, 2, 'Decor').Status, 'Done');
  assert.equal(rowAt(w, 2, 'Decor')['Pin ID'], 'DECOR-0001');
  assert.equal(w.pins[0].board_id, 'b-home');
});

test('daily report: picture grid, problems, best pins, and a warning when an account did not run', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(2, { Media: 'nope.jpg' }), readyRow(1)]);
  files(w, ['p1.jpg']);
  await runEngine(w);
  w.stats = { [w.pins[0].id]: { IMPRESSION: 120, SAVE: 9, PIN_CLICK: 4, OUTBOUND_CLICK: 2 } };
  setAccount(w, 'Alerts', '{}');
  await runEngine(w, { publish: false });
  setAccount(w, 'Last run', '2000-01-01 09:00');
  const report = await load('report');
  const skipped = await report.code({ google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail }, due: false });
  assert.deepEqual(skipped, { skipped: true });
  const out = await report.code({ google: { access_token: w.tokens.google }, gmail: { access_token: w.tokens.gmail }, due: true });
  assert.equal(out.totalPosted, 1);
  assert.equal(out.totalProblems, 1);
  const mail = w.sent.find((m) => m.subject.startsWith('📋'));
  assert.match(mail.html, /i\.pinimg\.com\/236x\//);
  assert.match(mail.html, /published today: <b>1\/5<\/b>/);
  assert.match(mail.html, /Best pins so far/);
  assert.match(mail.html, /— 9 · 2 · 120/);
  const settings = Object.fromEntries(w.rows('Settings').slice(1).map((r) => [r[0], r[1]]));
  assert.equal(settings['Last report'], lib.localDate(new Date(), TZ));
  const hour = Number(lib.localStamp(new Date(), TZ).slice(11, 13));
  if (hour >= 9) {
    assert.equal(out.stopped, 1);
    assert.match(mail.html, /Did not run at/);
  }
});

test('planned boards: created (with section) right before the pin that needs them; typos still rejected', async () => {
  const w = await makeWorld();
  const boards = w.rows('Boards');
  boards[1] = ['hdrahm', 'Crochet Flower Bouquets', '', 'Forever flower bouquet ideas', 'Planned', '', '', ''];
  boards[2] = ['hdrahm', 'Crochet Flower Bouquets', 'Roses', '', 'Planned', '', '', ''];
  boards[3] = ['other', 'Someone Elses Board', '', '', 'Planned', '', '', ''];
  addRows(w, [
    readyRow(1, { Board: 'Someone Elses Board' }),
    readyRow(2, { Board: 'crochet flower bouquets', 'Board section': 'Tulips' }),
    readyRow(3, { Board: 'Crochet Flower Bouquets', 'Board section': 'roses' }),
  ]);
  files(w, ['p1.jpg', 'p2.jpg', 'p3.jpg']);
  const res = await runEngine(w);
  assert.equal(res.outcome, 'published');
  assert.match(rowAt(w, 2).Error, /not planned in the Boards tab/, 'another account\'s plan does not count');
  assert.match(rowAt(w, 3).Error, /section "Tulips" is not planned/);
  const created = w.boards.find((b) => b.name === 'Crochet Flower Bouquets');
  assert.ok(created, 'board created');
  assert.equal(created.privacy, 'PUBLIC');
  assert.equal(created.description, 'Forever flower bouquet ideas');
  assert.equal(w.sections[created.id].length, 1);
  assert.equal(w.sections[created.id][0].name, 'Roses');
  assert.equal(w.pins[0].payload.board_id, created.id);
  assert.equal(w.pins[0].payload.board_section_id, w.sections[created.id][0].id);
  const b = w.rows('Boards');
  assert.equal(b[1][4], 'On Pinterest');
  assert.equal(b[1][5], created.id);
  assert.equal(b[2][4], 'On Pinterest');
  assert.equal(b[2][6], w.sections[created.id][0].id);
  assert.equal(w.boards.filter((x) => x.name === 'Someone Elses Board').length, 0);

  // Running again never creates it twice.
  addRows(w, [readyRow(4, { Board: 'Crochet Flower Bouquets', 'Board section': 'Roses' })]);
  files(w, ['p4.jpg']);
  await runEngine(w);
  assert.equal(w.boards.filter((x) => x.name === 'Crochet Flower Bouquets').length, 1);
  assert.equal(w.sections[created.id].length, 1);
});

test('planned board refused by Pinterest: row rejected with the reason, plan marked Error', async () => {
  const w = await makeWorld();
  w.boards.push({ id: 'b-flowers', name: 'Flowers', privacy: 'PUBLIC', owner: 'p-token-1' });
  w.refuseSections = true;
  w.rows('Boards')[1] = ['hdrahm', 'Flowers', 'Bad / name', '', 'Planned', '', '', ''];
  addRows(w, [readyRow(1, { Board: 'Flowers', 'Board section': 'Bad / name' })]);
  files(w, ['p1.jpg']);
  await runEngine(w);
  assert.equal(w.pins.length, 0);
  assert.match(rowAt(w, 2).Error, /Pinterest refused to create the planned section "Bad \/ name"/);
  assert.equal(w.rows('Boards')[1][4], 'Error');
});

test('daily sync: boards and sections mirrored into the Boards tab, statistics into the Pins tab, once a day', async () => {
  const w = await makeWorld();
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  await runEngine(w);
  const pinId = w.pins[0].id;
  const boardRows = w.rows('Boards').slice(1).filter((r) => r && r[0] === 'hdrahm');
  assert.deepEqual(boardRows.map((r) => [r[1], r[2], r[4]]), [['Main board', '', 'On Pinterest'], ['Main board', 'Salads', 'On Pinterest']], 'secret board not listed');
  assert.ok(JSON.parse(account(w).Alerts).synced, 'marked as synced today');

  // Same day: no second sync (statistics are not re-read).
  w.stats = { [pinId]: { IMPRESSION: 50, SAVE: 3, PIN_CLICK: 2, OUTBOUND_CLICK: 1 } };
  await runEngine(w, { publish: false });
  assert.equal(rowAt(w, 2).Saves, 0);
  // Next day (simulated by clearing the marker): statistics land in the row, boards are not duplicated.
  setAccount(w, 'Alerts', '{}');
  await runEngine(w, { publish: false });
  const r = rowAt(w, 2);
  assert.equal(r.Impressions, 50);
  assert.equal(r.Saves, 3);
  assert.equal(r['Outbound clicks'], 1);
  assert.equal(r['Stats updated'], lib.localDate(new Date(), TZ));
  assert.equal(w.rows('Boards').slice(1).filter((x) => x && x[0] === 'hdrahm').length, 2);

  // Statistics unavailable (personal account): logged, nothing else breaks.
  w.statsDisabled = true;
  setAccount(w, 'Alerts', '{}');
  const res = await runEngine(w, { publish: false });
  assert.equal(res.outcome, 'daily sync only (not a posting hour)');
  assert.ok(logRows(w).some((l) => l.Result === 'Stats unavailable'));
  assert.equal(account(w).Health, 'Queue empty');
});

test('older spreadsheet: missing columns are added at the end, nothing else moves', async () => {
  const w = await makeWorld();
  const pins = w.rows('Pins – hdrahm');
  pins[0] = pins[0].filter((h) => !['Target keyword', 'Idea', 'Picture style', 'Impressions', 'Saves', 'Pin clicks', 'Outbound clicks', 'Stats updated'].includes(h));
  const acc = w.rows('Accounts');
  const drop = ['Connection ID', 'Niche', 'Link'];
  const keep = acc[0].map((h, i) => (drop.includes(h) ? -1 : i)).filter((i) => i >= 0);
  for (let r = 0; r < acc.length; r++) if (acc[r]) acc[r] = keep.map((i) => acc[r][i]);
  w.rows('Settings').splice(4);
  await runPrepare(w, config(w.accountsCfg));
  assert.deepEqual(w.rows('Pins – hdrahm')[0].slice(-8), ['Target keyword', 'Idea', 'Picture style', 'Impressions', 'Saves', 'Pin clicks', 'Outbound clicks', 'Stats updated']);
  assert.deepEqual(w.rows('Accounts')[0].slice(-3), ['Connection ID', 'Niche', 'Link']);
  assert.equal(account(w)['Connection ID'], 'pin-conn-1');
  assert.ok(w.rows('Settings').some((r) => r[0] === 'Daily report time'));
});

test('control panel: validation codes, schedules, import file with no blanks left, one Codex prompt per account', async () => {
  const gen = await import('../panel/generator.js');
  const fs = await import('node:fs');
  const template = fs.readFileSync(new URL('../dist/poster.template.json', import.meta.url), 'utf8');
  const promptTemplate = fs.readFileSync(new URL('../panel/codex-prompt.md', import.meta.url), 'utf8');
  assert.deepEqual(gen.spreadHours(5), [9, 12, 15, 18, 21]);
  assert.deepEqual(gen.spreadHours(1), [12]);
  assert.equal(gen.spreadHours(13).length, 13);
  assert.equal(gen.spreadHours(18).length, 18);
  assert.ok(gen.spreadHours(18).every((h) => h >= 6 && h <= 23));

  const state = gen.defaultState();
  let errors = gen.validate(state);
  assert.equal(errors.emailTo.code, 'email');
  assert.equal(errors.google.code, 'id');
  assert.equal(errors.accounts.code, 'accounts');
  Object.assign(state, { emailTo: 'me@gmail.com', botEmail: 'bot@gmail.com', google: 'k1F7bRMNAnjaUE0m3XtvU', gmail: 'UcAbB0KwMnvD5Edounul2' });
  const a = { ...gen.emptyAccount(), name: 'crochet', connection: 'tPb1OsyL7MkrNltrunSvT', general: true };
  const b = { ...gen.emptyAccount(), name: 'florals', connection: 'tPb1OsyL7MkrNltrunSvT', niche: 'crochet flower bouquets', username: '@florals_us', pinsPerDay: 3, hours: [10] };
  state.accounts = [a, b];
  errors = gen.validate(state);
  assert.equal(errors[`account:${b.id}:connection`].code, 'idDup');
  assert.deepEqual(errors[`account:${b.id}:hours`], { code: 'hours', n: 3 });
  Object.assign(b, { connection: 'VEZMpxqyfEJaSqJ9rzYZC', hours: [10, 14, 19] });
  assert.deepEqual(gen.validate(state), {});

  // Same schedule for every account overrides each account's own times.
  state.sameSchedule = true;
  state.sharedPinsPerDay = 2;
  state.sharedHours = [8];
  assert.deepEqual(gen.validate(state).sharedHours, { code: 'hours', n: 2 });
  state.sharedHours = [8, 20];
  assert.deepEqual(gen.validate(state), {});
  let cfg = gen.buildConfig(state, 'v');
  assert.deepEqual(cfg.accounts.map((x) => [x.hours, x.dailyCap]), [[[8, 20], 2], [[8, 20], 2]]);
  state.sameSchedule = false;

  const file = JSON.parse(gen.buildImportFile(template, state, 'v-1'));
  const text = JSON.stringify(file);
  assert.ok(!/"__(GOOGLE_CONNECTION|GMAIL_CONNECTION|TIME_ZONE|CONFIG)__"/.test(text), 'no placeholders left');
  assert.ok(text.includes('k1F7bRMNAnjaUE0m3XtvU') && text.includes('UcAbB0KwMnvD5Edounul2'));
  assert.equal(file.flows[0].trigger.settings.input.timezone, 'UTC', 'Morocco runs on GMT+0 (see scheduleZone)');
  assert.equal(cfg.settings.timeZone, 'Africa/Casablanca', 'the sheet keeps the familiar name');
  cfg = JSON.parse(file.flows[0].trigger.nextAction.nextAction.nextAction.settings.input.config);
  assert.equal(cfg.version, 'v-1');
  assert.deepEqual(cfg.accounts.map((x) => [x.name, x.connection, x.dailyCap, x.link]), [['crochet', 'tPb1OsyL7MkrNltrunSvT', 5, ''], ['florals', 'VEZMpxqyfEJaSqJ9rzYZC', 3, '']]);
  assert.match(cfg.accounts[0].niche, /^General/);

  // Telegram only: no Gmail login step, Telegram login step kept with its ID.
  const tgState = { ...state, notifyEmail: false, notifyTelegram: true, gmail: '', telegram: 'TgBotConnectionId1234' };
  assert.deepEqual(gen.validate(tgState), {});
  assert.equal(gen.validate({ ...tgState, notifyTelegram: false }).channels.code, 'channel');
  const tgFile = JSON.parse(gen.buildImportFile(template, tgState, 'v-2'));
  const names = [];
  for (let st = tgFile.flows[0].trigger; st; st = st.nextAction) names.push(st.name);
  assert.deepEqual(names, ['trigger', 'step_1', 'step_tg', 'step_3', 'step_4', 'step_7']);
  assert.equal(tgFile.flows[0].trigger.nextAction.nextAction.settings.input.connection_name, 'TgBotConnectionId1234');
  assert.equal(tgFile.flows[0].trigger.nextAction.nextAction.nextAction.settings.input.gmail, '', 'removed Gmail step is not referenced');
  const tgCfg = JSON.parse(tgFile.flows[0].trigger.nextAction.nextAction.nextAction.settings.input.config);
  assert.deepEqual([tgCfg.settings.notifyEmail, tgCfg.settings.notifyTelegram], [false, true]);

  // Batch prompts: links per batch line, one focus per batch, FREE PATTERN on link pins only.
  const now = new Date(2026, 9, 17, 14, 5);
  const batch = { accountId: b.id, lines: [{ ...gen.newLine('link', 5), url: 'https://minianimals.com/free-cat' }, { ...gen.newLine('link', 4), url: 'https://minianimals.com/free-dog' }, gen.newLine('free', 6)] };
  const p1 = gen.buildCodexPrompt(promptTemplate, state, a, undefined, now);
  const p2 = gen.buildCodexPrompt(promptTemplate, state, b, batch, now);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(p1) && !/\{\{[A-Z_]+\}\}/.test(p2), 'every blank filled');
  assert.match(p1, /GENERAL account/);
  assert.match(p1, /design the look yourself in STEP 2/);
  assert.match(p1, /never ask me for approval/);
  assert.match(p1, /1\. 15 pins → No link/);
  assert.match(p1, /"Pins – crochet"/);
  assert.match(p1, /bot@gmail\.com/);
  assert.match(p2, /Stay strictly inside this niche/);
  assert.match(p2, /1\. 5 pins → link: https:\/\/minianimals\.com\/free-cat/);
  assert.match(p2, /2\. 4 pins → link: https:\/\/minianimals\.com\/free-dog/);
  assert.match(p2, /3\. 6 pins → No link/);
  assert.match(p2, /This batch = 15 pins ≈ 5 days/);
  assert.match(p2, /3 pins a day at 10:00, 14:00, 19:00/);
  assert.match(p2, /BATCH B20261017-1405/);
  assert.match(p2, /https:\/\/www\.pinterest\.com\/florals_us\//);
  assert.match(p2, /CALL TO ACTION \(every pin of a link line; the patterns are free/);
  assert.match(p2, /"FREE PATTERN", "FREE PDF PATTERN"/);
  assert.match(p2, /Category: Crochet & knitting/);

  // Food account: food rules everywhere, not one crochet word.
  const food = { ...b, name: 'tajine', category: 'food', niche: 'Moroccan food recipes' };
  const pf = gen.buildCodexPrompt(promptTemplate, state, food, { accountId: b.id, lines: [{ ...gen.newLine('link', 5), url: 'https://moroccankitchen.com/chicken-tagine' }] }, now);
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(pf), 'every blank filled');
  assert.doesNotMatch(pf, /crochet|yarn|stitch|pattern page/i);
  assert.match(pf, /Category: Food & recipes/);
  assert.match(pf, /"GET THE RECIPE"/);
  assert.match(pf, /patterned ceramic plates and bowls, tagine pots, zellige/);
  assert.match(pf, /never couscous or a different dish/);
  assert.match(pf, /1\. 5 pins → link: https:\/\/moroccankitchen\.com\/chicken-tagine \(recipe page/);
  assert.match(pf, /Tap for the full recipe\./);
  assert.match(pf, /EVERY pin uses this one design, the owner's signature recipe infographic/);
  assert.match(pf, /RECIPE INFOGRAPHIC — exactly this design, 1000 × 1500/);
  assert.match(pf, /6 numbered step tiles in two columns, read in zig-zag order/);
  assert.match(pf, /GET THE FULL RECIPE/);
  assert.doesNotMatch(pf, /Use at least 5 different formats/);
  assert.match(p2, /Use at least 5 different formats/);
  assert.match(p2, /L1 top text band/);
  // Every category fills every blank.
  for (const k of Object.keys(gen.CATEGORIES)) {
    const t = gen.buildCodexPrompt(promptTemplate, state, { ...b, category: k }, undefined, now);
    assert.ok(!/\{\{[A-Z_]+\}\}/.test(t), `category ${k} leaves no blanks`);
  }
  assert.equal(gen.categoryOf({}).name, 'Crochet & knitting', 'older saved accounts stay crochet');
  assert.match(p2, /ONE micro-niche/);
  assert.match(p2, /"florals-NNNN\.jpg"/);
});

test('New pins batch: validation of account, page links, counts and total', async () => {
  const gen = await import('../panel/generator.js');
  const state = gen.defaultState();
  const acc = { ...gen.emptyAccount(), name: 'mini' };
  state.accounts = [acc];
  let e = gen.validateBatch(state);
  assert.equal(e['batch:account'].code, 'pickAccount');
  state.batch.accountId = acc.id;
  const [first] = state.batch.lines;
  assert.equal(gen.validateBatch(state)[`batch:line:${first.id}:url`].code, 'pageUrl');
  first.url = 'https://minianimals.com/free-cat';
  assert.deepEqual(gen.validateBatch(state), {});
  const dup = { ...gen.newLine('link', 5), url: 'https://minianimals.com/free-cat' };
  state.batch.lines.push(dup);
  assert.equal(gen.validateBatch(state)[`batch:line:${dup.id}:url`].code, 'urlDup');
  dup.url = 'https://minianimals.com/free-dog';
  state.batch.lines.push(gen.newLine('free', 30));
  assert.equal(gen.batchTotal(state.batch), 40);
  assert.deepEqual(gen.validateBatch(state), {});
  state.batch.lines.push(gen.newLine('free', 1));
  assert.equal(gen.validateBatch(state)['batch:total'].code, 'batchTotal');
  state.batch.lines = [];
  assert.equal(gen.validateBatch(state)['batch:lines'].code, 'lines');
});

test('automation without a Telegram login (shared spreadsheet says Telegram on): email only, no failure rows', async () => {
  const w = await makeWorld();
  setSetting(w, 'Notify by Telegram', 'Yes');
  setSetting(w, 'Telegram chat ID', '555');
  addRows(w, [readyRow(1)]);
  files(w, ['p1.jpg']);
  w.sent.length = 0;
  const res = await runEngine(w, { telegram: '' });
  assert.equal(res.outcome, 'published');
  assert.ok(w.sent.some((m) => /is live/.test(m.subject)), 'email still sent');
  assert.equal(w.rows('Log').filter((r) => r[3] === 'Notification failed').length, 0);
  assert.equal((w.telegramSent || []).length, 0);
});

test('products: a pin with a Product and no Link gets the product link; counts and status kept; paused skipped; unknown rejected', async () => {
  const w = await makeWorld();
  const products = w.rows('Products');
  const P = products[0];
  const prow = (o) => P.map((h) => (o[h] === undefined ? '' : o[h]));
  products.push(prow({ Account: 'hdrahm', Product: 'Free Mini Cat Pattern', Link: 'https://minianimals.com/free-cat', 'Pins wanted': 3 }));
  products.push(prow({ Account: 'hdrahm', Product: 'Free Mini Dog Pattern', Link: 'https://minianimals.com/free-dog', 'Pins wanted': 2, Status: 'Paused' }));
  products.push(prow({ Account: 'other', Product: 'Free Mini Cat Pattern', Link: 'https://elsewhere.com/cat', 'Pins wanted': 9 }));
  addRows(w, [
    readyRow(1, { Link: '', Product: 'Free Mini Dog Pattern' }),
    readyRow(2, { Link: '', Product: 'free mini cat pattern', Focus: 'cats', Batch: 'B1' }),
    readyRow(3, { Link: '', Product: 'Free Mini Cat Pattern' }),
  ]);
  files(w, ['p1.jpg', 'p2.jpg', 'p3.jpg']);
  const res = await runEngine(w);
  assert.equal(res.outcome, 'published');
  assert.equal(w.pins[0].link, 'https://minianimals.com/free-cat', 'paused dog product skipped; cat pin got its product link');
  assert.equal(w.pins[0].title, 'Pin number 2');
  const cat = headerObj(P, w.rows('Products')[1]);
  assert.deepEqual([String(cat['Pins made']), String(cat['Pins posted']), cat.Status], ['2', '1', 'Needs pins']);
  const dog = headerObj(P, w.rows('Products')[2]);
  assert.equal(dog.Status, 'Paused');
  assert.equal(headerObj(P, w.rows('Products')[3])['Pins made'], '', 'other accounts untouched');

  // A product that is not in the Products tab (and no Link) is rejected with a clear reason.
  addRows(w, [readyRow(4, { Link: '', Product: 'Free Mini Frog Pattern' })], 'hdrahm', 2);
  w.rows(tabOf('hdrahm'))[1][PIN.indexOf('Pin ID')] = '';
  files(w, ['p4.jpg']);
  w.now = undefined;
  setAccount(w, 'Last run', '');
  await runEngine(w, { dailyCapOverride: 10 });
  const frog = headerObj(w.rows(tabOf('hdrahm'))[0], w.rows(tabOf('hdrahm')).find((r) => r && r[PIN.indexOf('Media')] === 'p4.jpg'));
  assert.equal(frog.Status, 'Error');
  assert.match(frog.Error, /Free Mini Frog Pattern" is not in the Products tab/);
});

test('website mode: the account represents a website; Codex works product by product, counting existing pins', async () => {
  const gen = await import('../panel/generator.js');
  const fs = await import('node:fs');
  const tpl = fs.readFileSync(new URL('../panel/codex-prompt.md', import.meta.url), 'utf8');
  const state = { ...gen.defaultState(), botEmail: 'bot@example.com', google: 'k1F7bRMNAnjaUE0m3XtvU', gmail: 'UcAbB0KwMnvD5Edounul2', emailTo: 'me@example.com' };
  const cs = { ...gen.emptyAccount(), name: 'crochet', connection: 'tPb1OsyL7MkrNltrunSvT', username: '@crochet_simplified', source: 'website', website: '' };
  state.accounts = [cs];
  assert.equal(gen.validate(state)[`account:${cs.id}:website`].code, 'pageUrl');
  cs.website = 'https://crochetsimplified.com';
  assert.deepEqual(gen.validate(state), {}, 'no niche needed for a website account');
  state.batch = { accountId: cs.id, lines: [gen.newLine('next', 2)] };
  assert.deepEqual(gen.validateBatch(state), {});
  assert.equal(gen.batchTotal(state.batch, cs), 12, '2 rounds × 6 pins (default)');
  state.batch.lines[0].perRound = 8;
  assert.equal(gen.batchTotal(state.batch, cs), 16, 'per-batch override: 2 × 8');
  const t = gen.buildCodexPrompt(tpl, state, cs, state.batch, new Date(2026, 9, 19, 10, 0));
  assert.ok(!/\{\{[A-Z_]+\}\}/.test(t));
  assert.match(t, /WEBSITE MODE — THIS ACCOUNT REPRESENTS https:\/\/crochetsimplified\.com/);
  assert.match(t, /sitemap\.xml/);
  assert.match(t, /pins made by hand count/);
  assert.match(t, /round 2/);
  assert.match(t, /download a product's PDF only once/);
  assert.match(t, /CATEGORY rounds/);
  assert.match(t, /WINNER rounds/);
  assert.match(t, /Catalog, EVERY batch/);
  assert.match(t, /including pins that were not made by this automation/);
  assert.match(t, /1\. The next 2 rounds of the website plan \(product, category or winner rounds\), 8 pins each \(= 16 pins\)/);
  assert.match(t, /This batch = 16 pins/);
  // A niche account cannot use "next product" lines; website prompts default to one product.
  const niche = { ...gen.emptyAccount(), name: 'mini', connection: 'VEZMpxqyfEJaSqJ9rzYZC', niche: 'mini animals' };
  state.accounts.push(niche);
  state.batch = { accountId: niche.id, lines: [gen.newLine('next', 1)] };
  assert.equal(Object.values(gen.validateBatch(state))[0].code, 'nextNeedsWebsite');
  assert.match(gen.buildCodexPrompt(tpl, state, cs), /1\. The next 1 round of the website plan/);
  assert.doesNotMatch(gen.buildCodexPrompt(tpl, state, niche), /WEBSITE MODE/);
});
