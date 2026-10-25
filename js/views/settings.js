// Settings: theme, weekly goal, custom tags, GitHub Gist sync, export/import, storage and reset.

import * as store from '../store.js';
import * as sync from '../sync.js';
import * as imagesync from '../imagesync.js';
import * as images from '../images.js';
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

function repoHelp() {
  return h('details', { class: 'help' },
    h('summary', null, 'How to set up screenshot sync (about 5 minutes)'),
    h('ol', { class: 'steps' },
      h('li', null, 'Make the store: open ', ext('https://github.com/new', 'github.com/new'), '. Repository name: ', h('strong', null, 'cyber-logbook-data'),
        '. Choose ', h('strong', null, 'Private'), ' (important), tick ', h('strong', null, 'Add a README file'), ', then ', h('strong', null, 'Create repository'), '.'),
      h('li', null, 'Let your token use it: open ', ext('https://github.com/settings/personal-access-tokens', 'github.com/settings/personal-access-tokens'),
        ', click your ', h('strong', null, 'Cyber Logbook'), ' token, then ', h('strong', null, 'Edit'), '. (Editing keeps the same token, so you don\'t have to paste it again.)'),
      h('li', null, 'Repository access: choose ', h('strong', null, 'Only select repositories'), ' and pick ', h('strong', null, 'cyber-logbook-data'), '.'),
      h('li', null, 'Permissions: under ', h('strong', null, 'Repository permissions'), ', set ', h('strong', null, 'Contents'), ' to ', h('strong', null, 'Read and write'),
        ' (Metadata: read-only is added automatically). Keep Gists on Read and write. Click ', h('strong', null, 'Update'), '.'),
      h('li', null, 'Do the same for your other device\'s token.'),
      h('li', null, 'Type ', h('strong', null, 'cyber-logbook-data'), ' below and press ', h('strong', null, 'Connect screenshot sync'), '. Then do the same on your other device.')),
    h('p', { class: 'hint' }, 'Prefer a separate token just for screenshots? Make a fine-grained token with Only select repositories → cyber-logbook-data and Contents: Read and write, and paste it under "Advanced".'));
}

