// DOM helpers. All text goes in through textContent/value, never innerHTML,
// so nothing typed, imported or synced can inject markup or scripts.

import { parseLocalDate, isValidDateStr } from './model.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PROPS = new Set(['value', 'checked', 'selected', 'indeterminate']);

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

function setProps(el, props) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'text') el.textContent = v;
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (PROPS.has(k)) el[k] = v;
    else if (/^on/i.test(k)) continue; // no inline handlers
    else el.setAttribute(k, v === true ? '' : String(v));
  }
}

export function h(tag, props = null, ...children) {
  const el = document.createElement(tag);
  setProps(el, props);
  appendChildren(el, children);
  return el;
}

export function s(tag, props = null, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  setProps(el, props);
  appendChildren(el, children);
  return el;
}

// 24x24 stroke icons (drawn for this app).
const ICONS = {
  pen: 'M4 20h4L19 9l-4-4L4 16v4z M13.5 6.5l4 4',
  book: 'M5 4h13v15H6.5A1.5 1.5 0 0 0 5 20.5z M5 20.5A1.5 1.5 0 0 0 6.5 22H19 M9 8h6 M9 11.5h4',
  terminal: 'M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z M7 9l3 3-3 3 M12.5 15H17',
  help: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M9.5 9.2a2.6 2.6 0 1 1 3.6 2.4c-.7.3-1.1.9-1.1 1.6v.6 M12 17.2v.1',
  cards: 'M8 3.5h11a1 1 0 0 1 1 1V16 M4 7.5h11a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8.5a1 1 0 0 1 1-1z',
  chart: 'M4 20V11 M10 20V5 M16 20v-6 M21 20H3',
  settings: 'M4 7h9 M17 7h3 M15 5v4 M4 12h3 M11 12h9 M9 10v4 M4 17h11 M19 17h1 M17 15v4',
  sync: 'M20 11a8 8 0 0 0-14.3-4.9L4 8 M4 4v4h4 M4 13a8 8 0 0 0 14.3 4.9L20 16 M20 20v-4h-4',
  cloudOk: 'M7 18a5 5 0 1 1 .9-9.9A6 6 0 0 1 19.4 10 4 4 0 0 1 18 18z M9.5 13.5l2 2 3.5-3.5',
  cloudOff: 'M3 3l18 18 M8.3 6.3A6 6 0 0 1 19.4 10 4 4 0 0 1 20.6 17 M16 18H7a5 5 0 0 1-2.4-9.4',
  alert: 'M12 3.5l9.5 16.5h-19z M12 10v4.5 M12 17.3v.1',
  sun: 'M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 2.5v2 M12 19.5v2 M4.9 4.9l1.4 1.4 M17.7 17.7l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.9 19.1l1.4-1.4 M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z',
  copy: 'M9 9h11v11H9z M5 15H4V4h11v1',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z',
  eyeOff: 'M3 3l18 18 M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4 M6.6 6.6A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 5.4-1.6 M9.9 9.9a3 3 0 0 0 4.2 4.2',
  trash: 'M4 7h16 M10 11v6 M14 11v6 M6 7l1 13h10l1-13 M9 7V4h6v3',
  x: 'M6 6l12 12 M18 6L6 18',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14 M5 12h14',
  download: 'M12 4v11 M7.5 10.5L12 15l4.5-4.5 M4 20h16',
  upload: 'M12 20V9 M7.5 13.5L12 9l4.5 4.5 M4 4h16',
  share: 'M12 3v12 M7.5 7.5L12 3l4.5 4.5 M5 12v8h14v-8',
  external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  search: 'M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-4-4',
  install: 'M8 2.5h8a2 2 0 0 1 2 2v15a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-15a2 2 0 0 1 2-2z M12 7v7 M9 11l3 3 3-3 M11 18.5h2',
  flame: 'M12 3c1 4 5 5.5 5 10.5a5 5 0 0 1-10 0c0-2.6 1.4-3.7 2-5.2.9 1 1.5 2 1.4 3.2 1.7-1.6 2.2-4.7 1.6-8.5z',
  clock: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z M12 7v5l3.5 2',
  message: 'M4 5h16v11H9.5L4 20z M8 9.5h8 M8 12.5h5',
  bulb: 'M9 18h6 M10 21h4 M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3z',
  flag: 'M5 21V4 M5 4h12l-2.5 4.5L17 13H5',
  shuffle: 'M4 7h3l10 10h3 M4 17h3l3-3 M14 10l3-3h3 M18 5l2 2-2 2 M18 15l2 2-2 2',
  back: 'M15 5l-7 7 7 7',
  chevron: 'M9 6l6 6-6 6',
  link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
  edge: 'M4 12a8 8 0 1 1 16 0v1H9a3.5 3.5 0 0 0 6.5 1.8 M4 12c0-3 3-5 6-5s5.5 2 5.5 4',
  shield: 'M12 3l7.5 3v5.5c0 4.6-3.1 8.2-7.5 9.5-4.4-1.3-7.5-4.9-7.5-9.5V6z M9 12l2 2 4-4',
};

