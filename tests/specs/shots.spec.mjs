// Screenshots: paste, upload, drag and drop, redact, compress, view, zoom, reorder, delete,
// journal count and filter, Markdown/backup export, import, reset and the database upgrade.
// Runs on a desktop window and a phone-sized one.
import AxeBuilder from '@axe-core/playwright';
import JSZip from 'jszip';
import { test, expect, open, seed, chip, pasteImage, dropFiles, drawBox, inspectImage, imageCount, makePng, seedShotEntry, readDownload, readBackupZip } from './helpers.mjs';
import { BASE_URL } from '../base-url.mjs';

const isPhone = (info) => info.project.name === 'phone';

async function startEntry(page, room) {
  await open(page, 'log');
  await chip(page.getByRole('group', { name: 'Platform' }), 'TryHackMe').click();
  await page.getByLabel('Room, level or lab name').fill(room);
}

const shotIds = (page) => page.locator('.shot-row input[id^="cap-"]').evaluateAll((els) => els.map((e) => e.id.slice(4)));
const captions = (page) => page.locator('.shot-row input[id^="cap-"]').evaluateAll((els) => els.map((e) => e.value));

test('paste a screenshot, black out the secret, and it is saved compressed', async ({ page }) => {
  await startEntry(page, 'Nmap room');
  await pasteImage(page, { w: 3000, h: 1500 }); // a 1440p-style screenshot, wider than 1920

  const dlg = page.getByRole('dialog', { name: 'Check this screenshot' });
  await expect(dlg).toBeVisible();
  await expect(dlg.getByText('No boxes yet')).toBeVisible();
  await expect(dlg.getByRole('button', { name: 'Undo' })).toBeDisabled();
  // Output is 1920x960. The red "secret" block is at x/y 192–576, the blue block at x 1152–1536.
  await drawBox(page, [180, 180], [590, 590]);
  await expect(dlg.getByText('1 black box')).toBeVisible();
  await dlg.getByRole('button', { name: 'Undo' }).click();
  await expect(dlg.getByText('No boxes yet')).toBeVisible();
  await drawBox(page, [180, 180], [590, 590]);
  await drawBox(page, [800, 700], [1000, 800]);
  await expect(dlg.getByText('2 black boxes')).toBeVisible();
  await dlg.getByRole('button', { name: 'Clear' }).click();
  await expect(dlg.getByText('No boxes yet')).toBeVisible();
  await drawBox(page, [180, 180], [590, 590]);
  await dlg.getByLabel('Caption (optional)').fill('nmap results for the target');
  await dlg.getByRole('button', { name: 'Save screenshot' }).click();
  await expect(dlg).toBeHidden();

  await expect(page.locator('.shot-row')).toHaveCount(1);
  await expect(page.getByText(/Screenshot added \(\d+ KB, 1 area blacked out\)/)).toBeVisible();
  expect(await captions(page)).toEqual(['nmap results for the target']);
  const [id] = await shotIds(page);
  const img = await inspectImage(page, id, [[384, 384], [1344, 384], [60, 40]]);
  expect(img).toMatchObject({ type: 'image/webp', w: 1920, h: 960, bw: 1920, bh: 960 });
  expect(Math.max(...img.px[0]), 'the red secret is now solid black').toBeLessThan(40);
  expect(img.px[1][2], 'the blue block is untouched').toBeGreaterThan(200);
  expect(img.px[1][0]).toBeLessThan(60);
  expect(Math.min(...img.px[2]), 'white stays white').toBeGreaterThan(215);

  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page).toHaveURL(/#\/entry\//);
  await expect(page.getByRole('heading', { name: 'Screenshots (1)' })).toBeVisible();
  await expect(page.locator('.gallery-caption')).toHaveText('nmap results for the target');

  // Full-screen viewer: opens, zooms with the wheel and keys, resets, closes with Esc.
  const opener = page.getByRole('button', { name: 'Open screenshot 1: nmap results for the target full screen' });
  await opener.click();
  const viewer = page.getByRole('dialog', { name: 'Screenshot viewer' });
  await expect(viewer).toBeVisible();
  await expect(viewer.locator('.viewer-count')).toHaveText('1 / 1');
  await expect(viewer.locator('.viewer-caption')).toHaveText('nmap results for the target');
  await expect.poll(() => viewer.locator('.viewer-img').evaluate((i) => i.naturalWidth)).toBe(1920);
  const scale = () => viewer.locator('.viewer-img').evaluate((i) => Number((/scale\(([\d.]+)\)/.exec(i.style.transform) || [0, 1])[1]));
  const box = await viewer.locator('.viewer-stage').boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, -400);
  await expect.poll(scale).toBeGreaterThan(1.1);
  await viewer.getByRole('button', { name: 'Fit' }).click();
  expect(await scale()).toBe(1);
  await page.keyboard.press('+'); // keyboard zoom still works right after pressing Fit
  await expect.poll(scale).toBeGreaterThan(1);
  await page.keyboard.press('0');
  expect(await scale()).toBe(1);
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(opener).toBeFocused();

  // Delete from the viewer (on-page confirm), undo, then delete for real.
  await opener.click();
  await viewer.getByRole('button', { name: 'Delete this screenshot' }).click();
  await expect(viewer.getByText('Delete this screenshot?')).toBeVisible();
  await viewer.getByRole('button', { name: 'Delete screenshot' }).click();
  await expect(viewer).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Screenshots (1)' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('heading', { name: 'Screenshots (1)' })).toBeVisible();
  await page.getByRole('button', { name: /Open screenshot 1/ }).click();
  await viewer.getByRole('button', { name: 'Delete this screenshot' }).click();
  await viewer.getByRole('button', { name: 'Delete screenshot' }).click();
  await expect(page.getByRole('heading', { name: 'Screenshots (1)' })).toHaveCount(0);
  const entry = await page.evaluate(async () => (await import('./js/store.js')).entries()[0]);
  expect(entry.shots).toEqual([]);
  expect(entry.deletedShots).toContain(id);
  // Kept for a couple of minutes (so Undo works), then the space is freed.
  expect(await imageCount(page)).toBe(1);
  const freed = await page.evaluate(async () => (await import('./js/images.js')).gcLocal({ now: Date.now() + 3 * 60 * 1000 }));
  expect(freed).toEqual([id]);
  expect(await imageCount(page)).toBe(0);
});

