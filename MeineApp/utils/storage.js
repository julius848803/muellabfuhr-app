import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  recurringSchedules: 'mb_recurring_schedules',
  importedEvents: 'mb_imported_events',
  confirmations: 'mb_confirmations',
  settings: 'mb_settings',
  counts: 'mb_counts',
};

export const DEFAULT_SETTINGS = {
  reminderMode: 'evening', // 'evening' = Vorabend, 'morning' = am Tag selbst
  reminderTime: '20:00',
  escalationIntervalMinutes: 5,
  escalationMaxRepeats: 12,
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

export const getSettings = () => getJson(KEYS.settings, DEFAULT_SETTINGS);
export const setSettings = (v) => setJson(KEYS.settings, v);

export const getCounts = () => getJson(KEYS.counts, {});
export const setCounts = (v) => setJson(KEYS.counts, v);