export function icon(name, { label = null, cls = '' } = {}) {
  const el = s('svg', {
    viewBox: '0 0 24 24',
    class: `icon ${cls}`.trim(),
    'aria-hidden': label ? null : 'true',
    role: label ? 'img' : null,
    'aria-label': label,
    focusable: 'false',
  }, s('path', { d: ICONS[name] || ICONS.help }));
  return el;
}

// Swap static <span data-icon="..."> placeholders in index.html for real icons.
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.replaceWith(icon(el.dataset.icon));
  });
}

export function setIcon(container, name) {
  const old = container.querySelector('svg.icon');
  const fresh = icon(name);
  if (old) old.replaceWith(fresh);
  else container.prepend(fresh);
}

let uidCounter = 0;
export const uid = (p = 'f') => `${p}-${++uidCounter}`;

export function field(labelText, control, { hint = '', cls = '' } = {}) {
  if (!control.id) control.id = uid();
  const hintEl = hint ? h('p', { class: 'hint', id: `${control.id}-hint` }, hint) : null;
  if (hintEl) control.setAttribute('aria-describedby', hintEl.id);
  return h('div', { class: `field ${cls}`.trim() },
    h('label', { class: 'label', for: control.id }, labelText),
    hintEl,
    control,
    h('p', { class: 'field-error', id: `${control.id}-err`, hidden: true }));
}

// Works for a control inside field() or for a fieldset with a [data-error-for] paragraph.
export function setError(control, message) {
  const err = document.getElementById(`${control.id}-err`);
  if (!err) return;
  err.textContent = message || '';
  err.hidden = !message;
  const ids = (control.getAttribute('aria-describedby') || '').split(' ').filter((x) => x && x !== err.id);
  if (message) ids.push(err.id);
  if (ids.length) control.setAttribute('aria-describedby', ids.join(' '));
  else control.removeAttribute('aria-describedby');
  if (message) control.setAttribute('aria-invalid', 'true');
  else control.removeAttribute('aria-invalid');
}

export function chip(type, name, value, label, checked, extra = {}) {
  return h('label', { class: 'chip' },
    h('input', { type, name, value, checked, class: 'chip-input', ...extra }),
    h('span', { class: 'chip-label' }, label));
}

export function toast(message, { type = 'info', action = null, timeout = 4500 } = {}) {
  const region = document.getElementById('toasts');
  if (!region) return;
  let timer = null;
  const close = () => {
    clearTimeout(timer);
    el.remove();
  };
  const el = h('div', { class: `toast toast-${type}` },
    type === 'error' ? icon('alert') : type === 'success' ? icon('check') : null,
    h('span', { class: 'toast-msg' }, message),
    action && h('button', { type: 'button', class: 'btn btn-small btn-toast', on: { click: () => { close(); action.fn(); } } }, action.label),
    h('button', { type: 'button', class: 'icon-btn icon-btn-small', 'aria-label': 'Dismiss message', on: { click: close } }, icon('x')));
  region.append(el);
  while (region.children.length > 3) region.firstElementChild.remove();
  if (timeout) timer = setTimeout(close, action ? timeout + 3000 : timeout);
  return close;
}

