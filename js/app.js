// App start-up: storage, router, header (sync status, questions badge, theme), banners, auto-sync.

import * as store from './store.js';
import * as sync from './sync.js';
import * as imagesync from './imagesync.js';
import { gcLocal } from './images.js';
import { initPWA } from './pwa.js';
import { applyTheme, toggleTheme } from './theme.js';
import { h, hydrateIcons, icon, relTime, setIcon, toast } from './ui.js';
import * as logView from './views/log.js';
import * as journalView from './views/journal.js';
import * as entryView from './views/entry.js';
import * as cheatsView from './views/cheats.js';
import * as questionsView from './views/questions.js';
import * as reviewView from './views/review.js';
import * as statsView from './views/stats.js';
import * as settingsView from './views/settings.js';
import * as installView from './views/install.js';

const ROUTES = {
  log: logView,
  edit: logView,
  journal: journalView,
  entry: entryView,
  cheats: cheatsView,
  questions: questionsView,
  review: reviewView,
  stats: statsView,
  settings: settingsView,
  install: installView,
};
const NAV_FOR = { edit: 'log', entry: 'journal' };

const main = document.getElementById('main');
const banners = document.getElementById('banners');
let current = { name: '', param: '', view: null, cleanup: null };
let renderCount = 0;
let firstRoute = true;
let pendingRefresh = false;

// ---- Router -----------------------------------------------------------------------------
function parseHash() {
  const [, name = 'log', ...rest] = (location.hash || '#/log').split('/');
  const param = decodeURIComponent(rest.join('/'));
  return ROUTES[name] ? { name, param } : { name: 'log', param: '' };
}

function isTyping() {
  const a = document.activeElement;
  return !!a && main.contains(a) && (a.matches('input:not([type=checkbox]):not([type=radio]), textarea, select') || a.isContentEditable);
}

