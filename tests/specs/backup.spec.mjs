// Export (JSON + Markdown zip), import with merge-by-ID, bad-file handling, and local reset with undo.
import JSZip from 'jszip';
import fs from 'node:fs/promises';
import { test, expect, open, seed, readDownload } from './helpers.mjs';
import { sampleEntries } from '../fixtures/sample.mjs';

async function download(page, buttonName) {
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: buttonName }).click()]);
  return dl;
}

test('JSON backup and Obsidian-ready Markdown export', async ({ page }) => {
  await open(page, 'settings');
  await seed(page, sampleEntries());
  await open(page, 'settings');

  const jsonDl = await download(page, 'Export JSON backup');
  expect(jsonDl.suggestedFilename()).toMatch(/^cyber-logbook-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const backup = JSON.parse((await readDownload(jsonDl)).toString('utf8'));
  expect(backup.app).toBe('cyber-logbook');
  expect(backup.entries).toHaveLength(5);

  const zipDl = await download(page, 'Export Markdown (.zip)');
  expect(zipDl.suggestedFilename()).toMatch(/^cyber-logbook-markdown-.*\.zip$/);
  const zip = await JSZip.loadAsync(await readDownload(zipDl));
  const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
  expect(names).toContain('Cyber Logbook/Cheat sheet.md');
  expect(names).toContain('Cyber Logbook/Cyber Logbook index.md');
  expect(names.filter((n) => n.startsWith('Cyber Logbook/Sessions/'))).toHaveLength(5);
  const banditName = names.find((n) => n.includes('Bandit - Bandit Level 4 → 5'));
  const md = await zip.file(banditName).async('string');
  expect(md.startsWith('---\ndate: ')).toBe(true);
  expect(md).toContain('platform: "Bandit"');
  expect(md).toContain('tags:\n  - cyber-logbook\n  - linux');
  expect(md).toContain('minutes: 45');
  expect(md).toContain('confidence: 4');
  expect(md).toContain('> [!tip] Explain it to a mate');
  expect(md).toContain('```shell\nfile ./inhere/*\n```');
  expect(md).toContain('- [ ] Why does cat -file07 fail');
  expect(md).not.toContain('FAKE-flag-for-tests-0001'); // flags left out by default
  const cheat = await zip.file('Cyber Logbook/Cheat sheet.md').async('string');
  expect(cheat).toContain('## Linux');
  expect(cheat).toMatch(/\[\[.*Bandit Level 4 → 5\]\]/);

  await page.getByLabel('Include level passwords / flags').check();
  const zip2 = await JSZip.loadAsync(await readDownload(await download(page, 'Export Markdown (.zip)')));
  expect(await zip2.file(banditName).async('string')).toContain('FAKE-flag-for-tests-0001');
});

test('import merges by entry ID and survives broken or hostile files', async ({ page }, info) => {
  await open(page, 'settings');
  const file = async (name, content) => {
    const p = info.outputPath(name);
    await fs.writeFile(p, typeof content === 'string' ? content : JSON.stringify(content));
    return p;
  };
  const entries = sampleEntries().map((e, i) => ({ ...e, id: `e_test${i}`, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
  const good = await file('good.json', { app: 'cyber-logbook', schema: 1, entries });
  const result = page.locator('#import-result');
  const input = page.locator('#import-file');

  await input.setInputFiles(good);
  await expect(result).toContainText('5 new, 0 updated, 0 already up to date');
  await input.setInputFiles(good);
  await expect(result).toContainText('0 new, 0 updated, 5 already up to date');

  const newer = await file('newer.json', { entries: [{ ...entries[0], room: 'Renamed in backup', updatedAt: '2026-02-01T00:00:00.000Z' }, { ...entries[1], room: 'Older copy', updatedAt: '2025-01-01T00:00:00.000Z' }] });
  await input.setInputFiles(newer);
  await expect(result).toContainText('0 new, 1 updated, 1 already up to date');

  const bad = [
    ['not-json.json', 'this is { not json', "isn't valid JSON"],
    ['wrong-shape.json', { hello: 'world' }, "doesn't look like a Cyber Logbook backup"],
    ['other-app.json', { app: 'something-else', entries: [] }, "isn't a Cyber Logbook backup"],
    ['empty.json', '', "isn't valid JSON"],
    ['nulls.json', [null, 1, 'x', [], { deleted: 'maybe' }], '4 skipped because they were damaged'],
  ];
  for (const [name, content, message] of bad) {
    await input.setInputFiles(await file(name, content));
    await expect(result, name).toContainText(message);
  }

  const hostileJson = JSON.stringify([{
    room: '<img src=x onerror="window.__xss=1">Totally normal room',
    link: 'javascript:alert(1)',
    platform: { evil: true },
    minutes: 'lots',
    confidence: 99,
    date: '2026-13-45',
    tags: ['<script>window.__xss=2</script>', 7, null],
    commands: 'not a list',
    questions: [{ q: 'ok?', solved: 'yes' }],
    learned: 'x'.repeat(200000),
  }]).replace('[{', '[{"__proto__":{"polluted":true},"constructor":{"prototype":{"polluted":true}},');
  await input.setInputFiles(await file('hostile.json', hostileJson));
  await expect(result).toContainText('1 new');
  await open(page, 'journal');
  const card = page.locator('.entry-card', { hasText: 'Totally normal room' });
  await expect(card).toContainText('<img src=x onerror=');
  await card.click();
  await expect(page.getByRole('link', { name: 'Open room link' })).toHaveCount(0);
  for (const r of ['cheats', 'questions', 'review', 'stats']) await open(page, r);
  expect(await page.evaluate(() => [window.__xss, ({}).polluted])).toEqual([undefined, undefined]);
});

test('reset: in-page confirm, automatic backup first, then undo', async ({ page }) => {
  await open(page, 'settings');
  await seed(page, sampleEntries());
  await open(page, 'settings');
  await page.getByRole('button', { name: 'Reset all local data…' }).click();
  await expect(page.getByText('Wipe all 5 entries from this device?')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Reset all local data…' })).toBeVisible();

  await page.getByRole('button', { name: 'Reset all local data…' }).click();
  await page.getByLabel('Type RESET to confirm').fill('RESET');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Back up, then wipe this device' }).click()]);
  const saved = JSON.parse((await readDownload(dl)).toString('utf8'));
  expect(saved.entries.filter((e) => !e.deleted)).toHaveLength(5);
  await expect(page.getByText('This device has been reset.')).toBeVisible();
  await expect(page.getByText('Also wipe the synced copy?')).toHaveCount(0); // sync wasn't set up
  expect(await page.evaluate(async () => (await import('./js/store.js')).count())).toBe(0);

  await page.getByRole('button', { name: 'Undo reset' }).click();
  await open(page, 'journal');
  await expect(page.locator('.entry-card')).toHaveCount(5);

  // The downloaded backup file restores everything on a fresh device too.
  await page.evaluate(async () => {
    const db = await import('./js/db.js');
    await db.clearAll();
  });
  await page.reload();
  await open(page, 'settings');
  await page.locator('#import-file').setInputFiles(await dl.path());
  await expect(page.locator('#import-result')).toContainText('5 new');
});
