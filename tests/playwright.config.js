import { defineConfig, devices } from '@playwright/test';
import { BASE_PATH, BASE_URL, PORT } from './base-url.mjs';

// Optional: run the suite in another Chromium-based browser you have installed, e.g. Opera GX:
//   set CL_BROWSER=C:\Users\<you>\AppData\Local\Programs\Opera GX\<version>\opera.exe
const customBrowser = process.env.CL_BROWSER;

export default defineConfig({
  testDir: './specs',
  timeout: 60_000,
  expect: { timeout: 8_000 },
  workers: customBrowser ? 1 : 3,
  // Opera GX sometimes quits between tests when driven by Playwright; one retry absorbs that (reported as "flaky").
  retries: customBrowser ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node tools/serve.mjs',
    url: BASE_URL,
    env: { PORT: String(PORT), BASE: BASE_PATH },
    reuseExistingServer: true,
  },
  projects: customBrowser
    ? [{ name: 'custom-browser', testIgnore: /install\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions: { executablePath: customBrowser } } }]
    : [
      { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
      { name: 'phone', testMatch: /(app|shots)\.spec/, use: { ...devices['Pixel 7'] } },
      { name: 'small-phone', testMatch: /layout\.spec/, use: { ...devices['Galaxy S9+'], viewport: { width: 360, height: 740 } } },
      { name: 'qhd', testMatch: /layout\.spec/, use: { ...devices['Desktop Chrome'], viewport: { width: 2560, height: 1440 } } },
    ],
});
