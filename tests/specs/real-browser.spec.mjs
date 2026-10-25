// Only runs when CL_BROWSER points at an installed browser (see playwright.config.js).
// Records what that browser says about itself and checks the install help reacts correctly.
import { test, expect, open } from './helpers.mjs';

test('install help recognises this real browser', async ({ page }, info) => {
  const exe = info.project.use.launchOptions?.executablePath || '';
  test.skip(!exe, 'set CL_BROWSER to run this');
  await open(page, 'install');
  const seen = await page.evaluate(async () => {
    const { detectBrowser } = await import('./js/browser.js');
    const brands = navigator.userAgentData ? navigator.userAgentData.brands.map((b) => b.brand) : null;
    return { ua: navigator.userAgent, brands, detected: detectBrowser() };
  });
  info.annotations.push({ type: 'browser', description: JSON.stringify(seen) });
  console.log(JSON.stringify(seen, null, 2));
  if (/opera/i.test(exe)) {
    expect(['opera-gx', 'opera']).toContain(seen.detected.name);
    await expect(page.getByRole('link', { name: 'Open in Edge' })).toBeVisible();
  }
});
