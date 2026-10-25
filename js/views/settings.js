// Settings: theme, weekly goal, custom tags, GitHub Gist sync, export/import, storage and reset.

import * as store from '../store.js';
import * as sync from '../sync.js';
import * as backup from '../backup.js';
import { resetLocal, undoReset, wipeSyncedCopy } from '../reset.js';
import { getThemePref, setThemePref } from '../theme.js';
import { isStandalone } from '../pwa.js';
import { cleanLine } from '../model.js';
import { chip, confirmPanel, debounce, field, fmtDateTime, h, icon, pageHead, relTime, setError, toast } from '../ui.js';

export const title = 'Settings';

// These survive re-renders while the app is open (an import or reset refreshes this screen).
let resetSession = null;
let importMessage = { text: '', cls: 'form-msg' };

function section(titleText, id, ...children) {
  return h('section', { class: 'card settings-section', id: `s-${id}`, 'aria-labelledby': `s-${id}-h` },
    h('h2', { id: `s-${id}-h` }, titleText), ...children);
}

function ext(href, text) {
  return h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text, icon('external', { cls: 'icon-inline' }));
}

function themeSection() {
  const pref = getThemePref();
  const group = h('fieldset', { class: 'fieldset' },
    h('legend', { class: 'label' }, 'Theme'),
    h('div', { class: 'chips' }, [['system', 'Match my device'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => chip('radio', 'theme', v, l, pref === v))));
  group.addEventListener('change', (ev) => {
    if (ev.target.name === 'theme') setThemePref(ev.target.value);
  });
  return section('Appearance', 'appearance', group, h('p', { class: 'hint' }, 'The sun/moon button at the top switches quickly. Saved on this device only.'));
}

function goalSection() {
  const st = store.getSettings();
  const min = h('input', { type: 'number', class: 'input input-narrow', id: 'goal-min', min: '0', max: '100', step: '0.5', inputmode: 'decimal', value: String(st.goalMinHours) });
  const target = h('input', { type: 'number', class: 'input input-narrow', id: 'goal-target', min: '0.5', max: '100', step: '0.5', inputmode: 'decimal', value: String(st.goalTargetHours) });
  const saved = h('p', { class: 'hint', 'aria-live': 'polite' });
  const save = debounce(async () => {
    const mn = Number.parseFloat(min.value);
    const tg = Number.parseFloat(target.value);
    setError(min, '');
    setError(target, '');
    if (!(tg > 0 && tg <= 100)) { setError(target, 'Enter a target between 0.5 and 100 hours.'); return; }
    if (!(mn >= 0 && mn <= 100)) { setError(min, 'Enter a minimum between 0 and 100 hours.'); return; }
    if (mn > tg) { setError(min, "The minimum can't be more than the target."); return; }
    await store.updateSettings({ goalMinHours: mn, goalTargetHours: tg });
    saved.textContent = `Saved: ${mn}–${tg} hours a week.`;
  }, 600);
  min.addEventListener('input', save);
  target.addEventListener('input', save);
  return section('Weekly goal', 'goal',
    h('div', { class: 'form-grid' }, field('Minimum hours a week', min), field('Target hours a week', target)),
    saved,
    h('p', { class: 'hint' }, 'Stats shows your progress towards these each week (Monday to Sunday). Syncs to your other devices.'));
}

function tagsSection() {
  const list = h('ul', { class: 'tag-manage' });
  const input = h('input', { type: 'text', class: 'input', id: 'custom-tag', maxlength: '40', autocomplete: 'off', placeholder: 'e.g. Privilege escalation' });
  const add = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('plus'), 'Add');
  function paint() {
    const tags = store.getSettings().customTags;
    list.replaceChildren(...(tags.length ? tags.map((t) => {
      const rm = h('button', { type: 'button', class: 'icon-btn icon-btn-small', 'aria-label': `Remove tag ${t}` }, icon('x'));
      rm.addEventListener('click', async () => {
        await store.updateSettings({ customTags: store.getSettings().customTags.filter((x) => x !== t) });
        paint();
        input.focus();
      });
      return h('li', { class: 'tag' }, t, rm);
    }) : [h('li', { class: 'muted' }, 'No custom tags yet.')]));
  }
  async function addTag() {
    const t = cleanLine(input.value, 40);
    if (!t) return;
    const tags = store.getSettings().customTags;
    if (!tags.some((x) => x.toLowerCase() === t.toLowerCase())) await store.updateSettings({ customTags: [...tags, t] });
    input.value = '';
    paint();
  }
  add.addEventListener('click', addTag);
  input.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); addTag(); } });
  paint();
  return section('Your tags', 'tags',
    h('p', { class: 'hint' }, 'Built in: Networking, Linux, Windows, Web, Security basics, Blue team, Red team, Homelab. Add your own here or straight from the log form. Removing a tag here doesn\'t remove it from entries.'),
    list,
    h('div', { class: 'inline-add' }, h('label', { class: 'visually-hidden', for: 'custom-tag' }, 'New tag'), input, add));
}

