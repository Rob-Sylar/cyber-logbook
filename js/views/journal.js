// Journal: every entry, newest first, with search and filters.

import * as store from '../store.js';
import { PLATFORMS, CONFIDENCE } from '../model.js';
import { matchesTerms, queryTerms, searchHaystack } from '../derive.js';
import { confidenceDots, emptyState, field, fmtDate, fmtMinutes, h, icon, pageHead } from '../ui.js';

export const title = 'Journal';
export const wide = true;

// Kept between visits while the app is open.
const filters = { q: '', platform: '', tag: '', from: '', to: '', conf: '' };
let filtersOpen = false;

function activeFilterCount() {
  return ['platform', 'tag', 'from', 'to', 'conf'].filter((k) => filters[k]).length;
}

function passes(e, terms) {
  if (filters.platform && e.platform !== filters.platform) return false;
  if (filters.tag && !e.tags.some((t) => t.toLowerCase() === filters.tag.toLowerCase())) return false;
  if (filters.from && e.date < filters.from) return false;
  if (filters.to && e.date > filters.to) return false;
  if (filters.conf === 'low' && !(e.confidence && e.confidence <= 2)) return false;
  if (filters.conf === 'none' && e.confidence) return false;
  if (/^[1-5]$/.test(filters.conf) && e.confidence !== Number(filters.conf)) return false;
  return !terms.length || matchesTerms(searchHaystack(e), terms);
}

export function entryCard(e) {
  const open = e.questions.filter((q) => !q.solved).length;
  return h('a', { class: 'entry-card', href: `#/entry/${encodeURIComponent(e.id)}` },
    h('div', { class: 'entry-card-top' },
      h('span', { class: 'pill' }, e.platform),
      h('time', { datetime: e.date }, fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short' })),
      h('span', { class: 'muted' }, fmtMinutes(e.minutes)),
      confidenceDots(e.confidence)),
    h('h3', { class: 'entry-card-title' }, e.room || 'Untitled session'),
    e.learned ? h('p', { class: 'entry-card-text' }, e.learned) : null,
    h('div', { class: 'entry-card-foot' },
      e.tags.map((t) => h('span', { class: 'tag' }, t)),
      open ? h('span', { class: 'tag tag-warn' }, `${open} open question${open === 1 ? '' : 's'}`) : null,
      e.quick && !e.explain ? h('span', { class: 'tag tag-muted' }, 'Quick log') : null));
}

export function render(page) {
  const all = store.entries();
  page.append(pageHead('Journal', h('a', { class: 'btn btn-primary', href: '#/log' }, icon('plus'), 'New entry')));

  if (!all.length) {
    page.append(emptyState('No entries yet', 'Log your first session and it will show up here.',
      h('a', { class: 'btn btn-primary', href: '#/log' }, 'Log a session')));
    return null;
  }

  const search = h('input', { type: 'search', class: 'input', id: 'j-search', value: filters.q, placeholder: 'Search rooms, notes, commands, questions…', autocomplete: 'off' });
  const filterBtn = h('button', { type: 'button', class: 'btn btn-ghost', 'aria-expanded': String(filtersOpen), 'aria-controls': 'j-filters' });
  const setFilterBtn = () => {
    const n = activeFilterCount();
    filterBtn.replaceChildren(icon('filter'), n ? `Filters (${n})` : 'Filters');
  };
  setFilterBtn();

  const select = (id, value, options) => {
    const el = h('select', { class: 'input', id }, options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
    return el;
  };
  const platformSel = select('j-platform', filters.platform, [['', 'Any platform'], ...PLATFORMS.map((p) => [p, p]),
    ...[...new Set(all.map((e) => e.platform))].filter((p) => !PLATFORMS.includes(p)).map((p) => [p, p])]);
  const tagSel = select('j-tag', filters.tag, [['', 'Any tag'], ...store.allTags().map((t) => [t, t])]);
  const confSel = select('j-conf', filters.conf, [['', 'Any confidence'], ['low', '1–2 (revisit)'], ...CONFIDENCE.map((c) => [String(c.value), `${c.value} – ${c.label}`]), ['none', 'Not rated']]);
  const from = h('input', { type: 'date', class: 'input', id: 'j-from', value: filters.from });
  const to = h('input', { type: 'date', class: 'input', id: 'j-to', value: filters.to });
  const clearBtn = h('button', { type: 'button', class: 'btn btn-ghost btn-small' }, 'Clear filters');

  const panel = h('div', { class: 'filter-panel', id: 'j-filters', hidden: !filtersOpen },
    field('Platform', platformSel), field('Tag', tagSel), field('Confidence', confSel),
    field('From date', from), field('To date', to),
    h('div', { class: 'filter-actions' }, clearBtn));

  const summary = h('p', { class: 'muted summary', 'aria-live': 'polite' });
  const list = h('div', { class: 'entry-list' });

  function update() {
    const terms = queryTerms(filters.q);
    const shown = all.filter((e) => passes(e, terms));
    const mins = shown.reduce((n, e) => n + e.minutes, 0);
    summary.textContent = shown.length === all.length
      ? `${all.length} entr${all.length === 1 ? 'y' : 'ies'} · ${fmtMinutes(mins)}`
      : `Showing ${shown.length} of ${all.length} entries · ${fmtMinutes(mins)}`;
    if (!shown.length) {
      list.replaceChildren(emptyState('Nothing matches', 'Try a different search or clear the filters.'));
      return;
    }
    const out = [];
    let month = '';
    for (const e of shown) {
      const m = e.date.slice(0, 7);
      if (m !== month) {
        month = m;
        out.push(h('h2', { class: 'month-head' }, fmtDate(`${m}-01`, { month: 'long', year: 'numeric' })));
      }
      out.push(entryCard(e));
    }
    list.replaceChildren(...out);
  }

  search.addEventListener('input', () => { filters.q = search.value; update(); });
  filterBtn.addEventListener('click', () => {
    filtersOpen = !filtersOpen;
    panel.hidden = !filtersOpen;
    filterBtn.setAttribute('aria-expanded', String(filtersOpen));
  });
  const bind = (el, key) => el.addEventListener('change', () => { filters[key] = el.value; setFilterBtn(); update(); });
  bind(platformSel, 'platform');
  bind(tagSel, 'tag');
  bind(confSel, 'conf');
  bind(from, 'from');
  bind(to, 'to');
  clearBtn.addEventListener('click', () => {
    Object.assign(filters, { platform: '', tag: '', from: '', to: '', conf: '' });
    platformSel.value = tagSel.value = confSel.value = from.value = to.value = '';
    setFilterBtn();
    update();
  });

  page.append(
    h('div', { class: 'search-row' },
      h('div', { class: 'search-box' }, h('label', { class: 'visually-hidden', for: 'j-search' }, 'Search entries'), icon('search'), search),
      filterBtn),
    panel, summary, list);
  update();
  return null;
}
