// Screenshot sync between devices through a PRIVATE GitHub repository (free), one file per image
// at images/<id>.webp, written with the Contents API. Entry text (with each screenshot's id and
// caption) still syncs through the Gist; this only moves the image files, in the background,
// after text sync has finished, so text sync never waits for it.

import * as db from './db.js';
import * as store from './store.js';
import * as images from './images.js';
import * as sync from './sync.js';
import { SyncError, ghRequest } from './github.js';
import { nowISO } from './model.js';

const KV = 'imageSync';
const REPO_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;
const NAME_RE = /^[A-Za-z0-9._-]{1,100}$/;
const TOKEN_RE = /^[A-Za-z0-9_]{30,255}$/;
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,200}$/;
const FILE_RE = /^images\/([A-Za-z0-9_-]{1,64})\.(webp|jpg|jpeg|png)$/;
const README = '# Cyber Logbook screenshots\n\nPrivate image store for the Cyber Logbook app. Keep this repository **private**.\n';

let cfg = { repo: '', branch: '', token: '' };
let state = { status: 'off', message: '', done: 0, total: 0, waiting: 0, remoteCount: null, lastRunAt: null };
const listeners = new Set();
let running = null;
let again = false;
let timer = null;
let failures = 0;
let paused = false;
let lastWrite = 0;
const badDownloads = new Set(); // files that aren't valid images; skipped for this session

function sanitize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  return {
    repo: typeof r.repo === 'string' && REPO_RE.test(r.repo) ? r.repo : '',
    branch: typeof r.branch === 'string' && BRANCH_RE.test(r.branch) ? r.branch : '',
    token: typeof r.token === 'string' && TOKEN_RE.test(r.token) ? r.token : '',
  };
}

const tokenNow = () => cfg.token || sync.currentToken();
export const configured = () => !!cfg.repo && !!tokenNow();

export function getState() {
  return {
    ...state,
    connected: !!cfg.repo,
    repo: cfg.repo,
    repoUrl: cfg.repo ? `https://github.com/${cfg.repo}` : '',
    separateToken: !!cfg.token,
    hasToken: !!tokenNow(),
  };
}

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function setState(status, message = '', extra = {}) {
  state = { ...state, status, message, ...extra };
  const snap = getState();
  listeners.forEach((fn) => {
    try { fn(snap); } catch { /* a broken listener must not stop sync */ }
  });
}

async function saveCfg(patch) {
  cfg = { ...cfg, ...patch };
  await db.kvSet(KV, cfg);
}

export async function init() {
  cfg = sanitize(await db.kvGet(KV).catch(() => null));
  failures = 0;
  setState(cfg.repo ? 'idle' : 'off', '', { done: 0, total: 0, waiting: 0, remoteCount: null });
}

