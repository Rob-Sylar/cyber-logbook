// Markdown export in a shape that drops straight into an Obsidian vault:
// YAML front-matter, a callout for "explain it to a mate", commands as fenced code blocks.

import { buildCheatGroups, byNewest } from './derive.js';

const yq = (s) => JSON.stringify(String(s)); // JSON strings are valid YAML double-quoted scalars

// Obsidian tags can't contain spaces: "Security basics" -> "security-basics"
export function obsidianTag(t) {
  let s = t.toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}_/-]+/gu, '-').replace(/^-+|-+$/g, '');
  if (/^\d+$/.test(s)) s = `t-${s}`;
  return s;
}

function fence(text, lang = '') {
  const longest = Math.max(0, ...(text.match(/`+/g) || []).map((r) => r.length));
  const f = '`'.repeat(Math.max(3, longest + 1));
  return `${f}${lang}\n${text}\n${f}`;
}

const quoteBlock = (text) => text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
const oneLine = (s) => s.replace(/\s*\n\s*/g, ' ');

// shotFiles: Map of screenshot id -> file name inside attachments/ (images that exist on this device).
export function entryToMarkdown(e, { includeFlags = false, shotFiles = null } = {}) {
  const fm = ['---', `date: ${e.date}`, `platform: ${yq(e.platform)}`, `room: ${yq(e.room)}`];
  if (e.link) fm.push(`link: ${yq(e.link)}`);
  const slugs = [...new Set(['cyber-logbook', ...e.tags.map(obsidianTag).filter(Boolean)])];
  fm.push('tags:', ...slugs.map((t) => `  - ${t}`));
  if (e.tags.length) fm.push('topics:', ...e.tags.map((t) => `  - ${yq(t)}`));
  fm.push(`minutes: ${e.minutes}`);
  if (e.confidence) fm.push(`confidence: ${e.confidence}`);
  fm.push(`id: ${yq(e.id)}`, `created: ${e.createdAt}`, `updated: ${e.updatedAt}`, '---');

  const blocks = [fm.join('\n'), `# ${e.room || 'Untitled session'}`];
  if (e.explain) blocks.push(`> [!tip] Explain it to a mate\n${quoteBlock(e.explain)}`);
  if (e.learned) blocks.push(`## What I learned\n\n${e.learned}`);
  if (e.did) blocks.push(`## What I did\n\n${e.did}`);
  if (e.commands.length) {
    const parts = ['## Commands I used'];
    for (const c of e.commands) {
      const row = [];
      if (c.cmd) row.push(fence(c.cmd, 'shell'));
      if (c.what) row.push(`**What it does:** ${c.what}`);
      if (c.example) row.push(`**Example:**\n\n${fence(c.example, 'shell')}`);
      parts.push(row.join('\n\n'));
    }
    blocks.push(parts.join('\n\n'));
  }
  if (e.shots && e.shots.length && shotFiles) {
    const parts = ['## Screenshots'];
    for (const s of e.shots) {
      const file = shotFiles.get(s.id);
      const pic = file ? `![[attachments/${file}]]` : '*(This screenshot wasn\'t on the device that made this export.)*';
      parts.push(s.caption ? `${pic}\n*${oneLine(s.caption).replace(/\*/g, '\\*')}*` : pic);
    }
    blocks.push(parts.join('\n\n'));
  }
  if (e.questions.length) {
    const lines = ['## Still confused about', ''];
    for (const q of e.questions) {
      lines.push(`- [${q.solved ? 'x' : ' '}] ${oneLine(q.q) || '(no question written)'}`);
      if (q.answer) {
        q.answer.split('\n').forEach((l, i) => lines.push(i === 0 ? `    - Answer: ${l}` : `      ${l}`));
      }
    }
    blocks.push(lines.join('\n'));
  }
  if (includeFlags && e.flag) blocks.push(`## Level password / flag\n\n${fence(e.flag)}`);
  return `${blocks.join('\n\n')}\n`;
}

const BAD_FILENAME = /[\\/:*?"<>|#^[\]\u0000-\u001F]/g;

export function noteName(e, used) {
  let base = `${e.date} ${e.platform} - ${e.room || 'Untitled'}`
    .replace(BAD_FILENAME, ' ').replace(/\s+/g, ' ').trim().replace(/[. ]+$/, '');
  if (base.length > 120) base = base.slice(0, 120).trim();
  let name = base;
  for (let i = 2; used.has(name.toLowerCase()); i++) name = `${base} (${i})`;
  used.add(name.toLowerCase());
  return name;
}

export function cheatSheetMarkdown(entries, names) {
  const out = ['---', 'tags:', '  - cyber-logbook', '  - cheat-sheet', '---', '# Cheat sheet', ''];
  for (const g of buildCheatGroups(entries)) {
    out.push(`## ${g.tag}`, '');
    for (const item of g.items) {
      out.push(fence(item.cmd, 'shell'));
      if (item.what) out.push(`**What it does:** ${item.what}`);
      if (item.example) out.push('', `**Example:**`, '', fence(item.example, 'shell'));
      const from = item.sources.map((s) => (names.has(s.id) ? `[[${names.get(s.id)}]]` : s.room)).join(', ');
      out.push('', `*From:* ${from}`, '');
    }
  }
  return `${out.join('\n')}\n`;
}

export function indexMarkdown(entries, names) {
  const out = ['---', 'tags:', '  - cyber-logbook', '---', '# Cyber Logbook', ''];
  let month = '';
  for (const e of [...entries].sort(byNewest)) {
    const m = e.date.slice(0, 7);
    if (m !== month) {
      month = m;
      out.push('', `## ${m}`, '');
    }
    out.push(`- [[${names.get(e.id)}]] · ${e.minutes} min${e.confidence ? ` · confidence ${e.confidence}/5` : ''}`);
  }
  out.push('', '[[Cheat sheet]]');
  return `${out.join('\n')}\n`;
}
