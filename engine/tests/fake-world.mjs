// In-memory stand-ins for the Google Sheets, Google Drive, Pinterest and Gmail
// endpoints the automation uses. Installed as globalThis.fetch for the tests.

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

function colIndex(letters) {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

export function parseA1(range) {
  const bang = range.lastIndexOf('!');
  let tab = range.slice(0, bang);
  const ref = range.slice(bang + 1);
  if (tab.startsWith("'")) tab = tab.slice(1, -1).replace(/''/g, "'");
  const [a, b] = ref.split(':');
  const pa = a.match(/^([A-Z]*)(\d*)$/);
  if (!pa) throw new Error(`bad range ${range}`);
  const c1 = pa[1] ? colIndex(pa[1]) : 0;
  const r1 = pa[2] ? Number(pa[2]) : 1;
  if (b === undefined) return { tab, c1, r1, c2: c1, r2: r1 };
  const pb = b.match(/^([A-Z]*)(\d*)$/);
  // A whole-row range ("1:1") covers every column, like the real API.
  const c2 = pb[1] ? colIndex(pb[1]) : (pa[1] ? 25 : 1000);
  const r2 = pb[2] ? Number(pb[2]) : Infinity;
  return { tab, c1, r1, c2, r2 };
}

function decodeMimeWord(s) {
  return s.replace(/=\?UTF-8\?B\?([^?]+)\?=/g, (_, b) => Buffer.from(b, 'base64').toString('utf8'));
}

export class FakeWorld {
  constructor() {
    this.seq = 1;
    this.files = new Map();
    this.books = new Map();
    this.tokens = { google: 'g-token', gmail: 'm-token' };
    this.connections = { 'pin-conn-1': 'p-token-1' };
    this.pinterestUsers = { 'p-token-1': 'hdrahm' };
    this.revokedPinterestTokens = new Set();
    this.boards = [];
    this.pins = [];
    this.createPinPlan = []; // queue of { status, message, createAnyway }
    this.sections = {}; // boardId -> [{id, name}]
    this.media = {};
    this.onCreatePin = null; // hook(pin) e.g. to move rows while a run is publishing
    this.stripLinks = false;
    this.sent = [];
    this.requests = [];
    this.files.set('root', { id: 'root', name: 'My Drive', mimeType: 'application/vnd.google-apps.folder', parents: [], properties: {}, trashed: false });
  }

  id(prefix) { return `${prefix}${String(this.seq++).padStart(12, "0")}`; }

  install() {
    globalThis.__AP_RETRY_DELAYS__ = [1, 1];
    globalThis.fetch = (url, opts = {}) => this.handle(String(url), opts);
  }

  // ---------------------------------------------------------------- helpers
  addImage(folderId, name, { mimeType = 'image/jpeg', bytes, content, durationMillis } = {}) {
    const id = this.id('img');
    let buf = content;
    if (!buf) {
      if (mimeType === 'image/png') buf = fakePng(1000, 1500);
      else if (mimeType === 'image/jpeg') buf = fakeJpeg(1000, 1500);
      else if (mimeType.startsWith('video/')) buf = fakeMp4(durationMillis ? durationMillis / 1000 : 6);
      else buf = Buffer.from(`GIF89a-${name}`);
    }
    this.files.set(id, {
      id, name, mimeType, parents: [folderId], properties: {}, trashed: false, size: String(bytes || buf.length),
      content: buf.toString('base64'),
      ...(durationMillis ? { videoMediaMetadata: { durationMillis: String(durationMillis) } } : {}),
    });
    return id;
  }

  book() { return [...this.books.values()][0]; }

  tab(title) { return this.book().tabs.find((t) => t.title === title); }

  rows(title) { return this.tab(title).grid; }

  setRows(title, startRow, rows) {
    const grid = this.tab(title).grid;
    rows.forEach((r, i) => { grid[startRow - 1 + i] = r.slice(); });
  }

  emailsTo(addr) { return this.sent.filter((m) => m.to === addr); }

  // ---------------------------------------------------------------- routing
  async handle(url, opts) {
    const u = new URL(url);
    const method = (opts.method || 'GET').toUpperCase();
    const auth = (opts.headers && (opts.headers.Authorization || opts.headers.authorization)) || '';
    const token = auth.replace(/^Bearer /, '');
    const body = opts.body ? (typeof opts.body === 'string' ? opts.body : String(opts.body)) : '';
    this.requests.push({ method, url });
    if (u.hostname === 'api.pinterest.com') return this.pinterest(u, method, token, body);
    if (u.hostname === 'pinterest-media-upload.example.com') {
      const mediaId = u.searchParams.get('media');
      this.media[mediaId].uploaded = true;
      return new Response(null, { status: 204 });
    }
    if (u.hostname === 'gmail.googleapis.com') return this.gmail(u, method, token, body);
    if (u.hostname === 'api.telegram.org') return this.telegramApi(u, body);
    if (token !== this.tokens.google) return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    if (u.hostname === 'sheets.googleapis.com') return this.sheets(u, method, body);
    if (u.hostname === 'www.googleapis.com') return this.drive(u, method, body);
    return json(404, { error: { message: `no fake for ${url}` } });
  }

  // ---------------------------------------------------------------- Drive
  drive(u, method, body) {
    const path = u.pathname.replace(/^\/(upload\/)?drive\/v3/, '');
    if (path === '/files' && method === 'GET') {
      const q = u.searchParams.get('q') || '';
      let list = [...this.files.values()].filter((f) => !f.trashed);
      const marker = q.match(/key='autopilot' and value='([^']+)'/);
      if (marker) list = list.filter((f) => f.properties && f.properties.autopilot === marker[1]);
      const parent = q.match(/'([^']+)' in parents/);
      if (parent) list = list.filter((f) => f.parents.includes(parent[1]));
      const name = q.match(/name = '((?:[^'\\]|\\.)*)'/);
      if (name) list = list.filter((f) => f.name === name[1].replace(/\\'/g, "'"));
      const mime = q.match(/mimeType = '([^']+)'/);
      if (mime) list = list.filter((f) => f.mimeType === mime[1]);
      return json(200, { files: list.map((f) => ({ ...f, webViewLink: this.link(f) })) });
    }
    if (path === '/files' && method === 'POST') {
      const b = JSON.parse(body);
      const id = this.id('folder');
      const f = { id, name: b.name, mimeType: b.mimeType, parents: b.parents || ['root'], properties: b.properties || {}, trashed: false };
      this.files.set(id, f);
      return json(200, { id, name: f.name, webViewLink: this.link(f) });
    }
    const m = path.match(/^\/files\/([^/]+)(\/permissions)?$/);
    if (m) {
      const f = this.files.get(m[1]);
      if (!f || f.trashed) return json(404, { error: { code: 404, message: `File not found: ${m[1]}` } });
      if (m[2] && method === 'GET') return json(200, { permissions: (f.shared || []).map((e) => ({ emailAddress: e, role: 'writer' })) });
      if (m[2]) { f.shared = (f.shared || []).concat(JSON.parse(body).emailAddress); return json(200, { id: 'perm1' }); }
      if (method === 'GET' && u.searchParams.get('alt') === 'media') return new Response(Buffer.from(f.content || '', 'base64'), { status: 200 });
      if (method === 'GET') return json(200, { ...f, webViewLink: this.link(f) });
      if (method === 'PATCH') {
        const b = body ? JSON.parse(body) : {};
        if (b.properties) f.properties = { ...f.properties, ...b.properties };
        const add = u.searchParams.get('addParents');
        const remove = u.searchParams.get('removeParents');
        if (remove) f.parents = f.parents.filter((p) => !remove.split(',').includes(p));
        if (add) f.parents.push(...add.split(','));
        return json(200, { id: f.id, name: f.name, parents: f.parents });
      }
      if (method === 'DELETE') { f.trashed = true; return new Response(null, { status: 204 }); }
    }
    return json(404, { error: { message: `no drive fake for ${method} ${path}` } });
  }

  link(f) {
    if (f.mimeType === 'application/vnd.google-apps.folder') return `https://drive.google.com/drive/folders/${f.id}`;
    if (f.mimeType === 'application/vnd.google-apps.spreadsheet') return `https://docs.google.com/spreadsheets/d/${f.id}/edit`;
    return `https://drive.google.com/file/d/${f.id}/view`;
  }

  // ---------------------------------------------------------------- Sheets
  sheets(u, method, body) {
    const path = u.pathname.replace(/^\/v4\/spreadsheets/, '');
    if (path === '' && method === 'POST') {
      const b = JSON.parse(body);
      const id = this.id('sheet');
      const tabs = b.sheets.map((s, i) => ({ title: s.properties.title, sheetId: 100 + i, grid: [], columnCount: (s.properties.gridProperties || {}).columnCount || 26 }));
      this.books.set(id, { id, title: b.properties.title, locale: b.properties.locale, timeZone: b.properties.timeZone, tabs, formatRequests: 0 });
      this.files.set(id, { id, name: b.properties.title, mimeType: 'application/vnd.google-apps.spreadsheet', parents: ['root'], properties: {}, trashed: false });
      return json(200, { spreadsheetId: id, sheets: tabs.map((t) => ({ properties: { title: t.title, sheetId: t.sheetId } })) });
    }
    const m = path.match(/^\/([^/:]+)(.*)$/);
    const book = m && this.books.get(m[1]);
    if (!book) return json(404, { error: { code: 404, message: 'Requested entity was not found.' } });
    const rest = m[2];
    const findTab = (title) => book.tabs.find((t) => t.title === title);
    if (rest === '' && method === 'GET') {
      return json(200, { spreadsheetId: book.id, properties: { title: book.title }, sheets: book.tabs.map((t) => ({ properties: { title: t.title, sheetId: t.sheetId, gridProperties: { columnCount: t.columnCount || 26 } } })) });
    }
    if (rest === '/values:batchGet') {
      const out = [];
      for (const range of u.searchParams.getAll('ranges')) {
        const a = parseA1(range);
        const tab = findTab(a.tab);
        if (!tab) return json(400, { error: { code: 400, message: `Unable to parse range: ${range}` } });
        const rows = [];
        const last = Math.min(a.r2, tab.grid.length);
        for (let r = a.r1; r <= last; r++) {
          const row = (tab.grid[r - 1] || []).slice(a.c1, a.c2 + 1);
          while (row.length && (row[row.length - 1] === '' || row[row.length - 1] === undefined || row[row.length - 1] === null)) row.pop();
          rows.push(row.map((v) => (v === undefined || v === null ? '' : v)));
        }
        while (rows.length && !rows[rows.length - 1].length) rows.pop();
        out.push({ range, values: rows });
      }
      return json(200, { valueRanges: out });
    }
    if (rest === '/values:batchUpdate' && method === 'POST') {
      const b = JSON.parse(body);
      for (const d of b.data) {
        const a = parseA1(d.range);
        const tab = findTab(a.tab);
        if (!tab) return json(400, { error: { code: 400, message: `Unable to parse range: ${d.range}` } });
        const widest = Math.max(0, ...d.values.map((v) => a.c1 + v.length));
        if (widest > (tab.columnCount || 26)) return json(400, { error: { code: 400, message: `Range (${d.range}) exceeds grid limits. Max columns: ${tab.columnCount || 26}` } });
        d.values.forEach((rowVals, i) => {
          const r = a.r1 - 1 + i;
          tab.grid[r] = tab.grid[r] || [];
          rowVals.forEach((v, j) => { tab.grid[r][a.c1 + j] = v; });
        });
      }
      return json(200, {});
    }
    const ap = rest.match(/^\/values\/(.+):append$/);
    if (ap && method === 'POST') {
      const a = parseA1(decodeURIComponent(ap[1]));
      const tab = findTab(a.tab);
      if (!tab) return json(400, { error: { code: 400, message: 'Unable to parse range' } });
      let lastUsed = 0;
      tab.grid.forEach((row, i) => { if (row && row.some((v) => v !== '' && v !== undefined && v !== null)) lastUsed = i + 1; });
      JSON.parse(body).values.forEach((vals, i) => { tab.grid[lastUsed + i] = vals.slice(); });
      return json(200, {});
    }
    if (rest === ':batchUpdate' && method === 'POST') {
      const b = JSON.parse(body);
      const replies = b.requests.map((req) => {
        if (req.addSheet) {
          const sheetId = 200 + book.tabs.length;
          book.tabs.push({ title: req.addSheet.properties.title, sheetId, grid: [], columnCount: ((req.addSheet.properties.gridProperties || {}).columnCount) || 26 });
          return { addSheet: { properties: { sheetId, title: req.addSheet.properties.title } } };
        }
        if (req.appendDimension && req.appendDimension.dimension === 'COLUMNS') {
          const tab = book.tabs.find((t) => t.sheetId === req.appendDimension.sheetId);
          tab.columnCount = (tab.columnCount || 26) + req.appendDimension.length;
          return {};
        }
        book.formatRequests++;
        return {};
      });
      return json(200, { replies });
    }
    return json(404, { error: { message: `no sheets fake for ${method} ${rest}` } });
  }

  // ---------------------------------------------------------------- Pinterest
  pinterest(u, method, token, body) {
    if (this.revokedPinterestTokens.has(token) || !this.pinterestUsers[token]) return json(401, { code: 2, message: 'Authentication failed.' });
    const path = u.pathname.replace(/^\/v5/, '');
    if (path === '/user_account') return json(200, { username: this.pinterestUsers[token], account_type: 'BUSINESS' });
    if (path === '/boards' && method === 'GET') return json(200, { items: this.boards.filter((b) => b.owner === token), bookmark: null });
    if (path === '/boards' && method === 'POST') {
      const b = JSON.parse(body);
      const board = { id: this.id('board'), name: b.name, description: b.description || '', privacy: b.privacy || 'PUBLIC', owner: token };
      this.boards.push(board);
      return json(201, board);
    }
    if (path === '/pins' && method === 'POST') {
      const b = JSON.parse(body);
      const plan = this.createPinPlan.shift();
      const create = () => {
        const ms = b.media_source;
        let media;
        if (ms.source_type === 'multiple_image_base64') media = { media_type: 'multiple_images', items: ms.items.map((it, i) => ({ item_type: 'image', title: it.title, link: it.link, images: { '600x': { url: `https://i.pinimg.com/564x/c${i}.jpg` } } })) };
        else if (ms.source_type === 'video_id') media = { media_type: 'video', cover_image_url: 'https://i.pinimg.com/videos/cover.jpg' };
        else media = { media_type: 'image', images: { '600x': { url: `https://i.pinimg.com/564x/${b.title.length}.jpg` } } };
        const pin = {
          id: this.id('pin'), board_id: b.board_id, board_section_id: b.board_section_id || null, title: b.title, description: b.description,
          link: this.stripLinks ? null : b.link, alt_text: b.alt_text, ai_disclosures: b.ai_disclosures, owner: token, payload: b,
          board_owner: { username: this.pinterestUsers[token] },
          created_at: new Date().toISOString().replace(/\.\d+Z$/, ''), media,
        };
        this.pins.unshift(pin);
        if (this.onCreatePin) this.onCreatePin(pin);
        return pin;
      };
      if (plan) {
        if (plan.createAnyway) create();
        return json(plan.status, { code: plan.status, message: plan.message || 'failure' });
      }
      return json(201, create());
    }
    const gp = path.match(/^\/pins\/([^/]+)$/);
    if (gp && method === 'GET') {
      const pin = this.pins.find((p) => p.id === gp[1]);
      return pin ? json(200, pin) : json(404, { code: 50, message: 'Pin not found.' });
    }
    const bp = path.match(/^\/boards\/([^/]+)\/pins$/);
    if (bp) return json(200, { items: this.pins.filter((p) => p.board_id === bp[1]), bookmark: null });
    const sp = path.match(/^\/boards\/([^/]+)\/sections$/);
    if (sp && method === 'POST') {
      if (this.refuseSections) return json(400, { code: 1, message: 'Section name not allowed' });
      const section = { id: this.id('section'), name: JSON.parse(body).name };
      this.sections[sp[1]] = (this.sections[sp[1]] || []).concat(section);
      return json(201, section);
    }
    if (sp) return json(200, { items: this.sections[sp[1]] || [], bookmark: null });
    const an = path.match(/^\/pins\/([^/]+)\/analytics$/);
    if (an) {
      if (this.statsDisabled) return json(403, { code: 3, message: 'Analytics are only available for business accounts' });
      const st = (this.stats || {})[an[1]] || { IMPRESSION: 0, SAVE: 0, PIN_CLICK: 0, OUTBOUND_CLICK: 0 };
      return json(200, { all: { summary_metrics: st, daily_metrics: [] } });
    }
    if (path === '/media' && method === 'POST') {
      const id = String(9000 + Object.keys(this.media).length);
      this.media[id] = { uploaded: false };
      return json(201, { media_id: id, media_type: 'video', upload_url: `https://pinterest-media-upload.example.com/?media=${id}`, upload_parameters: { key: `uploads/${id}`, policy: 'p' } });
    }
    const mp = path.match(/^\/media\/([^/]+)$/);
    if (mp) return json(200, { media_id: mp[1], media_type: 'video', status: this.media[mp[1]] && this.media[mp[1]].uploaded ? 'succeeded' : 'registered' });
    return json(404, { code: 404, message: `no pinterest fake for ${method} ${path}` });
  }

  // ---------------------------------------------------------------- Telegram
  telegramApi(u, body) {
    const m = u.pathname.match(/^\/bot([^/]+)\/(\w+)$/);
    if (!m || m[1] !== (this.telegramToken || 'tg-token')) return json(401, { ok: false, description: 'Unauthorized' });
    const b = body ? JSON.parse(body) : {};
    this.telegramSent = this.telegramSent || [];
    if (m[2] === 'getUpdates') return json(200, { ok: true, result: (this.telegramUpdates || []) });
    if (m[2] === 'sendMessage' || m[2] === 'sendPhoto') {
      if (this.telegramDown) return json(400, { ok: false, description: 'Bad Request: chat not found' });
      if (this.telegramRefuseHtml && b.parse_mode === 'HTML') return json(400, { ok: false, description: "Bad Request: can't parse entities" });
      if (this.telegramRefusePhoto && m[2] === 'sendPhoto') return json(400, { ok: false, description: 'Bad Request: wrong file identifier/HTTP URL specified' });
      this.telegramSent.push({ method: m[2], chat: String(b.chat_id), text: b.text || b.caption, photo: b.photo, buttons: b.reply_markup ? b.reply_markup.inline_keyboard.map((r) => r[0]) : [], html: b.parse_mode === 'HTML' });
      return json(200, { ok: true, result: { message_id: this.telegramSent.length } });
    }
    return json(404, { ok: false });
  }

  // ---------------------------------------------------------------- Gmail
  gmail(u, method, token, body) {
    if (this.gmailDown || token !== this.tokens.gmail) return json(401, { error: { code: 401, message: 'Invalid Credentials' } });
    if (u.pathname.endsWith('/profile')) return json(200, { emailAddress: 'bot@example.com' });
    if (u.pathname.endsWith('/messages/send')) {
      const raw = JSON.parse(body).raw.replace(/-/g, '+').replace(/_/g, '/');
      const mime = Buffer.from(raw, 'base64').toString('utf8');
      const [head, ...bodyParts] = mime.split('\r\n\r\n');
      const header = (name) => ((head.match(new RegExp(`^${name}: (.*)$`, 'm')) || [])[1] || '');
      const html = Buffer.from(bodyParts.join('\r\n\r\n').replace(/\r\n/g, ''), 'base64').toString('utf8');
      this.sent.push({ to: header('To'), from: decodeMimeWord(header('From')), subject: decodeMimeWord(header('Subject')), html });
      return json(200, { id: this.id('msg') });
    }
    return json(404, { error: { message: 'no gmail fake' } });
  }
}

export function fakePng(w, h) {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8); b.write('IHDR', 12); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20);
  return b;
}

export function fakeJpeg(w, h) {
  return Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xff, 0xd9]);
}

export function fakeMp4(seconds) {
  const b = Buffer.alloc(64);
  b.write('ftypisom', 4);
  b.write('mvhd', 24);
  b[28] = 0; // version 0
  b.writeUInt32BE(1000, 28 + 4 + 8); // timescale
  b.writeUInt32BE(Math.round(seconds * 1000), 28 + 4 + 12); // duration
  return b;
}
