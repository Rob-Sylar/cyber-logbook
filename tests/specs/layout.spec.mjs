// Every screen fits the window, has big enough tap targets and passes automated accessibility checks.
// Runs on desktop (1440px), a small 360px phone and a 2560x1440 monitor.
import AxeBuilder from '@axe-core/playwright';
import { test, expect, open, seed } from './helpers.mjs';
import { sampleEntries } from '../fixtures/sample.mjs';

const ROUTES = ['log', 'journal', 'cheats', 'questions', 'review', 'stats', 'settings', 'install'];

for (const scheme of ['light', 'dark']) {
  test(`all screens: no sideways scroll, no accessibility problems (${scheme})`, async ({ page }, info) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page, 'log');
    await seed(page, sampleEntries());
    const entryId = await page.evaluate(async () => (await import('./js/store.js')).entries()[0].id);
    for (const route of [...ROUTES, `entry/${entryId}`, `edit/${entryId}`]) {
      await open(page, route);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, `${route} should not scroll sideways`).toBeLessThanOrEqual(0);

      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      const bad = results.violations
        .filter((v) => v.impact === 'serious' || v.impact === 'critical')
        .map((v) => `${v.id}: ${v.help} -> ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
      expect(bad, `${route} (${info.project.name}, ${scheme})`).toEqual([]);
    }
  });
}

test('tap targets are at least 44px on phones', async ({ page }, info) => {
  test.skip(info.project.name !== 'small-phone', 'phone only');
  await open(page, 'log');
  await seed(page, sampleEntries());
  for (const route of ['log', 'journal', 'cheats', 'review', 'settings']) {
    await open(page, route);
    const small = await page.evaluate(() => [...document.querySelectorAll('.btn, .icon-btn, .chip-label, .chip-btn, .nav a, .seg-btn, .check, summary, .back-link')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.width > 0 && (r.height < 44 || r.width < 36))
      .map(({ el, r }) => `${el.className || el.tagName} "${el.textContent.trim().slice(0, 20)}" ${Math.round(r.width)}x${Math.round(r.height)}`));
    expect(small, route).toEqual([]);
  }
});

test('bottom navigation on phones, sidebar on big screens', async ({ page }, info) => {
  await open(page, 'journal');
  const nav = page.getByRole('navigation', { name: 'Main' });
  const box = await nav.boundingBox();
  const vp = page.viewportSize();
  if (vp.width < 1024) {
    expect(Math.round(box.y + box.height)).toBe(vp.height);
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeHidden();
    await expect(page.locator('.topbar').getByRole('link', { name: 'Settings' })).toBeVisible();
  } else {
    expect(box.x).toBe(0);
    expect(box.height).toBeGreaterThan(400);
    await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
  }
  await expect(nav.getByRole('link', { name: 'Journal' })).toHaveAttribute('aria-current', 'page');
});
