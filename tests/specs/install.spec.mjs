// The "How to install" screen shows the right steps for the browser it's opened in.
import { test, expect } from './helpers.mjs';
import { BASE_URL } from '../base-url.mjs';

const UA = {
  operaGX: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 OPR/124.0.0.0',
  edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0',
  androidChrome: 'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
  samsung: 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0',
};
const brands = (...names) => ({ brands: names.map((brand) => ({ brand, version: '140' })), mobile: false, platform: 'Windows' });

async function installPage(browser, userAgent, uaData) {
  const ctx = await browser.newContext({ userAgent, baseURL: BASE_URL });
  if (uaData) {
    await ctx.addInitScript((data) => {
      Object.defineProperty(navigator, 'userAgentData', { value: data, configurable: true });
    }, uaData);
  }
  const page = await ctx.newPage();
  await page.goto('./#/install');
  await expect(page.locator('main h1')).toHaveText('Install the app');
  return { ctx, page };
}

test('detectBrowser recognises the browsers you use', async ({ page }) => {
  await page.goto('./');
  const results = await page.evaluate(async ([ua, b]) => {
    const { detectBrowser } = await import('./js/browser.js');
    return {
      gxBrand: detectBrowser(ua.operaGX, b.gx).name,
      gxUaOnly: detectBrowser(ua.operaGX, undefined).name,
      edge: detectBrowser(ua.edge, b.edge).name,
      androidChrome: detectBrowser(ua.androidChrome, { ...b.chrome, mobile: true }),
      samsung: detectBrowser(ua.samsung, undefined).name,
      firefox: detectBrowser(ua.firefox, undefined).name,
    };
  }, [UA, { gx: brands('Chromium', 'Opera GX', 'Not=A?Brand'), edge: brands('Chromium', 'Microsoft Edge'), chrome: brands('Chromium', 'Google Chrome') }]);
  expect(results.gxBrand).toBe('opera-gx');
  expect(results.gxUaOnly).toBe('opera');
  expect(results.edge).toBe('edge');
  expect(results.androidChrome).toMatchObject({ name: 'chrome', os: 'android', mobile: true });
  expect(results.samsung).toBe('samsung');
  expect(results.firefox).toBe('firefox');
});

test('Opera GX on Windows is sent to Edge with an "Open in Edge" link', async ({ browser }) => {
  const { ctx, page } = await installPage(browser, UA.operaGX, brands('Chromium', 'Opera GX', 'Not=A?Brand'));
  await expect(page.getByText('Detected: Opera GX on Windows.')).toBeVisible();
  await expect(page.getByRole('heading', { name: "You're in Opera GX" })).toBeVisible();
  await expect(page.getByText("Opera GX can't install web apps on a PC.")).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Edge' })).toHaveAttribute('href', `microsoft-edge:${BASE_URL}`);
  await expect(page.getByRole('heading', { name: 'Then, in Microsoft Edge' })).toBeVisible();
  await expect(page.getByText('keep separate copies of your data')).toBeVisible();
  await ctx.close();
});

test('Opera GX is still handled when it only says "OPR" (older versions)', async ({ browser }) => {
  const { ctx, page } = await installPage(browser, UA.operaGX, brands('Chromium', 'Opera'));
  await expect(page.getByRole('heading', { name: "You're in Opera" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Edge' })).toBeVisible();
  await ctx.close();
});

test('Edge on Windows gets the Edge steps', async ({ browser }) => {
  const { ctx, page } = await installPage(browser, UA.edge, brands('Chromium', 'Microsoft Edge'));
  await expect(page.getByRole('heading', { name: 'Install in Microsoft Edge' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open in Edge' })).toHaveCount(0);
  await ctx.close();
});

test('Chrome on Android gets the "Install app" steps', async ({ browser }) => {
  const { ctx, page } = await installPage(browser, UA.androidChrome, { ...brands('Chromium', 'Google Chrome'), mobile: true, platform: 'Android' });
  await expect(page.getByRole('heading', { name: 'Install on Android (Chrome)' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Use Chrome to install' })).toHaveCount(0);
  await expect(page.locator('main')).toContainText('Install app');
  await ctx.close();
});

test('Samsung Internet on Android is pointed to Chrome', async ({ browser }) => {
  const { ctx, page } = await installPage(browser, UA.samsung);
  await expect(page.getByRole('heading', { name: 'Use Chrome to install' })).toBeVisible();
  await ctx.close();
});
