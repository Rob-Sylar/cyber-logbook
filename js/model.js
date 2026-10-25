// Data model: constants, cleaning/validation of entries, and merge-by-ID logic.
// Anything that comes from outside the running app (imports, the synced Gist, saved drafts)
// goes through normalizeEntry(), so bad data is dropped or repaired instead of crashing the app.

export const APP_ID = 'cyber-logbook';
export const SCHEMA_VERSION = 2; // 2: entries can have screenshots (shots / deletedShots)
export const EPOCH = '1970-01-01T00:00:00.000Z';

export const PLATFORMS = ['TryHackMe', 'Bandit', 'CyLab Academy', 'Hack The Box', 'CyberDefenders', 'Blue Team Labs', 'Homelab', 'Other'];
export const DEFAULT_TAGS = ['Networking', 'Linux', 'Windows', 'Web', 'Security basics', 'Blue team', 'Red team', 'Homelab'];
export const MINUTE_PRESETS = [15, 30, 45, 60, 90];
export const CONFIDENCE = [
  { value: 1, label: 'Needed lots of help' },
  { value: 2, label: 'Shaky without notes' },
  { value: 3, label: 'OK with my notes' },
  { value: 4, label: 'Mostly on my own' },
  { value: 5, label: 'Could teach it' },
];

const LIMITS = { line: 300, url: 2048, text: 50000, tag: 40, tags: 30, cmd: 5000, rows: 300, flag: 1000, entries: 100000, shots: 100, caption: 500, deletedShots: 5000 };
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export const pad2 = (n) => String(n).padStart(2, '0');

export function newId(prefix = 'e') {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  let rand = '';
  for (const b of bytes) rand += b.toString(16).padStart(2, '0');
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export const isValidId = (v) => typeof v === 'string' && ID_RE.test(v);

export function localDateISO(d = new Date()) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export const nowISO = () => new Date().toISOString();

export function isValidDateStr(s) {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  if (y < 1970 || y > 2999) return false;
  const dt = new Date(y, mo - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

export function parseLocalDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function cleanText(v, max = LIMITS.text) {
  if (typeof v === 'number' && Number.isFinite(v)) v = String(v);
  if (typeof v !== 'string') return '';
  v = v.replace(CONTROL_RE, '');
  return v.length > max ? v.slice(0, max) : v;
}

export function cleanLine(v, max = LIMITS.line) {
  return cleanText(v, max).replace(/[\r\n\t]+/g, ' ').trim();
}

export function cleanIso(v) {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const t = typeof v === 'number' ? v : Date.parse(v);
  if (!Number.isFinite(t)) return null;
  const d = new Date(t);
  const y = d.getUTCFullYear();
  if (y < 1970 || y > 2999) return null;
  return d.toISOString();
}

// Only http(s) links are kept, so a crafted import can't smuggle in javascript: URLs.
export function safeUrl(v) {
  const s = cleanLine(v, LIMITS.url);
  if (!s) return '';
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
    if ((u.protocol === 'http:' || u.protocol === 'https:') && u.hostname) return u.href;
  } catch { /* not a URL */ }
  return '';
}

const PLATFORM_LOOKUP = new Map(PLATFORMS.map((p) => [p.toLowerCase(), p]));
export function normalizePlatform(v) {
  const s = cleanLine(v, 60);
  if (!s) return 'Other';
  return PLATFORM_LOOKUP.get(s.toLowerCase()) || s;
}

export function normalizeTags(v) {
  const arr = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : [];
  const out = [];
  const seen = new Set();
  for (const t of arr) {
    const s = cleanLine(t, LIMITS.tag);
    if (!s || seen.has(s.toLowerCase())) continue;
    seen.add(s.toLowerCase());
    out.push(s);
    if (out.length >= LIMITS.tags) break;
  }
  return out;
}

function normalizeRows(list, mapRow, keep) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const ids = new Set();
  for (let i = 0; i < list.length && out.length < LIMITS.rows; i++) {
    const raw = list[i];
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = mapRow(raw);
    if (!keep(row)) continue;
    let id = isValidId(raw.id) ? raw.id : `r${i}`;
    while (ids.has(id)) id = `${id.slice(0, 60)}x${i}`;
    ids.add(id);
    out.push({ id, ...row });
  }
  return out;
}

function toInt(v) {
  if (v === null || v === undefined || v === '' || typeof v === 'boolean') return NaN;
  return Math.round(Number(v));
}

const clampInt = (v, max) => {
  const n = toInt(v);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), max) : 0;
};