function imageSyncSection(cleanups) {
  const wrap = h('div');
  const line = h('p', { class: 'sync-status', 'aria-live': 'polite' });
  const bar = h('div', { class: 'sync-progress', role: 'progressbar', 'aria-label': 'Screenshot sync progress', 'aria-valuemin': '0', hidden: true }, h('div', { class: 'sync-progress-fill' }));

  function paint(st = imagesync.getState()) {
    line.className = `sync-status is-${st.status}`;
    const last = st.lastRunAt ? ` Last checked ${relTime(st.lastRunAt)}.` : '';
    const inRepo = st.remoteCount !== null && st.remoteCount !== undefined ? ` ${st.remoteCount} in the repository.` : '';
    if (st.status === 'working') line.textContent = st.message || 'Syncing screenshots…';
    else if (st.status === 'error') line.textContent = `Problem: ${st.message}`;
    else if (st.status === 'ok') line.textContent = `${st.message}${inRepo}${last}`;
    else line.textContent = st.message || 'Waiting for the next sync.';
    const showBar = st.status === 'working' && st.total > 0;
    bar.hidden = !showBar;
    if (showBar) {
      bar.setAttribute('aria-valuemax', String(st.total));
      bar.setAttribute('aria-valuenow', String(st.done));
      bar.firstChild.style.width = `${Math.round((st.done / st.total) * 100)}%`;
    }
  }

  function setupUI() {
    const textOn = sync.getState().connected;
    const repo = h('input', { type: 'text', class: 'input mono', id: 'img-repo', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'cyber-logbook-data', value: 'cyber-logbook-data' });
    const token = h('input', { type: 'password', class: 'input mono', id: 'img-token', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', placeholder: 'Leave blank to use your text-sync token' });
    const msg = h('p', { class: 'form-msg', 'aria-live': 'polite' });
    const connect = h('button', { type: 'button', class: 'btn btn-primary' }, icon('image'), 'Connect screenshot sync');
    connect.addEventListener('click', async () => {
      connect.disabled = true;
      msg.className = 'form-msg';
      msg.textContent = 'Checking the repository with GitHub…';
      try {
        await imagesync.connect(repo.value, token.value);
        token.value = '';
        toast('Screenshot sync is on for this device', { type: 'success' });
        build();
      } catch (err) {
        msg.className = 'form-msg is-error';
        msg.textContent = err && err.message ? err.message : 'Could not connect.';
        repo.focus();
      } finally {
        connect.disabled = false;
      }
    });
    return h('div', null,
      h('p', null, 'Screenshots are too big for the Gist, so they sync through a ', h('strong', null, 'private GitHub repository'), ' that only you can see. Free, and each image is uploaded once and downloaded only by devices that don\'t have it yet.'),
      textOn ? null : h('p', { class: 'form-msg is-error' }, 'Turn on text sync (the section above) first.'),
      repoHelp(),
      field('Private repository', repo, { hint: 'Just the name (cyber-logbook-data) or yourname/cyber-logbook-data.' }),
      h('details', { class: 'help' }, h('summary', null, 'Advanced: a separate token for screenshots'),
        field('Screenshot token', token, { hint: 'Only needed if your text-sync token doesn\'t have access to the repository.' })),
      h('div', { class: 'btn-row' }, connect),
      msg);
  }

  function connectedUI(st) {
    const now = h('button', { type: 'button', class: 'btn btn-primary' }, icon('sync'), 'Sync screenshots now');
    now.addEventListener('click', async () => {
      now.disabled = true;
      await imagesync.run();
      now.disabled = false;
    });
    const confirmSlot = h('div');
    const off = h('button', { type: 'button', class: 'btn btn-ghost' }, 'Stop screenshot sync on this device');
    off.addEventListener('click', () => {
      confirmSlot.replaceChildren(confirmPanel({
        title: 'Stop syncing screenshots on this device?',
        message: 'Screenshots already here stay here, and the repository is left as it is. New screenshots won\'t reach your other device until you reconnect.',
        confirmLabel: 'Stop screenshot sync',
        danger: false,
        onConfirm: async () => {
          await imagesync.disconnect();
          build();
        },
        onCancel: () => { confirmSlot.replaceChildren(); off.focus(); },
      }));
    });
    paint(st);
    return h('div', null,
      h('p', { class: 'sync-connected' }, icon('cloudOk'), h('strong', null, `Screenshots sync through ${st.repo}.`)),
      line, bar,
      h('div', { class: 'btn-row' }, now, h('a', { class: 'btn btn-ghost', href: st.repoUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('external'), 'View the repository')),
      h('p', { class: 'hint' }, `${st.separateToken ? 'Uses its own token' : 'Uses your text-sync token'}, stored on this device only. Screenshots sync automatically after text sync, and again when you come back online.`),
      h('p', { class: 'hint' }, 'Deleted screenshots are removed from the repository, but GitHub keeps old versions in the repository\'s history. To erase those as well, delete the repository on GitHub and make a new one.'),
      h('div', { class: 'btn-row' }, off),
      confirmSlot);
  }

  function build() {
    const st = imagesync.getState();
    wrap.replaceChildren(st.connected ? connectedUI(st) : setupUI());
  }

  let wasConnected = imagesync.getState().connected;
  cleanups.push(imagesync.onChange((st) => {
    if (st.connected !== wasConnected) {
      wasConnected = st.connected;
      build();
    } else {
      paint(st);
    }
  }));
  build();
  return section('Screenshot sync (private repository)', 'imagesync', wrap);
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
  const json = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('download'), 'Export full backup (.zip)');
  json.addEventListener('click', async () => {
    json.disabled = true;
    try {
      reportDelivery(await backup.exportFullBackup(), 'Backup');
    } catch (err) {
      toast(`Backup failed: ${err.message}`, { type: 'error' });
    } finally {
      json.disabled = false;
    }
  });
  const file = h('input', { type: 'file', accept: '.zip,.json,application/zip,application/json', id: 'import-file', class: 'file-hidden', tabindex: '-1', 'aria-hidden': 'true' });
  const importBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, icon('upload'), 'Import a backup…');
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
      const pics = r.images ? `, ${r.images} screenshot${r.images === 1 ? '' : 's'} restored` : '';
      const badPics = r.badImages ? `, ${r.badImages} damaged image${r.badImages === 1 ? '' : 's'} skipped` : '';
      say(`Imported ${f.name}: ${r.added} new, ${r.updated} updated, ${r.kept} already up to date${r.invalid ? `, ${r.invalid} skipped because they were damaged` : ''}${pics}${badPics}.`, 'is-ok');
      toast('Import finished', { type: 'success' });
    } catch {
      say('Something went wrong reading that file. Nothing was changed.', 'is-error');
    }
  });
  return section('Backup and export', 'backup',
    h('h3', null, 'Markdown for Obsidian'),
    h('p', { class: 'hint' }, 'One .md file per entry with YAML front-matter, screenshots in an attachments folder (embedded with their captions), plus a cheat sheet and an index. Unzip it into your Obsidian vault.'),
    h('label', { class: 'check', for: flagsId }, includeFlags, h('span', null, 'Include level passwords / flags')),
    h('div', { class: 'btn-row' }, md),
    h('h3', null, 'Full backup'),
    h('p', { class: 'hint' }, 'A .zip with everything: backup.json (your entries and settings) plus an images folder with your screenshots. Your tokens are never included. Importing merges by entry, so it never wipes newer work, and it also accepts older .json backups. On Android your browser\'s share sheet opens if it supports that file type; otherwise the file goes to Downloads.'),
    h('div', { class: 'btn-row' }, json, importBtn, file),
    result);
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;