function tokenHelp() {
  return h('details', { class: 'help' },
    h('summary', null, 'How to make the GitHub token (about 5 minutes)'),
    h('ol', { class: 'steps' },
      h('li', null, 'Sign in to GitHub (make a free account at ', ext('https://github.com/signup', 'github.com/signup'), ' if you need one).'),
      h('li', null, 'Open ', ext('https://github.com/settings/personal-access-tokens/new', 'github.com/settings/personal-access-tokens/new'),
        '. (The long way: your profile picture → Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token.)'),
      h('li', null, 'Token name: ', h('strong', null, 'Cyber Logbook PC'), ' (or ', h('strong', null, 'Cyber Logbook phone'), '). Expiration: 1 year, and put a reminder in your calendar to make a new one before it runs out.'),
      h('li', null, 'Repository access: leave it on ', h('strong', null, 'Public repositories'), ' (read-only). The app doesn\'t need any repository.'),
      h('li', null, 'Permissions: under ', h('strong', null, 'Account permissions'), ', set ', h('strong', null, 'Gists'), ' to ', h('strong', null, 'Read and write'), '. (On the newer layout: click ', h('strong', null, 'Add permissions'), ', tick Gists, then choose Read and write.) Leave everything else on No access.'),
      h('li', null, 'Click ', h('strong', null, 'Generate token'), ' and copy it. It starts with ', h('code', null, 'github_pat_'), '. GitHub only shows it once.'),
      h('li', null, 'Paste it below and press ', h('strong', null, 'Connect and sync'), '. Do the same on your other device, ideally with its own token, so you can cancel one without the other.')),
    h('p', { class: 'hint' }, 'The token can only touch your Gists. It is stored on this device only and is never shown again, exported or included in backups.'));
}