// Screenshot references kept on the entry. The image bytes live in the separate "images" store.
function normalizeShots(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== 'object' || !isValidId(raw.id) || seen.has(raw.id)) continue;
    seen.add(raw.id);
    out.push({ id: raw.id, caption: cleanText(raw.caption, LIMITS.caption).trim(), w: clampInt(raw.w, 20000), h: clampInt(raw.h, 20000) });
    if (out.length >= LIMITS.shots) break;
  }
  return out;
}

// IDs of screenshots removed from an entry, so other devices know to delete them too.
function normalizeIdList(list, exclude = []) {
  if (!Array.isArray(list)) return [];
  const skip = new Set(exclude);
  const out = [];
  for (const id of list) {
    if (!isValidId(id) || skip.has(id)) continue;
    skip.add(id);
    out.push(id);
    if (out.length >= LIMITS.deletedShots) break;
  }
  return out;
}

// Returns a clean entry (fixed key order, so JSON comparisons are stable) or null if unusable.
export function normalizeEntry(raw, { assignId = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  let id = isValidId(raw.id) ? raw.id : null;
  if (!id) {
    if (!assignId) return null;
    id = newId();
  }
  const createdAt = cleanIso(raw.createdAt) || cleanIso(raw.updatedAt) || EPOCH;
  const updatedAt = cleanIso(raw.updatedAt) || createdAt;
  if (raw.deleted === true) return { id, deleted: true, createdAt, updatedAt, deletedShots: normalizeIdList(raw.deletedShots) };

  const minutes = toInt(raw.minutes);
  const confidence = toInt(raw.confidence);
  const fallbackDate = localDateISO(createdAt === EPOCH ? new Date() : new Date(createdAt));
  const shots = normalizeShots(raw.shots);
  return {
    id,
    createdAt,
    updatedAt,
    deleted: false,
    date: isValidDateStr(raw.date) ? raw.date : fallbackDate,
    minutes: Number.isFinite(minutes) ? Math.min(Math.max(minutes, 0), 1440) : 0,
    platform: normalizePlatform(raw.platform),
    room: cleanLine(raw.room),
    link: safeUrl(raw.link),
    tags: normalizeTags(raw.tags),
    did: cleanText(raw.did).trim(),
    learned: cleanText(raw.learned).trim(),
    explain: cleanText(raw.explain).trim(),
    commands: normalizeRows(
      raw.commands,
      (c) => ({ cmd: cleanText(c.cmd, LIMITS.cmd).trim(), what: cleanText(c.what, LIMITS.cmd).trim(), example: cleanText(c.example, LIMITS.cmd).trim() }),
      (r) => r.cmd || r.what || r.example,
    ),
    shots,
    questions: normalizeRows(
      raw.questions,
      (q) => ({ q: cleanText(q.q, LIMITS.cmd).trim(), solved: q.solved === true, answer: cleanText(q.answer, LIMITS.text).trim() }),
      (r) => r.q || r.answer,
    ),
    confidence: confidence >= 1 && confidence <= 5 ? confidence : null,
    flag: cleanText(raw.flag, LIMITS.flag).trim(),
    quick: raw.quick === true,
    deletedShots: normalizeIdList(raw.deletedShots, shots.map((s) => s.id)),
  };
}

// A deleted entry remembers its screenshots so every device can delete the images too.
export function tombstone(entry, at = nowISO()) {
  const deletedShots = normalizeIdList([...(entry.deletedShots || []), ...(entry.shots || []).map((s) => s.id)]);
  return { id: entry.id, deleted: true, createdAt: entry.createdAt || at, updatedAt: at, deletedShots };
}

// ---- Merge by entry ID ------------------------------------------------------------------
// Newest updatedAt wins. Ties are broken the same way on every device, so two devices
// always agree on the result.
const stamp = (e) => {
  const t = Date.parse(e.updatedAt);
  return Number.isFinite(t) ? t : 0;
};

export function pickNewer(a, b) {
  const ta = stamp(a), tb = stamp(b);
  if (ta !== tb) return ta > tb ? a : b;
  if (!!a.deleted !== !!b.deleted) return a.deleted ? a : b;
  return JSON.stringify(a) >= JSON.stringify(b) ? a : b;
}

export const sameEntry = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// local/remote: arrays of normalized entries (tombstones included).
// Returns what to write locally and whether the remote copy is missing anything.
export function mergeEntryLists(local, remote) {
  const merged = new Map(local.map((e) => [e.id, e]));
  const remoteById = new Map();
  const toSaveLocal = [];
  for (const r of remote) {
    remoteById.set(r.id, r);
    const l = merged.get(r.id);
    if (!l) {
      merged.set(r.id, r);
      toSaveLocal.push(r);
    } else if (!sameEntry(l, r) && pickNewer(l, r) === r) {
      merged.set(r.id, r);
      toSaveLocal.push(r);
    }
  }
  let remoteChanged = false;
  for (const [id, e] of merged) {
    const r = remoteById.get(id);
    if (!r || !sameEntry(r, e)) { remoteChanged = true; break; }
  }
  return { merged: [...merged.values()], toSaveLocal, remoteChanged };
}

// ---- Settings that sync between devices --------------------------------------------------
export const DEFAULT_SETTINGS = Object.freeze({ goalMinHours: 2, goalTargetHours: 3, customTags: [], updatedAt: EPOCH });

function cleanHours(v, fallback) {
  const n = Number(v);
  if (v === '' || v === null || !Number.isFinite(n) || n < 0 || n > 100) return fallback;
  return Math.round(n * 4) / 4;
}

export function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  let target = cleanHours(s.goalTargetHours, DEFAULT_SETTINGS.goalTargetHours);
  if (target <= 0) target = DEFAULT_SETTINGS.goalTargetHours;
  let min = cleanHours(s.goalMinHours, DEFAULT_SETTINGS.goalMinHours);
  if (min > target) min = target;
  return {
    goalMinHours: min,
    goalTargetHours: target,
    customTags: normalizeTags(s.customTags),
    updatedAt: cleanIso(s.updatedAt) || EPOCH,
  };
}

