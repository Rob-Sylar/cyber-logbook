// Service worker registration, update prompts and the "Install app" prompt.

let deferredPrompt = null;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());

export function onInstallChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export const canPromptInstall = () => !!deferredPrompt;

export function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches
    || matchMedia('(display-mode: window-controls-overlay)').matches
    || navigator.standalone === true;
}

export async function promptInstall() {
  const p = deferredPrompt;
  if (!p) return null;
  deferredPrompt = null;
  p.prompt();
  const choice = await p.userChoice.catch(() => ({ outcome: 'dismissed' }));
  emit();
  return choice.outcome;
}

export function initPWA({ onUpdateReady }) {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emit();
  });
  registerServiceWorker(onUpdateReady);
}

async function registerServiceWorker(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return;
  let acceptedUpdate = false;
  try {
    const reg = await navigator.serviceWorker.register('sw.js');
    const offer = (worker) => {
      if (!worker || !navigator.serviceWorker.controller) return; // first install: nothing to update
      onUpdateReady(() => {
        acceptedUpdate = true;
        worker.postMessage('SKIP_WAITING');
      });
    };
    if (reg.waiting) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed') offer(w);
      });
    });
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (acceptedUpdate) location.reload();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  } catch {
    // Service workers can be blocked (e.g. some private modes). The app still works while online.
  }
}
