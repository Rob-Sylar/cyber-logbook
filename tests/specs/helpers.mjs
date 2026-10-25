import { test as base, expect } from '@playwright/test';
import { createHash } from 'node:crypto';

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

// A full backup is a zip: backup.json plus images/<id>.webp
export async function readBackupZip(download) {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(await readDownload(download));
  const json = JSON.parse(await zip.file('backup.json').async('string'));
  const imageFiles = Object.keys(zip.files).filter((n) => n.startsWith('images/') && !zip.files[n].dir);
  return { zip, json, imageFiles };
}

// ---- Test screenshots ------------------------------------------------------------------------------
// A white "screenshot" with a red block (the secret to black out), a blue block (must survive)
// and a line of terminal-style text. Proportions are fixed so tests can find the blocks at any size.
const DRAW_TEST_IMAGE = `(w, h) => {
  const c = new OffscreenCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#ff0000'; x.fillRect(w * 0.1, h * 0.2, w * 0.2, h * 0.4);
  x.fillStyle = '#0000ff'; x.fillRect(w * 0.6, h * 0.2, w * 0.2, h * 0.4);
  x.fillStyle = '#000000'; x.font = Math.round(h / 20) + 'px monospace'; x.fillText('nmap -sV 10.10.10.10', w * 0.1, h * 0.85);
  return c.convertToBlob({ type: 'image/png' });
}`;

export async function makePng(page, filePath, { w, h }) {
  const fs = await import('node:fs/promises');
  const b64 = await page.evaluate(`(async () => {
    const blob = await (${DRAW_TEST_IMAGE})(${w}, ${h});
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let s = ''; for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  })()`);
  await fs.writeFile(filePath, Buffer.from(b64, 'base64'));
  return filePath;
}

// Same as pressing Ctrl+V with a screenshot on the clipboard (what Win+Shift+S does).
export async function pasteImage(page, { w, h }) {
  await page.evaluate(`(async () => {
    const blob = await (${DRAW_TEST_IMAGE})(${w}, ${h});
    const dt = new DataTransfer();
    dt.items.add(new File([blob], 'image.png', { type: 'image/png' }));
    document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  })()`);
}

// Same as dragging image files from File Explorer and dropping them on the element.
export async function dropFiles(page, selector, files) {
  await page.evaluate(`(async () => {
    const dt = new DataTransfer();
    for (const f of ${JSON.stringify(files)}) {
      const blob = f.image ? await (${DRAW_TEST_IMAGE})(f.w, f.h) : new Blob([f.text || 'hello'], { type: f.type || 'text/plain' });
      dt.items.add(new File([blob], f.name, { type: blob.type }));
    }
    const el = document.querySelector(${JSON.stringify(selector)});
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  })()`);
}

// Draws a black box on the redact canvas, using the canvas's own pixel coordinates.
export async function drawBox(page, from, to) {
  const canvas = page.locator('.redact-canvas');
  const box = await canvas.boundingBox();
  const size = await canvas.evaluate((c) => [c.width, c.height]);
  const at = ([x, y]) => [box.x + (x * box.width) / size[0], box.y + (y * box.height) / size[1]];
  await page.mouse.move(...at(from));
  await page.mouse.down();
  await page.mouse.move(...at(to), { steps: 6 });
  await page.mouse.up();
}

// Reads the saved (compressed, redacted) image back and samples pixels from it.
export function inspectImage(page, id, points) {
  return page.evaluate(async ([imageId, pts]) => {
    const images = await import('./js/images.js');
    const rec = await images.getImage(imageId);
    if (!rec) return null;
    const bmp = await createImageBitmap(rec.blob);
    const c = new OffscreenCanvas(bmp.width, bmp.height);
    const x = c.getContext('2d');
    x.drawImage(bmp, 0, 0);
    return { type: rec.type, w: rec.w, h: rec.h, size: rec.size, bw: bmp.width, bh: bmp.height, px: pts.map(([px, py]) => Array.from(x.getImageData(px, py, 1, 1).data.slice(0, 3))) };
  }, [id, points]);
}

export const imageCount = (page) => page.evaluate(async () => (await (await import('./js/images.js')).imageIds()).length);

// Saves an entry with one screenshot straight into the app (faster than the UI). Returns the image id.
export async function seedShotEntry(page, entry, { w = 1600, h = 900, caption = '' } = {}) {
  const id = await page.evaluate(`(async () => {
    const images = await import('./js/images.js');
    const store = await import('./js/store.js');
    const res = await images.processImage(await (${DRAW_TEST_IMAGE})(${w}, ${h}));
    const rec = await images.storeImage(res.blob, res.w, res.h);
    await store.save({ ...${JSON.stringify(entry)}, shots: [{ id: rec.id, caption: ${JSON.stringify(caption)}, w: res.w, h: res.h }] });
    return rec.id;
  })()`);
  await page.reload();
  await expect(page.locator('main h1')).toBeVisible();
  return id;
}

