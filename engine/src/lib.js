// ============================================================================
// Pinterest Autopilot — shared library.
// Pasted in front of every code step (Activepieces code steps cannot import
// each other), so keep it self-contained: no imports.
// ============================================================================

const CONTROL_MARKER = 'control-sheet';
const ROOT_MARKER = 'root-folder';
const DEFAULT_TZ = 'Africa/Casablanca';

const TABS = { guide: 'Guide', accounts: 'Accounts', plan: 'Plan', boards: 'Boards', products: 'Products', settings: 'Settings', log: 'Log' };
const PINS_TAB_PREFIX = 'Pins – ';
const IMAGES_FOLDER_PREFIX = 'Media – ';

// Columns are found by header name, so their order can change without breaking anything.
// Older spreadsheets get any missing column added at the end (see ensureColumns).
const PIN_INPUT_COLUMNS = ['Pin ID', 'Status', 'Account', 'Media type', 'Media', 'Title', 'Description', 'Keywords',
  'Product', 'Link', 'Board', 'Board section', 'Alt text', 'AI disclosure', 'Publish after', 'Video cover', 'Card titles', 'Card links'];
// Written by the content creator (Codex) so the next batch never repeats an idea.
const PIN_MEMORY_COLUMNS = ['Target keyword', 'Idea', 'Picture style', 'Focus', 'Batch'];
const PIN_MANAGED_COLUMNS = ['Pinterest Pin ID', 'Pin URL', 'Posted at', 'Attempts', 'Last attempt', 'Error', 'Lock'];
const PIN_STATS_COLUMNS = ['Impressions', 'Saves', 'Pin clicks', 'Outbound clicks', 'Stats updated'];
const PIN_REQUIRED_COLUMNS = [...PIN_INPUT_COLUMNS, ...PIN_MANAGED_COLUMNS];
const PIN_COLUMNS = [...PIN_INPUT_COLUMNS, ...PIN_MEMORY_COLUMNS, ...PIN_MANAGED_COLUMNS, ...PIN_STATS_COLUMNS];
const ACCOUNT_COLUMNS = ['Account', 'On', 'Pinterest username', 'Connection ID', 'Niche', 'Link', 'Posting times',
  'Daily cap', 'Pins tab', 'Media folder', 'Default board', 'Health', 'Last run', 'Last post', 'Pins left', 'Alerts', 'Style guide'];
const ACCOUNT_REQUIRED_COLUMNS = ['Account', 'On', 'Pinterest username', 'Posting times', 'Daily cap', 'Pins tab',
  'Media folder', 'Default board', 'Health', 'Last run', 'Last post', 'Pins left', 'Alerts'];
const BOARD_COLUMNS = ['Account', 'Board', 'Section', 'Board description', 'Status', 'Board ID', 'Section ID', 'Updated'];
const BOARD_STATUS = { live: 'On Pinterest', planned: 'Planned', error: 'Error' };
// Products tab: one row per page (free PDF pattern or category) that pins link to.
// A pin with a Product and no Link gets that product's link. Counts and Status are kept by the automation.
const PRODUCT_COLUMNS = ['Account', 'Product', 'Link', 'Pins wanted', 'Pins made', 'Pins posted', 'Status', 'Updated'];
const PRODUCT_STATUS = { needs: 'Needs pins', posting: 'Posting', done: 'Done', paused: 'Paused' };
// Plan tab: each account's growth plan, written and kept up to date by Codex (one micro-niche per row, in order).
const PLAN_COLUMNS = ['Account', 'Order', 'Focus', 'Why (evidence)', 'Boards', 'Status', 'Started', 'Finished', 'Result'];
const PLAN_STATUS = ['Next', 'In progress', 'Done', 'Dropped'];
const LOG_COLUMNS = ['Time', 'Account', 'Pin ID', 'Result', 'Attempt', 'Pinterest Pin ID', 'Pin URL', 'Details', 'Image'];
// Settings tab: label -> default. Labels are matched case-insensitively.
const SETTING_KEYS = {
  emailTo: 'Send emails to', emailEveryPin: 'Email every published pin', lowQueue: 'Low-queue warning',
  timeZone: 'Time zone', reportTime: 'Daily report time', lastReport: 'Last report', configApplied: 'Config applied',
  notifyEmail: 'Notify by email', notifyTelegram: 'Notify by Telegram', telegramChat: 'Telegram chat ID',
};
// The automation runs once an hour between these hours (install time zone).
const FIRST_HOUR = 6;
const LAST_HOUR = 23;