test('upload several images, caption and reorder them, then find them in the journal', async ({ page }, info) => {
  await open(page, 'journal');
  await seed(page, [{ platform: 'Other', room: 'No pictures here', minutes: 15, learned: 'Plain entry' }]);
  await startEntry(page, 'Two pictures');
  if (isPhone(info)) {
    await expect(page.getByRole('button', { name: 'Gallery or camera' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take a photo' })).toBeVisible();
    await expect(page.locator('#shot-camera')).toHaveAttribute('capture', 'environment');
  } else {
    await expect(page.getByRole('button', { name: 'Choose images' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Take a photo' })).toHaveCount(0);
  }
  await expect(page.locator('#shot-files')).toHaveAttribute('accept', 'image/*');
  await expect(page.locator('#shot-files')).toHaveAttribute('multiple', '');

  const small = await makePng(page, info.outputPath('small.png'), { w: 800, h: 600 });
  const big = await makePng(page, info.outputPath('big.png'), { w: 2400, h: 1200 });
  await page.locator('#shot-files').setInputFiles([small, big]);
  const d1 = page.getByRole('dialog', { name: 'Check screenshot 1 of 2' });
  await d1.getByLabel('Caption (optional)').fill('first');
  await d1.getByRole('button', { name: 'Save screenshot' }).click();
  const d2 = page.getByRole('dialog', { name: 'Check screenshot 2 of 2' });
  await d2.getByLabel('Caption (optional)').fill('second');
  await d2.getByRole('button', { name: 'Save screenshot' }).click();
  await expect(page.locator('.shot-row')).toHaveCount(2);
  expect(await captions(page)).toEqual(['first', 'second']);
  const [smallId, bigId] = await shotIds(page);
  expect((await inspectImage(page, smallId, [])).w, 'small images are not enlarged').toBe(800);
  expect((await inspectImage(page, bigId, [])).w).toBe(1920);

  await page.getByRole('button', { name: 'Move screenshot 2 up' }).click();
  expect(await captions(page)).toEqual(['second', 'first']);
  await expect(page.getByRole('button', { name: 'Move screenshot 1 down' })).toBeFocused();
  let order = ['second', 'first'];
  if (!isPhone(info)) {
    // Mouse users can also drag the handle (it's hidden on narrow phone screens, which use the arrows).
    await page.locator('.shot-row').nth(0).locator('.drag-handle').dragTo(page.locator('.shot-row').nth(1));
    order = ['first', 'second'];
    expect(await captions(page)).toEqual(order);
  }
  await page.getByLabel('Caption for screenshot 2 (optional)').fill('edited caption');
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.locator('.gallery-caption')).toHaveText([order[0], 'edited caption']);

  await open(page, 'journal');
  const card = page.locator('.entry-card', { hasText: 'Two pictures' });
  await expect(card.locator('.shot-count')).toContainText('📷 2');
  await expect(card).toContainText('2 screenshots');
  await expect(page.locator('.entry-card')).toHaveCount(2);
  await page.getByRole('button', { name: /^Filters/ }).click();
  await page.getByLabel('Only entries with screenshots').check();
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Filters (1)' })).toBeVisible();
});

test('quick log hides Screenshots until you paste one; drafts keep them; discarding frees the space', async ({ page }) => {
  await open(page, 'log');
  await page.getByRole('switch', { name: 'Quick log' }).check({ force: true });
  await expect(page.getByRole('heading', { name: 'Screenshots' })).toBeHidden();

  // Discarding in the redact screen keeps nothing.
  await pasteImage(page, { w: 900, h: 500 });
  await page.getByRole('dialog', { name: 'Check this screenshot' }).getByRole('button', { name: 'Discard', exact: true }).click();
  expect(await imageCount(page)).toBe(0);

  await pasteImage(page, { w: 1200, h: 700 });
  await page.getByRole('dialog', { name: 'Check this screenshot' }).getByRole('button', { name: 'Save screenshot' }).click();
  await expect(page.getByRole('heading', { name: 'Screenshots' })).toBeVisible();
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.reload();
  await expect(page.locator('.shot-row')).toHaveCount(1);
  await expect.poll(() => page.locator('.shot-row img').evaluate((i) => i.naturalWidth)).toBe(1200);
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await expect(page.locator('.shot-row')).toHaveCount(0);
  await expect.poll(() => imageCount(page)).toBe(0);
});

test('drag and drop image files, and paste into a text box still pastes text', async ({ page }) => {
  await startEntry(page, 'Dropped');
  await dropFiles(page, '.dropzone', [{ name: 'notes.txt', text: 'hi' }]);
  await expect(page.getByText('Only image files can be added as screenshots.')).toBeVisible();
  await dropFiles(page, '.dropzone', [{ name: 'shot.png', image: true, w: 1000, h: 600 }]);
  await page.getByRole('dialog', { name: 'Check this screenshot' }).getByRole('button', { name: 'Save screenshot' }).click();
  await expect(page.locator('.shot-row')).toHaveCount(1);
  // Dropped somewhere else on the page: still added (instead of the browser opening the file).
  await dropFiles(page, 'main h1', [{ name: 'shot2.png', image: true, w: 500, h: 400 }]);
  await page.getByRole('dialog', { name: 'Check this screenshot' }).getByRole('button', { name: 'Save screenshot' }).click();
  await expect(page.locator('.shot-row')).toHaveCount(2);

  // Text + image on the clipboard while typing in a box: treated as a text paste.
  await page.getByLabel('What I did').focus();
  await page.evaluate(() => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'some text');
    dt.items.add(new File([new Uint8Array([137, 80, 78, 71])], 'x.png', { type: 'image/png' }));
    document.activeElement.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('Markdown export, full backup, import on another device, reset and undo all include screenshots', async ({ page, browser }) => {
  await open(page, 'settings');
  const id = await seedShotEntry(page, { platform: 'Hack The Box', room: 'Lame', minutes: 60, learned: 'SMB 1 is old and risky' }, { caption: 'smbclient listing' });
  await open(page, 'settings');

  const [mdDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export Markdown (.zip)' }).click()]);
  const md = await JSZip.loadAsync(await readDownload(mdDl));
  expect(Object.keys(md.files)).toContain(`Cyber Logbook/attachments/${id}.webp`);
  const note = await md.file(/Sessions\/.*Lame\.md$/)[0].async('string');
  expect(note).toContain(`## Screenshots\n\n![[attachments/${id}.webp]]\n*smbclient listing*`);
  expect((await md.file(`Cyber Logbook/attachments/${id}.webp`).async('uint8array')).length).toBeGreaterThan(1000);

  const [fullDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export full backup (.zip)' }).click()]);
  const full = await readBackupZip(fullDl);
  expect(full.imageFiles).toEqual([`images/${id}.webp`]);
  expect(full.json.images[0]).toMatchObject({ id, file: `images/${id}.webp`, type: 'image/webp' });
  expect(full.json.entries[0].shots[0]).toMatchObject({ id, caption: 'smbclient listing' });

  // Another device (fresh browser profile) restores entry + screenshot from the zip.
  const other = await browser.newContext({ baseURL: BASE_URL });
  const p2 = await other.newPage();
  await p2.goto('./#/settings');
  await p2.locator('#import-file').setInputFiles(await fullDl.path());
  await expect(p2.locator('#import-result')).toContainText('1 new');
  await expect(p2.locator('#import-result')).toContainText('1 screenshot restored');
  await p2.goto('./#/journal');
  await p2.locator('.entry-card').first().click();
  await expect.poll(() => p2.locator('.gallery img').evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
  await other.close();

  // Reset: the automatic backup includes the screenshot; the wipe removes it; Undo brings it back.
  await page.getByRole('button', { name: 'Reset all local data…' }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  const [resetDl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up, then wipe this device' }).click()]);
  expect((await readBackupZip(resetDl)).imageFiles).toEqual([`images/${id}.webp`]);
  await expect(page.getByText('This device has been reset.')).toBeVisible();
  expect(await imageCount(page)).toBe(0);
  await page.getByRole('button', { name: 'Undo reset' }).click();
  await expect.poll(() => imageCount(page)).toBe(1);
});

test('upgrading from the first version keeps every existing entry and setting', async ({ page }) => {
  // Build a version-1 database exactly as the first release stored it (on a plain page of the same
  // site; some browsers ask that page for /favicon.ico, which this project doesn't have).
  await page.context().route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('./icons/icon.svg');
  await page.evaluate(() => new Promise((resolve, reject) => {
    const req = indexedDB.open('cyber-logbook', 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore('entries', { keyPath: 'id' });
      req.result.createObjectStore('kv');
    };
    req.onerror = () => reject(req.error);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction(['entries', 'kv'], 'readwrite');
      tx.objectStore('entries').put({
        id: 'e_old1', createdAt: '2026-09-01T10:00:00.000Z', updatedAt: '2026-09-01T10:00:00.000Z', deleted: false, date: '2026-09-01',
        minutes: 30, platform: 'Bandit', room: 'Old entry from v1', link: '', tags: ['Linux'], did: '', learned: 'Made before screenshots existed',
        explain: 'Old explanation', commands: [{ id: 'r0', cmd: 'ls -la', what: 'list all', example: '' }], questions: [], confidence: 3, flag: 'FAKE-old-flag', quick: false,
      });
      tx.objectStore('entries').put({ id: 'e_old2', deleted: true, createdAt: '2026-08-01T10:00:00.000Z', updatedAt: '2026-08-02T10:00:00.000Z' });
      tx.objectStore('kv').put({ goalMinHours: 1, goalTargetHours: 4, customTags: ['Old tag'], updatedAt: '2026-09-01T10:00:00.000Z' }, 'settings');
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
  }));

  await open(page, 'journal');
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await expect(page.locator('.entry-card')).toContainText('Old entry from v1');
  const dbInfo = await page.evaluate(() => new Promise((resolve) => {
    const r = indexedDB.open('cyber-logbook');
    r.onsuccess = () => { resolve({ version: r.result.version, stores: [...r.result.objectStoreNames].sort() }); r.result.close(); };
  }));
  expect(dbInfo).toEqual({ version: 2, stores: ['entries', 'images', 'kv'] });
  await open(page, 'settings');
  await expect(page.locator('#goal-target')).toHaveValue('4');
  await expect(page.locator('.tag-manage')).toContainText('Old tag');

  // The old entry is intact and can now get a screenshot.
  await open(page, 'journal');
  await page.locator('.entry-card').click();
  await expect(page.getByText('Old explanation')).toBeVisible();
  await page.getByRole('link', { name: 'Edit' }).click();
  await pasteImage(page, { w: 1000, h: 600 });
  await page.getByRole('dialog', { name: 'Check this screenshot' }).getByRole('button', { name: 'Save screenshot' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { name: 'Screenshots (1)' })).toBeVisible();
  const saved = await page.evaluate(async () => (await import('./js/store.js')).get('e_old1'));
  expect(saved).toMatchObject({ room: 'Old entry from v1', flag: 'FAKE-old-flag', confidence: 3, learned: 'Made before screenshots existed' });
  expect(saved.commands[0]).toMatchObject({ cmd: 'ls -la' });
  expect(saved.shots).toHaveLength(1);
});

test('the redact screen and the viewer pass accessibility checks', async ({ page }) => {
  await startEntry(page, 'Accessible');
  await pasteImage(page, { w: 1200, h: 700 });
  await expect(page.getByRole('dialog', { name: 'Check this screenshot' })).toBeVisible();
  const serious = async () => (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze())
    .violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`);
  expect(await serious()).toEqual([]);
  await page.getByRole('button', { name: 'Save screenshot' }).click();
  expect(await serious()).toEqual([]);
  await page.getByRole('button', { name: 'Save entry' }).click();
  await page.getByRole('button', { name: /Open screenshot 1/ }).click();
  await expect(page.getByRole('dialog', { name: 'Screenshot viewer' })).toBeVisible();
  expect(await serious()).toEqual([]);
});
