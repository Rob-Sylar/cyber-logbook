// A tiny promise wrapper around IndexedDB (no library needed).
// Stores: "entries" (keyed by entry.id), "kv" (settings, drafts, sync config)
// and, since version 2, "images" (screenshot Blobs keyed by image id, kept apart from entry text).

const DB_NAME = 'cyber-logbook';
const DB_VERSION = 2;
let dbPromise = null;

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in self)) {
      reject(new Error('This browser has no IndexedDB storage.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    // Upgrades only ever add stores, so entries saved by older versions carry over untouched.
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      dbPromise = null;
      reject(req.error || new Error('Could not open storage.'));
    };
  });
  return dbPromise;
}

function write(storeNames, work) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, 'readwrite');
    work(tx);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Storage write was cancelled.'));
  }));
}

export async function getAll(storeName) {
  const db = await openDB();
  return promisify(db.transaction(storeName).objectStore(storeName).getAll());
}

export async function getOne(storeName, key) {
  const db = await openDB();
  return promisify(db.transaction(storeName).objectStore(storeName).get(key));
}

export async function getAllKeys(storeName) {
  const db = await openDB();
  return promisify(db.transaction(storeName).objectStore(storeName).getAllKeys());
}

export function putMany(storeName, values) {
  return write([storeName], (tx) => {
    const os = tx.objectStore(storeName);
    for (const v of values) os.put(v);
  });
}

export function deleteMany(storeName, keys) {
  return write([storeName], (tx) => {
    const os = tx.objectStore(storeName);
    for (const k of keys) os.delete(k);
  });
}

export async function kvGet(key) {
  const db = await openDB();
  return promisify(db.transaction('kv').objectStore('kv').get(key));
}

export function kvSet(key, value) {
  return write(['kv'], (tx) => tx.objectStore('kv').put(value, key));
}

export function kvDel(key) {
  return write(['kv'], (tx) => tx.objectStore('kv').delete(key));
}

export function clearAll() {
  return write(['entries', 'kv', 'images'], (tx) => {
    tx.objectStore('entries').clear();
    tx.objectStore('kv').clear();
    tx.objectStore('images').clear();
  });
}
