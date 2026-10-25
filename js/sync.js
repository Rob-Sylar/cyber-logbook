// Free sync between devices through one JSON file in a secret GitHub Gist.
// The token is kept in this device's IndexedDB only. It's never logged, exported or shown again.

import * as db from './db.js';
import * as store from './store.js';
import { EPOCH, buildBackup, cleanIso, mergeEntryLists, nowISO, parseBackup } from './model.js';
import { currentBackup, downloadJSON, stampedName } from './backup.js';

const API = 'https://api.github.com';
export const GIST_FILE = 'cyber-logbook.json';
const GIST_DESC = 'Cyber Logbook sync data (managed by the Cyber Logbook app; please do not edit by hand)';
const GIST_ID_RE = /^[0-9a-f]{20,64}$/i;
const TOKEN_RE = /^[A-Za-z0-9_]{30,255}$/;

const EMPTY = { token: '', gistId: '', lastSyncAt: null, knownResetAt: null, auto: true };
let cfg = { ...EMPTY };
let state = { status: 'off', message: '', pendingReset: null };
const listeners = new Set();
let running = null;
let again = false;
let timer = null;
let paused = false;

export class SyncError extends Error {
  constructor(message, status = 0) {
    super(message);
    this.status = status;
  }
}

function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    token: typeof r.token === 'string' && TOKEN_RE.test(r.token) ? r.token : '',
    gistId: typeof r.gistId === 'string' && GIST_ID_RE.test(r.gistId) ? r.gistId : '',
    lastSyncAt: cleanIso(r.lastSyncAt),
    knownResetAt: cleanIso(r.knownResetAt),
    auto: r.auto !== false,
  };
}

async function saveCfg(patch) {
  cfg = { ...cfg, ...patch };
  await db.kvSet('sync', cfg);
}

function setState(status, message = '', extra = {}) {
  state = { ...state, status, message, ...extra };
  const snapshot = getState();
  listeners.forEach((fn) => {
    try { fn(snapshot); } catch { /* a broken listener must not stop sync */ }
  });
}