const STATUS = {
  draft: 'Draft', ready: 'Ready', posting: 'Posting', done: 'Done', error: 'Error', review: 'Needs review', skip: 'Skip',
};
const MEDIA_TYPES = { image: 'Image', carousel: 'Carousel', video: 'Video' };
const AI_DISCLOSURE_OPTIONS = {
  '': [],
  'none': [],
  'ai modified': ['AI_MODIFIED'],
  'synthetic performer': ['SYNTHETIC_PERFORMER'],
  'ai modified + synthetic performer': ['AI_MODIFIED', 'SYNTHETIC_PERFORMER'],
};

// Official limits (Pinterest API v5.28 PinCreate schema + Pinterest "Review Pin specs").
const LIMITS = {
  title: 100, description: 800, altText: 500, link: 2048,
  imageBytes: 20 * 1024 * 1024,
  // Pinterest allows 2 GB videos; the automation runs in Activepieces with limited memory.
  videoBytes: 100 * 1024 * 1024,
  videoMinSeconds: 4, videoMaxSeconds: 300,
  carouselMin: 2, carouselMax: 5,
};
const IMAGE_MIME = ['image/jpeg', 'image/png'];
const VIDEO_MIME = ['video/mp4', 'video/x-m4v', 'video/m4v'];
const LOCK_STALE_MINUTES = 15;
const MAX_BAD_ROWS_PER_RUN = 5;
const MAX_ATTEMPTS = 3;

// ---------------------------------------------------------------------------
// HTTP with retries and error classification
// ---------------------------------------------------------------------------
class ApiError extends Error {
  constructor(service, status, message, body) {
    super(`${service} ${status || 'network'}: ${message}`);
    this.service = service;
    this.status = status;
    this.detail = message;
    this.body = body;
    this.kind = classifyFailure(status, body);
  }
}

function classifyFailure(status, body) {
  const text = String(body || '');
  if (!status) return 'transient';
  if (status === 429 || status >= 500) return 'transient';
  if (/rateLimitExceeded|userRateLimitExceeded|backendError/i.test(text)) return 'transient';
  if (status === 401) return 'auth';
  if (/invalid_grant|invalid_token|token.*(expired|revoked)|Authentication failed/i.test(text)) return 'auth';
  return 'request';
}

function extractMessage(text) {
  try {
    const j = JSON.parse(text);
    if (j && j.error && j.error.message) return j.error.message;
    if (j && j.message) return j.message;
    if (j && typeof j.error === 'string') return j.error;
    if (j && j.description) return j.description;
  } catch (e) { /* not JSON */ }
  return String(text || '').slice(0, 300);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = (globalThis.__AP_RETRY_DELAYS__) || [2000, 6000];
const CONFIRM_DELAYS_MS = (globalThis.__AP_CONFIRM_DELAYS__) || [5000, 15000];

async function http(service, url, opts = {}) {
  const { method = 'GET', token, json, body, headers = {}, raw = false, tries = 3 } = opts;
  let lastErr;
  for (let attempt = 1; attempt <= tries; attempt++) {
    let res;
    try {
      res = await fetch(url, {
        method,
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...headers,
        },
        body: json !== undefined ? JSON.stringify(json) : body,
      });
    } catch (e) {
      lastErr = new ApiError(service, 0, `network error: ${e && e.message ? e.message : e}`, '');
    }
    if (res) {
      if (res.ok) {
        if (raw) return res;
        const text = await res.text();
        return text ? JSON.parse(text) : {};
      }
      const text = await res.text();
      lastErr = new ApiError(service, res.status, extractMessage(text), text);
      if (lastErr.kind !== 'transient') throw lastErr;
    }
    if (attempt < tries) await sleep(RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)]);
  }
  throw lastErr;
}

function tokenOf(conn) {
  if (!conn || typeof conn !== 'object') return null;
  if (conn.access_token) return conn.access_token;
  if (conn.value && conn.value.access_token) return conn.value.access_token;
  return null;
}