// ---- Backup / sync file format ------------------------------------------------------------
export function buildBackup({ entries, settings = null, resetAt = null }) {
  return {
    app: APP_ID,
    schema: SCHEMA_VERSION,
    exportedAt: nowISO(),
    resetAt: resetAt || null,
    settings: settings ? normalizeSettings(settings) : null,
    entries,
  };
}

// Never throws. Accepts a JSON string or an already-parsed value.
export function parseBackup(input, { assignIds = false } = {}) {
  let data = input;
  if (typeof input === 'string') {
    if (input.length > 50 * 1024 * 1024) return { ok: false, error: 'That file is too big (over 50 MB).' };
    try {
      data = JSON.parse(input.replace(/^﻿/, ''));
    } catch {
      return { ok: false, error: "That file isn't valid JSON, so nothing was imported." };
    }
  }
  let rawEntries;
  let rawSettings = null;
  let resetAt = null;
  if (Array.isArray(data)) {
    rawEntries = data;
  } else if (data && typeof data === 'object' && Array.isArray(data.entries)) {
    if (data.app !== undefined && data.app !== APP_ID) return { ok: false, error: "That JSON isn't a Cyber Logbook backup." };
    rawEntries = data.entries;
    rawSettings = data.settings && typeof data.settings === 'object' ? data.settings : null;
    resetAt = cleanIso(data.resetAt);
  } else {
    return { ok: false, error: "That JSON doesn't look like a Cyber Logbook backup (there's no list of entries)." };
  }
  if (rawEntries.length > LIMITS.entries) return { ok: false, error: 'That file has too many entries to import.' };

  const byId = new Map();
  let invalid = 0;
  for (const r of rawEntries) {
    const e = normalizeEntry(r, { assignId: assignIds });
    if (!e) { invalid++; continue; }
    const prev = byId.get(e.id);
    byId.set(e.id, prev ? pickNewer(prev, e) : e);
  }
  return {
    ok: true,
    entries: [...byId.values()],
    settings: rawSettings ? normalizeSettings(rawSettings) : null,
    resetAt,
    invalid,
  };
}
