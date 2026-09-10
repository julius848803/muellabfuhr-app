import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatRelativeDay } from './pickups';

const NOTIFICATION_MAP_KEY = 'mb_notification_map';
const SHOWN_MAP_KEY = 'mb_shown_notification_map';
const CATEGORY_ID = 'MUELL_REMINDER';
const ANDROID_CHANNEL_ID = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function setupNotifications() {
  await Notifications.requestPermissionsAsync();

  // Android verlangt seit Version 8 einen explizit angelegten Notification
  // Channel, sonst werden geplante Benachrichtigungen nicht angezeigt.
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(ANDROID_CHANNEL_ID, {
      name: 'Müllabfuhr-Erinnerungen',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: null,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      // Durchbricht "Bitte nicht stören" — braucht zusätzlich die
      // "Nicht-stören-Zugriff"-Berechtigung, die der Nutzer manuell in den
      // Android-Systemeinstellungen erteilen muss (kann die App nicht selbst
      // aktivieren, das ist eine besonders geschützte Berechtigung).
      bypassDnd: true,
    });
  }

  await Notifications.setNotificationCategoryAsync(CATEGORY_ID, [
    {
      identifier: 'CONFIRM',
      buttonTitle: '✓ Ist draußen',
      options: { opensAppToForeground: false },
    },
    {
      identifier: 'SNOOZE',
      buttonTitle: 'In 5 Minuten erinnern',
      options: { opensAppToForeground: false },
    },
  ]);
}

