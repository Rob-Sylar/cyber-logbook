// Core journaling flows. Runs on a desktop window and a phone-sized one.
import { test, expect, open, seed, chip } from './helpers.mjs';
import { sampleEntries } from '../fixtures/sample.mjs';

test.beforeEach(async ({ context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
});

test('logs a full entry and it shows up on every screen', async ({ page }) => {
  await open(page, 'log');
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await expect(page.locator('#f-date')).toHaveValue(today);
  await expect(page.getByRole('radio', { name: '30 min' })).toBeChecked();

  await chip(page, '45 min').click();
  await chip(page.getByRole('group', { name: 'Platform' }), 'Bandit').click();
  await page.getByLabel('Room, level or lab name').fill('Bandit Level 5 → 6');
  await page.getByLabel('Link (optional)').fill('overthewire.org/wargames/bandit/bandit6.html');
  await chip(page, 'Linux').click();
  await page.getByLabel('New tag name').fill('Wargames');
  await page.getByRole('button', { name: 'Add tag' }).click();
  await expect(page.getByRole('checkbox', { name: 'Wargames' })).toBeChecked();
  await page.getByLabel('What I did').fill('Used find with size and permission filters.');
  await page.getByLabel('What I learned').fill('find can filter by size, owner and permissions all at once.');
  await page.getByRole('textbox', { name: 'Explain it to a mate' }).fill('find is a search dog: tell it the size, owner and type and it sniffs out just that file.');

  await page.getByRole('button', { name: 'Add a command' }).click();
  const c1 = page.getByRole('group', { name: 'Command 1' });
  await expect(c1.getByLabel('Command', { exact: true })).toBeFocused();
  await c1.getByLabel('Command', { exact: true }).fill('find / -size 33c -user bandit7 2>/dev/null');
  await c1.getByLabel('What it does').fill('Finds 33-byte files owned by bandit7, hiding errors');
  await page.getByRole('button', { name: 'Add a command' }).click();
  const c2 = page.getByRole('group', { name: 'Command 2' });
  await c2.getByLabel('Command', { exact: true }).fill('cat $(find . -size 1033c)');
  await c2.getByLabel('What it does').fill('Prints the file find locates');
  await c2.getByLabel('Example (optional)').fill('cat ./maybehere07/.file2');

  await page.getByRole('button', { name: 'Add a question' }).click();
  await page.getByRole('group', { name: 'Question 1' }).getByLabel('What confuses me').fill('What does the c in 33c mean?');
  await page.getByRole('button', { name: 'Add a question' }).click();
  const q2 = page.getByRole('group', { name: 'Question 2' });
  await q2.getByLabel('What confuses me').fill('Why redirect 2>/dev/null?');
  await q2.getByLabel('Figured it out').check();
  await q2.getByLabel('Answer').fill('It hides permission-denied errors.');

  await chip(page.getByRole('group', { name: /Confidence/ }), '2').click();
  await expect(page.getByText('2 – Shaky without notes')).toBeVisible();

  const flag = page.getByLabel('Level password / flag (private)');
  await flag.fill('FAKE-flag-for-tests-0002');
  await expect(flag).toHaveClass(/masked/);
  await page.getByRole('button', { name: 'Show' }).click();
  await expect(flag).not.toHaveClass(/masked/);

  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page).toHaveURL(/#\/entry\//);
  await expect(page.getByRole('heading', { level: 1, name: 'Bandit Level 5 → 6' })).toBeVisible();
  await expect(page.getByText('find is a search dog')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open room link' })).toHaveAttribute('href', 'https://overthewire.org/wargames/bandit/bandit6.html');
  await expect(page.locator('.flag-value')).not.toContainText('FAKE-flag');
  await page.getByRole('button', { name: 'Reveal' }).click();
  await expect(page.locator('.flag-value')).toHaveText('FAKE-flag-for-tests-0002');

  // Journal + search
  await open(page, 'journal');
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await page.getByLabel('Search entries').fill('search dog');
  await expect(page.locator('.entry-card')).toHaveCount(1);
  await page.getByLabel('Search entries').fill('no such words');
  await expect(page.getByText('Nothing matches')).toBeVisible();
  await page.getByLabel('Search entries').fill('');

  // Cheat sheet: grouped under both tags, copy works
  await open(page, 'cheats');
  await expect(page.getByRole('heading', { name: 'Linux' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wargames' })).toBeVisible();
  await page.getByRole('button', { name: /Copy command: find \/ -size 33c/ }).first().click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('find / -size 33c -user bandit7 2>/dev/null');
  await page.getByLabel('Search the cheat sheet').fill('prints');
  await expect(page.locator('.cheat-item')).toHaveCount(2); // one command, shown under 2 tags

  // Questions
  await open(page, 'questions');
  await expect(page.getByRole('button', { name: 'Open (1)' })).toBeVisible();
  await expect(page.locator('#questions-link .badge, .nav .badge').first()).toHaveText('1');
  await page.getByLabel('Figured it out').check();
  await expect(page.getByRole('button', { name: 'Figured out (2)' })).toBeVisible();
  await page.getByRole('button', { name: 'Figured out (2)' }).click();
  await expect(page.locator('.q-card')).toHaveCount(2);

  // Review: confidence 2 goes in Revisit, flashcards work
  await open(page, 'review');
  await expect(page.getByRole('heading', { name: 'Revisit (1)' })).toBeVisible();
  await expect(page.getByText('Card 1 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: 'Got it' }).click();
  await expect(page.getByText('Card 2 of 3')).toBeVisible();

  // Stats
  await open(page, 'stats');
  await expect(page.locator('.stat', { hasText: 'Total time' })).toContainText('1 session');
  await expect(page.getByRole('progressbar', { name: 'Hours this week' })).toHaveAttribute('aria-valuenow', '0.8');
});

test('quick log only asks for the essentials', async ({ page }) => {
  await open(page, 'log');
  await page.getByRole('switch', { name: 'Quick log' }).check({ force: true });
  await expect(page.getByLabel('What I did')).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'Explain it to a mate' })).toBeHidden();
  await expect(page.getByRole('button', { name: 'Add a command' })).toBeHidden();
  await chip(page.getByRole('group', { name: 'Platform' }), 'TryHackMe').click();
  await page.getByLabel('Room, level or lab name').fill('Pre Security');
  await page.getByLabel('What I learned').fill('A MAC address identifies a network card.');
  await chip(page, '15 min').click();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page).toHaveURL(/#\/entry\//);
  await open(page, 'journal');
  await expect(page.locator('.entry-card')).toContainText('Quick log');
  // The quick-log choice is remembered for next time
  await open(page, 'log');
  await expect(page.getByRole('switch', { name: 'Quick log' })).toBeChecked();
});

test('draft autosaves as you type and survives a reload', async ({ page }) => {
  await open(page, 'log');
  await page.getByLabel('Room, level or lab name').fill('Half-finished room');
  await page.getByRole('textbox', { name: 'Explain it to a mate' }).fill('Still writing this…');
  await expect(page.getByText(/Draft saved/)).toBeVisible();
  await page.reload();
  await expect(page.getByText(/Restored your unsaved draft/)).toBeVisible();
  await expect(page.getByLabel('Room, level or lab name')).toHaveValue('Half-finished room');
  await expect(page.getByRole('textbox', { name: 'Explain it to a mate' })).toHaveValue('Still writing this…');
  await page.getByRole('button', { name: 'Start fresh' }).click();
  await expect(page.getByLabel('Room, level or lab name')).toHaveValue('');
});

test('saving an empty form shows errors instead of crashing', async ({ page }) => {
  await open(page, 'log');
  await page.evaluate(() => localStorage.removeItem('cl-last-platform'));
  await page.reload();
  await page.getByRole('button', { name: 'Save entry' }).click();
  await expect(page.getByText('Pick a platform.')).toBeVisible();
  await expect(page.getByText(/Add a room, level or lab name/)).toBeVisible();
  await page.getByLabel('Link (optional)').fill('javascript:alert(1)');
  await page.getByLabel('Link (optional)').blur();
  await expect(page.getByText(/normal web address/)).toBeVisible();
  await expect(page).toHaveURL(/#\/log/);
});

test('edit, delete with an in-page confirm, then undo', async ({ page }) => {
  await open(page, 'journal');
  await seed(page, sampleEntries().slice(0, 1));
  await open(page, 'journal');
  await page.locator('.entry-card').first().click();
  await page.getByRole('link', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit entry' })).toBeVisible();
  await page.getByLabel('Room, level or lab name').fill('Bandit Level 4 → 5 (redone)');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Bandit Level 4 → 5 (redone)' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Delete this entry?')).toBeVisible();
  await page.getByRole('button', { name: 'Delete entry' }).click();
  await expect(page).toHaveURL(/#\/journal/);
  await expect(page.getByText('No entries yet')).toBeVisible();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('.entry-card')).toHaveCount(1);
});

test('theme toggle switches and is remembered', async ({ page }) => {
  await open(page, 'log');
  const btn = page.locator('#theme-btn');
  const before = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await btn.click();
  const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  expect(after).not.toBe(before);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  expect(['light', 'dark']).toContain(theme);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
  await open(page, 'settings');
  await chip(page, 'Match my device').click();
  await expect(page.locator('html')).not.toHaveAttribute('data-theme', /./);
});

test('respects reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, 'review');
  const dur = await page.evaluate(() => getComputedStyle(document.querySelector('.btn') || document.body).transitionDuration);
  expect(dur === '0s' || dur === '').toBeTruthy();
});