const gh = (path, opts = {}) => ghRequest(tokenNow(), `/repos/${cfg.repo}${path}`, { ...opts, perm: 'contents' });
const fileUrl = (name) => `/contents/images/${encodeURIComponent(name)}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Stay well under GitHub's limit on how fast files can be created.
async function pace() {
  const wait = lastWrite + images.tuning.writeGapMs - Date.now();
  if (wait > 0) await sleep(wait);
  lastWrite = Date.now();
}

// Map of image id -> { name, sha } for every image file in the repository.
async function listRemote() {
  const found = new Map();
  let tree;
  try {
    tree = await gh(`/git/trees/${encodeURIComponent(cfg.branch)}?recursive=1`);
  } catch (err) {
    if (err.status === 409) return found; // brand-new empty repository
    throw err;
  }
  const add = (path, sha) => {
    const m = FILE_RE.exec(path || '');
    if (m) found.set(m[1], { name: path.slice('images/'.length), sha });
  };
  for (const t of tree.tree || []) if (t.type === 'blob') add(t.path, t.sha);
  if (tree.truncated) {
    const listing = await gh(`/contents/images?ref=${encodeURIComponent(cfg.branch)}`).catch(() => []);
    for (const f of Array.isArray(listing) ? listing : []) add(`images/${f.name}`, f.sha);
  }
  return found;
}

function toBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function upload(id) {
  const rec = await images.getImage(id);
  if (!rec) return;
  const name = `${id}.${images.EXT_FOR_TYPE[rec.type] || 'webp'}`;
  await pace();
  try {
    await gh(fileUrl(name), { method: 'PUT', body: { message: `Add screenshot ${id}`, content: await toBase64(rec.blob), branch: cfg.branch } });
  } catch (err) {
    if (err.status !== 422) throw err; // 422: it's already there (your other device got there first)
  }
}

async function download(id, info) {
  const ext = info.name.split('.').pop().toLowerCase();
  const raw = await gh(`${fileUrl(info.name)}?ref=${encodeURIComponent(cfg.branch)}`, { as: 'blob' });
  const blob = new Blob([raw], { type: images.TYPE_FOR_EXT[ext] || 'image/webp' });
  try {
    await images.storeExisting(id, blob);
  } catch {
    badDownloads.add(id); // not a usable image: leave it alone rather than retrying forever
  }
}

async function removeRemote(id, info) {
  await pace();
  try {
    await gh(fileUrl(info.name), { method: 'DELETE', body: { message: `Delete screenshot ${id}`, sha: info.sha, branch: cfg.branch } });
  } catch (err) {
    if (err.status !== 404 && err.status !== 422) throw err;
  }
}

function fmtWait(s) {
  return s < 90 ? `${Math.round(s)} seconds` : `${Math.round(s / 60)} minutes`;
}

async function doRun() {
  clearTimeout(timer);
  if (!configured() || paused) {
    setState(cfg.repo ? 'idle' : 'off', cfg.repo && !tokenNow() ? 'Turn text sync back on (or add a screenshot token) to sync screenshots.' : '');
    return;
  }
  // While the "synced copy was wiped" question is open, wait for the answer.
  if (sync.getState().status === 'decision') return;
  if (!navigator.onLine) {
    setState('offline', 'Offline. Screenshots will sync when you reconnect.');
    return;
  }
  const startToken = tokenNow();
  setState('working', 'Checking screenshots…', { done: 0, total: 0 });
  try {
    if (!cfg.branch) {
      const repo = await gh('');
      await saveCfg({ branch: BRANCH_RE.test(repo.default_branch || '') ? repo.default_branch : 'main' });
    }
    const { live, dead } = images.shotSets(store.allRecords());
    const local = new Set(await images.imageIds());
    const remote = await listRemote();
    const ups = [...local].filter((id) => live.has(id) && !remote.has(id));
    const downs = [...live].filter((id) => !local.has(id) && remote.has(id) && !badDownloads.has(id));
    const dels = [...dead].filter((id) => remote.has(id));
    const waiting = [...live].filter((id) => !local.has(id) && !remote.has(id)).length;
    const total = ups.length + downs.length + dels.length;
    let done = 0;
    const step = (msg) => setState('working', msg, { done, total, waiting });
    const stillOn = () => !paused && tokenNow() === startToken && configured();

    for (const id of ups) {
      if (!stillOn()) return;
      step(`Uploading screenshot ${done + 1} of ${total}…`);
      await upload(id);
      done++;
    }
    for (const id of downs) {
      if (!stillOn()) return;
      step(`Downloading screenshot ${done + 1} of ${total}…`);
      await download(id, remote.get(id));
      done++;
    }
    for (const id of dels) {
      if (!stillOn()) return;
      step(`Removing deleted screenshot ${done + 1} of ${total}…`);
      await removeRemote(id, remote.get(id));
      done++;
    }
    await images.gcLocal();
    failures = 0;
    const msg = waiting
      ? `${waiting} screenshot${waiting === 1 ? ' is' : 's are'} waiting for your other device to upload ${waiting === 1 ? 'it' : 'them'}.`
      : 'Screenshots are up to date.';
    setState('ok', msg, { done: total, total, waiting, remoteCount: remote.size + ups.length - dels.length, lastRunAt: nowISO() });
    if (waiting) schedule(60_000); // check again in a minute
  } catch (err) {
    failures++;
    const wait = err.retryAfter || Math.min(600, 30 * 2 ** (failures - 1));
    setState('error', `${err instanceof SyncError ? err.message : 'Screenshot sync hit a problem.'} Trying again in ${fmtWait(wait)}.`);
    schedule(wait * 1000);
  }
}

export function run() {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await doRun();
      } while (again && !paused);
    } finally {
      running = null;
    }
  })();
  return running;
}

export function schedule(delay = 1000) {
  if (!cfg.repo) return;
  clearTimeout(timer);
  timer = setTimeout(() => { run(); }, delay);
}

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

async function findOwner(token) {
  try {
    const u = await ghRequest(token, '/user');
    if (u && typeof u.login === 'string') return u.login;
  } catch { /* fall back to the Gist's owner */ }
  const gistId = sync.currentGistId();
  if (gistId) {
    try {
      const g = await ghRequest(token, `/gists/${gistId}`);
      if (g && g.owner && typeof g.owner.login === 'string') return g.owner.login;
    } catch { /* give up below */ }
  }
  throw new SyncError('Type the repository as yourname/cyber-logbook-data (your GitHub username, a slash, then the repository name).');
}

export async function connect(repoInput, separateToken = '') {
  const own = String(separateToken || '').trim();
  if (own && !TOKEN_RE.test(own)) throw new SyncError("That doesn't look like a GitHub token. Copy the whole thing; it starts with github_pat_.");
  const token = own || sync.currentToken();
  if (!token) throw new SyncError('Turn on text sync first (the section above), or paste a separate token for screenshots.');
  if (!navigator.onLine) throw new SyncError("You're offline. Connect to the internet to set up screenshot sync.");
  let name = String(repoInput || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!name) throw new SyncError('Type the name of your private repository, e.g. cyber-logbook-data.');
  if (!name.includes('/')) {
    if (!NAME_RE.test(name)) throw new SyncError("That repository name doesn't look right. It can only use letters, numbers, dots, dashes and underscores.");
    name = `${await findOwner(token)}/${name}`;
  }
  if (!REPO_RE.test(name) || /\/\.+$/.test(name)) throw new SyncError("That repository name doesn't look right. Use the form yourname/cyber-logbook-data.");
  let repo;
  try {
    repo = await ghRequest(token, `/repos/${name}`, { perm: 'contents' });
  } catch (err) {
    if (err.status === 404) {
      throw new SyncError(`Can't find ${name}. Check the name, and that the token can see it (Repository access → Only select repositories → ${name.split('/')[1]}).`, 404);
    }
    throw err;
  }
  if (repo.private !== true) {
    throw new SyncError(`${name} is public, so anyone could see your screenshots. Make it private on GitHub (the repository's Settings → Danger Zone → Change visibility), then try again.`);
  }
  const full = typeof repo.full_name === 'string' && REPO_RE.test(repo.full_name) ? repo.full_name : name;
  const branch = BRANCH_RE.test(repo.default_branch || '') ? repo.default_branch : 'main';
  await saveCfg({ repo: full, branch, token: own });
  failures = 0;
  badDownloads.clear();
  setState('idle', '', { done: 0, total: 0, waiting: 0, remoteCount: null });
  await run();
  return getState();
}

