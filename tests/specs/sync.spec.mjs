// Two separate browser profiles (separate storage, like a PC and a phone) syncing through one Gist.
// GitHub's API is replaced by an in-memory fake, so no real account or token is needed.
import { test, expect } from '@playwright/test';
import { fakeGitHub, readBackupZip, pasteImage, imageCount } from './helpers.mjs';
import { BASE_URL } from '../base-url.mjs';

const TOKEN_A = `github_pat_${'A1'.repeat(41)}`;
const TOKEN_B = `github_pat_${'B2'.repeat(41)}`;

async function device(browser, gh, name) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', baseURL: BASE_URL });
  await ctx.route('https://api.github.com/**', gh.handler);
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push(`${name} pageerror: ${e.message}`));
  page.on('console', (m) => {
    const t = m.text();
    if (m.type() === 'error' && !/status of 40[14]/.test(t)) page.problems.push(`${name} console: ${t}`);
    if (t.includes('github_pat_')) page.problems.push(`${name} logged the token!`);
  });
  page.on('dialog', (d) => { page.problems.push(`${name} dialog`); d.dismiss(); });
  await page.goto('./#/log');
  await expect(page.locator('main h1')).toBeVisible();
  return { ctx, page };
}

// Runs fn(store, sync, args) inside the page, using the app's own module instances.
// (Evaluated by Playwright, so the app's strict Content-Security-Policy stays switched on.)
const call = (page, fn, ...args) => page.evaluate(`(async () => {
  const store = await import('./js/store.js');
  const sync = await import('./js/sync.js');
  return (${fn.toString()})(store, sync, ${JSON.stringify(args)});
})()`);

const rooms = (page) => call(page, (store) => store.entries().map((e) => e.room).sort());
const status = (page) => call(page, (store, sync) => sync.getState().status);
async function syncNow(page) {
  await call(page, (store, sync) => sync.syncNow());
  expect(await status(page)).toBe('ok');
}
const addEntry = (page, room) => call(page, (store, sync, [r]) => store.save({ platform: 'TryHackMe', room: r, minutes: 30, learned: `learned in ${r}` }).then((e) => e.id), room);

async function connect(page, token) {
  await page.goto('./#/settings');
  await page.getByLabel('GitHub token (Gists: read and write)').fill(token);
  await page.getByRole('button', { name: 'Connect and sync' }).click();
  await expect(page.getByText('Sync is on for this device.')).toBeVisible();
  await expect.poll(() => status(page)).toBe('ok');
}

test('two profiles merge through the same Gist without losing anything', async ({ browser }) => {
  const gh = fakeGitHub({ validTokens: [TOKEN_A, TOKEN_B] });
  const A = await device(browser, gh, 'PC');
  const B = await device(browser, gh, 'Phone');

  // PC logs something, then turns sync on: a secret Gist is created.
  await addEntry(A.page, 'PC entry 1');
  await connect(A.page, TOKEN_A);
  expect(gh.gists.size).toBe(1);
  const created = gh.calls.find((c) => c.method === 'POST');
  expect(created.auth).toBe(`Bearer ${TOKEN_A}`);
  expect(gh.remoteData().entries.map((e) => e.room)).toEqual(['PC entry 1']);

  // Phone already has its own entry, connects with its own token, finds the same Gist and merges.
  await addEntry(B.page, 'Phone entry 1');
  await connect(B.page, TOKEN_B);
  expect(gh.gists.size).toBe(1);
  expect(await rooms(B.page)).toEqual(['PC entry 1', 'Phone entry 1']);

  // PC presses the header sync button and gets the phone's entry.
  await A.page.locator('#sync-btn').click();
  await expect.poll(() => rooms(A.page)).toEqual(['PC entry 1', 'Phone entry 1']);
  await expect(A.page.locator('#sync-btn')).toHaveAttribute('aria-label', /^Synced/);

  // Both devices edit while out of touch (auto-sync off): same entry on both + a new entry each.
  await call(A.page, (store, sync) => sync.setAuto(false));
  await call(B.page, (store, sync) => sync.setAuto(false));
  const sharedId = await call(A.page, (store) => store.entries().find((e) => e.room === 'PC entry 1').id);
  await call(A.page, (store, sync, [id]) => store.save({ ...store.get(id), room: 'Edited on PC' }), sharedId);
  await A.page.waitForTimeout(30);
  await call(B.page, (store, sync, [id]) => store.save({ ...store.get(id), room: 'Edited on phone (later)' }), sharedId);
  await addEntry(A.page, 'PC entry 2');
  await addEntry(B.page, 'Phone entry 2');

  await syncNow(A.page);
  await syncNow(B.page);
  await syncNow(A.page);
  const expected = ['Edited on phone (later)', 'PC entry 2', 'Phone entry 1', 'Phone entry 2'];
  expect(await rooms(A.page)).toEqual(expected);
  expect(await rooms(B.page)).toEqual(expected);
  expect(gh.remoteData().entries.filter((e) => !e.deleted).map((e) => e.room).sort()).toEqual(expected);

  // A delete on the phone reaches the PC (it isn't resurrected by the PC's copy).
  const delId = await call(B.page, (store) => store.entries().find((e) => e.room === 'Phone entry 2').id);
  await B.page.goto(`./#/entry/${delId}`);
  await B.page.getByRole('button', { name: 'Delete' }).click();
  await B.page.getByRole('button', { name: 'Delete entry' }).click();
  await syncNow(B.page);
  await syncNow(A.page);
  expect(await rooms(A.page)).toEqual(['Edited on phone (later)', 'PC entry 2', 'Phone entry 1']);
  expect(gh.remoteData().entries.find((e) => e.id === delId).deleted).toBe(true);

  // Auto-sync after a save.
  await call(A.page, (store, sync) => sync.setAuto(true));
  await addEntry(A.page, 'PC entry 3 (auto)');
  await expect.poll(() => gh.remoteData().entries.some((e) => e.room === 'PC entry 3 (auto)'), { timeout: 10_000 }).toBe(true);

  // The token never leaves the device: not in the Gist, backups, localStorage or the page.
  const gistText = [...gh.gists.values()][0].files['cyber-logbook.json'].content;
  expect(gistText).not.toContain('github_pat_');
  for (const { page } of [A, B]) {
    const leaks = await page.evaluate(async () => {
      const { currentBackup } = await import('./js/backup.js');
      return [JSON.stringify(currentBackup()), JSON.stringify({ ...localStorage }), document.documentElement.outerHTML].filter((t) => t.includes('github_pat_')).length;
    });
    expect(leaks).toBe(0);
  }
  expect(gh.calls.filter((c) => c.auth && c.auth !== `Bearer ${TOKEN_A}` && c.auth !== `Bearer ${TOKEN_B}`)).toEqual([]);

  expect([...A.page.problems, ...B.page.problems]).toEqual([]);
  await A.ctx.close();
  await B.ctx.close();
});

