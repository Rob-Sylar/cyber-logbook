// JSON backup, Markdown (.zip) export, JSON import, and handing files to the user
// (share sheet on phones where the browser supports it, otherwise a normal download).

import * as store from './store.js';
import { buildBackup, localDateISO, mergeEntryLists, pad2, parseBackup } from './model.js';
import { cheatSheetMarkdown, entryToMarkdown, indexMarkdown, noteName } from './markdown.js';

export function stampedName(prefix, ext) {
  const d = new Date();
  return `${prefix}-${localDateISO(d)}-${pad2(d.getHours())}${pad2(d.getMinutes())}.${ext}`;
}

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
  setTimeout(() => URL.revokeObjectURL(url), 30000);
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

export function exportJSON() {
  const blob = new Blob([JSON.stringify(currentBackup(), null, 2)], { type: 'application/json' });
  return deliverFile(blob, stampedName('cyber-logbook-backup', 'json'));
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
    root.file(`Sessions/${name}.md`, entryToMarkdown(e, { includeFlags }));
  }
  root.file('Cheat sheet.md', cheatSheetMarkdown(entries, names));
  root.file('Cyber Logbook index.md', indexMarkdown(entries, names));
  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/zip' });
}

export async function exportMarkdown(opts) {
  const blob = await buildMarkdownZip(opts);
  return deliverFile(blob, stampedName('cyber-logbook-markdown', 'zip'));
}

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

export async function importFile(file) {
  if (!file) return { ok: false, error: 'No file chosen.' };
  if (file.size > 50 * 1024 * 1024) return { ok: false, error: 'That file is too big (over 50 MB).' };
  let text;
  try { text = await file.text(); } catch { return { ok: false, error: "Couldn't read that file." }; }
  const parsed = parseBackup(text, { assignIds: true });
  if (!parsed.ok) return parsed;
  return { ok: true, ...(await mergeBackup(parsed)) };
}
