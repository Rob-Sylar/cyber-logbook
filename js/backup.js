// Full backups (.zip with backup.json + images/), Markdown (.zip) export, import of old .json or new .zip
// backups, and handing files to the user (share sheet on phones where supported, otherwise a download).

import * as store from './store.js';
import * as images from './images.js';
import { buildBackup, isValidId, localDateISO, mergeEntryLists, pad2, parseBackup } from './model.js';
import { cheatSheetMarkdown, entryToMarkdown, indexMarkdown, noteName } from './markdown.js';

const MAX_JSON_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_BYTES = 1024 * 1024 * 1024;
const ZIP_IMAGE_RE = /(^|\/)images\/([A-Za-z0-9_-]{1,64})\.(webp|jpe?g|png)$/i;

export function stampedName(prefix, ext) {
  const d = new Date();
  return `${prefix}-${localDateISO(d)}-${pad2(d.getHours())}${pad2(d.getMinutes())}.${ext}`;
}

// Entries + settings only (the format the Gist uses too).
export function currentBackup() {
  return buildBackup({ entries: store.allRecords(), settings: store.getSettings() });
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function downloadJSON(obj, filename) {
  downloadBlob(new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' }), filename);
}

const isPhone = () => navigator.userAgentData?.mobile === true || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// Returns 'shared', 'downloaded' or 'cancelled'.
export async function deliverFile(blob, filename) {
  if (isPhone() && typeof navigator.canShare === 'function') {
    const file = new File([blob], filename, { type: blob.type });
    let shareable = false;
    try { shareable = navigator.canShare({ files: [file] }); } catch { shareable = false; }
    if (shareable) {
      try {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        // Anything else (e.g. no share target): fall back to a download.
      }
    }
  }
  downloadBlob(blob, filename);
  return 'downloaded';
}

let jszipLoading = null;
export function loadJSZip() {
  if (window.JSZip) return Promise.resolve(window.JSZip);
  jszipLoading ||= new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = 'vendor/jszip.min.js';
    el.onload = () => (window.JSZip ? resolve(window.JSZip) : reject(new Error('Zip library failed to start.')));
    el.onerror = () => {
      jszipLoading = null;
      reject(new Error("Couldn't load the zip library."));
    };
    document.head.append(el);
  });
  return jszipLoading;
}

const fileNameFor = (rec) => `${rec.id}.${images.EXT_FOR_TYPE[rec.type] || 'webp'}`;

// ---- Full backup: backup.json + images/ ---------------------------------------------------------
// A snapshot holds the Blobs in memory, so Reset can offer Undo without re-reading the file.
export async function fullSnapshot() {
  const json = currentBackup();
  const recs = await images.allImages();
  json.images = recs.map((r) => ({ id: r.id, file: `images/${fileNameFor(r)}`, type: r.type, w: r.w, h: r.h, size: r.size }));
  return { json, images: recs };
}

export async function snapshotToZip(snapshot) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  zip.file('backup.json', JSON.stringify(snapshot.json, null, 2));
  for (const r of snapshot.images) zip.file(`images/${fileNameFor(r)}`, r.blob, { binary: true, compression: 'STORE' });
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
}

export async function exportFullBackup() {
  const zip = await snapshotToZip(await fullSnapshot());
  return deliverFile(zip, stampedName('cyber-logbook-backup', 'zip'));
}

// Always a plain download (never the share sheet), so an automatic backup can't be cancelled by accident.
export async function downloadFullBackup(prefix) {
  const snapshot = await fullSnapshot();
  const filename = stampedName(prefix, 'zip');
  downloadBlob(await snapshotToZip(snapshot), filename);
  return { snapshot, filename };
}

export async function restoreSnapshot(snapshot) {
  const have = new Set(await images.imageIds());
  await images.putRecords(snapshot.images.filter((r) => !have.has(r.id)));
  const parsed = parseBackup(snapshot.json);
  if (parsed.ok) await mergeBackup(parsed, 'import');
}

