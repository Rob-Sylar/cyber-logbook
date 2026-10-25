// Install-ability and offline behaviour, checked with Chrome's own PWA installability report.
import { test, expect, chromium } from '@playwright/test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function walk(dir) {
  const out = [];
  for (const d of await fs.readdir(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = `${dir}/${d.name}`;
    if (d.isDirectory()) out.push(...(await walk(rel)));
    else out.push(rel);
  }
  return out;
}

test('manifest has everything an installable app needs', async ({ page }) => {
  await page.goto('./');
  const m = await page.evaluate(async () => (await fetch('manifest.webmanifest')).json());
  expect(m.name).toBe('Cyber Logbook');
  expect(m.short_name.length).toBeLessThanOrEqual(12);
  expect(m.display).toBe('standalone');
  expect(m.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
  expect(m.start_url).toBeTruthy();
  for (const purpose of ['any', 'maskable']) {
    for (const size of [192, 512]) {
      const icon = m.icons.find((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
      expect(icon, `${purpose} ${size}`).toBeTruthy();
      const dims = await page.evaluate((src) => new Promise((res) => {
        const img = new Image();
        img.onload = () => res([img.naturalWidth, img.naturalHeight]);
        img.onerror = () => res([0, 0]);
        img.src = src;
      }), icon.src);
      expect(dims).toEqual([size, size]);
    }
  }
});

test('every app file is listed in the service worker cache', async () => {
  const sw = await fs.readFile(path.join(ROOT, 'sw.js'), 'utf8');
  const listed = new Set([...sw.matchAll(/'([\w./-]+\.(?:js|css|html|webmanifest|png|svg))'/g)].map((m) => m[1]));
  const onDisk = ['index.html', 'manifest.webmanifest', ...(await walk('js')), ...(await walk('css')), ...(await walk('vendor')), ...(await walk('icons'))];
  for (const f of onDisk) expect(listed.has(f), `${f} must be in sw.js ASSETS`).toBe(true);
  for (const f of listed) await expect(fs.access(path.join(ROOT, f)), `${f} listed in sw.js must exist`).resolves.toBeUndefined();
});

test('Chrome says it is installable, and it works with no network', async ({}, info) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cyber-logbook-pwa-'));
  const launchOptions = info.project.use.launchOptions || {};
  const ctx = await chromium.launchPersistentContext(dir, { ...launchOptions, baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 800 } });
  try {
    // A fresh tab: some browsers (Opera) load their own start page into the first one.
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const cdp = await ctx.newCDPSession(page);
    const manifest = await cdp.send('Page.getAppManifest');
    expect(manifest.errors).toEqual([]);
    if (/opera/i.test(launchOptions.executablePath || '')) {
      // Opera / Opera GX can't install web apps on a PC: just record what it says.
      const report = await cdp.send('Page.getInstallabilityErrors').catch((err) => ({ error: err.message }));
      info.annotations.push({ type: 'installability', description: JSON.stringify(report) });
    } else {
      const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
      expect(installabilityErrors).toEqual([]);
    }

    // Pull the plug.
    await ctx.setOffline(true);
    await page.reload();
    await expect(page.locator('main h1')).toHaveText('Log a session');
    await page.getByRole('switch', { name: 'Quick log' }).check({ force: true });
    await page.getByRole('group', { name: 'Platform' }).locator('label.chip', { hasText: /^Homelab$/ }).click();
    await page.getByLabel('Room, level or lab name').fill('Offline lab notes');
    await page.getByLabel('What I learned').fill('Logged with no internet.');
    await page.getByRole('button', { name: 'Save entry' }).click();
    await expect(page.getByRole('heading', { level: 1, name: 'Offline lab notes' })).toBeVisible();
    for (const route of ['journal', 'cheats', 'questions', 'review', 'stats', 'settings', 'install']) {
      await page.goto(`./#/${route}`);
      await expect(page.locator('main h1')).toBeVisible();
    }
    // The zip library also comes from the offline cache.
    await page.goto('./#/settings');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Markdown (.zip)' }).click()]);
    const zip = await JSZip.loadAsync(await fs.readFile(await dl.path()));
    expect(Object.keys(zip.files).some((f) => f.endsWith('Offline lab notes.md'))).toBe(true);

    // Data is still there after closing and reopening (still offline).
    await page.close();
    const again = await ctx.newPage();
    await again.goto('./#/journal');
    await expect(again.locator('.entry-card')).toContainText('Offline lab notes');
    expect(errors).toEqual([]);
  } finally {
    await ctx.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});
