// Berechnet gesetzliche Feiertage für Bremen (HB).
// Bewegliche Feiertage basieren auf dem Osterdatum (Gauß'sche Osterformel).

function easterSunday(year) {
  // Gaußsche Osterformel
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const holidayCache = new Map();

export function getBremenHolidays(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);

  const easter = easterSunday(year);
  const holidays = new Map();

  const add = (date, name) => holidays.set(toDateKey(date), name);

  add(new Date(year, 0, 1), 'Neujahr');
  add(addDays(easter, -2), 'Karfreitag');
  add(addDays(easter, 1), 'Ostermontag');
  add(new Date(year, 4, 1), 'Tag der Arbeit');
  add(addDays(easter, 39), 'Christi Himmelfahrt');
  add(addDays(easter, 50), 'Pfingstmontag');
  add(new Date(year, 9, 3), 'Tag der Deutschen Einheit');
  add(new Date(year, 9, 31), 'Reformationstag');
  add(new Date(year, 11, 25), '1. Weihnachtstag');
  add(new Date(year, 11, 26), '2. Weihnachtstag');

  holidayCache.set(year, holidays);
  return holidays;
}

// dateKey im Format "YYYY-MM-DD"
export function getHolidayName(dateKey) {
  const year = parseInt(dateKey.split('-')[0], 10);
  const holidays = getBremenHolidays(year);
  return holidays.get(dateKey) ?? null;
}

export function isHoliday(dateKey) {
  return getHolidayName(dateKey) !== null;
}