test('wiping the synced copy: backups first, the other device asks, and undo works', async ({ browser }) => {
  const gh = fakeGitHub({ validTokens: [TOKEN_A, TOKEN_B] });
  const A = await device(browser, gh, 'PC');
  const B = await device(browser, gh, 'Phone');
  await addEntry(A.page, 'PC note');
  await connect(A.page, TOKEN_A);
  await addEntry(B.page, 'Phone note');
  await connect(B.page, TOKEN_B);
  await syncNow(A.page);

  // PC: Reset → type RESET → backup downloads → wipe → offered "also wipe synced copy".
  await A.page.goto('./#/settings');
  await A.page.getByRole('button', { name: 'Reset all local data…' }).click();
  const go = A.page.getByRole('button', { name: 'Back up, then wipe this device' });
  await expect(go).toBeDisabled();
  await A.page.getByLabel('Type RESET to confirm').fill('reset');
  await expect(go).toBeEnabled();
  const [backupDl] = await Promise.all([A.page.waitForEvent('download'), go.click()]);
  expect(backupDl.suggestedFilename()).toMatch(/^cyber-logbook-before-reset-.*\.zip$/);
  const { json: saved } = await readBackupZip(backupDl);
  expect(saved.entries.map((e) => e.room).sort()).toEqual(['PC note', 'Phone note']);
  await expect(A.page.getByText('This device has been reset.')).toBeVisible();
  expect(await rooms(A.page)).toEqual([]);
  expect(await A.page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('cl-')))).toEqual([]);

  const [remoteDl] = await Promise.all([A.page.waitForEvent('download'), A.page.getByRole('button', { name: 'Yes, wipe the synced copy too' }).click()]);
  expect(remoteDl.suggestedFilename()).toMatch(/^cyber-logbook-synced-copy-before-wipe-.*\.json$/);
  await expect(A.page.getByText('The synced copy was wiped too.')).toBeVisible();
  expect(gh.remoteData().entries).toEqual([]);
  expect(gh.remoteData().resetAt).toBeTruthy();

  // Phone: next sync notices the wipe and asks instead of deleting or re-uploading on its own.
  await call(B.page, (store, sync) => sync.syncNow());
  expect(await status(B.page)).toBe('decision');
  await B.page.goto('./#/journal');
  await expect(B.page.getByText(/Your synced copy was wiped from another device/)).toBeVisible();
  expect(await rooms(B.page)).toEqual(['PC note', 'Phone note']);
  await B.page.getByRole('button', { name: 'Keep and re-upload' }).click();
  await expect.poll(() => status(B.page)).toBe('ok');
  expect(gh.remoteData().entries.map((e) => e.room).sort()).toEqual(['PC note', 'Phone note']);

  // PC: Undo puts everything back and reconnects sync.
  await A.page.getByRole('button', { name: 'Undo reset' }).click();
  await expect.poll(() => rooms(A.page)).toEqual(['PC note', 'Phone note']);
  await expect.poll(() => status(A.page)).toBe('ok');

  expect([...A.page.problems, ...B.page.problems]).toEqual([]);
  await A.ctx.close();
  await B.ctx.close();
});