async function renderRoute({ keepScroll = false } = {}) {
  const { name, param } = parseHash();
  const view = ROUTES[name];
  if (current.cleanup) {
    try { current.cleanup(); } catch { /* ignore */ }
  }
  const scroll = window.scrollY;
  const page = h('div', { class: `page ${view.wide ? 'page-wide' : ''}`.trim() });
  main.replaceChildren(page);
  current = { name, param, view, cleanup: null };
  pendingRefresh = false;
  const navName = NAV_FOR[name] || name;
  document.querySelectorAll('.nav a, .topbar a.icon-btn').forEach((a) => {
    if (a.dataset.route === navName || a.getAttribute('href') === `#/${navName}`) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  document.title = `${view.title || 'Cyber Logbook'} · Cyber Logbook`;
  const thisRender = ++renderCount;
  try {
    const cleanup = await view.render(page, param);
    if (typeof cleanup === 'function') {
      // If you already moved on while this screen was loading, tidy it up straight away.
      if (thisRender === renderCount) current.cleanup = cleanup;
      else cleanup();
    }
  } catch (err) {
    console.error(err);
    page.replaceChildren(h('div', { class: 'empty' },
      h('p', { class: 'empty-title' }, 'Something went wrong showing this screen.'),
      h('p', { class: 'muted' }, 'Your data is safe. Try going back to the journal.'),
      h('a', { class: 'btn btn-primary', href: '#/journal' }, 'Open the journal')));
  }
  if (keepScroll) {
    window.scrollTo(0, scroll);
  } else if (!firstRoute) {
    window.scrollTo(0, 0);
    const heading = page.querySelector('h1');
    if (heading) heading.focus({ preventScroll: true });
  }
  firstRoute = false;
}

// Data changed somewhere else (sync, import, reset): refresh the screen, but never while you're typing.
function refreshForExternalChange() {
  const mode = current.view?.refreshOn || 'external';
  if (mode === 'none') return;
  if (isTyping()) {
    pendingRefresh = true;
    return;
  }
  renderRoute({ keepScroll: true });
}

main.addEventListener('focusout', () => {
  setTimeout(() => {
    if (pendingRefresh && !isTyping()) renderRoute({ keepScroll: true });
  }, 150);
});

// ---- Header -----------------------------------------------------------------------------
function updateQuestionBadges() {
  const n = store.openQuestionCount();
  document.querySelectorAll('.badge').forEach((b) => {
    b.textContent = n > 99 ? '99+' : String(n);
    b.hidden = n === 0;
  });
  const link = document.getElementById('questions-link');
  link?.setAttribute('aria-label', n ? `Questions, ${n} open` : 'Questions');
}

const SYNC_ICONS = { off: 'cloudOff', idle: 'cloudOk', ok: 'cloudOk', syncing: 'sync', offline: 'cloudOff', error: 'alert', decision: 'alert' };

function updateSyncButton(st = sync.getState()) {
  const btn = document.getElementById('sync-btn');
  if (!btn) return;
  setIcon(btn, SYNC_ICONS[st.status] || 'cloudOk');
  btn.classList.toggle('is-syncing', st.status === 'syncing');
  btn.dataset.state = st.status;
  const text = btn.querySelector('.sync-text');
  // The visible text always starts the accessible name (so voice control can "click Sync off").
  let short;
  let more;
  if (st.status === 'off') { short = 'Sync off'; more = 'Open sync settings'; }
  else if (st.status === 'syncing') { short = 'Syncing…'; more = ''; }
  else if (st.status === 'offline') { short = 'Offline'; more = 'Will sync when you reconnect'; }
  else if (st.status === 'error') { short = 'Sync error'; more = `${st.message} Open sync settings`; }
  else if (st.status === 'decision') { short = 'Sync needs you'; more = 'See the message at the top of the page'; }
  else { short = st.lastSyncAt ? `Synced ${relTime(st.lastSyncAt)}` : 'Not synced yet'; more = 'Sync now'; }
  // Screenshots sync in the background after the text; show their progress while that happens.
  const img = imagesync.getState();
  if ((st.status === 'ok' || st.status === 'idle') && img.status === 'working') {
    short = img.total ? `Screenshots ${img.done}/${img.total}` : 'Checking screenshots';
    more = 'Syncing screenshots in the background';
    setIcon(btn, 'sync');
    btn.classList.add('is-syncing');
  } else if ((st.status === 'ok' || st.status === 'idle') && img.status === 'error') {
    more = `${more}. Screenshot sync: ${img.message}`;
  }
  const label = more ? `${short}. ${more}` : short;
  btn.setAttribute('aria-label', label);
  btn.title = label;
  if (text) text.textContent = short;
}

function onSyncButton() {
  const st = sync.getState();
  if (st.status === 'off' || st.status === 'error') location.hash = '#/settings';
  else if (st.status === 'decision') banners.querySelector('button')?.focus();
  else sync.syncNow();
}

// ---- Banners ----------------------------------------------------------------------------
function renderBanners() {
  banners.replaceChildren();
  const st = sync.getState();
  if (st.status === 'decision' && st.pendingReset) {
    const { count, resetAt } = st.pendingReset;
    const when = new Date(resetAt).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    const removeBtn = h('button', { type: 'button', class: 'btn btn-danger' }, 'Remove them here too');
    const keepBtn = h('button', { type: 'button', class: 'btn btn-primary' }, 'Keep and re-upload');
    removeBtn.addEventListener('click', async () => {
      removeBtn.disabled = keepBtn.disabled = true;
      await sync.resolveReset('remove');
      toast('Removed. A backup file of them was saved first.', { type: 'success' });
    });
    keepBtn.addEventListener('click', async () => {
      removeBtn.disabled = keepBtn.disabled = true;
      await sync.resolveReset('keep');
      toast('Kept. They are being uploaded to your synced copy again.', { type: 'success' });
    });
    banners.append(h('section', { class: 'banner banner-warn', 'aria-labelledby': 'reset-banner-title' },
      icon('alert'),
      h('div', { class: 'banner-body' },
        h('p', { class: 'banner-title', id: 'reset-banner-title' }, `Your synced copy was wiped from another device (${when}).`),
        h('p', null, `This device still has ${count} older entr${count === 1 ? 'y' : 'ies'}. Remove them here too, or keep them and upload them again? A backup file is saved before anything is removed.`),
        h('div', { class: 'btn-row' }, keepBtn, removeBtn))));
  }
  if (updateAccept) {
    const btn = h('button', { type: 'button', class: 'btn btn-primary btn-small' }, 'Tap to update');
    btn.addEventListener('click', () => { btn.disabled = true; updateAccept(); });
    banners.append(h('section', { class: 'banner', 'aria-label': 'Update available' },
      icon('download'),
      h('div', { class: 'banner-body' },
        h('p', { class: 'banner-title' }, 'New version available'),
        h('p', null, 'Your entries are safe. Updating just reloads the app.'),
        h('div', { class: 'btn-row' }, btn))));
  }
}

let updateAccept = null;

// ---- Start-up ---------------------------------------------------------------------------
function showFatal(err) {
  main.replaceChildren(h('div', { class: 'page' }, h('div', { class: 'empty' },
    h('p', { class: 'empty-title' }, "Cyber Logbook can't open its storage."),
    h('p', null, 'This usually happens in a private/incognito window or when site data is blocked for this site. Open it in a normal window, or allow site data in your browser settings.'),
    h('p', { class: 'muted' }, `Details: ${err && err.message ? err.message : String(err)}`))));
}

async function boot() {
  hydrateIcons();
  applyTheme();
  document.getElementById('theme-btn').addEventListener('click', toggleTheme);
  document.getElementById('sync-btn').addEventListener('click', onSyncButton);

  initPWA({
    onUpdateReady: (accept) => {
      updateAccept = accept;
      renderBanners();
    },
  });

  try {
    await store.init();
    await sync.init();
    await imagesync.init();
  } catch (err) {
    showFatal(err);
    return;
  }

  store.subscribe(({ type, source }) => {
    updateQuestionBadges();
    if (source === 'local' || source === 'import') sync.schedule();
    if (type === 'reset') applyTheme();
    if (source !== 'local') refreshForExternalChange();
  });
  sync.onChange((st) => {
    updateSyncButton(st);
    renderBanners();
    if (st.status === 'ok') imagesync.schedule(300); // images follow once the text is in
  });
  imagesync.onChange(() => updateSyncButton());

  window.addEventListener('hashchange', () => renderRoute());
  window.addEventListener('online', () => {
    if (sync.autoEnabled()) sync.syncNow();
    if (imagesync.configured()) imagesync.schedule(2000);
  });
  window.addEventListener('offline', () => { if (sync.getState().connected) updateSyncButton({ ...sync.getState(), status: 'offline' }); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || !sync.autoEnabled()) return;
    const last = Date.parse(sync.getState().lastSyncAt || 0);
    if (!Number.isFinite(last) || Date.now() - last > 60_000) sync.syncNow();
  });
  setInterval(() => updateSyncButton(), 30_000);

  updateQuestionBadges();
  updateSyncButton();
  renderBanners();
  await renderRoute();

  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  if (sync.autoEnabled()) sync.syncNow();
  else if (imagesync.configured()) imagesync.schedule(3000);
  // Free the space of screenshots deleted more than a couple of minutes ago (kept briefly for Undo).
  setTimeout(() => gcLocal().catch(() => {}), 5000);
  setInterval(() => gcLocal().catch(() => {}), 60_000);
}

boot();
