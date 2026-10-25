// Makes the screenshots listed in manifest.webmanifest (shown in Chrome/Edge's install dialog).
// Run from the tests folder: node tools/manifest-screenshots.mjs
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleEntries } from '../fixtures/sample.mjs';
import './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const out = path.join(root, 'screenshots');
await mkdir(out, { recursive: true });
const base = `http://localhost:${process.env.PORT || 4173}/`;

const shots = [
  { file: 'narrow-log.png', route: 'log', viewport: { width: 390, height: 844 }, scale: 2, mobile: true },
  { file: 'narrow-journal.png', route: 'journal', viewport: { width: 390, height: 844 }, scale: 2, mobile: true },
  { file: 'wide-journal.png', route: 'journal', viewport: { width: 1280, height: 800 }, scale: 1, mobile: false },
];

const browser = await chromium.launch();
for (const s of shots) {
  const ctx = await browser.newContext({ viewport: s.viewport, deviceScaleFactor: s.scale, isMobile: s.mobile, hasTouch: s.mobile, colorScheme: 'dark', serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(base);
  await page.waitForSelector('main h1');
  await page.evaluate(async (entries) => {
    const store = await import('./js/store.js');
    for (const e of entries) await store.save(e);
    localStorage.setItem('cl-install-hint', 'hidden');
  }, sampleEntries());
  await page.goto(`${base}#/${s.route}`);
  await page.reload();
  await page.waitForSelector('main h1');
  await page.screenshot({ path: path.join(out, s.file) });
  console.log(`wrote screenshots/${s.file} (${s.viewport.width * s.scale}x${s.viewport.height * s.scale})`);
  await ctx.close();
}
await browser.close();
process.exit(0);