test('the other device can also choose to remove its old entries (backup first)', async ({ browser }) => {
  const gh = fakeGitHub({ validTokens: [TOKEN_A, TOKEN_B] });
  const A = await device(browser, gh, 'PC');
  const B = await device(browser, gh, 'Phone');
  await addEntry(B.page, 'Old phone note');
  await connect(B.page, TOKEN_B);
  await connect(A.page, TOKEN_A);
  const wiped = await call(A.page, async (store, sync) => {
    const { wipeRemote } = sync;
    return wipeRemote(sync.exportCredentials()).then((r) => !!r.resetAt);
  });
  expect(wiped).toBe(true);
  await B.page.goto('./#/journal');
  await call(B.page, (store, sync) => sync.syncNow());
  const [dl] = await Promise.all([B.page.waitForEvent('download'), B.page.getByRole('button', { name: 'Remove them here too' }).click()]);
  expect(dl.suggestedFilename()).toMatch(/^cyber-logbook-before-sync-wipe-/);
  await expect.poll(() => rooms(B.page)).toEqual([]);
  await expect.poll(() => status(B.page)).toBe('ok');
  expect([...A.page.problems, ...B.page.problems]).toEqual([]);
  await A.ctx.close();
  await B.ctx.close();
});

// ---- Screenshots ---------------------------------------------------------------------------------
const imageIds = (page) => page.evaluate(async () => (await (await import('./js/images.js')).imageIds()).sort());
const imageState = (page) => page.evaluate(async () => (await import('./js/imagesync.js')).getState().status);
const runImages = (page) => page.evaluate(async () => (await import('./js/imagesync.js')).run());

async function connectImages(page, repo) {
  await page.goto('./#/settings');
  await page.getByRole('textbox', { name: 'Private repository' }).fill(repo);
  await page.getByRole('button', { name: 'Connect screenshot sync' }).click();
}

async function logWithScreenshot(page, room) {
  await page.goto('./#/log');
  await page.getByRole('group', { name: 'Platform' }).locator('label.chip', { hasText: /^Homelab$/ }).click();
  await page.getByLabel('Room, level or lab name').fill(room);
  await pasteImage(page, { w: 1400, h: 800 });
  await page.getByRole('dialog', { name: 'Check this screenshot' }).getByRole('button', { name: 'Save screenshot' }).click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page).toHaveURL(/#\/entry\//);
  return call(page, (store, sync, [r]) => store.entries().find((e) => e.room === r).shots[0].id, room);
}