// ---------------------------------------------------------------------------
// Google Sheets
// ---------------------------------------------------------------------------
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function quoteTab(tab) {
  return `'${String(tab).replace(/'/g, "''")}'`;
}

const sheets = {
  async batchGet(token, id, ranges) {
    const qs = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join('&');
    const res = await http('Google Sheets', `${SHEETS}/${id}/values:batchGet?${qs}&valueRenderOption=UNFORMATTED_VALUE&dateTimeRenderOption=SERIAL_NUMBER`, { token });
    return (res.valueRanges || []).map((vr) => vr.values || []);
  },
  async get(token, id, range) {
    return (await sheets.batchGet(token, id, [range]))[0];
  },
  async write(token, id, data) {
    if (!data.length) return;
    await http('Google Sheets', `${SHEETS}/${id}/values:batchUpdate`, {
      method: 'POST', token, json: { valueInputOption: 'RAW', data },
    });
  },
  async append(token, id, range, values) {
    await http('Google Sheets', `${SHEETS}/${id}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`, {
      method: 'POST', token, json: { values },
    });
  },
  async batchUpdate(token, id, requests) {
    if (!requests.length) return {};
    return http('Google Sheets', `${SHEETS}/${id}:batchUpdate`, { method: 'POST', token, json: { requests } });
  },
  async meta(token, id) {
    return http('Google Sheets', `${SHEETS}/${id}?fields=spreadsheetId,spreadsheetUrl,properties.title,properties.timeZone,sheets.properties`, { token });
  },
};