function storageSection() {
  const used = h('p', { id: 'storage-used' }, 'Storage used: checking…');
  const counts = h('p', { class: 'hint' });
  const persistLine = h('p', { class: 'hint' });
  const persistBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small', hidden: true }, 'Ask the browser to keep my data');
  const version = h('p', { class: 'hint' });

  async function paintPersist() {
    let persisted = null;
    try { persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null; } catch { /* unsupported */ }
    persistLine.textContent = persisted === true
      ? 'Storage is persistent: the browser won\'t clear it to save space.'
      : persisted === false
        ? 'Storage isn\'t marked persistent yet, so the browser could clear it if the device gets very low on space. Installing the app usually fixes this; sync and backups protect you either way.'
        : '';
    persistBtn.hidden = persisted !== false;
  }
  persistBtn.addEventListener('click', async () => {
    const ok = navigator.storage && navigator.storage.persist ? await navigator.storage.persist().catch(() => false) : false;
    toast(ok ? 'Storage is now persistent.' : 'The browser said not yet. It usually agrees once the app is installed or used regularly.', { type: ok ? 'success' : 'info' });
    paintPersist();
  });

  (async () => {
    const n = store.count();
    const pics = await images.storageSummary().catch(() => ({ count: 0, bytes: 0 }));
    let total = null;
    let quota = null;
    try {
      const est = navigator.storage && navigator.storage.estimate ? await navigator.storage.estimate() : null;
      if (est) { total = est.usage; quota = est.quota; }
    } catch { /* unsupported */ }
    used.replaceChildren(h('strong', null, 'Storage used: '), total !== null ? mb(total) : `${mb(pics.bytes)}+`,
      quota ? h('span', { class: 'muted' }, ` of about ${mb(quota)} the browser allows`) : '');
    counts.textContent = `${n} entr${n === 1 ? 'y' : 'ies'} and ${pics.count} screenshot${pics.count === 1 ? '' : 's'} (${mb(pics.bytes)}) on this device.`;
    try {
      const keys = window.caches ? await caches.keys() : [];
      const k = keys.find((x) => x.startsWith('cyber-logbook-'));
      if (k) version.textContent = `App version ${k.replace('cyber-logbook-', '')}.`;
    } catch { /* no cache API */ }
  })();
  paintPersist();
  const installLink = h('a', { href: '#/install' }, isStandalone() ? 'You are using the installed app.' : 'How to install the app on this device');
  return section('This device', 'device', used, counts, persistLine, persistBtn, version, h('p', null, installLink));
}

function resetSection() {
  const body = h('div');
  const paint = () => body.replaceChildren(...resetContent());

  function resetContent() {
    if (!resetSession) {
      const btn = h('button', { type: 'button', class: 'btn btn-danger' }, icon('trash'), 'Reset all local data…');
      btn.addEventListener('click', () => { resetSession = { step: 'confirm' }; paint(); });
      return [h('p', null, 'Deletes every entry, screenshot, draft and setting on this device. A backup file is saved automatically first, so you can undo it.'), btn];
    }
    if (resetSession.step === 'confirm') {
      const n = store.count();
      return [confirmPanel({
        title: `Wipe all ${n} entr${n === 1 ? 'y' : 'ies'} from this device?`,
        message: 'First a backup (cyber-logbook-before-reset-….zip, with your screenshots inside) is saved to your Downloads. Then everything on this device is deleted, including screenshots and sync tokens. Your synced copy is not touched unless you choose that next.',
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
      h('p', null, 'Backup saved as ', h('code', null, resetSession.filename), '. To restore it later: Settings → Import a backup.'),
    ];
    const undo = h('button', { type: 'button', class: 'btn btn-primary' }, 'Undo reset');
    undo.addEventListener('click', async () => {
      undo.disabled = true;
      try {
        await undoReset({
          backup: resetSession.backup,
          savedSync: resetSession.savedSync,
          savedImageSync: resetSession.savedImageSync,
          remoteResetAt: resetSession.remote?.resetAt || null,
        });
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
          const r = await wipeSyncedCopy(resetSession.savedSync, resetSession.savedImageSync);
          resetSession.remote = r;
          resetSession.remoteError = '';
        } catch (err) {
          resetSession.remoteError = err.message;
        }
        paint();
      });
      out.push(h('div', { class: 'confirm-panel is-danger', role: 'group', 'aria-labelledby': 'wipe-q' },
        h('p', { class: 'confirm-title', id: 'wipe-q' }, 'Also wipe the synced copy?'),
        h('p', { class: 'confirm-msg' }, 'This empties the Gist that your devices sync through (a backup of it is downloaded first) and removes the screenshots from your private screenshot repository. Your other devices keep their own data and will ask you what to do next time they sync. If you say no, reconnect sync later to pull everything back.'),
        resetSession.remoteError ? h('p', { class: 'form-msg is-error' }, resetSession.remoteError) : null,
        h('div', { class: 'btn-row' }, keep, wipe)));
    } else if (resetSession.remote && !resetSession.remote.skipped) {
      out.push(h('p', null, 'The synced copy was wiped too',
        resetSession.remote.imagesWiped ? ', including the screenshots in your repository.' : '.',
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
    imageSyncSection(cleanups),
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
