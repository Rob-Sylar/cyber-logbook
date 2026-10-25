// "How to install": detects the browser and shows the right steps.
// Opera GX can't install web apps on a PC, so it points you to Microsoft Edge instead.

import { detectBrowser } from '../browser.js';
import { canPromptInstall, isStandalone, onInstallChange, promptInstall } from '../pwa.js';
import { copyButton, h, icon, pageHead, toast } from '../ui.js';

export const title = 'Install the app';

const appUrl = () => `${location.origin}${location.pathname}`;

const EDGE_STEPS = () => [
  'Open the app\'s address in Microsoft Edge (it comes with Windows 11).',
  ['Look at the right-hand end of the address bar for the ', h('strong', null, 'App available'), ' icon (a small square with a plus sign). Click it, then click ', h('strong', null, 'Install'), '.'],
  ['No icon? Click the ', h('strong', null, '⋯'), ' menu (top right) → ', h('strong', null, 'Apps'), ' → ', h('strong', null, 'Install Cyber Logbook'), '.'],
  ['It opens in its own window and gets a Start menu entry. To pin it: right-click its icon on the taskbar → ', h('strong', null, 'Pin to taskbar'), '.'],
];

const CHROME_ANDROID_STEPS = () => [
  'Open the app\'s address in Chrome on your phone.',
  ['Tap the ', h('strong', null, '⋮'), ' menu (top right).'],
  ['Tap ', h('strong', null, 'Install app'), '. (On some phones it says ', h('strong', null, 'Add to Home screen'), ', then ', h('strong', null, 'Install'), '.)'],
  'Tap Install again to confirm. The Cyber Logbook icon appears on your home screen and in your app drawer.',
];

const CHROME_DESKTOP_STEPS = () => [
  ['Click the install icon at the right of the address bar (a monitor with a down arrow), then ', h('strong', null, 'Install'), '.'],
  ['Or: ', h('strong', null, '⋮'), ' menu → ', h('strong', null, 'Cast, save and share'), ' → ', h('strong', null, 'Install page as app'), '.'],
];

const steps = (list) => h('ol', { class: 'steps' }, list.map((s) => h('li', null, s)));

function linkBox() {
  return h('div', { class: 'link-box' },
    h('code', { class: 'url' }, appUrl()),
    copyButton(() => appUrl(), 'Copy the app link', { small: false }));
}

