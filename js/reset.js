// "Reset all local data", with an automatic backup first and an undo.

import * as db from './db.js';
import * as store from './store.js';
import * as sync from './sync.js';
import { currentBackup, downloadJSON, mergeBackup, stampedName } from './backup.js';
import { parseBackup } from './model.js';

function clearLocalPrefs() {
  try {
    for (const k of Object.keys(localStorage)) if (k.startsWith('cl-')) localStorage.removeItem(k);
  } catch { /* storage blocked */ }
}

// Always a plain download (never the share sheet), so the backup can't be cancelled by accident.
export async function resetLocal() {
  const backup = currentBackup();
  const filename = stampedName('cyber-logbook-before-reset', 'json');
  downloadJSON(backup, filename);
  const savedSync = sync.exportCredentials();
  sync.pause();
  await sync.idle();
  await db.clearAll();
  clearLocalPrefs();
  store.clearMemory();
  await sync.init();
  sync.resume();
  return { backup, filename, savedSync };
}

export async function wipeSyncedCopy(savedSync) {
  const result = await sync.wipeRemote(savedSync);
  let filename = '';
  if (result.remote) {
    filename = stampedName('cyber-logbook-synced-copy-before-wipe', 'json');
    downloadJSON(result.remote, filename);
  }
  return { ...result, filename };
}

// Puts everything back from the in-memory backup. If the synced copy was wiped too,
// reconnecting re-uploads the restored entries.
export async function undoReset({ backup, savedSync, remoteResetAt = null }) {
  const parsed = parseBackup(backup);
  if (parsed.ok) await mergeBackup(parsed, 'import');
  if (savedSync && savedSync.token) {
    await sync.restoreCredentials(savedSync, remoteResetAt ? { knownResetAt: remoteResetAt } : {});
    await sync.syncNow();
  }
}
