import { test as base, expect } from '@playwright/test';

// Every test fails if the page throws, logs an error, or opens a browser dialog (confirm/alert).
export const test = base.extend({
  page: async ({ page }, use) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console: ${m.text()}`); });
    page.on('dialog', (d) => { problems.push(`dialog: ${d.type()} ${d.message()}`); d.dismiss(); });
    await use(page);
    expect(problems, 'no errors or browser dialogs').toEqual([]);
  },
});
export { expect };

export async function open(page, route = 'log') {
  await page.goto(`./#/${route}`);
  await expect(page.locator('main h1')).toBeVisible();
}

// Saves entries straight into the app's store, then reloads so the current screen shows them.
export async function seed(page, entries) {
  await page.evaluate(async (list) => {
    const store = await import('./js/store.js');
    for (const e of list) await store.save(e);
  }, entries);
  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
}

export const chip = (scope, text) => scope.locator('label.chip', { hasText: new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) });

export async function readDownload(download) {
  const fs = await import('node:fs/promises');
  return fs.readFile(await download.path());
}

// A tiny in-memory imitation of the GitHub Gists API, shared by any number of browser contexts.
export function fakeGitHub({ validTokens }) {
  const gists = new Map();
  const calls = [];
  let n = 0;
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, accept',
    'access-control-allow-methods': 'GET, POST, PATCH, OPTIONS',
  };
  const json = (route, status, body) => route.fulfill({ status, headers: { ...cors, 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const full = (g) => ({
    id: g.id,
    created_at: g.created_at,
    description: g.description,
    public: false,
    files: Object.fromEntries(Object.entries(g.files).map(([name, f]) => [name, { filename: name, content: f.content, truncated: false, raw_url: `https://gist.githubusercontent.com/me/${g.id}/raw/${name}` }])),
  });

  async function handler(route) {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const auth = req.headers().authorization || '';
    calls.push({ method: req.method(), path: url.pathname, auth });
    if (!validTokens.some((t) => auth === `Bearer ${t}`)) return json(route, 401, { message: 'Bad credentials' });
    const m = url.pathname.match(/^\/gists\/([0-9a-f]+)$/);
    if (req.method() === 'GET' && url.pathname === '/gists') {
      const page = Number(url.searchParams.get('page') || 1);
      const per = Number(url.searchParams.get('per_page') || 30);
      const list = [...gists.values()].slice((page - 1) * per, page * per).map((g) => {
        const f = full(g);
        for (const file of Object.values(f.files)) delete file.content;
        return f;
      });
      return json(route, 200, list);
    }
    if (req.method() === 'POST' && url.pathname === '/gists') {
      const body = req.postDataJSON();
      const id = (++n).toString(16).padStart(32, 'a');
      const g = { id, created_at: new Date(Date.now() + n).toISOString(), description: body.description, files: {} };
      for (const [name, f] of Object.entries(body.files)) g.files[name] = { content: f.content };
      gists.set(id, g);
      return json(route, 201, full(g));
    }
    if (m && req.method() === 'GET') {
      const g = gists.get(m[1]);
      return g ? json(route, 200, full(g)) : json(route, 404, { message: 'Not Found' });
    }
    if (m && req.method() === 'PATCH') {
      const g = gists.get(m[1]);
      if (!g) return json(route, 404, { message: 'Not Found' });
      for (const [name, f] of Object.entries(req.postDataJSON().files)) g.files[name] = { content: f.content };
      return json(route, 200, full(g));
    }
    return json(route, 404, { message: 'Not Found' });
  }

  const remoteData = () => {
    const g = [...gists.values()][0];
    return g ? JSON.parse(g.files['cyber-logbook.json'].content) : null;
  };
  return { gists, calls, handler, remoteData };
}