export function debounce(fn, ms) {
  let t = null;
  let lastArgs = null;
  const d = (...args) => {
    lastArgs = args;
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...lastArgs); }, ms);
  };
  d.flush = () => { if (t) { clearTimeout(t); t = null; fn(...lastArgs); } };
  d.cancel = () => { clearTimeout(t); t = null; };
  return d;
}

export function fmtMinutes(m) {
  if (!m) return '0 min';
  const hrs = Math.floor(m / 60), mins = m % 60;
  if (!hrs) return `${mins} min`;
  return mins ? `${hrs} h ${mins} min` : `${hrs} h`;
}

export function fmtHours(min) {
  const v = Math.round((min / 60) * 10) / 10;
  return `${Number.isInteger(v) ? v : v.toFixed(1)} h`;
}

export function fmtDate(dateStr, opts = { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!isValidDateStr(dateStr)) return dateStr;
  return parseLocalDate(dateStr).toLocaleDateString(undefined, opts);
}

export function fmtDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function fmtClock(d = new Date()) {
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function relTime(iso) {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 'never';
  const secs = Math.round((Date.now() - t) / 1000);
  if (secs < 45) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return fmtDateTime(iso);
}

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { class: 'visually-hidden', readonly: true, 'aria-hidden': 'true' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function copyButton(getText, label, { small = true } = {}) {
  const text = h('span', null, 'Copy');
  const btn = h('button', { type: 'button', class: `btn btn-ghost ${small ? 'btn-small' : ''}`, 'aria-label': label },
    icon('copy'), text);
  btn.addEventListener('click', async () => {
    const ok = await copyText(getText());
    text.textContent = ok ? 'Copied' : 'Copy failed';
    toast(ok ? 'Copied to clipboard' : "Couldn't copy. Select the text and copy it manually.", { type: ok ? 'success' : 'error', timeout: 2000 });
    setTimeout(() => { text.textContent = 'Copy'; }, 1800);
  });
  return btn;
}

// An in-page "are you sure?" panel (used instead of the browser's confirm() popup).
export function confirmPanel({ title, message, confirmLabel, cancelLabel = 'Cancel', danger = true, requireText = '', onConfirm, onCancel }) {
  const titleId = uid('confirm');
  const confirmBtn = h('button', { type: 'button', class: `btn ${danger ? 'btn-danger' : 'btn-primary'}` }, confirmLabel);
  const cancelBtn = h('button', { type: 'button', class: 'btn btn-ghost' }, cancelLabel);
  let input = null;
  if (requireText) {
    input = h('input', { type: 'text', class: 'input', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' });
    confirmBtn.disabled = true;
    input.addEventListener('input', () => {
      confirmBtn.disabled = input.value.trim().toUpperCase() !== requireText;
    });
  }
  const panel = h('div', { class: `confirm-panel ${danger ? 'is-danger' : ''}`, role: 'group', 'aria-labelledby': titleId },
    h('p', { class: 'confirm-title', id: titleId }, title),
    message ? h('p', { class: 'confirm-msg' }, message) : null,
    input ? field(`Type ${requireText} to confirm`, input) : null,
    h('div', { class: 'btn-row' }, cancelBtn, confirmBtn));
  confirmBtn.addEventListener('click', async () => {
    confirmBtn.disabled = true;
    cancelBtn.disabled = true;
    try { await onConfirm(); } finally {
      confirmBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });
  cancelBtn.addEventListener('click', () => onCancel && onCancel());
  queueMicrotask(() => (input || cancelBtn).focus());
  return panel;
}

export function emptyState(title, text, action = null) {
  return h('div', { class: 'empty' },
    h('p', { class: 'empty-title' }, title),
    text ? h('p', { class: 'muted' }, text) : null,
    action);
}

export function pageHead(titleText, ...extra) {
  return h('div', { class: 'page-head' }, h('h1', { tabindex: '-1' }, titleText), ...extra);
}

export function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}

export function lsSet(key, value) {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch { /* storage blocked */ }
}

export function confidenceDots(n) {
  const label = n ? `Confidence ${n} out of 5` : 'Confidence not rated';
  return h('span', { class: `conf-dots conf-${n || 0}`, role: 'img', 'aria-label': label, title: label },
    [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= (n || 0) ? 'dot on' : 'dot' })));
}