test('screenshots sync through a private repository, deletes follow, and an offline device catches up', async ({ browser }) => {
  const gh = fakeGitHub({ validTokens: [TOKEN_A, TOKEN_B] });
  const A = await device(browser, gh, 'PC');
  const B = await device(browser, gh, 'Phone');
  await connect(A.page, TOKEN_A);
  await connect(B.page, TOKEN_B);
  for (const d of [A, B]) await d.page.evaluate(async () => { (await import('./js/images.js')).tuning.writeGapMs = 0; });

  // A public repository is refused: anyone could see the screenshots.
  await connectImages(A.page, 'public-repo');
  await expect(A.page.getByText(/public-repo is public, so anyone could see your screenshots/)).toBeVisible();

  // Both devices connect to the private one (just the name: the owner is looked up).
  for (const d of [A, B]) {
    await connectImages(d.page, 'cyber-logbook-data');
    await expect(d.page.getByText('Screenshots sync through me/cyber-logbook-data.')).toBeVisible();
  }

  // PC logs an entry with a screenshot: text goes to the Gist, then the image is uploaded once.
  const id1 = await logWithScreenshot(A.page, 'Lab with picture');
  await expect.poll(() => gh.repoImages(), { timeout: 15_000 }).toEqual([`images/${id1}.webp`]);
  const uploaded = gh.repoFile(`images/${id1}.webp`).content;
  const local = await A.page.evaluate(async (i) => (await (await import('./js/images.js')).getImage(i)).size, id1);
  expect(uploaded.length).toBe(local);
  expect(gh.remoteData().entries.find((e) => e.room === 'Lab with picture').shots[0].id).toBe(id1);
  expect(JSON.stringify(gh.remoteData())).not.toContain('base64'); // no image data in the Gist

  // Phone syncs: gets the entry, then downloads only the image it's missing.
  await syncNow(B.page);
  await expect.poll(() => imageIds(B.page), { timeout: 15_000 }).toEqual([id1]);
  const puts = gh.calls.filter((c) => c.method === 'PUT').length;
  await runImages(B.page);
  expect(gh.calls.filter((c) => c.method === 'PUT').length, 'nothing re-uploaded').toBe(puts);
  await B.page.goto(`./#/entry/${await call(B.page, (store) => store.entries()[0].id)}`);
  await expect.poll(() => B.page.locator('.gallery img').evaluate((i) => i.naturalWidth)).toBe(1400);

  // Phone deletes it: the PC's entry loses it at the next sync, and the file leaves the repository.
  await B.page.getByRole('button', { name: /Open screenshot 1/ }).click();
  await B.page.getByRole('button', { name: 'Delete this screenshot' }).click();
  await B.page.getByRole('button', { name: 'Delete screenshot' }).click();
  await syncNow(B.page);
  await syncNow(A.page);
  expect(await call(A.page, (store) => store.entries()[0].shots.length)).toBe(0);
  for (const d of [A, B]) await d.page.evaluate(async () => { (await import('./js/images.js')).tuning.graceMs = 0; });
  await runImages(A.page);
  expect(gh.repoImages()).toEqual([]);
  expect(await imageIds(A.page)).toEqual([]);
  await runImages(B.page);
  expect(await imageIds(B.page)).toEqual([]);

  // Phone goes offline; PC adds another screenshot; the phone catches up when it's back online.
  await B.ctx.setOffline(true);
  await runImages(B.page);
  expect(await imageState(B.page)).toBe('offline');
  const id2 = await logWithScreenshot(A.page, 'Second lab');
  await expect.poll(() => gh.repoImages(), { timeout: 15_000 }).toEqual([`images/${id2}.webp`]);
  await B.ctx.setOffline(false); // fires "online": text sync, then screenshots
  await expect.poll(() => imageIds(B.page), { timeout: 20_000 }).toEqual([id2]);
  await B.page.goto('./#/settings');
  await expect(B.page.locator('#s-imagesync')).toContainText('Screenshots are up to date.');

  // Wiping the synced copy (Reset on the PC) also empties the screenshot repository.
  await A.page.goto('./#/settings');
  await A.page.getByRole('button', { name: 'Reset all local data…' }).click();
  await A.page.getByLabel('Type RESET to confirm').fill('RESET');
  await Promise.all([A.page.waitForEvent('download'), A.page.getByRole('button', { name: 'Back up, then wipe this device' }).click()]);
  await Promise.all([A.page.waitForEvent('download'), A.page.getByRole('button', { name: 'Yes, wipe the synced copy too' }).click()]);
  await expect(A.page.getByText(/including the screenshots in your repository/)).toBeVisible();
  expect(gh.repoImages()).toEqual([]);
  // The phone keeps its copy and re-uploads when asked to.
  await call(B.page, (store, sync) => sync.syncNow());
  await B.page.goto('./#/journal');
  await B.page.getByRole('button', { name: 'Keep and re-upload' }).click();
  await expect.poll(() => gh.repoImages(), { timeout: 15_000 }).toEqual([`images/${id2}.webp`]);

  // Tokens never end up in the repository, the Gist or anything the app stores in plain sight.
  for (const p of gh.repoImages()) expect(gh.repoFile(p).content.toString('latin1')).not.toContain('github_pat_');
  expect(gh.calls.filter((c) => c.auth && c.auth !== `Bearer ${TOKEN_A}` && c.auth !== `Bearer ${TOKEN_B}`)).toEqual([]);
  expect(await imageCount(B.page)).toBe(1);
  expect([...A.page.problems, ...B.page.problems]).toEqual([]);
  await A.ctx.close();
  await B.ctx.close();
});

test('a wrong token gives a friendly message and is not kept', async ({ browser }) => {
  const gh = fakeGitHub({ validTokens: [TOKEN_A] });
  const B = await device(browser, gh, 'Phone');
  await B.page.goto('./#/settings');
  await B.page.getByLabel('GitHub token (Gists: read and write)').fill('not a token');
  await B.page.getByRole('button', { name: 'Connect and sync' }).click();
  await expect(B.page.getByText(/doesn't look like a GitHub token/)).toBeVisible();
  await B.page.getByLabel('GitHub token (Gists: read and write)').fill(`github_pat_${'Z'.repeat(80)}`);
  await B.page.getByRole('button', { name: 'Connect and sync' }).click();
  await expect(B.page.getByText(/GitHub rejected the token/)).toBeVisible();
  expect(await call(B.page, (store, sync) => sync.getState().connected)).toBe(false);
  expect(gh.gists.size).toBe(0);
  expect(B.page.problems).toEqual([]);
  await B.ctx.close();
});