function syncSection(cleanups) {
  const wrap = h('div', { class: 'sync-wrap' });
  const statusLine = h('p', { class: 'sync-status', 'aria-live': 'polite' });

  function paintStatus(st = sync.getState()) {
    statusLine.className = `sync-status is-${st.status}`;
    const last = st.lastSyncAt ? `Last synced ${relTime(st.lastSyncAt)}.` : 'Not synced yet.';
    if (st.status === 'error') statusLine.textContent = `Problem: ${st.message} ${last}`;
    else if (st.status === 'syncing') statusLine.textContent = 'Syncing…';
    else if (st.status === 'offline') statusLine.textContent = `Offline. ${last} Changes will sync when you reconnect.`;
    else if (st.status === 'decision') statusLine.textContent = 'Waiting for you: see the yellow message at the top of the page.';
    else statusLine.textContent = `${st.message && st.status === 'ok' ? `${st.message}. ` : ''}${last}`.replace('..', '.');
  }

  function setupUI() {
    const token = h('input', { type: 'password', class: 'input mono', id: 'sync-token', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'github_pat_…' });
    const show = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-pressed': 'false', 'aria-controls': 'sync-token' }, icon('eye'), 'Show');
    show.addEventListener('click', () => {
      const on = token.type === 'password';
      token.type = on ? 'text' : 'password';
      show.setAttribute('aria-pressed', String(on));
      show.replaceChildren(icon(on ? 'eyeOff' : 'eye'), on ? 'Hide' : 'Show');
    });
    const gist = h('input', { type: 'text', class: 'input mono', id: 'sync-gist', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'Leave blank: it is found or created for you' });
    const msg = h('p', { class: 'form-msg', 'aria-live': 'polite' });
    const connect = h('button', { type: 'button', class: 'btn btn-primary' }, icon('sync'), 'Connect and sync');
    connect.addEventListener('click', async () => {
      connect.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = 'Checking the token with GitHub…';
      try {
        await sync.connect(token.value, gist.value);
        token.value = '';
        toast('Sync is on for this device', { type: 'success' });
        build();
      } catch (err) {
        msg.className = 'form-msg is-error';
        msg.textContent = err && err.message ? err.message : 'Could not connect.';
        token.focus();
      } finally {
        connect.disabled = false;
      }
    });
    return h('div', null,
      h('p', null, 'Keep your PC and phone in step for free. The app saves one JSON file in a ', h('strong', null, 'secret Gist'), ' on your GitHub account and merges changes from both devices by entry, newest edit wins.'),
      tokenHelp(),
      h('div', { class: 'field' },
        h('label', { class: 'label', for: 'sync-token' }, 'GitHub token (Gists: read and write)'),
        h('div', { class: 'input-with-btn' }, token, show)),
      h('details', { class: 'help' }, h('summary', null, 'Advanced: use a specific Gist'),
        field('Gist ID', gist, { hint: 'Only needed if automatic finding picks the wrong one. It is the long code at the end of the Gist\'s address.' })),
      h('div', { class: 'btn-row' }, connect),
      msg);
  }

  function connectedUI(st) {
    const now = h('button', { type: 'button', class: 'btn btn-primary' }, icon('sync'), 'Sync now');
    now.addEventListener('click', async () => {
      now.disabled = true;
      await sync.syncNow();
      now.disabled = false;
      const after = sync.getState();
      if (after.status === 'ok') toast(after.message || 'Synced', { type: 'success', timeout: 2500 });
    });
    const autoId = 'sync-auto';
    const auto = h('input', { type: 'checkbox', id: autoId, checked: st.auto });
    auto.addEventListener('change', async () => {
      await sync.setAuto(auto.checked);
      if (auto.checked) sync.syncNow();
    });
    const confirmSlot = h('div');
    const disconnect = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Disconnect this device');
    disconnect.addEventListener('click', () => {
      confirmSlot.replaceChildren(confirmPanel({
        title: 'Disconnect sync on this device?',
        message: 'The token is removed from this device. Your entries stay here and in the Gist. To reconnect you will need to paste a token again.',
        confirmLabel: 'Disconnect',
        danger: false,
        onConfirm: async () => {
          await sync.disconnect();
          toast('Sync turned off on this device');
          build();
        },
        onCancel: () => { confirmSlot.replaceChildren(); disconnect.focus(); },
      }));
    });
    paintStatus(st);
    return h('div', null,
      h('p', { class: 'sync-connected' }, icon('cloudOk'), h('strong', null, 'Sync is on for this device.')),
      statusLine,
      h('div', { class: 'btn-row' }, now, st.gistUrl ? h('a', { class: 'btn btn-ghost', href: st.gistUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'View the Gist') : null),
      h('label', { class: 'check', for: autoId }, auto, h('span', null, 'Sync automatically: when the app opens, when you come back to it, and after each save')),
      h('p', { class: 'hint' }, 'Secret Gists are unlisted, not encrypted: anyone with the exact Gist link could read it. Don\'t share the link, and never store real-life passwords in the app.'),
      h('div', { class: 'btn-row' }, disconnect),
      confirmSlot);
  }

  function build() {
    const st = sync.getState();
    wrap.replaceChildren(st.connected ? connectedUI(st) : setupUI());
  }

  let wasConnected = sync.getState().connected;
  cleanups.push(sync.onChange((st) => {
    if (st.connected !== wasConnected) {
      wasConnected = st.connected;
      build();
    } else {
      paintStatus(st);
    }
  }));
  const ticker = setInterval(() => { if (sync.getState().connected) paintStatus(); }, 30_000);
  cleanups.push(() => clearInterval(ticker));
  build();
  return section('Sync between devices (GitHub Gist)', 'sync', wrap);
}

function reportDelivery(result, what) {
  if (result === 'shared') toast(`${what} shared`, { type: 'success' });
  else if (result === 'downloaded') toast(`${what} saved to your Downloads folder`, { type: 'success' });
}

function backupSection() {
  const flagsId = 'md-flags';
  const includeFlags = h('input', { type: 'checkbox', id: flagsId });
  const md = h('button', { type: 'button', class: 'btn btn-primary' }, icon('download'), 'Export Markdown (.zip)');
  md.addEventListener('click', async () => {
    md.disabled = true;
    try {
      reportDelivery(await backup.exportMarkdown({ includeFlags: includeFlags.checked }), 'Markdown export');
    } catch (err) {
      toast(`Export failed: ${err.message}`, { type: 'error' });
    } finally {
      md.disabled = false;
    }
  });
  const json = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('download'), 'Export JSON backup');
  json.addEventListener('click', async () => {
    json.disabled = true;
    try {
      reportDelivery(await backup.exportJSON(), 'Backup');
    } catch (err) {
      toast(`Backup failed: ${err.message}`, { type: 'error' });
    } finally {
      json.disabled = false;
    }
  });
  const file = h('input', { type: 'file', accept: '.json,application/json', id: 'import-file', class: 'file-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  const importBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('upload'), 'Import JSON backup…');
  const result = h('p', { class: importMessage.cls, id: 'import-result', 'aria-live': 'polite' }, importMessage.text);
  const say = (text, cls) => {
    importMessage = { text, cls: `form-msg ${cls}`.trim() };
    // The import may have redrawn the screen, so update whichever copy is on the page now.
    const el = document.getElementById('import-result') || result;
    el.className = importMessage.cls;
    el.textContent = text;
  };
  importBtn.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    say(`Importing ${f.name}…`, '');
    try {
      const r = await backup.importFile(f);
      if (!r.ok) {
        say(r.error, 'is-error');
        return;
      }
      say(`Imported ${f.name}: ${r.added} new, ${r.updated} updated, ${r.kept} already up to date${r.invalid ? `, ${r.invalid} skipped because they were damaged` : ''}.`, 'is-ok');
      toast('Import finished', { type: 'success' });
    } catch {
      say('Something went wrong reading that file. Nothing was changed.', 'is-error');
    }
  });
  return section('Backup and export', 'backup',
    h('h3', null, 'Markdown for Obsidian'),
    h('p', { class: 'hint' }, 'One .md file per entry with YAML front-matter, plus a cheat sheet and an index. Unzip it into your Obsidian vault.'),
    h('label', { class: 'check', for: flagsId }, includeFlags, h('span', null, 'Include level passwords / flags')),
    h('div', { class: 'btn-row' }, md),
    h('h3', null, 'Full backup'),
    h('p', { class: 'hint' }, 'A JSON file with everything (your sync token is never included). Importing merges by entry, so it never wipes newer work. On Android your browser\'s share sheet opens if it supports that file type; otherwise the file goes to Downloads.'),
    h('div', { class: 'btn-row' }, json, importBtn, file),
    result);
}

