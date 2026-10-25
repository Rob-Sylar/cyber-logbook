// Cheat sheet: every command you've logged, grouped by tag, searchable, one-tap copy.

import * as store from '../store.js';
import { buildCheatGroups, matchesTerms, queryTerms } from '../derive.js';
import { copyButton, emptyState, fmtDate, h, icon, pageHead } from '../ui.js';

export const title = 'Cheat sheet';
export const wide = true;

let query = '';

export function render(page) {
  const groups = buildCheatGroups(store.entries());
  const total = new Set(groups.flatMap((g) => g.items.map((i) => i.cmd))).size;
  page.append(pageHead('Cheat sheet', h('p', { class: 'muted' }, `${total} command${total === 1 ? '' : 's'} from your journal`)));

  if (!groups.length) {
    page.append(emptyState('No commands yet', 'Add commands to an entry ("Commands I used") and they will collect here.',
      h('a', { class: 'btn btn-primary', href: '#/log' }, 'Log a session')));
    return null;
  }

  const search = h('input', { type: 'search', class: 'input', id: 'c-search', value: query, placeholder: 'Search commands, descriptions, rooms…', autocomplete: 'off' });
  const jump = h('nav', { class: 'jump', 'aria-label': 'Jump to tag' });
  const list = h('div', { class: 'cheat-groups' });
  const summary = h('p', { class: 'muted summary', 'aria-live': 'polite' });

  function update() {
    const terms = queryTerms(query);
    const visible = [];
    for (const g of groups) {
      const items = g.items.filter((i) => !terms.length || matchesTerms(
        [i.cmd, i.what, i.example, g.tag, ...i.sources.map((s) => `${s.room} ${s.platform}`)].join('\n').toLowerCase(), terms));
      if (items.length) visible.push({ ...g, items });
    }
    const shownCount = visible.reduce((n, g) => n + g.items.length, 0);
    summary.textContent = terms.length ? `${shownCount} match${shownCount === 1 ? '' : 'es'}` : '';
    jump.replaceChildren(...visible.map((g, i) => {
      const b = h('button', { type: 'button', class: 'chip-btn' }, `${g.tag} (${g.items.length})`);
      b.addEventListener('click', () => {
        const head = document.getElementById(`cg-${i}`);
        head?.scrollIntoView({ block: 'start' });
        head?.focus({ preventScroll: true });
      });
      return b;
    }));
    if (!visible.length) {
      list.replaceChildren(emptyState('Nothing matches', 'Try another word.'));
      return;
    }
    list.replaceChildren(...visible.map((g, i) => h('section', { class: 'cheat-group', 'aria-labelledby': `cg-${i}` },
      h('h2', { id: `cg-${i}`, tabindex: '-1' }, g.tag),
      h('ul', { class: 'cheat-list' }, g.items.map((item) => h('li', { class: 'cheat-item' },
        h('div', { class: 'cmd-line' },
          h('pre', { class: 'code' }, h('code', null, item.cmd)),
          copyButton(() => item.cmd, `Copy command: ${item.cmd.slice(0, 60)}`)),
        item.what ? h('p', { class: 'cheat-what' }, item.what) : null,
        item.example ? h('div', { class: 'cmd-example' }, h('span', { class: 'label-small' }, 'Example'), h('pre', { class: 'code' }, h('code', null, item.example))) : null,
        h('p', { class: 'cheat-source small' }, 'From ',
          item.sources.slice(0, 3).map((src, n) => [n ? ', ' : '', h('a', { href: `#/entry/${encodeURIComponent(src.id)}` }, src.room || src.platform), ` (${fmtDate(src.date, { day: 'numeric', month: 'short' })})`]),
          item.sources.length > 3 ? ` and ${item.sources.length - 3} more` : '')))))));
  }

  search.addEventListener('input', () => { query = search.value; update(); });
  page.append(
    h('div', { class: 'search-row' }, h('div', { class: 'search-box' }, h('label', { class: 'visually-hidden', for: 'c-search' }, 'Search the cheat sheet'), icon('search'), search)),
    summary, jump, list);
  update();
  return null;
}