function colLetter(index) {
  let n = index + 1;
  let s = '';
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function headerMap(headerRow, required) {
  const map = {};
  (headerRow || []).forEach((h, i) => { map[String(h).trim().toLowerCase()] = i; });
  const missing = required.filter((c) => map[c.toLowerCase()] === undefined);
  return { idx: (name) => map[name.toLowerCase()], missing };
}

function cellText(v) {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

// ---------------------------------------------------------------------------
// Google Drive
// ---------------------------------------------------------------------------
const DRIVE = 'https://www.googleapis.com/drive/v3';

const drive = {
  async findByMarker(token, marker, mimeType) {
    const q = `properties has { key='autopilot' and value='${marker}' } and trashed = false` +
      (mimeType ? ` and mimeType = '${mimeType}'` : '');
    const res = await http('Google Drive', `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=files(id,name,webViewLink,modifiedTime)&orderBy=modifiedTime desc&pageSize=10`, { token });
    return res.files || [];
  },
  async listFolder(token, folderId) {
    const files = [];
    let pageToken = '';
    do {
      const q = `'${folderId}' in parents and trashed = false`;
      const res = await http('Google Drive', `${DRIVE}/files?q=${encodeURIComponent(q)}&fields=nextPageToken,files(id,name,mimeType,size,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis))&pageSize=1000${pageToken ? `&pageToken=${pageToken}` : ''}`, { token });
      files.push(...(res.files || []));
      pageToken = res.nextPageToken || '';
    } while (pageToken);
    return files;
  },
  async file(token, fileId) {
    return http('Google Drive', `${DRIVE}/files/${fileId}?fields=id,name,mimeType,size,trashed,parents,imageMediaMetadata(width,height),videoMediaMetadata(width,height,durationMillis)`, { token });
  },
  async download(token, fileId) {
    const res = await http('Google Drive', `${DRIVE}/files/${fileId}?alt=media`, { token, raw: true });
    return Buffer.from(await res.arrayBuffer());
  },
  async createFolder(token, name, parentId, marker) {
    return http('Google Drive', `${DRIVE}/files?fields=id,name,webViewLink`, {
      method: 'POST', token,
      json: {
        name, mimeType: 'application/vnd.google-apps.folder',
        ...(parentId ? { parents: [parentId] } : {}),
        ...(marker ? { properties: { autopilot: marker } } : {}),
      },
    });
  },
  async get(token, fileId, fields) {
    return http('Google Drive', `${DRIVE}/files/${fileId}?fields=${encodeURIComponent(fields || 'id,name,parents,webViewLink,trashed')}`, { token });
  },
  async update(token, fileId, json, query) {
    return http('Google Drive', `${DRIVE}/files/${fileId}?fields=id,name,parents${query ? `&${query}` : ''}`, { method: 'PATCH', token, json });
  },
};

// Accepts a Drive folder/file link or a bare ID.
function driveIdFromText(text) {
  const s = cellText(text);
  if (!s) return '';
  const m = s.match(/(?:folders|file\/d|d)\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{20,}$/.test(s)) return s;
  return '';
}

function folderIdFromLink(link) {
  return driveIdFromText(link);
}

// ---------------------------------------------------------------------------
// Pinterest
// ---------------------------------------------------------------------------
const PINTEREST = 'https://api.pinterest.com/v5';

const pinterest = {
  me(token) {
    return http('Pinterest', `${PINTEREST}/user_account`, { token });
  },
  async boards(token) {
    const all = [];
    let bookmark = '';
    for (let page = 0; page < 20; page++) {
      const res = await http('Pinterest', `${PINTEREST}/boards?page_size=250${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, { token });
      all.push(...(res.items || []));
      bookmark = res.bookmark || '';
      if (!bookmark) break;
    }
    return all;
  },
  async sections(token, boardId) {
    const all = [];
    let bookmark = '';
    for (let page = 0; page < 10; page++) {
      const res = await http('Pinterest', `${PINTEREST}/boards/${boardId}/sections?page_size=250${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, { token });
      all.push(...(res.items || []));
      bookmark = res.bookmark || '';
      if (!bookmark) break;
    }
    return all;
  },
  // A create is not idempotent: it is never retried automatically.
  createPin(token, payload) {
    return http('Pinterest', `${PINTEREST}/pins`, { method: 'POST', token, json: payload, tries: 1 });
  },
  getPin(token, id) {
    return http('Pinterest', `${PINTEREST}/pins/${id}`, { token });
  },
  async boardPins(token, boardId, max = 100) {
    const all = [];
    let bookmark = '';
    while (all.length < max) {
      const res = await http('Pinterest', `${PINTEREST}/boards/${boardId}/pins?page_size=50${bookmark ? `&bookmark=${encodeURIComponent(bookmark)}` : ''}`, { token });
      all.push(...(res.items || []));
      bookmark = res.bookmark || '';
      if (!bookmark) break;
    }
    return all;
  },
  registerVideo(token) {
    return http('Pinterest', `${PINTEREST}/media`, { method: 'POST', token, json: { media_type: 'video' } });
  },
  mediaStatus(token, mediaId) {
    return http('Pinterest', `${PINTEREST}/media/${mediaId}`, { token });
  },
  // Creates are not idempotent either: one try, and the caller re-reads the board list on doubt.
  createBoard(token, name, description) {
    return http('Pinterest', `${PINTEREST}/boards`, {
      method: 'POST', token, tries: 1,
      json: { name, privacy: 'PUBLIC', ...(description ? { description: description.slice(0, 500) } : {}) },
    });
  },
  createSection(token, boardId, name) {
    return http('Pinterest', `${PINTEREST}/boards/${boardId}/sections`, { method: 'POST', token, tries: 1, json: { name } });
  },
  // Totals for one pin between two dates (YYYY-MM-DD, at most 90 days back). Business accounts only.
  async pinStats(token, pinId, startDate, endDate) {
    const qs = `start_date=${startDate}&end_date=${endDate}&metric_types=IMPRESSION,SAVE,PIN_CLICK,OUTBOUND_CLICK&app_types=ALL&split_field=NO_SPLIT`;
    const res = await http('Pinterest', `${PINTEREST}/pins/${pinId}/analytics?${qs}`, { token });
    const all = res.all || res.ALL || res;
    const totals = { IMPRESSION: 0, SAVE: 0, PIN_CLICK: 0, OUTBOUND_CLICK: 0 };
    if (all && all.summary_metrics) {
      for (const k of Object.keys(totals)) totals[k] = Number(all.summary_metrics[k]) || 0;
    } else if (all && Array.isArray(all.daily_metrics)) {
      for (const day of all.daily_metrics) {
        for (const k of Object.keys(totals)) totals[k] += Number((day.metrics || {})[k]) || 0;
      }
    }
    return totals;
  },
};

async function uploadToPinterestS3(upload, bytes, filename, contentType) {
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.upload_parameters || {})) form.append(k, v);
  form.append('file', new Blob([bytes], { type: contentType }), filename);
  const res = await fetch(upload.upload_url, { method: 'POST', body: form });
  if (!res.ok && res.status !== 204) {
    const text = await res.text();
    throw new ApiError('Pinterest media upload', res.status, extractMessage(text), text);
  }
}

function pinUrl(id) {
  return `https://www.pinterest.com/pin/${id}/`;
}

function pinImage(pin) {
  const media = (pin && pin.media) || {};
  const images = media.images || (media.items && media.items[0] && media.items[0].images) || {};
  const pick = images['600x'] || images['400x300'] || images['1200x'] || images['150x150'];
  if (pick) return pick.url;
  return media.cover_image_url || '';
}

function normalizeName(s) {
  return cellText(s).replace(/\s+/g, ' ').toLowerCase();
}

function normalizeText(s) {
  return cellText(s).replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ').replace(/\s+$/g, '');
}

function normalizeUrl(s) {
  return cellText(s).replace(/\/+$/, '').toLowerCase();
}

// ---------------------------------------------------------------------------
// File inspection (dimensions / duration) without libraries
// ---------------------------------------------------------------------------
function imageSize(buf) {
  try {
    if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length - 9) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        const len = buf.readUInt16BE(i + 2);
        if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    }
  } catch (e) { /* unreadable header */ }
  return null;
}

