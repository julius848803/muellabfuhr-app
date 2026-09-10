import { getHolidayName } from './holidays';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfDay(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDateKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Erzeugt alle Vorkommen eines wiederkehrenden Termins innerhalb [rangeStart, rangeEnd].
function generateOccurrencesBetween(schedule, rangeStart, rangeEnd) {
  const intervalDays = schedule.intervalWeeks * 7;
  const start = startOfDay(parseDateKey(schedule.startDate));

  const occurrences = [];
  const diffDays = Math.round((rangeStart.getTime() - start.getTime()) / MS_PER_DAY);
  let firstOccurrence;
  if (diffDays <= 0) {
    firstOccurrence = start;
  } else {
    const k = Math.ceil(diffDays / intervalDays);
    firstOccurrence = new Date(start.getTime() + k * intervalDays * MS_PER_DAY);
  }

  let cursor = firstOccurrence;
  while (cursor <= rangeEnd) {
    if (cursor >= rangeStart) occurrences.push(toDateKey(cursor));
    cursor = new Date(cursor.getTime() + intervalDays * MS_PER_DAY);
  }
  return occurrences;
}

export function generateRecurringOccurrences(schedule, daysAhead = 30) {
  const today = startOfDay(new Date());
  const rangeEnd = new Date(today.getTime() + daysAhead * MS_PER_DAY);
  return generateOccurrencesBetween(schedule, today, rangeEnd);
}

export function getUpcomingPickups({ recurringSchedules, importedEvents, daysAhead = 30 }) {
  const today = startOfDay(new Date());
  const rangeEndKey = toDateKey(new Date(today.getTime() + daysAhead * MS_PER_DAY));
  const todayKey = toDateKey(today);

  const map = new Map();

  for (const schedule of recurringSchedules) {
    const dates = generateRecurringOccurrences(schedule, daysAhead);
    for (const date of dates) {
      const id = `${schedule.type}__${date}`;
      map.set(id, { id, type: schedule.type, date });
    }
  }

  for (const event of importedEvents) {
    if (event.date < todayKey || event.date > rangeEndKey) continue;
    const id = `${event.type}__${event.date}`;
    map.set(id, { id, type: event.type, date: event.date });
  }

  const list = Array.from(map.values());
  for (const item of list) {
    item.holidayName = getHolidayName(item.date);
  }
  list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return list;
}

// Termine, deren Datum in der Vergangenheit liegt (für's Archiv, damit man
// nachträglich noch bestätigen/ändern kann).
export function getPastPickups({ recurringSchedules, importedEvents, daysBack = 30 }) {
  const today = startOfDay(new Date());
  const rangeStart = new Date(today.getTime() - daysBack * MS_PER_DAY);
  const rangeEnd = new Date(today.getTime() - MS_PER_DAY); // gestern
  const rangeStartKey = toDateKey(rangeStart);
  const todayKey = toDateKey(today);

  const map = new Map();

  for (const schedule of recurringSchedules) {
    const dates = generateOccurrencesBetween(schedule, rangeStart, rangeEnd);
    for (const date of dates) {
      const id = `${schedule.type}__${date}`;
      map.set(id, { id, type: schedule.type, date });
    }
  }

  for (const event of importedEvents) {
    if (event.date < rangeStartKey || event.date >= todayKey) continue;
    const id = `${event.type}__${event.date}`;
    map.set(id, { id, type: event.type, date: event.date });
  }

  const list = Array.from(map.values());
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return list;
}

export function daysFromToday(dateKey) {
  const today = startOfDay(new Date());
  const target = startOfDay(parseDateKey(dateKey));
  return Math.round((target.getTime() - today.getTime()) / MS_PER_DAY);
}

export function formatRelativeDay(dateKey) {
  const diff = daysFromToday(dateKey);
  if (diff === 0) return 'Heute';
  if (diff === 1) return 'Morgen';
  const date = parseDateKey(dateKey);
  return date.toLocaleDateString('de-DE', {
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}
