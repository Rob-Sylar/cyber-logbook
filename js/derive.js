// Read-only views of the data: search, cheat sheet grouping, questions list and flashcard decks.

import { CONFIDENCE } from './model.js';

export function byNewest(a, b) {
  return b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt);
}

export function confidenceLabel(n) {
  return CONFIDENCE.find((c) => c.value === n)?.label || 'Not rated';
}

// The level password / flag is deliberately left out of search.
export function searchHaystack(e) {
  const parts = [e.room, e.platform, e.link, e.did, e.learned, e.explain, e.tags.join(' '), e.date];
  for (const c of e.commands) parts.push(c.cmd, c.what, c.example);
  for (const q of e.questions) parts.push(q.q, q.answer);
  for (const s of e.shots) parts.push(s.caption);
  return parts.join('\n').toLowerCase();
}

export const queryTerms = (q) => q.toLowerCase().split(/\s+/).filter(Boolean);
export const matchesTerms = (hay, terms) => terms.every((t) => hay.includes(t));

const cmdKey = (cmd) => cmd.replace(/\s+/g, ' ').trim();

// Every command ever logged, de-duplicated within each tag. Newest description wins.
export function buildCheatGroups(entries) {
  const groups = new Map();
  for (const e of [...entries].sort(byNewest)) {
    const tags = e.tags.length ? e.tags : ['Untagged'];
    for (const c of e.commands) {
      if (!c.cmd) continue;
      const key = cmdKey(c.cmd);
      for (const tag of tags) {
        const gk = tag.toLowerCase();
        if (!groups.has(gk)) groups.set(gk, { tag, items: new Map() });
        const items = groups.get(gk).items;
        let item = items.get(key);
        if (!item) {
          item = { cmd: c.cmd, what: c.what, example: c.example, sources: [] };
          items.set(key, item);
        } else {
          if (!item.what && c.what) item.what = c.what;
          if (!item.example && c.example) item.example = c.example;
        }
        if (!item.sources.some((s) => s.id === e.id)) item.sources.push({ id: e.id, room: e.room, platform: e.platform, date: e.date });
      }
    }
  }
  const cmp = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' });
  return [...groups.values()]
    .map((g) => ({ tag: g.tag, items: [...g.items.values()].sort((a, b) => cmp(a.cmd, b.cmd)) }))
    .sort((a, b) => (a.tag === 'Untagged') - (b.tag === 'Untagged') || cmp(a.tag, b.tag));
}

export function collectQuestions(entries) {
  return [...entries].sort(byNewest).flatMap((e) => e.questions.map((q) => ({ entry: e, q })));
}

export function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Unrated entries sit between "shaky" (2) and "OK" (3).
const confOf = (e) => e.confidence ?? 2.5;

// kind: 'all' | 'takeaways' | 'commands'. Lowest confidence first, shuffled within each level.
export function buildDeck(entries, kind = 'all') {
  const cards = [];
  if (kind !== 'commands') {
    for (const e of entries) {
      if (e.learned || e.explain) cards.push({ key: `l:${e.id}`, type: 'learned', entryId: e.id, conf: confOf(e) });
    }
  }
  if (kind !== 'takeaways') {
    const byCmd = new Map();
    for (const e of entries) {
      for (const c of e.commands) {
        if (!c.cmd || !(c.what || c.example)) continue;
        const key = cmdKey(c.cmd);
        const card = { key: `c:${e.id}:${c.id}`, type: 'command', entryId: e.id, cmdId: c.id, conf: confOf(e) };
        const prev = byCmd.get(key);
        if (!prev || card.conf < prev.conf) byCmd.set(key, card);
      }
    }
    cards.push(...byCmd.values());
  }
  shuffle(cards);
  return cards.sort((a, b) => a.conf - b.conf);
}
