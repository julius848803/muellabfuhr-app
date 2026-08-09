import AsyncStorage from '@react-native-async-storage/async-storage';
import { getUpcomingPickups, formatRelativeDay } from './pickups';
import { colorForType } from './colors';

async function getJson(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

// Liefert alle Termine, die auf den nächsten anstehenden Tag fallen und noch
// nicht bestätigt sind — genau das, was das Widget anzeigen soll.
export async function getNextPickupItems() {
  const [recurringSchedules, importedEvents, confirmations] = await Promise.all([
    getJson('mb_recurring_schedules', []),
    getJson('mb_imported_events', []),
    getJson('mb_confirmations', {}),
  ]);

  const pickups = getUpcomingPickups({ recurringSchedules, importedEvents, daysAhead: 21 });
  const open = pickups.filter((p) => !confirmations[p.id]);
  if (open.length === 0) return [];

  const nextDate = open[0].date;
  const sameDay = open.filter((p) => p.date === nextDate);

  return sameDay.map((p) => ({
    type: p.type,
    date: p.date,
    color: colorForType(p.type),
    relativeLabel: formatRelativeDay(p.date),
  }));
}