export function render(page) {
  const b = detectBrowser();
  page.append(pageHead('Install the app'));

  if (isStandalone()) {
    page.append(h('div', { class: 'notice notice-ok' }, icon('check'),
      h('p', null, h('strong', null, 'You\'re using the installed app. '), 'It works offline and keeps your data on this device.')));
  }

  const installSlot = h('div');
  const paintInstall = () => {
    installSlot.replaceChildren();
    if (!isStandalone() && canPromptInstall()) {
      const btn = h('button', { type: 'button', class: 'btn btn-primary btn-big' }, icon('install'), 'Install Cyber Logbook');
      btn.addEventListener('click', async () => {
        const outcome = await promptInstall();
        if (outcome === 'accepted') toast('Installed. Look for Cyber Logbook in your apps.', { type: 'success' });
      });
      installSlot.append(h('div', { class: 'card install-now' }, h('p', null, 'Your browser can install it right now:'), btn));
    }
  };
  paintInstall();
  const unsub = onInstallChange(paintInstall);

  page.append(h('p', { class: 'detected' }, 'Detected: ', h('strong', null, b.label), '.'), installSlot);

  const isOpera = b.name === 'opera-gx' || b.name === 'opera';
  if (isOpera && !b.mobile) {
    const edgeHref = `microsoft-edge:${appUrl()}`;
    page.append(h('section', { class: 'card callout', 'aria-labelledby': 'opera-h' },
      h('h2', { id: 'opera-h' }, b.name === 'opera-gx' ? 'You\'re in Opera GX' : 'You\'re in Opera'),
      h('p', null, 'Opera GX can\'t install web apps on a PC. Open this page in ', h('strong', null, 'Microsoft Edge'), ' (already on Windows 11) and install it from there.'),
      h('div', { class: 'btn-row' },
        h('a', { class: 'btn btn-primary', href: edgeHref }, icon('external'), 'Open in Edge')),
      h('p', { class: 'hint' }, 'If Opera asks "Open Microsoft Edge?", choose Open. If nothing happens, copy this link and paste it into Edge:'),
      linkBox(),
      h('p', { class: 'hint' }, 'You can still use Cyber Logbook in an Opera GX tab: everything works, including offline. But Opera GX and the Edge app keep separate copies of your data, so either stick to the installed app or turn on Sync in both.')));
    page.append(h('section', { class: 'card', 'aria-labelledby': 'edge-h' }, h('h2', { id: 'edge-h' }, 'Then, in Microsoft Edge'), steps(EDGE_STEPS())));
  } else if (b.os === 'android') {
    if (b.name !== 'chrome') {
      page.append(h('section', { class: 'card callout', 'aria-labelledby': 'useChrome-h' },
        h('h2', { id: 'useChrome-h' }, 'Use Chrome to install'),
        h('p', null, `You're in ${b.label}. For the smoothest install, open this link in Chrome:`),
        linkBox()));
    }
    page.append(h('section', { class: 'card', 'aria-labelledby': 'and-h' }, h('h2', { id: 'and-h' }, 'Install on Android (Chrome)'), steps(CHROME_ANDROID_STEPS())));
  } else if (b.name === 'edge') {
    page.append(h('section', { class: 'card', 'aria-labelledby': 'edge-h' }, h('h2', { id: 'edge-h' }, 'Install in Microsoft Edge'), steps(EDGE_STEPS().slice(1))));
  } else if (['chrome', 'brave', 'chromium'].includes(b.name) && !b.mobile) {
    page.append(h('section', { class: 'card', 'aria-labelledby': 'cd-h' }, h('h2', { id: 'cd-h' }, 'Install on this computer'), steps(CHROME_DESKTOP_STEPS()),
      h('p', { class: 'hint' }, 'On Windows you can also use Microsoft Edge: the steps are below.')));
  } else if (b.os === 'ios') {
    page.append(h('section', { class: 'card', 'aria-labelledby': 'ios-h' }, h('h2', { id: 'ios-h' }, 'Install on iPhone or iPad'),
      steps([['Open this page in ', h('strong', null, 'Safari'), '.'], ['Tap the ', h('strong', null, 'Share'), ' button.'], ['Tap ', h('strong', null, 'Add to Home Screen'), '.']])));
  } else {
    page.append(h('section', { class: 'card callout', 'aria-labelledby': 'other-h' },
      h('h2', { id: 'other-h' }, 'This browser may not install apps'),
      h('p', null, `You're in ${b.label}. Use Microsoft Edge on Windows, or Chrome on Android:`), linkBox()));
  }

  // Always show both main routes, since you'll install on two devices.
  page.append(h('details', { class: 'card help' },
    h('summary', null, 'Steps for your other device'),
    h('h3', null, 'Windows PC: Microsoft Edge'), steps(EDGE_STEPS()),
    h('h3', null, 'Android phone: Chrome'), steps(CHROME_ANDROID_STEPS()),
    h('p', null, 'The app link:'), linkBox()));

  page.append(h('section', { class: 'card', 'aria-labelledby': 'after-h' },
    h('h2', { id: 'after-h' }, 'After installing'),
    h('ul', { class: 'bullets' },
      h('li', null, 'It works with no internet. Your entries are saved on the device as you go.'),
      h('li', null, 'Each browser and installed app keeps its own copy of your data. To keep your PC and phone in step, set up ', h('a', { href: '#/settings' }, 'Sync in Settings'), ' on each one.'),
      h('li', null, 'When an update is published, a "new version is ready" message appears. Tap Reload.'))));

  return unsub;
}