function storageSection() {
  const info = h('p', { class: 'hint' }, 'Checking…');
  (async () => {
    const n = store.count();
    let persisted = null;
    let usage = '';
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch { /* unsupported */ }
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      if (est && est.usage) usage = ` Using about ${(est.usage / 1024 / 1024).toFixed(1)} MB.`;
    } catch { /* unsupported */ }
    let version = '';
    try {
      const keys = window.caches ? await caches.keys() : [];
      const k = keys.find((x) => x.startsWith('cyber-logbook-'));
      if (k) version = ` App version ${k.replace('cyber-logbook-', '')}.`;
    } catch { /* no cache API */ }
    const p = persisted === true ? 'Storage is marked as persistent, so the browser won\'t clear it to save space.'
      : persisted === false ? 'The browser may clear storage if the device runs very low on space. Installing the app and syncing (or regular backups) protects you.'
        : '';
    info.textContent = `${n} entr${n === 1 ? 'y' : 'ies'} on this device. ${p}${usage}${version}`;
  })();
  const installLink = h('a', { href: '#/install' }, isStandalone() ? 'You are using the installed app.' : 'How to install the app on this device');
  return section('This device', 'device', info, h('p', null, installLink));
}

function resetSection() {
  const body = h('div');
  const paint = () => body.replaceChildren(...resetContent());

  function resetContent() {
    if (!resetSession) {
      const btn = h('button', { type: 'button', class: 'btn btn-danger' }, icon('trash'), 'Reset all local data…');
      btn.addEventListener('click', () => { resetSession = { step: 'confirm' }; paint(); });
      return [h('p', null, 'Deletes every entry, draft and setting on this device. A backup file is saved automatically first, so you can undo it.'), btn];
    }
    if (resetSession.step === 'confirm') {
      const n = store.count();
      return [confirmPanel({
        title: `Wipe all ${n} entr${n === 1 ? 'y' : 'ies'} from this device?`,
        message: 'First a backup file (cyber-logbook-before-reset-….json) is saved to your Downloads. Then everything on this device is deleted, including the sync token. Your synced copy is not touched unless you choose that next.',
        confirmLabel: 'Back up, then wipe this device',
        requireText: 'RESET',
        onConfirm: async () => {
          resetSession = { step: 'working' };
          try {
            const r = await resetLocal();
            resetSession = { step: 'done', ...r, remote: null, remoteError: '' };
          } catch (err) {
            resetSession = null;
            toast(`Reset failed: ${err.message}`, { type: 'error' });
          }
          // The wipe refreshes the screen, so rebuild it in its final state.
          window.dispatchEvent(new HashChangeEvent('hashchange'));
        },
        onCancel: () => { resetSession = null; paint(); body.querySelector('button')?.focus(); },
      })];
    }
    if (resetSession.step === 'working') return [h('p', { role: 'status' }, 'Saving a backup and wiping this device…')];
    // step: done
    const out = [
      h('h3', { tabindex: '-1' }, icon('check'), 'This device has been reset.'),
      h('p', null, 'Backup saved as ', h('code', null, resetSession.filename), '. To restore it later: Settings → Import JSON backup.'),
    ];
    const undo = h('button', { type: 'button', class: 'btn btn-primary' }, 'Undo reset');
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      try {
        await undoReset({ backup: resetSession.backup, savedSync: resetSession.savedSync, remoteResetAt: resetSession.remote?.resetAt || null });
        resetSession = null;
        toast('Everything is back.', { type: 'success' });
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      } catch (err) {
        undo.disabled = false;
        toast(`Undo failed: ${err.message}. Use Import JSON backup with the saved file instead.`, { type: 'error' });
      }
    });
    const hadSync = !!(resetSession.savedSync && resetSession.savedSync.token);
    if (hadSync && !resetSession.remote) {
      const keep = h('button', { type: 'button', class: 'btn btn-ghost' }, 'No, keep the synced copy');
      const wipe = h('button', { type: 'button', class: 'btn btn-danger' }, 'Yes, wipe the synced copy too');
      keep.addEventListener('click', () => { resetSession.remote = { skipped: true }; paint(); });
      wipe.addEventListener('click', async () => {
        keep.disabled = wipe.disabled = true;
        try {
          const r = await wipeSyncedCopy(resetSession.savedSync);
          resetSession.remote = r;
          resetSession.remoteError = '';
        } catch (err) {
          resetSession.remoteError = err.message;
        }
        paint();
      });
      out.push(h('div', { class: 'confirm-panel is-danger', role: 'group', 'aria-labelledby': 'wipe-q' },
        h('p', { class: 'confirm-title', id: 'wipe-q' }, 'Also wipe the synced copy?'),
        h('p', { class: 'confirm-msg' }, 'This empties the Gist that your devices sync through (a backup of it is downloaded first). Your other devices keep their own data and will ask you what to do next time they sync. If you say no, reconnect sync later to pull everything back.'),
        resetSession.remoteError ? h('p', { class: 'form-msg is-error' }, resetSession.remoteError) : null,
        h('div', { class: 'btn-row' }, keep, wipe)));
    } else if (resetSession.remote && !resetSession.remote.skipped) {
      out.push(h('p', null, 'The synced copy was wiped too.',
        resetSession.remote.filename ? [' Its backup was saved as ', h('code', null, resetSession.remote.filename), '.'] : ''));
    } else if (resetSession.remote?.skipped) {
      out.push(h('p', null, 'The synced copy was left alone. Reconnect sync on this device to pull everything back down.'));
    }
    const dismiss = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Done');
    dismiss.addEventListener('click', () => { resetSession = null; window.dispatchEvent(new HashChangeEvent('hashchange')); });
    out.push(h('div', { class: 'btn-row' }, undo, dismiss));
    return out;
  }

  paint();
  return section('Reset', 'reset', body);
}

export function render(page) {
  const cleanups = [];
  page.append(pageHead('Settings'),
    themeSection(),
    goalSection(),
    tagsSection(),
    syncSection(cleanups),
    backupSection(),
    storageSection(),
    resetSection(),
    h('p', { class: 'small muted about' }, 'Cyber Logbook is free and open source. Your data lives on your devices and in your own GitHub Gist, nowhere else.'));
  if (resetSession) {
    setTimeout(() => {
      page.querySelector('#s-reset')?.scrollIntoView({ block: 'start' });
      page.querySelector('#s-reset h3')?.focus({ preventScroll: true });
    }, 0);
  }
  return () => cleanups.forEach((fn) => fn());
}