export async function disconnect() {
  clearTimeout(timer);
  await idle();
  await saveCfg({ repo: '', branch: '', token: '' });
  setState('off', '', { done: 0, total: 0, waiting: 0, remoteCount: null });
}

// Used by Reset, which wipes this device's storage but may still need these for "wipe synced copy" / Undo.
export const exportCredentials = () => ({ ...cfg });

export async function restoreCredentials(saved) {
  cfg = sanitize(saved);
  await db.kvSet(KV, cfg);
  setState(cfg.repo ? 'idle' : 'off');
}

// Removes every screenshot from the repository in one commit. (GitHub keeps old commits in the
// private repository's history; delete the repository on GitHub to remove those too.)
export async function wipeRemote(saved, textToken) {
  const c = sanitize(saved);
  const token = c.token || textToken;
  if (!c.repo || !token) return false;
  const req = (path, opts = {}) => ghRequest(token, `/repos/${c.repo}${path}`, { ...opts, perm: 'contents' });
  const branch = c.branch || (await req('')).default_branch || 'main';
  let ref;
  try {
    ref = await req(`/git/ref/heads/${encodeURIComponent(branch)}`);
  } catch (err) {
    if (err.status === 404 || err.status === 409) return true; // empty repository: nothing to wipe
    throw err;
  }
  const tree = await req('/git/trees', { method: 'POST', body: { tree: [{ path: 'README.md', mode: '100644', type: 'blob', content: README }] } });
  const commit = await req('/git/commits', { method: 'POST', body: { message: 'Remove all screenshots (Cyber Logbook reset)', tree: tree.sha, parents: [ref.object.sha] } });
  await req(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: { sha: commit.sha } });
  return true;
}
