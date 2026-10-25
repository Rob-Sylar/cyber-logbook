// In-memory copy of everything in IndexedDB, plus change notifications.
// Views read from here; every write goes to IndexedDB first, then memory, then listeners.

import * as db from './db.js';
import { DEFAULT_TAGS, newId, normalizeEntry, normalizeSettings, nowISO, tombstone } from './model.js';
import { byNewest } from './derive.js';

const records = new Map(); // id -> entry (tombstones included, so deletes can sync)
let settings = normalizeSettings(null);
const listeners = new Set();

export async function init() {
  const [rows, s] = await Promise.all([db.getAll('entries'), db.kvGet('settings')]);
  records.clear();
  for (const r of rows) {
    const e = normalizeEntry(r);
    if (e) records.set(e.id, e);
  }
  settings = normalizeSettings(s);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// source: 'local' (edited here), 'sync', 'import' or 'reset'
function emit(type, source) {
  for (const fn of listeners) {
    try { fn({ type, source }); } catch (err) { console.error(err); }
  }
}

export const entries = () => [...records.values()].filter((e) => !e.deleted).sort(byNewest);
export const allRecords = () => [...records.values()];
export const count = () => entries().length;

export function get(id) {
  const e = records.get(id);
  return e && !e.deleted ? e : null;
}

// Makes sure an edit is always "newer" than what it replaces, even if the clock went backwards.
function nextStamp(prev) {
  const now = Date.now();
  const before = prev ? Date.parse(prev.updatedAt) : 0;
  return new Date(Math.max(now, before + 1)).toISOString();
}

export async function save(raw) {
  const id = raw.id || newId();
  const prev = records.get(id);
  const updatedAt = nextStamp(prev);
  const e = normalizeEntry({ ...raw, id, createdAt: prev?.createdAt || updatedAt, updatedAt, deleted: false });
  if (!e) throw new Error('That entry could not be saved.');
  await db.putMany('entries', [e]);
  records.set(e.id, e);
  emit('entries', 'local');
  return e;
}

export async function remove(id) {
  const prev = records.get(id);
  if (!prev || prev.deleted) return null;
  const t = tombstone(prev, nextStamp(prev));
  await db.putMany('entries', [t]);
  records.set(id, t);
  emit('entries', 'local');
  return prev;
}

// Entries already normalized and merged (from sync or import).
export async function applyMerged(list, source) {
  if (!list.length) return;
  await db.putMany('entries', list);
  for (const e of list) records.set(e.id, e);
  emit('entries', source);
}

export async function hardDelete(ids, source) {
  if (!ids.length) return;
  await db.deleteMany('entries', ids);
  for (const id of ids) records.delete(id);
  emit('entries', source);
}

export const getSettings = () => settings;

export async function updateSettings(patch) {
  const next = normalizeSettings({ ...settings, ...patch, updatedAt: nowISO() });
  await db.kvSet('settings', next);
  settings = next;
  emit('settings', 'local');
  return next;
}

export async function replaceSettings(next, source) {
  const clean = normalizeSettings(next);
  await db.kvSet('settings', clean);
  settings = clean;
  emit('settings', source);
}

// After the database has been wiped.
export function clearMemory() {
  records.clear();
  settings = normalizeSettings(null);
  emit('reset', 'reset');
}

// Built-in tags, then your custom ones, then any others found in entries (e.g. from an import).
export function allTags() {
  const out = [];
  const seen = new Set();
  const add = (t) => {
    if (!seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); }
  };
  DEFAULT_TAGS.forEach(add);
  settings.customTags.forEach(add);
  const used = new Set();
  for (const e of entries()) e.tags.forEach((t) => used.add(t));
  [...used].sort((a, b) => a.localeCompare(b)).forEach(add);
  return out;
}

export function openQuestionCount() {
  let n = 0;
  for (const e of entries()) n += e.questions.filter((q) => !q.solved).length;
  return n;
}
