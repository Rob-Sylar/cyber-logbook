// Stats: totals, weekly goal, streaks, a 12-week heatmap and per-platform bars (plain SVG).

import * as store from '../store.js';
import { computeStats, heatLevel } from '../stats.js';
import { emptyState, fmtHours, fmtMinutes, h, icon, pageHead, s } from '../ui.js';

export const title = 'Stats';
export const wide = true;

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function statCard(label, value, sub, iconName) {
  return h('div', { class: 'stat' },
    h('p', { class: 'stat-label' }, iconName ? icon(iconName) : null, label),
    h('p', { class: 'stat-value' }, value),
    sub ? h('p', { class: 'stat-sub' }, sub) : null);
}

function goalCard(st, settings) {
  const hours = st.thisWeekMinutes / 60;
  const { goalMinHours: min, goalTargetHours: target } = settings;
  const pct = Math.min(100, (hours / target) * 100);
  const fill = h('div', { class: 'goal-fill' });
  fill.style.width = `${pct}%`;
  const marker = h('div', { class: 'goal-marker', title: `Minimum: ${min} h` });
  marker.style.left = `${Math.min(100, (min / target) * 100)}%`;
  let status;
  if (hours >= target) status = 'Weekly goal hit. Brilliant.';
  else if (hours >= min) status = `Minimum done. ${fmtMinutes(Math.ceil((target - hours) * 60))} to your target.`;
  else status = `${fmtMinutes(Math.ceil((min - hours) * 60))} to your ${min} h minimum.`;
  return h('section', { class: 'card goal-card', 'aria-labelledby': 'goal-h' },
    h('h2', { id: 'goal-h' }, 'This week'),
    h('p', { class: 'goal-big' }, fmtHours(st.thisWeekMinutes), h('span', { class: 'muted' }, ` of ${target} h`)),
    h('div', {
      class: `goal-track ${hours >= min ? 'is-min' : ''} ${hours >= target ? 'is-done' : ''}`,
      role: 'progressbar',
      'aria-label': 'Hours this week',
      'aria-valuemin': '0',
      'aria-valuemax': String(target),
      'aria-valuenow': String(Math.round(hours * 10) / 10),
      'aria-valuetext': `${fmtHours(st.thisWeekMinutes)} of ${target} hours`,
    }, fill, marker),
    h('p', { class: 'goal-legend small muted' }, `Goal: ${min}–${target} h a week (Monday to Sunday). The line marks your minimum.`),
    h('p', { class: 'goal-status' }, status));
}

function heatmap(st) {
  const cell = 16, gap = 4, left = 34, top = 22;
  const width = left + 12 * (cell + gap);
  const height = top + 7 * (cell + gap);
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, class: 'heatmap', role: 'img', 'aria-labelledby': 'heat-title heat-desc' },
    s('title', { id: 'heat-title' }, 'Activity over the last 12 weeks'),
    s('desc', { id: 'heat-desc' }, `${st.activeDays} active day${st.activeDays === 1 ? '' : 's'} in the last 12 weeks. Darker squares mean more time.`));
  DAY_NAMES.forEach((d, i) => {
    if (i % 2 === 0) svg.append(s('text', { x: 0, y: top + i * (cell + gap) + cell - 3, class: 'chart-text' }, d));
  });
  let lastMonth = -1;
  st.days.forEach((d, i) => {
    const col = Math.floor(i / 7), row = i % 7;
    const x = left + col * (cell + gap), y = top + row * (cell + gap);
    if (row === 0 && d.date.getMonth() !== lastMonth) {
      lastMonth = d.date.getMonth();
      svg.append(s('text', { x, y: 14, class: 'chart-text' }, d.date.toLocaleDateString(undefined, { month: 'short' })));
    }
    const label = `${d.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}: ${d.future ? 'still to come' : fmtMinutes(d.minutes)}`;
    svg.append(s('rect', { x, y, width: cell, height: cell, rx: 3, class: d.future ? 'heat heat-future' : `heat heat-${heatLevel(d.minutes)}` }, s('title', null, label)));
  });
  const legend = h('div', { class: 'heat-legend small muted', 'aria-hidden': 'true' }, 'Less',
    [0, 1, 2, 3, 4].map((l) => s('svg', { viewBox: '0 0 12 12', class: 'legend-swatch' }, s('rect', { width: 12, height: 12, rx: 2, class: `heat heat-${l}` }))), 'More');
  return [svg, legend];
}