function sniffImageType(buf) {
  if (buf.length > 4 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  return null;
}

// Reads the duration from an MP4/M4V "mvhd" box.
function mp4DurationSeconds(buf) {
  const idx = buf.indexOf(Buffer.from('mvhd'));
  if (idx < 0) return null;
  const version = buf[idx + 4];
  try {
    if (version === 1) {
      const timescale = buf.readUInt32BE(idx + 4 + 4 + 16);
      const hi = buf.readUInt32BE(idx + 4 + 4 + 20);
      const lo = buf.readUInt32BE(idx + 4 + 4 + 24);
      return (hi * 2 ** 32 + lo) / timescale;
    }
    const timescale = buf.readUInt32BE(idx + 4 + 4 + 8);
    const duration = buf.readUInt32BE(idx + 4 + 4 + 12);
    return duration / timescale;
  } catch (e) {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Gmail
// ---------------------------------------------------------------------------
function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

function b64url(s) {
  return b64(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildMime({ to, subject, html, fromName, fromAddress }) {
  const encodedSubject = `=?UTF-8?B?${b64(subject)}?=`;
  const body = b64(html).replace(/.{1,76}/g, (line) => `${line}\r\n`);
  return [
    fromAddress ? `From: =?UTF-8?B?${b64(fromName || fromAddress)}?= <${fromAddress}>` : null,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].filter((l) => l !== null).join('\r\n');
}

let senderAddress = null;

async function sendEmail(gmailToken, { to, subject, html }) {
  if (!gmailToken) throw new Error('Gmail connection is not available');
  if (!to) throw new Error('No "Send emails to" address in the Settings tab');
  if (!senderAddress) {
    const profile = await http('Gmail', 'https://gmail.googleapis.com/gmail/v1/users/me/profile', { token: gmailToken });
    senderAddress = profile.emailAddress;
  }
  const raw = b64url(buildMime({ to, subject, html, fromName: 'Pinterest Autopilot', fromAddress: senderAddress }));
  await http('Gmail', 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST', token: gmailToken, json: { raw },
  });
  return true;
}

// ---------------------------------------------------------------------------
// Telegram (optional second channel: a bot made with @BotFather)
// ---------------------------------------------------------------------------
function secretOf(conn) {
  if (!conn || typeof conn !== 'object') return typeof conn === 'string' && conn ? conn : null;
  return conn.secret_text || conn.secretText || conn.token || (conn.value && (conn.value.secret_text || conn.value.token)) || null;
}

const telegram = {
  call(token, method, payload) {
    return http('Telegram', `https://api.telegram.org/bot${token}/${method}`, { method: 'POST', json: payload || {} });
  },
  // The newest private chat that wrote to the bot (the person presses Start once).
  async findChat(token) {
    const res = await telegram.call(token, 'getUpdates', { limit: 100, allowed_updates: ['message'] });
    const chats = (res.result || []).map((u) => u.message && u.message.chat).filter((c) => c && c.type === 'private');
    return chats.length ? String(chats[chats.length - 1].id) : '';
  },
  // Picture + text + link buttons. Falls back step by step (no picture, then plain text without
  // buttons) so a refused picture or link never loses the message itself.
  async send(token, chatId, text, image, links) {
    const buttons = (links || []).filter((l) => l && /^https?:\/\//.test(l.href || '')).slice(0, 4)
      .map((l) => [{ text: String(l.text || 'Open').slice(0, 60), url: l.href }]);
    const plain = `${tgPlain(text)}${(links || []).filter((l) => l && l.href).map((l) => `\n${l.text || 'Link'}: ${l.href}`).join('')}`;
    const tries = [
      { text, parse_mode: 'HTML', reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined, photo: image },
      { text, parse_mode: 'HTML', reply_markup: buttons.length ? { inline_keyboard: buttons } : undefined },
      { text: plain },
    ];
    let lastErr;
    for (const t of tries) {
      const base = { chat_id: chatId, ...(t.parse_mode ? { parse_mode: t.parse_mode } : {}), ...(t.reply_markup ? { reply_markup: t.reply_markup } : {}) };
      try {
        if (t.photo) {
          if (t.text.length <= 1024) return await telegram.call(token, 'sendPhoto', { ...base, photo: t.photo, caption: t.text });
          await telegram.call(token, 'sendPhoto', { chat_id: chatId, photo: t.photo });
          return await telegram.call(token, 'sendMessage', { ...base, text: t.text.slice(0, 4096), disable_web_page_preview: true });
        }
        return await telegram.call(token, 'sendMessage', { ...base, text: t.text.slice(0, 4096), disable_web_page_preview: true });
      } catch (e) {
        lastErr = e;
        if (e instanceof ApiError && (e.status === 401 || e.status === 403 || /chat not found/i.test(e.message))) break;
      }
    }
    throw lastErr;
  },
};

function tgEsc(t) {
  return String(t === undefined || t === null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function tgPlain(t) {
  return String(t || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

// Telegram version of an email: "Label: value" lines, bold kept, footer dropped (Telegram HTML
// allows only a few tags). Links become buttons under the message (see telegram.send).
function telegramText(subject, html) {
  const B = '\u0001';
  const b = '\u0002';
  const body = String(html || '')
    .replace(/<(style|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<div style="text-align:center[^"]*">[\s\S]*?<\/div>/gi, '')
    .replace(/<img[^>]*>/gi, '')
    .replace(/<tr[^>]*>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<td[^>]*>([\s\S]*?)<\/td>\s*<\/tr>/gi, `\n${B}$1:${b} $2\n`)
    .replace(/<b>([\s\S]*?)<\/b>/gi, `${B}$1${b}`)
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/(p|div|li|h\d|table|ul|ol)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const text = tgEsc(body).slice(0, 3000).split(B).join('<b>').split(b).join('</b>');
  // An unclosed <b> (cut text) would make Telegram refuse the whole message.
  const open = (text.match(/<b>/g) || []).length - (text.match(/<\/b>/g) || []).length;
  return `<b>${tgEsc(subject)}</b>\n\n${text}${open > 0 ? '</b>' : ''}`;
}

// Sends one notification on every channel switched on in Settings. Returns the channels that failed.
async function notify(ch, msg) {
  const failed = [];
  let tried = 0;
  if (ch.email) {
    tried++;
    try { await sendEmail(ch.mailTok, { to: ch.emailTo, subject: msg.subject, html: msg.html }); }
    catch (e) { failed.push(`email: ${e.message}`); }
  }
  if (ch.telegram) {
    tried++;
    try {
      if (!ch.tgTok) throw new Error('Telegram connection is not available');
      if (!ch.chatId) throw new Error('no Telegram chat yet: open your bot in Telegram and press Start');
      await telegram.send(ch.tgTok, ch.chatId, msg.telegram || telegramText(msg.subject, msg.html), msg.image, msg.links);
    } catch (e) { failed.push(`telegram: ${e.message}`); }
  }
  return { tried, failed, delivered: tried - failed.length };
}

// Log tab rows for notifications that could not be delivered (so a silent channel is visible).
function notifyFailureRows(stamp, account, failed) {
  return (failed || []).map((f) => [stamp, account || '', '', 'Notification failed', '', '', '', String(f).slice(0, 300), '']);
}

// A channel whose login step is not in this automation at all (the Control Panel left it out, so the
// input is '') is skipped instead of failing: automations sharing a spreadsheet may differ in channels.
function channelsFrom(settings, mailTok, tgTok, inputs = {}) {
  return {
    email: settings.notifyEmail && inputs.gmail !== '', telegram: settings.notifyTelegram && inputs.telegram !== '',
    emailTo: settings.emailTo, mailTok, tgTok, chatId: settings.telegramChat,
  };
}

// ---------------------------------------------------------------------------
// Dates (everything the user sees is in the account's time zone)
// ---------------------------------------------------------------------------
function validTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch (e) {
    return false;
  }
}

// Time zones whose rules changed after the server's time-zone data was built. Morocco left GMT+1
// for good on 20 September 2026 (tz 2026c); servers with older data still add one hour.
const ZONE_FIXES = [
  { zones: ['Africa/Casablanca', 'Africa/El_Aaiun'], from: Date.UTC(2026, 8, 20, 1), use: 'UTC' },
];

function liveZone(tz, date = new Date()) {
  const fix = ZONE_FIXES.find((f) => f.zones.includes(tz) && date.getTime() >= f.from);
  return fix ? fix.use : tz;
}

function zonedParts(date, tz) {
  const f = new Intl.DateTimeFormat('en-GB', {
    timeZone: liveZone(tz, date), year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  });
  const p = {};
  for (const part of f.formatToParts(date)) p[part.type] = part.value;
  return p;
}

function localDate(date, tz) {
  const p = zonedParts(date, tz);
  return `${p.year}-${p.month}-${p.day}`;
}

function localStamp(date, tz) {
  const p = zonedParts(date, tz);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

// "YYYY-MM-DD HH:MM" in the account's zone, so it compares directly with localStamp().
function cellToLocalStamp(v) {
  if (v === undefined || v === null || v === '') return '';
  if (typeof v === 'number') {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return `${d.toISOString().slice(0, 10)} ${d.toISOString().slice(11, 16)}`;
  }
  const s = String(v).trim();
  if (!s) return '';
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?$/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')} ${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?: (\d{1,2}):(\d{2}))?$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')} ${(m[4] || '00').padStart(2, '0')}:${m[5] || '00'}`;
  return null;
}

// ---------------------------------------------------------------------------
// Pin content rules
// ---------------------------------------------------------------------------
function formatKeywords(keywords) {
  return cellText(keywords)
    .split(/[,;\n]+/)
    .map((t) => t.trim().replace(/^#+/, ''))
    .map((t) => t.replace(/[^\p{L}\p{N}_]+/gu, ''))
    .filter(Boolean)
    .map((t) => `#${t}`)
    .join(' ');
}

function finalDescription(description, keywords) {
  const d = cellText(description);
  const t = formatKeywords(keywords);
  if (d && t) return `${d}\n\n${t}`;
  return d || t;
}

function isValidLink(link) {
  if (!/^https?:\/\//i.test(link)) return false;
  try {
    const u = new URL(link);
    return Boolean(u.hostname && u.hostname.includes('.'));
  } catch (e) {
    return false;
  }
}

function splitList(text, sep) {
  return cellText(text).split(sep).map((s) => s.trim()).filter(Boolean);
}

function isYes(v, fallback) {
  const s = cellText(v);
  if (!s) return Boolean(fallback);
  return /^(yes|y|on|true|1)$/i.test(s);
}

// "09:00, 13:00 · 19:00" -> [9, 13, 19] (whole hours inside the automation's hourly window).
function parseHours(text) {
  const hours = new Set();
  for (const part of cellText(text).split(/[,;·\s]+/)) {
    const m = part.match(/^(\d{1,2})(?::(\d{2}))?$/);
    if (!m) continue;
    const h = Number(m[1]);
    if (h >= FIRST_HOUR && h <= LAST_HOUR) hours.add(h);
  }
  return [...hours].sort((a, b) => a - b);
}

function formatHours(hours) {
  return hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ');
}

function localHour(date, tz) {
  return Number(zonedParts(date, tz).hour);
}

function daysAgo(date, tz, n) {
  return localDate(new Date(date.getTime() - n * 86400000), tz);
}

// Reads the Settings tab (label | value | help) into { key: value } using SETTING_KEYS.
function readSettings(rows) {
  const byLabel = {};
  for (const r of rows || []) {
    const label = cellText(r[0]).toLowerCase();
    if (label) byLabel[label] = { value: r[1], row: null };
  }
  (rows || []).forEach((r, i) => { const l = cellText(r[0]).toLowerCase(); if (byLabel[l]) byLabel[l].row = i + 1; });
  const out = { rowOf: {} };
  for (const [key, label] of Object.entries(SETTING_KEYS)) {
    const hit = byLabel[label.toLowerCase()];
    out[key] = hit ? hit.value : undefined;
    out.rowOf[key] = hit ? hit.row : null;
  }
  const low = Number(cellText(out.lowQueue));
  const tz = cellText(out.timeZone);
  const report = parseHours(cellText(out.reportTime));
  return {
    rowOf: out.rowOf,
    emailTo: cellText(out.emailTo),
    emailEveryPin: isYes(out.emailEveryPin, true),
    lowQueue: Number.isFinite(low) && cellText(out.lowQueue) !== '' && low >= 0 ? low : 10,
    timeZone: validTimeZone(tz) && tz ? tz : DEFAULT_TZ,
    reportHour: report.length ? report[0] : 22,
    lastReport: cellText(out.lastReport),
    configApplied: cellText(out.configApplied),
    notifyEmail: isYes(out.notifyEmail, true),
    notifyTelegram: isYes(out.notifyTelegram, false),
    telegramChat: cellText(out.telegramChat),
  };
}

// Adds any missing header (by name) at the end of row 1 of a tab. Returns the full header row.
async function ensureColumns(token, sheetId, tab, headerRow, wanted) {
  const have = (headerRow || []).map((h) => cellText(h));
  const lower = new Set(have.map((h) => h.toLowerCase()));
  const missing = wanted.filter((c) => !lower.has(c.toLowerCase()));
  if (!missing.length) return have;
  const start = have.length;
  const meta = await sheets.meta(token, sheetId);
  const props = ((meta.sheets || []).find((s) => s.properties.title === tab) || {}).properties;
  const cols = props && props.gridProperties ? props.gridProperties.columnCount : 0;
  if (props && cols < start + missing.length) {
    await sheets.batchUpdate(token, sheetId, [{ appendDimension: { sheetId: props.sheetId, dimension: 'COLUMNS', length: start + missing.length - cols } }]);
  }
  await sheets.write(token, sheetId, [{ range: `${quoteTab(tab)}!${colLetter(start)}1`, values: [missing] }]);
  return [...have, ...missing];
}

// ---------------------------------------------------------------------------
// HTML helpers for emails
// ---------------------------------------------------------------------------
function esc(s) {
  return String(s === undefined || s === null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function emailShell(title, inner, accent) {
  return `<!doctype html><html><body style="margin:0;padding:0;background:#f4f4f5;">
<div style="max-width:560px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18181b;">
<div style="background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e4e4e7;">
<div style="padding:14px 20px;background:${accent || '#e60023'};color:#ffffff;font-size:15px;font-weight:600;">${esc(title)}</div>
<div style="padding:20px;font-size:15px;line-height:1.5;">${inner}</div>
</div>
<div style="text-align:center;color:#a1a1aa;font-size:12px;padding:12px;">Sent by your Pinterest Autopilot</div>
</div></body></html>`;
}

function detailRows(pairs) {
  return `<table style="width:100%;border-collapse:collapse;font-size:14px;">${pairs
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#71717a;white-space:nowrap;vertical-align:top;">${esc(k)}</td><td style="padding:4px 0;">${v}</td></tr>`)
    .join('')}</table>`;
}

function link(href, text) {
  return `<a href="${esc(href)}" style="color:#e60023;">${esc(text || href)}</a>`;
}
