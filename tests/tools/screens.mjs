// Dev helper: loads every screen at phone and desktop sizes, prints console errors and saves screenshots.
// Usage (from tests/): node tools/screens.mjs <output folder>
import { chromium, devices } from '@playwright/test';
import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { sampleEntries } from '../fixtures/sample.mjs';
import './serve.mjs';

const out = path.resolve(process.argv[2] || 'screens');
await mkdir(out, { recursive: true });
const base = `http://localhost:${process.env.PORT || 4173}/`;
const routes = ['log', 'journal', 'cheats', 'questions', 'review', 'stats', 'settings', 'install'];
const sizes = [
  ['phone', { ...devices['Pixel 7'] }],
  ['desktop', { viewport: { width: 1440, height: 900 } }],
  ['qhd', { viewport: { width: 2560, height: 1440 } }],
];

const browser = await chromium.launch();
for (const [label, opts] of sizes) {
  for (const scheme of ['dark', 'light']) {
    const ctx = await browser.newContext({ ...opts, colorScheme: scheme });
    const page = await ctx.newPage();
    const problems = [];
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') problems.push(`${m.type()}: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    await page.goto(base);
    await page.waitForSelector('h1');
    await page.evaluate(async (entries) => {
      const store = await import('./js/store.js');
      for (const e of entries) await store.save(e);
    }, sampleEntries());
    for (const r of routes) {
      await page.goto(`${base}#/${r}`);
      await page.waitForTimeout(250);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 0) problems.push(`${r}: horizontal overflow ${overflow}px`);
      if (scheme === 'dark' || label === 'phone') await page.screenshot({ path: path.join(out, `${label}-${scheme}-${r}.png`), fullPage: label === 'phone' });
    }
    const first = await page.evaluate(() => document.querySelector('.entry-card') ? 1 : 0);
    console.log(`${label}/${scheme}: ${problems.length ? problems.join('\n  ') : 'no console errors'}${first ? '' : ' (no entry cards?)'}`);
    await ctx.close();
  }
}
await browser.close();
process.exit(0);