// A tiny in-memory imitation of the GitHub API (Gists, plus private repositories for screenshots),
// shared by any number of browser contexts.
export function fakeGitHub({ validTokens, repos: repoDefs = { 'cyber-logbook-data': { private: true }, 'public-repo': { private: false } } }) {
  const gists = new Map();
  const calls = [];
  let n = 0;
  const sha1 = (data) => createHash('sha1').update(data).digest('hex');
  const readme = Buffer.from('# readme\n');
  const repos = new Map(Object.entries(repoDefs).map(([name, def]) => [name, {
    private: def.private, files: new Map([['README.md', { content: readme, sha: sha1(readme) }]]), trees: new Map(), commits: new Map(), head: 'c0',
  }]));
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type, accept',
    'access-control-allow-methods': 'GET, POST, PATCH, PUT, DELETE, OPTIONS',
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
    if (req.method() === 'GET' && url.pathname === '/user') return json(route, 200, { login: 'me' });
    const r = url.pathname.match(/^\/repos\/me\/([^/]+)(\/.*)?$/);
    if (r) return repoHandler(route, req, decodeURIComponent(r[1]), r[2] || '');
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

  // The bits of the repository API that screenshot sync uses.
  async function repoHandler(route, req, name, rest) {
    const repo = repos.get(name);
    if (!repo) return json(route, 404, { message: 'Not Found' });
    const method = req.method();
    if (rest === '' && method === 'GET') return json(route, 200, { full_name: `me/${name}`, private: repo.private, default_branch: 'main' });
    if (rest.startsWith('/git/trees/') && method === 'GET') {
      if (!repo.files.size) return json(route, 409, { message: 'Git Repository is empty.' });
      return json(route, 200, { sha: 'tree', truncated: false, tree: [...repo.files].map(([p, f]) => ({ path: p, mode: '100644', type: 'blob', sha: f.sha })) });
    }
    const c = rest.match(/^\/contents\/(.+)$/);
    if (c) {
      const p = decodeURIComponent(c[1]);
      const f = repo.files.get(p);
      if (method === 'GET') {
        if (!f) return json(route, 404, { message: 'Not Found' });
        if ((req.headers().accept || '').includes('raw')) return route.fulfill({ status: 200, headers: { ...cors, 'content-type': 'application/octet-stream' }, body: f.content });
        return json(route, 200, { path: p, sha: f.sha, content: f.content.toString('base64'), encoding: 'base64' });
      }
      if (method === 'PUT') {
        const body = req.postDataJSON();
        if (f && body.sha !== f.sha) return json(route, 422, { message: 'Invalid request. "sha" wasn\'t supplied.' });
        const content = Buffer.from(body.content, 'base64');
        repo.files.set(p, { content, sha: sha1(content) });
        return json(route, f ? 200 : 201, { content: { path: p, sha: sha1(content) } });
      }
      if (method === 'DELETE') {
        if (!f) return json(route, 404, { message: 'Not Found' });
        if (req.postDataJSON().sha !== f.sha) return json(route, 409, { message: 'sha does not match' });
        repo.files.delete(p);
        return json(route, 200, { commit: {} });
      }
    }
    if (rest.startsWith('/git/ref/heads/') && method === 'GET') {
      if (!repo.files.size) return json(route, 409, { message: 'Git Repository is empty.' });
      return json(route, 200, { ref: 'refs/heads/main', object: { sha: repo.head, type: 'commit' } });
    }
    if (rest === '/git/trees' && method === 'POST') {
      const sha = `t${++n}`;
      repo.trees.set(sha, req.postDataJSON().tree);
      return json(route, 201, { sha });
    }
    if (rest === '/git/commits' && method === 'POST') {
      const body = req.postDataJSON();
      if (body.parents[0] !== repo.head) return json(route, 422, { message: 'parent mismatch' });
      const sha = `c${++n}`;
      repo.commits.set(sha, body.tree);
      return json(route, 201, { sha });
    }
    if (rest.startsWith('/git/refs/heads/') && method === 'PATCH') {
      const commit = req.postDataJSON().sha;
      const tree = repo.trees.get(repo.commits.get(commit)) || [];
      repo.files = new Map(tree.map((t) => [t.path, { content: Buffer.from(t.content || ''), sha: sha1(t.content || '') }]));
      repo.head = commit;
      return json(route, 200, { object: { sha: commit } });
    }
    return json(route, 404, { message: 'Not Found' });
  }

  const remoteData = () => {
    const g = [...gists.values()][0];
    return g ? JSON.parse(g.files['cyber-logbook.json'].content) : null;
  };
  const repoImages = (name = 'cyber-logbook-data') => [...repos.get(name).files.keys()].filter((p) => p.startsWith('images/')).sort();
  const repoFile = (p, name = 'cyber-logbook-data') => repos.get(name).files.get(p);
  return { gists, calls, handler, remoteData, repoImages, repoFile };
}
