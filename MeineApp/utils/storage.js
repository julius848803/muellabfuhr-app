import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  recurringSchedules: 'mb_recurring_schedules',
  importedEvents: 'mb_imported_events',
  confirmations: 'mb_confirmations',
  settings: 'mb_settings',
  counts: 'mb_counts',
  history: 'mb_history',
  adjustments: 'mb_adjustments',
  skipped: 'mb_skipped',
  yearlyTargets: 'mb_yearly_targets',
};

export const MAX_PHASES = 5;
export const MAX_PER_PHASE = 100;

export const DEFAULT_SETTINGS = {
  // Zeiträume: jeweils ab "time" (an "dayMode": 'evening' = Vorabend der
  // Abholung, 'pickupDay' = am Abholtag selbst) alle "intervalMinutes" eine
  // Erinnerung, bis der nächste Zeitraum beginnt (oder "stopTime" beim letzten).
  phases: [
    { id: 'p1', time: '18:00', intervalMinutes: 60, dayMode: 'evening' },
    { id: 'p2', time: '21:00', intervalMinutes: 10, dayMode: 'evening' },
    { id: 'p3', time: '23:00', intervalMinutes: 3, dayMode: 'evening' },
  ],
  // Ab dieser Uhrzeit (am Abholtag) werden keine weiteren Erinnerungen mehr geplant.
  stopTime: '23:59',
};

async function getJson(key, fallback) {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function setJson(key, value) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export const getRecurringSchedules = () => getJson(KEYS.recurringSchedules, []);
export const setRecurringSchedules = (v) => setJson(KEYS.recurringSchedules, v);

export const getImportedEvents = () => getJson(KEYS.importedEvents, []);
export const setImportedEvents = (v) => setJson(KEYS.importedEvents, v);

export const getConfirmations = () => getJson(KEYS.confirmations, {});
export const setConfirmations = (v) => setJson(KEYS.confirmations, v);

export async function getSettings() {
  const stored = await getJson(KEYS.settings, null);
  if (!stored) return DEFAULT_SETTINGS;

  // Migration: ältere Versionen kannten noch kein "phases"-Array
  // (nur einzelne reminderTime/escalation-Felder).
  let phases = stored.phases;
  if (!Array.isArray(phases) || phases.length === 0) {
    phases = DEFAULT_SETTINGS.phases;
  } else if (phases.some((p) => !p.dayMode)) {
    // Migration: dayMode gab es früher nur global als "reminderMode".
    const fallbackMode = stored.reminderMode ?? 'evening';
    phases = phases.map((p) => ({ dayMode: fallbackMode, ...p }));
  }

  const stopTime = stored.stopTime ?? DEFAULT_SETTINGS.stopTime;

  return { ...stored, phases, stopTime };
}
export const setSettings = (v) => setJson(KEYS.settings, v);

export const getCounts = () => getJson(KEYS.counts, {});
export const setCounts = (v) => setJson(KEYS.counts, v);

// history: { [type]: string[] } — Liste von Datums-Keys (YYYY-MM-DD), an denen bestätigt wurde
export const getHistory = () => getJson(KEYS.history, {});
export const setHistory = (v) => setJson(KEYS.history, v);

// adjustments: { [type]: { [dateKey]: netDelta } } — manuelle Zähler-Änderungen,
// pro Tag zu einer Gesamtzahl aufsummiert
export const getAdjustments = () => getJson(KEYS.adjustments, {});
export const setAdjustments = (v) => setJson(KEYS.adjustments, v);

// skipped: { [pickupId]: true } — "Diesmal nicht": Erinnerungen für diesen
// einen Termin stummschalten, ohne ihn als "draußen" zu zählen
export const getSkipped = () => getJson(KEYS.skipped, {});
export const setSkipped = (v) => setJson(KEYS.skipped, v);

// yearlyTargets: { [type]: number } — gewünschte Anzahl Leerungen pro Jahr
export const getYearlyTargets = () => getJson(KEYS.yearlyTargets, {});
export const setYearlyTargets = (v) => setJson(KEYS.yearlyTargets, v);
