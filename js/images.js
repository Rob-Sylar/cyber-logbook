// Screenshot images: decoding, redaction, compression, storage in IndexedDB and clean-up.
// Entries only hold references ({ id, caption, w, h }); the Blobs live in the "images" store.

import * as db from './db.js';
import * as store from './store.js';
import { newId, nowISO } from './model.js';

export const MAX_WIDTH = 1920;
const MAX_HEIGHT = 12000; // very tall scrolling screenshots are scaled down to stay under canvas limits
const QUALITY = 0.9; // keeps small terminal text sharp
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
// graceMs: deleted images are kept this long so Undo still works.
// writeGapMs: pause between uploads/deletes so GitHub's rate limits are never hit.
// (Exported as an object only so the automated tests can shorten them.)
export const tuning = { graceMs: 2 * 60 * 1000, writeGapMs: 800 };

export const EXT_FOR_TYPE = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };
export const TYPE_FOR_EXT = { webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };

const listeners = new Set();

// fn({ added: [ids], removed: [ids], reset: bool }). Pass an AbortSignal to unsubscribe automatically.
export function onImagesChanged(fn, signal) {
  listeners.add(fn);
  const off = () => listeners.delete(fn);
  if (signal) signal.addEventListener('abort', off, { once: true });
  return off;
}

function emit(change) {
  for (const fn of listeners) {
    try { fn(change); } catch (err) { console.error(err); }
  }
}

export function looksLikeImage(file) {
  return !!file && (/^image\//.test(file.type || '') || /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(file.name || ''));
}

// Returns { source, width, height, close() }. Camera photos are turned the right way up.
export async function decodeImage(blob) {
  if (!blob || blob.size === 0) throw new Error('That image is empty.');
  if (blob.size > MAX_INPUT_BYTES) throw new Error('That image is bigger than 40 MB.');
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bmp, width: bmp.width, height: bmp.height, close: () => bmp.close() };
    } catch { /* fall back to <img> below */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => {} };
  } catch {
    throw new Error("That file isn't an image this browser can open.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Output size: never wider than 1920 px, aspect ratio kept.
export function outputSize(width, height) {
  const scale = Math.min(1, MAX_WIDTH / width, MAX_HEIGHT / height);
  return { w: Math.max(1, Math.round(width * scale)), h: Math.max(1, Math.round(height * scale)) };
}

// Draws the image at output size with solid black boxes burned in. White underneath, so
// transparent areas don't turn black if we have to fall back to JPEG.
export function paint(ctx, source, w, h, rects = []) {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);
  ctx.fillStyle = '#000000';
  for (const r of rects) ctx.fillRect(r.x, r.y, r.w, r.h);
}

const toBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

// WebP where the browser can make it, otherwise JPEG. Re-encoding also strips EXIF data such as GPS location.
export async function encodeCanvas(canvas) {
  let blob = await toBlob(canvas, 'image/webp', QUALITY);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', QUALITY);
  if (!blob) throw new Error("Couldn't compress that image.");
  return blob;
}

// Decode → resize → black boxes → compress. Used by the redact screen and by tests.
export async function processImage(file, rects = []) {
  const img = await decodeImage(file);
  try {
    const { w, h } = outputSize(img.width, img.height);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    paint(canvas.getContext('2d'), img.source, w, h, rects);
    return { blob: await encodeCanvas(canvas), w, h };
  } finally {
    img.close();
  }
}

let persistAsked = false;
function askPersistOnce() {
  if (persistAsked || !navigator.storage || !navigator.storage.persist) return;
  persistAsked = true;
  navigator.storage.persist().catch(() => {});
}

export async function storeImage(blob, w, h) {
  const rec = { id: newId('s'), blob, type: blob.type, w, h, size: blob.size, createdAt: nowISO() };
  await db.putMany('images', [rec]);
  emit({ added: [rec.id] });
  askPersistOnce();
  return rec;
}

// For images arriving from sync or a backup: checks it really is an image before keeping it.
export async function storeExisting(id, blob) {
  if (blob.size > MAX_INPUT_BYTES) throw new Error('Image too big');
  const img = await decodeImage(blob);
  img.close();
  const rec = { id, blob, type: blob.type, w: img.width, h: img.height, size: blob.size, createdAt: nowISO() };
  await db.putMany('images', [rec]);
  emit({ added: [id] });
  return rec;
}

export async function putRecords(recs) {
  if (!recs.length) return;
  await db.putMany('images', recs);
  emit({ added: recs.map((r) => r.id) });
}

export const getImage = (id) => db.getOne('images', id);
export const imageIds = () => db.getAllKeys('images');
export const allImages = () => db.getAll('images');

// ---- Object URLs for <img> tags (cached, freed when an image is deleted) -------------------
const urls = new Map();

export async function imageUrl(id) {
  if (urls.has(id)) return urls.get(id);
  const rec = await getImage(id);
  if (!rec || !rec.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  urls.set(id, url);
  return url;
}

function forget(ids) {
  for (const id of ids) {
    const u = urls.get(id);
    if (u) URL.revokeObjectURL(u);
    urls.delete(id);
  }
}

export async function deleteImages(ids) {
  if (!ids.length) return;
  await db.deleteMany('images', ids);
  forget(ids);
  emit({ removed: ids });
}

// After a reset: storage is already empty, just drop cached URLs.
export function clearCache() {
  forget([...urls.keys()]);
  emit({ reset: true });
}

export async function storageSummary() {
  const recs = await allImages();
  return { count: recs.length, bytes: recs.reduce((n, r) => n + (r.size || (r.blob && r.blob.size) || 0), 0) };
}

// ---- Which images are needed --------------------------------------------------------------
// live: attached to an entry. dead: deleted from an entry (or with its entry) over graceMs ago.
// Images that are in neither set (e.g. in an unsaved draft) are never touched.
export function shotSets(records, now = Date.now()) {
  const live = new Set();
  const dead = new Set();
  for (const e of records) if (!e.deleted) for (const s of e.shots) live.add(s.id);
  for (const e of records) {
    if (now - Date.parse(e.updatedAt) < tuning.graceMs) continue;
    for (const id of e.deletedShots || []) if (!live.has(id)) dead.add(id);
  }
  return { live, dead };
}

export async function gcLocal({ now = Date.now() } = {}) {
  const { dead } = shotSets(store.allRecords(), now);
  if (!dead.size) return [];
  const local = await imageIds();
  const gone = local.filter((id) => dead.has(id));
  await deleteImages(gone);
  return gone;
}