function weekBars(st, settings) {
  const w = 12 * 30, hgt = 140, top = 10, bottom = 22, chartH = hgt - top - bottom;
  const maxMin = Math.max(settings.goalTargetHours * 60, ...st.weeks.map((x) => x.minutes), 60);
  const y = (min) => top + chartH - (min / maxMin) * chartH;
  const svg = s('svg', { viewBox: `0 0 ${w} ${hgt}`, class: 'bars', role: 'img', 'aria-labelledby': 'wk-title' },
    s('title', { id: 'wk-title' }, 'Hours per week for the last 12 weeks'));
  for (const [mins, cls] of [[settings.goalMinHours * 60, 'goal-line min'], [settings.goalTargetHours * 60, 'goal-line']]) {
    if (mins > 0) svg.append(s('line', { x1: 0, x2: w, y1: y(mins), y2: y(mins), class: cls }));
  }
  st.weeks.forEach((wk, i) => {
    const x = i * 30 + 5, barH = Math.max(wk.minutes ? 2 : 0, (wk.minutes / maxMin) * chartH);
    const met = wk.minutes >= settings.goalMinHours * 60 && wk.minutes > 0;
    svg.append(s('rect', { x, y: top + chartH - barH, width: 20, height: barH, rx: 3, class: `bar ${met ? 'bar-met' : ''}` },
      s('title', null, `Week of ${wk.start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}: ${fmtMinutes(wk.minutes)}`)));
    if (i % 2 === 1 || i === 11) {
      svg.append(s('text', { x: x + 10, y: hgt - 6, class: 'chart-text', 'text-anchor': 'middle' }, i === 11 ? 'Now' : wk.start.toLocaleDateString(undefined, { day: 'numeric', month: 'numeric' })));
    }
  });
  const table = h('table', { class: 'visually-hidden' },
    h('caption', null, 'Minutes per week'),
    h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Week starting'), h('th', { scope: 'col' }, 'Time'))),
    h('tbody', null, st.weeks.map((wk) => h('tr', null, h('td', null, wk.start.toLocaleDateString()), h('td', null, fmtMinutes(wk.minutes))))));
  return [svg, table];
}

function hBars(rows, valueOf, labelOf, titleText) {
  const rowH = 30, labelW = 130, w = 420;
  const max = Math.max(1, ...rows.map(valueOf));
  const svg = s('svg', { viewBox: `0 0 ${w} ${rows.length * rowH + 4}`, class: 'hbars', role: 'img', 'aria-label': titleText });
  rows.forEach((r, i) => {
    const y = i * rowH + 4;
    const bw = Math.max(2, (valueOf(r) / max) * (w - labelW - 70));
    svg.append(
      s('text', { x: 0, y: y + 17, class: 'chart-text chart-label' }, r.name.length > 18 ? `${r.name.slice(0, 17)}…` : r.name),
      s('rect', { x: labelW, y: y + 4, width: bw, height: 18, rx: 3, class: 'bar' }),
      s('text', { x: labelW + bw + 8, y: y + 17, class: 'chart-text' }, labelOf(r)));
  });
  const list = h('ul', { class: 'visually-hidden' }, rows.map((r) => h('li', null, `${r.name}: ${labelOf(r)}`)));
  return [svg, list];
}

export function render(page) {
  const entries = store.entries();
  const settings = store.getSettings();
  page.append(pageHead('Stats'));
  if (!entries.length) {
    page.append(emptyState('No stats yet', 'Log a session and your hours, streak and heatmap will start filling in.',
      h('a', { class: 'btn btn-primary', href: '#/log' }, 'Log a session')));
    return null;
  }
  const st = computeStats(entries, settings);
  page.append(
    h('div', { class: 'stat-grid' },
      statCard('Total time', fmtHours(st.totalMinutes), `${st.entryCount} session${st.entryCount === 1 ? '' : 's'}`, 'clock'),
      statCard('Streak', `${st.streak} week${st.streak === 1 ? '' : 's'}`, 'In a row with at least one session', 'flame'),
      statCard('Goal streak', `${st.goalStreak} week${st.goalStreak === 1 ? '' : 's'}`, `In a row hitting ${settings.goalMinHours} h+`, 'check'),
      statCard('Open questions', String(st.openQuestions), st.avgConfidence ? `Average confidence ${st.avgConfidence.toFixed(1)}/5` : 'No confidence ratings yet', 'help')),
    h('div', { class: 'stats-two' },
      goalCard(st, settings),
      h('section', { class: 'card', 'aria-labelledby': 'heat-h' }, h('h2', { id: 'heat-h' }, 'Last 12 weeks'), ...heatmap(st))),
    h('section', { class: 'card', 'aria-labelledby': 'wk-h' }, h('h2', { id: 'wk-h' }, 'Hours per week'), ...weekBars(st, settings),
      h('p', { class: 'small muted' }, 'Green bars hit your minimum. Dashed line: minimum. Solid line: target.')),
    h('div', { class: 'stats-two' },
      h('section', { class: 'card', 'aria-labelledby': 'plat-h' }, h('h2', { id: 'plat-h' }, 'Sessions per platform'),
        ...hBars(st.platforms, (r) => r.count, (r) => `${r.count} · ${fmtHours(r.minutes)}`, 'Sessions per platform')),
      st.tags.length ? h('section', { class: 'card', 'aria-labelledby': 'tag-h' }, h('h2', { id: 'tag-h' }, 'Time per topic'),
        ...hBars([...st.tags].sort((a, b) => b.minutes - a.minutes).slice(0, 12), (r) => r.minutes, (r) => fmtHours(r.minutes), 'Time per topic tag')) : null),
  );
  return null;
}