export function getState() {
  return {
    status: state.status,
    message: state.message,
    pendingReset: state.pendingReset,
    connected: !!cfg.token,
    gistId: cfg.gistId,
    gistUrl: cfg.gistId ? `https://gist.github.com/${cfg.gistId}` : '',
    lastSyncAt: cfg.lastSyncAt,
    auto: cfg.auto,
  };
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function init() {
  const saved = await db.kvGet('sync').catch(() => null);
  cfg = sanitize(saved);
  state.pendingReset = null;
  setState(cfg.token ? 'idle' : 'off');
}

function describe(res, detail) {
  const code = res.status;
  if (code === 401) return 'GitHub rejected the token. It may have expired or been deleted. Make a new one and paste it in Settings → Sync.';
  if (code === 403 || code === 429) {
    if (res.headers.get('x-ratelimit-remaining') === '0') return 'GitHub says too many requests. Wait a few minutes, then sync again.';
    return 'The token is not allowed to use Gists. When you make it, set Account permissions → Gists → Read and write.';
  }
  if (code === 404) return 'The sync Gist could not be found.';
  if (code === 422) return `GitHub refused the update${detail ? ` (${detail})` : ''}.`;
  if (code >= 500) return 'GitHub is having problems right now. Your data is safe on this device. Try again later.';
  return `GitHub error ${code}${detail ? `: ${detail}` : ''}.`;
}

async function gh(token, path, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(API + path, {
      method,
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new SyncError("Couldn't reach GitHub. Check your internet connection.");
  }
  if (res.ok) return res.status === 204 ? null : res.json();
  let detail = '';
  try {
    const j = await res.json();
    if (j && typeof j.message === 'string') detail = j.message.slice(0, 160);
  } catch { /* no JSON body */ }
  throw new SyncError(describe(res, detail), res.status);
}

async function findGist(token) {
  const hits = [];
  for (let page = 1; page <= 10; page++) {
    const list = await gh(token, `/gists?per_page=100&page=${page}`);
    if (!Array.isArray(list)) break;
    for (const g of list) {
      if (g && g.files && g.files[GIST_FILE] && GIST_ID_RE.test(String(g.id))) hits.push(g);
    }
    if (list.length < 100) break;
  }
  // If two devices ever created one each, everyone settles on the oldest.
  hits.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return hits.length ? String(hits[0].id) : '';
}

async function readGist(token, gistId) {
  const g = await gh(token, `/gists/${gistId}`);
  const f = g && g.files && g.files[GIST_FILE];
  if (!f) return null;
  let text = typeof f.content === 'string' ? f.content : '';
  if (f.truncated) {
    const raw = typeof f.raw_url === 'string' && f.raw_url.startsWith('https://gist.githubusercontent.com/') ? f.raw_url : '';
    const r = raw ? await fetch(raw, { cache: 'no-store', credentials: 'omit' }).catch(() => null) : null;
    if (!r || !r.ok) throw new SyncError("The synced copy is very large and couldn't be downloaded in full. Nothing was changed.");
    text = await r.text();
  }
  const parsed = parseBackup(text);
  if (!parsed.ok) {
    throw new SyncError("The synced copy in your Gist is damaged or isn't a Cyber Logbook file, so nothing was changed. Settings → Reset can wipe it and start fresh.", 'bad-remote');
  }
  return parsed;
}

const payload = (resetAt) => JSON.stringify(buildBackup({ entries: store.allRecords(), settings: store.getSettings(), resetAt }));

async function writeGist(token, gistId, content) {
  await gh(token, `/gists/${gistId}`, { method: 'PATCH', body: { files: { [GIST_FILE]: { content } } } });
}

async function doSync(depth = 0) {
  if (!cfg.token || paused || state.status === 'decision') return;
  if (!navigator.onLine) {
    setState('offline', 'Offline. Changes will sync when you reconnect.');
    return;
  }
  const token = cfg.token;
  setState('syncing', 'Syncing…');
  try {
    if (!cfg.gistId) {
      const found = await findGist(token);
      if (!found) {
        const g = await gh(token, '/gists', {
          method: 'POST',
          body: { description: GIST_DESC, public: false, files: { [GIST_FILE]: { content: payload(cfg.knownResetAt) } } },
        });
        if (!g || !GIST_ID_RE.test(String(g.id))) throw new SyncError('GitHub did not return a Gist ID.');
        await saveCfg({ gistId: String(g.id), lastSyncAt: nowISO() });
        setState('ok', 'Synced (new sync Gist created)');
        return;
      }
      await saveCfg({ gistId: found });
    }

    let remote;
    try {
      remote = await readGist(token, cfg.gistId);
    } catch (err) {
      if (err.status === 404 && depth === 0) {
        await saveCfg({ gistId: '' });
        return doSync(1);
      }
      throw err;
    }
    if (token !== cfg.token) return; // disconnected while we were waiting

    const r = remote || { entries: [], settings: null, resetAt: null };
    // The synced copy was wiped from another device since we last looked.
    if (r.resetAt && (!cfg.knownResetAt || r.resetAt > cfg.knownResetAt)) {
      const older = store.allRecords().filter((e) => !e.deleted && e.updatedAt <= r.resetAt);
      if (older.length) {
        setState('decision', 'Your synced copy was wiped from another device.', { pendingReset: { resetAt: r.resetAt, count: older.length } });
        return;
      }
      await saveCfg({ knownResetAt: r.resetAt });
    }

    const { toSaveLocal, remoteChanged } = mergeEntryLists(store.allRecords(), r.entries);
    await store.applyMerged(toSaveLocal, 'sync');

    const ls = store.getSettings();
    let pushSettings = false;
    if (r.settings && r.settings.updatedAt > ls.updatedAt) await store.replaceSettings(r.settings, 'sync');
    else if (r.settings ? r.settings.updatedAt < ls.updatedAt : ls.updatedAt !== EPOCH) pushSettings = true;

    const resetDiffers = (r.resetAt || null) !== (cfg.knownResetAt || null);
    if (!remote || remoteChanged || pushSettings || resetDiffers) {
      await writeGist(token, cfg.gistId, payload(cfg.knownResetAt));
    }
    await saveCfg({ lastSyncAt: nowISO() });
    setState('ok', toSaveLocal.length ? `Synced. ${toSaveLocal.length} change${toSaveLocal.length === 1 ? '' : 's'} from your other device.` : 'Synced');
  } catch (err) {
    setState('error', err instanceof SyncError ? err.message : 'Sync failed unexpectedly. Your data on this device is safe.');
  }
}

export function syncNow() {
  if (!cfg.token) return Promise.resolve();
  clearTimeout(timer);
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await doSync();
      } while (again && !paused);
    } finally {
      running = null;
    }
  })();
  return running;
}

