// Light/dark theme: follows the system unless you pick one (saved on this device only).

import { lsGet, lsSet, setIcon } from './ui.js';

const darkQuery = matchMedia('(prefers-color-scheme: dark)');

export function getThemePref() {
  const t = lsGet('cl-theme');
  return t === 'light' || t === 'dark' ? t : 'system';
}

export function effectiveTheme() {
  const p = getThemePref();
  return p === 'system' ? (darkQuery.matches ? 'dark' : 'light') : p;
}

export function applyTheme() {
  const pref = getThemePref();
  if (pref === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', pref);
  const eff = effectiveTheme();
  document.getElementById('theme-color')?.setAttribute('content', eff === 'dark' ? '#0a0f1c' : '#f4f6fa');
  const btn = document.getElementById('theme-btn');
  if (btn) {
    setIcon(btn, eff === 'dark' ? 'sun' : 'moon');
    btn.setAttribute('aria-label', eff === 'dark' ? 'Switch to light theme' : 'Switch to dark theme');
  }
}

export function setThemePref(pref) {
  lsSet('cl-theme', pref === 'system' ? null : pref);
  applyTheme();
}

export function toggleTheme() {
  setThemePref(effectiveTheme() === 'dark' ? 'light' : 'dark');
}

darkQuery.addEventListener('change', applyTheme);
