import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatRelativeDay } from './pickups';

const NOTIFICATION_MAP_KEY = 'mb_notification_map';
const CATEGORY_ID = 'MUELL_REMINDER';

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

export async function cancelRemindersForPickup(pickupId) {
  const map = await getNotificationMap();
  const ids = map[pickupId] ?? [];
  for (const id of ids) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
  }
  delete map[pickupId];
  await setNotificationMap(map);
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
}

function computeBaseTrigger(dateKey, settings) {
  const [hour, minute] = settings.reminderTime.split(':').map(Number);
  const [y, m, d] = dateKey.split('-').map(Number);
  const base = new Date(y, m - 1, d, hour, minute, 0, 0);
  if (settings.reminderMode === 'evening') {
    base.setDate(base.getDate() - 1);
  }
  return base;
}

// Plant Erinnerungen für alle noch nicht bestätigten, anstehenden Abholungen.
// Mehrere Tonnen am selben Tag werden zu einer gemeinsamen Nachricht gebündelt.
// Bewusst begrenzt auf die nächsten Tage, damit das iOS-Limit für geplante
// Benachrichtigungen (64) nicht gesprengt wird.
export async function rescheduleAllReminders(pickups, confirmations, settings) {
  await cancelAllReminders();
  const map = {};
  const now = new Date();

  const relevant = pickups.filter((p) => {
    if (confirmations[p.id]) return false;
    const diffDays = Math.round(
      (new Date(p.date).getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)
    );
    return diffDays >= 0 && diffDays <= 2;
  });

  const groups = groupByDate(relevant).slice(0, 4);

  for (const group of groups) {
    const dateKey = group[0].date;
    const pickupIds = group.map((p) => p.id);
    const typeNames = group.map((p) => p.type).join(', ');
    const base = computeBaseTrigger(dateKey, settings);
    const ids = [];

    for (let k = 0; k < settings.escalationMaxRepeats; k++) {
      const fireDate = new Date(base.getTime() + k * settings.escalationIntervalMinutes * 60 * 1000);
      if (fireDate <= now) continue;

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
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireDate },
      });
      ids.push(id);
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
