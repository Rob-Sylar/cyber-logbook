// Renders icons/icon.svg into the PNG sizes the PWA manifest needs.
// Run from the tests folder: npm run icons
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const svg = await readFile(path.join(root, 'icons/icon.svg'), 'utf8');
const BG = '<rect width="512" height="512" rx="112" fill="#0a0f1c"/>';
if (!svg.includes(BG)) throw new Error('icon.svg background rect changed; update make-icons.mjs');

// Maskable icons: square background to the edges, artwork shrunk into the 80% safe zone.
const maskable = svg.replace(BG, '<rect width="512" height="512" fill="#0a0f1c"/><g transform="translate(51.2 51.2) scale(0.8)">').replace('</svg>', '</g></svg>');
// Apple touch icon: no transparency (iOS rounds the corners itself).
const square = svg.replace(' rx="112"', '');

const jobs = [
  ['icons/icon-192.png', svg, 192, true],
  ['icons/icon-512.png', svg, 512, true],
  ['icons/maskable-192.png', maskable, 192, false],
  ['icons/maskable-512.png', maskable, 512, false],
  ['icons/apple-touch-icon.png', square, 180, false],
];

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [out, markup, size, transparent] of jobs) {
  await page.setViewportSize({ width: size, height: size });
  const sized = markup.replace('<svg ', `<svg width="${size}" height="${size}" `);
  await page.setContent(`<!doctype html><html><body style="margin:0;background:transparent">${sized}</body></html>`);
  await page.screenshot({ path: path.join(root, out), omitBackground: transparent, clip: { x: 0, y: 0, width: size, height: size } });
  console.log(`wrote ${out}`);
}
await browser.close();
