// Numbers for the Stats screen. Weeks run Monday to Sunday in local time.

import { localDateISO, parseLocalDate } from './model.js';

export function mondayOf(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const weekKeyOf = (dateStr) => localDateISO(mondayOf(parseLocalDate(dateStr)));

// A streak survives until the current week ends, so it doesn't drop to 0 on Monday morning.
function countStreak(hit, thisMonday) {
  let d = new Date(thisMonday);
  if (!hit(localDateISO(d))) d = addDays(d, -7);
  let n = 0;
  while (n < 5000 && hit(localDateISO(d))) {
    n++;
    d = addDays(d, -7);
  }
  return n;
}

function tally(map, name, minutes) {
  const row = map.get(name) || { name, count: 0, minutes: 0 };
  row.count++;
  row.minutes += minutes;
  map.set(name, row);
}

export function computeStats(entries, settings, now = new Date()) {
  const dayMinutes = new Map();
  const weekMinutes = new Map();
  const weekCount = new Map();
  const platforms = new Map();
  const tags = new Map();
  let totalMinutes = 0, confSum = 0, confN = 0, openQuestions = 0;

  for (const e of entries) {
    totalMinutes += e.minutes;
    dayMinutes.set(e.date, (dayMinutes.get(e.date) || 0) + e.minutes);
    const wk = weekKeyOf(e.date);
    weekMinutes.set(wk, (weekMinutes.get(wk) || 0) + e.minutes);
    weekCount.set(wk, (weekCount.get(wk) || 0) + 1);
    tally(platforms, e.platform, e.minutes);
    for (const t of e.tags) tally(tags, t, e.minutes);
    if (e.confidence) { confSum += e.confidence; confN++; }
    openQuestions += e.questions.filter((q) => !q.solved).length;
  }

  const thisMonday = mondayOf(now);
  const weeks = [];
  for (let i = 11; i >= 0; i--) {
    const start = addDays(thisMonday, -7 * i);
    const key = localDateISO(start);
    weeks.push({ key, start, minutes: weekMinutes.get(key) || 0, count: weekCount.get(key) || 0 });
  }

  const today = localDateISO(now);
  const days = [];
  for (let i = 0; i < 84; i++) {
    const d = addDays(weeks[0].start, i);
    const key = localDateISO(d);
    days.push({ key, date: d, minutes: dayMinutes.get(key) || 0, future: key > today });
  }

  const goalMin = settings.goalMinHours * 60;
  const byCount = (a, b) => b.count - a.count || b.minutes - a.minutes || a.name.localeCompare(b.name);
  return {
    totalMinutes,
    entryCount: entries.length,
    thisWeekMinutes: weekMinutes.get(localDateISO(thisMonday)) || 0,
    weeks,
    days,
    streak: countStreak((k) => (weekCount.get(k) || 0) > 0, thisMonday),
    goalStreak: goalMin > 0 ? countStreak((k) => (weekMinutes.get(k) || 0) >= goalMin, thisMonday) : 0,
    platforms: [...platforms.values()].sort(byCount),
    tags: [...tags.values()].sort(byCount),
    avgConfidence: confN ? confSum / confN : null,
    openQuestions,
    activeDays: days.filter((d) => d.minutes > 0).length,
  };
}

export function heatLevel(minutes) {
  if (minutes <= 0) return 0;
  if (minutes < 30) return 1;
  if (minutes < 60) return 2;
  if (minutes < 120) return 3;
  return 4;
}
