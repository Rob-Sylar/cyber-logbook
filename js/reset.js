// "Reset all local data", with an automatic backup first (entries + screenshots) and an undo.

import * as db from './db.js';
import * as store from './store.js';
import * as sync from './sync.js';
import * as imagesync from './imagesync.js';
import { clearCache } from './images.js';
import { downloadFullBackup, downloadJSON, restoreSnapshot, stampedName } from './backup.js';

function clearLocalPrefs() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('cl-')) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}

export async function resetLocal() {
  const { snapshot, filename } = await downloadFullBackup('cyber-logbook-before-reset');
  const savedSync = sync.exportCredentials();
  const savedImageSync = imagesync.exportCredentials();
  sync.pause();
  imagesync.pause();
  await sync.idle();
  await imagesync.idle();
  await db.clearAll();
  clearLocalPrefs();
  clearCache();
  store.clearMemory();
  await sync.init();
  await imagesync.init();
  sync.resume();
  imagesync.resume();
  return { backup: snapshot, filename, savedSync, savedImageSync };
}

// Empties the Gist (leaving a "wiped" marker for your other devices) and the screenshot repository.
export async function wipeSyncedCopy(savedSync, savedImageSync) {
  const result = await sync.wipeRemote(savedSync);
  let filename = '';
  if (result.remote) {
    filename = stampedName('cyber-logbook-synced-copy-before-wipe', 'json');
    downloadJSON(result.remote, filename);
  }
  let imagesWiped = false;
  if (savedImageSync && savedImageSync.repo) imagesWiped = await imagesync.wipeRemote(savedImageSync, savedSync && savedSync.token);
  return { ...result, filename, imagesWiped };
}

// Puts everything back from the in-memory backup. If the synced copy was wiped too,
// reconnecting re-uploads the restored entries and screenshots.
export async function undoReset({ backup, savedSync, savedImageSync, remoteResetAt = null }) {
  await restoreSnapshot(backup);
  if (savedImageSync && savedImageSync.repo) await imagesync.restoreCredentials(savedImageSync);
  if (savedSync && savedSync.token) {
    await sync.restoreCredentials(savedSync, remoteResetAt ? { knownResetAt: remoteResetAt } : {});
    await sync.syncNow();
  }
}