// Debounced auto-sync after edits.
export function schedule(delay = 1500) {
  if (!cfg.token || !cfg.auto || paused) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, delay);
}

export const autoEnabled = () => !!cfg.token && cfg.auto;

export function pause() {
  paused = true;
  clearTimeout(timer);
}

export function resume() {
  paused = false;
}

export async function idle() {
  if (running) await running.catch(() => {});
}

export async function connect(rawToken, rawGistId = '') {
  const token = String(rawToken || '').trim();
  const gistId = String(rawGistId || '').trim();
  if (!TOKEN_RE.test(token)) throw new SyncError("That doesn't look like a GitHub token. Copy the whole thing; it starts with github_pat_.");
  if (gistId && !GIST_ID_RE.test(gistId)) throw new SyncError("That Gist ID doesn't look right. It's the long string of letters and numbers at the end of the Gist's web address.");
  if (!navigator.onLine) throw new SyncError("You're offline. Connect to the internet to set up sync.");
  await gh(token, '/gists?per_page=1'); // proves the token works before we keep it
  if (gistId) {
    const g = await gh(token, `/gists/${gistId}`);
    if (!g || !g.files || !g.files[GIST_FILE]) throw new SyncError(`That Gist doesn't contain ${GIST_FILE}, so it isn't a Cyber Logbook sync Gist.`);
  }
  await saveCfg({ token, gistId, lastSyncAt: null });
  setState('idle', '', { pendingReset: null });
  await syncNow();
  return getState();
}

export async function disconnect() {
  clearTimeout(timer);
  await idle();
  await saveCfg({ token: '', gistId: '', lastSyncAt: null });
  setState('off', '', { pendingReset: null });
}

export async function setAuto(on) {
  await saveCfg({ auto: !!on });
  setState(state.status, state.message);
}

// Used by Reset: keep the connection details in memory only, so "also wipe the synced copy"
// and "undo" still work after this device's storage has been cleared.
export const exportCredentials = () => ({ ...cfg });

export async function restoreCredentials(saved, patch = {}) {
  cfg = sanitize({ ...saved, ...patch });
  await db.kvSet('sync', cfg);
  setState(cfg.token ? 'idle' : 'off', '', { pendingReset: null });
}

// Empties the synced copy and leaves a "resetAt" marker so other devices ask before re-uploading.
export async function wipeRemote(saved) {
  const c = sanitize(saved);
  if (!c.token) throw new SyncError('Sync was not set up on this device, so there is no synced copy to wipe.');
  if (!navigator.onLine) throw new SyncError("You're offline, so the synced copy can't be wiped right now.");
  const gistId = c.gistId || (await findGist(c.token));
  if (!gistId) return { resetAt: null, gistId: '', remote: null };
  let remote = null;
  try {
    remote = await readGist(c.token, gistId);
  } catch (err) {
    if (err.status !== 'bad-remote') throw err;
  }
  const resetAt = nowISO();
  await writeGist(c.token, gistId, JSON.stringify(buildBackup({ entries: [], settings: null, resetAt })));
  return {
    resetAt,
    gistId,
    remote: remote ? buildBackup({ entries: remote.entries, settings: remote.settings, resetAt: remote.resetAt }) : null,
  };
}

// The user's answer to "your synced copy was wiped elsewhere".
export async function resolveReset(choice) {
  const p = state.pendingReset;
  if (!p) return;
  if (choice === 'remove') {
    downloadJSON(currentBackup(), stampedName('cyber-logbook-before-sync-wipe', 'json'));
    const ids = store.allRecords().filter((e) => e.updatedAt <= p.resetAt).map((e) => e.id);
    await store.hardDelete(ids, 'sync');
  }
  await saveCfg({ knownResetAt: p.resetAt });
  setState('idle', '', { pendingReset: null });
  await syncNow();
}