async function getNotificationMap() {
  const raw = await AsyncStorage.getItem(NOTIFICATION_MAP_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function setNotificationMap(map) {
  await AsyncStorage.setItem(NOTIFICATION_MAP_KEY, JSON.stringify(map));
}

// Merkt sich pro Tonnen-Gruppe (sortierte pickupIds als Schlüssel), welche
// zuletzt zugestellte Benachrichtigung gerade in der Statusleiste hängt.
// Jede Erinnerung einer Eskalations-Serie bekommt eine eigene ID (sonst
// würde das Planen der nächsten die vorherige, noch nicht fällige,
// überschreiben) — dadurch stapeln sie sich aber sonst alle übereinander in
// der Leiste. Deshalb wird beim Zustellen einer neuen die vorherige aktiv
// weggewischt.
function groupKeyForPickupIds(pickupIds) {
  return [...pickupIds].sort().join(',');
}

async function getShownMap() {
  const raw = await AsyncStorage.getItem(SHOWN_MAP_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function setShownMap(map) {
  await AsyncStorage.setItem(SHOWN_MAP_KEY, JSON.stringify(map));
}

export async function cancelRemindersForPickup(pickupId) {
  const map = await getNotificationMap();
  const ids = map[pickupId] ?? [];
  for (const id of ids) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  delete map[pickupId];
  await setNotificationMap(map);

  // Auch eine aktuell in der Leiste hängende Erinnerung für diese Tonne
  // wegwischen, sonst bleibt sie nach dem Bestätigen sichtbar stehen.
  const shownMap = await getShownMap();
  for (const key of Object.keys(shownMap)) {
    if (key.split(',').includes(String(pickupId))) {
      await Notifications.dismissNotificationAsync(shownMap[key]).catch(() => {});
      delete shownMap[key];
    }
  }
  await setShownMap(shownMap);
}

function groupByDate(pickups) {
  const groups = new Map();
  for (const pickup of pickups) {
    if (!groups.has(pickup.date)) groups.set(pickup.date, []);
    groups.get(pickup.date).push(pickup);
  }
  return Array.from(groups.values()).sort((a, b) => (a[0].date < b[0].date ? -1 : 1));
}

export async function cancelAllReminders() {
  await Notifications.cancelAllScheduledNotificationsAsync();
  await setNotificationMap({});
  await setShownMap({});
}

// Läuft, sobald eine geplante Erinnerung tatsächlich in der Statusleiste
// erscheint (auch im Hintergrund). Gehört sie zu einer Gruppe, für die schon
// eine ältere Erinnerung sichtbar ist, wird die alte weggewischt — so bleibt
// immer nur die aktuellste "Ist die Tonne draußen?"-Meldung stehen, statt
// dass sich mehrere Duplikate stapeln.
export function addNotificationReceivedListener() {
  return Notifications.addNotificationReceivedListener(async (notification) => {
    const pickupIds = notification.request.content.data?.pickupIds;
    const identifier = notification.request.identifier;
    if (!pickupIds || pickupIds.length === 0 || !identifier) return;

    const key = groupKeyForPickupIds(pickupIds);
    const shownMap = await getShownMap();
    const previousId = shownMap[key];
    if (previousId && previousId !== identifier) {
      await Notifications.dismissNotificationAsync(previousId).catch(() => {});
    }
    shownMap[key] = identifier;
    await setShownMap(shownMap);
  });
}

const MAX_PER_PHASE = 100;
// Hartes iOS-Limit für gleichzeitig geplante Benachrichtigungen liegt bei 64 —
// wir bleiben mit etwas Puffer darunter, damit auch spätere Termine noch
// Platz haben.
const GLOBAL_SAFETY_CAP = 60;

function baseDateForPhase(dateKey, time, dayMode) {
  const [hour, minute] = time.split(':').map(Number);
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d, hour, minute, 0, 0);
  if (dayMode === 'evening') {
    date.setDate(date.getDate() - 1);
  }
  return date;
}

// Erzeugt alle Feuer-Zeitpunkte für einen Abholtag anhand der konfigurierten
// Zeiträume. Jeder Zeitraum hat seine eigene Vorabend/Abholtag-Einstellung,
// daher werden alle Zeiträume anhand ihres tatsächlichen Zeitpunkts sortiert.
// Ein Zeitraum läuft ab seiner Startzeit im eigenen Intervall, bis der
// nächste beginnt (oder bis zur konfigurierten Stopp-Zeit beim letzten).
function computeFireTimes(dateKey, settings, now) {
  const withStart = settings.phases.map((phase) => ({
    ...phase,
    start: baseDateForPhase(dateKey, phase.time, phase.dayMode),
  }));
  withStart.sort((a, b) => a.start - b.start);

  const stopAt = baseDateForPhase(dateKey, settings.stopTime, 'pickupDay');
  const times = [];

  for (let i = 0; i < withStart.length; i++) {
    const phase = withStart[i];
    const end = i + 1 < withStart.length ? withStart[i + 1].start : stopAt;
    const intervalMs = phase.intervalMinutes * 60 * 1000;

    // Bei sehr kurzen Intervallen über lange Zeiträume würde das reine
    // Hochzählen ab phase.start das MAX_PER_PHASE-Budget schon in der
    // Vergangenheit verbrauchen, bevor "jetzt" überhaupt erreicht ist.
    // Deshalb: liegt der Start schon vor "jetzt", direkt zum nächsten
    // zukünftigen Zeitpunkt vorspulen, statt bei k=0 anzufangen.
    let effectiveStart = phase.start;
    if (now && effectiveStart < now) {
      const stepsElapsed = Math.floor((now.getTime() - effectiveStart.getTime()) / intervalMs) + 1;
      effectiveStart = new Date(effectiveStart.getTime() + stepsElapsed * intervalMs);
    }

    for (let k = 0; k < MAX_PER_PHASE; k++) {
      const fireDate = new Date(effectiveStart.getTime() + k * intervalMs);
      if (fireDate >= end) break;
      times.push(fireDate);
    }
  }

  // Nachfass-Logik: Falls sämtliche konfigurierten Zeiträume für diesen Tag
  // bereits vorbei sind (z.B. weil alle auf "Vorabend" stehen, der Termin
  // aber heute fällig ist), aber die Stopp-Zeit noch nicht erreicht ist,
  // soll trotzdem nicht komplett geschwiegen werden — dann startet sofort
  // eine Erinnerungsserie im Intervall des letzten Zeitraums.
  const future = times.filter((t) => t > now);
  if (future.length === 0 && stopAt > now && withStart.length > 0) {
    const lastPhase = withStart[withStart.length - 1];
    for (let k = 0; k < MAX_PER_PHASE; k++) {
      const fireDate = new Date(now.getTime() + k * lastPhase.intervalMinutes * 60 * 1000);
      if (fireDate >= stopAt) break;
      times.push(fireDate);
    }
  }

  return times;
}

// Plant Erinnerungen für alle noch nicht bestätigten, anstehenden Abholungen.
// Mehrere Tonnen am selben Tag werden zu einer gemeinsamen Nachricht gebündelt.
// Bewusst begrenzt auf die nächsten Tage + einen globalen Sicherheits-Deckel,
// damit das iOS-Limit für geplante Benachrichtigungen (64) nicht gesprengt wird.
export async function rescheduleAllReminders(pickups, confirmations, settings, skipped = {}) {
  await cancelAllReminders();
  const map = {};
  const now = new Date();
  let totalScheduled = 0;

  const relevant = pickups.filter((p) => {
    if (confirmations[p.id] || skipped[p.id]) return false;
    const diffDays = Math.round(
      (new Date(p.date).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
    );
    return diffDays >= 0 && diffDays <= 2;
  });

  const groups = groupByDate(relevant).slice(0, 4);

  for (const group of groups) {
    if (totalScheduled >= GLOBAL_SAFETY_CAP) break;

    const dateKey = group[0].date;
    const pickupIds = group.map((p) => p.id);
    const typeNames = group.map((p) => p.type).join(', ');
    const fireTimes = computeFireTimes(dateKey, settings, now).filter((t) => t > now);
    const ids = [];

    for (let k = 0; k < fireTimes.length; k++) {
      if (totalScheduled >= GLOBAL_SAFETY_CAP) break;

      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🗑️ ${typeNames} — ${formatRelativeDay(dateKey)}`,
          body:
            k === 0
              ? group.length > 1
                ? 'Sind die Tonnen schon draußen?'
                : 'Ist die Tonne schon draußen?'
              : 'Immer noch nicht bestätigt — bitte prüfen.',
          categoryIdentifier: CATEGORY_ID,
          data: { pickupIds },
          interruptionLevel: 'timeSensitive',
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: fireTimes[k],
          channelId: ANDROID_CHANNEL_ID,
        },
      });
      ids.push(id);
      totalScheduled++;
    }

    if (ids.length > 0) {
      for (const pickupId of pickupIds) {
        map[pickupId] = ids;
      }
    }
  }

  await setNotificationMap(map);
}

export function addNotificationResponseListener(onConfirm, onSnooze) {
  return Notifications.addNotificationResponseReceivedListener((response) => {
    const pickupIds = response.notification.request.content.data?.pickupIds;
    if (!pickupIds || pickupIds.length === 0) return;
    if (response.actionIdentifier === 'CONFIRM') {
      onConfirm(pickupIds);
    } else if (response.actionIdentifier === 'SNOOZE') {
      onSnooze(pickupIds);
    }
  });
}