// ---- Markdown for Obsidian ---------------------------------------------------------------------
export async function buildMarkdownZip({ includeFlags = false } = {}) {
  const JSZip = await loadJSZip();
  const zip = new JSZip();
  const root = zip.folder('Cyber Logbook');
  const entries = store.entries();
  const used = new Set(['cheat sheet', 'cyber logbook index']);
  const names = new Map();
  for (const e of entries) {
    const name = noteName(e, used);
    names.set(e.id, name);
    const shotFiles = new Map();
    for (const s of e.shots) {
      const rec = await images.getImage(s.id);
      if (!rec) continue;
      const file = fileNameFor(rec);
      root.file(`attachments/${file}`, rec.blob, { binary: true, compression: 'STORE' });
      shotFiles.set(s.id, file);
    }
    root.file(`Sessions/${name}.md`, entryToMarkdown(e, { includeFlags, shotFiles }));
  }
  root.file('Cheat sheet.md', cheatSheetMarkdown(entries, names));
  root.file('Cyber Logbook index.md', indexMarkdown(entries, names));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
}

export async function exportMarkdown(opts) {
  const blob = await buildMarkdownZip(opts);
  return deliverFile(blob, stampedName('cyber-logbook-markdown', 'zip'));
}

// ---- Import --------------------------------------------------------------------------------------
// Merge a parsed backup into what's on this device. Newer edits win, nothing is wiped.
export async function mergeBackup(parsed, source = 'import') {
  const local = store.allRecords();
  const localIds = new Set(local.map((e) => e.id));
  const { toSaveLocal } = mergeEntryLists(local, parsed.entries);
  const added = toSaveLocal.filter((e) => !localIds.has(e.id) && !e.deleted).length;
  const updated = toSaveLocal.filter((e) => localIds.has(e.id)).length;
  await store.applyMerged(toSaveLocal, source);
  if (parsed.settings && parsed.settings.updatedAt > store.getSettings().updatedAt) {
    await store.replaceSettings(parsed.settings, source);
  }
  return { added, updated, kept: parsed.entries.length - toSaveLocal.length, invalid: parsed.invalid || 0 };
}

async function isZip(file) {
  if (/\.zip$/i.test(file.name || '')) return true;
  try {
    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    return head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04;
  } catch {
    return false;
  }
}

// JSZip knows each file's unpacked size before unpacking; refuse anything absurd (zip bombs).
const unpackedSize = (f) => (f && f._data && Number.isFinite(f._data.uncompressedSize) ? f._data.uncompressedSize : 0);

async function importZip(file) {
  if (file.size > MAX_ZIP_BYTES) return { ok: false, error: 'That zip is too big (over 1 GB).' };
  const JSZip = await loadJSZip();
  let zip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    return { ok: false, error: "That zip file couldn't be opened, so nothing was imported." };
  }
  const jsonFile = zip.file(/(^|\/)backup\.json$/)[0];
  if (!jsonFile) return { ok: false, error: "That zip isn't a Cyber Logbook backup (there's no backup.json inside)." };
  if (unpackedSize(jsonFile) > MAX_JSON_BYTES) return { ok: false, error: 'The backup.json inside that zip is too big.' };
  const parsed = parseBackup(await jsonFile.async('string'), { assignIds: true });
  if (!parsed.ok) return parsed;

  const have = new Set(await images.imageIds());
  let restored = 0;
  let badImages = 0;
  for (const f of zip.file(ZIP_IMAGE_RE)) {
    const m = ZIP_IMAGE_RE.exec(f.name);
    const id = m[2];
    if (!isValidId(id) || have.has(id)) continue;
    if (unpackedSize(f) > images.MAX_INPUT_BYTES) { badImages++; continue; }
    const type = images.TYPE_FOR_EXT[m[3].toLowerCase()];
    try {
      await images.storeExisting(id, new Blob([await f.async('arraybuffer')], { type }));
      have.add(id);
      restored++;
    } catch {
      badImages++;
    }
  }
  return { ok: true, ...(await mergeBackup(parsed)), images: restored, badImages };
}

export async function importFile(file) {
  if (!file) return { ok: false, error: 'No file chosen.' };
  if (await isZip(file)) return importZip(file);
  if (file.size > MAX_JSON_BYTES) return { ok: false, error: 'That file is too big (over 50 MB).' };
  let text;
  try { text = await file.text(); } catch { return { ok: false, error: "Couldn't read that file." }; }
  const parsed = parseBackup(text, { assignIds: true });
  if (!parsed.ok) return parsed;
  return { ok: true, ...(await mergeBackup(parsed)), images: 0, badImages: 0 };
}
