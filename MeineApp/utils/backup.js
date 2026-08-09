import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Alle App-eigenen Storage-Keys (siehe storage.js) — zentral hier gepflegt,
// damit Backup/Restore garantiert alles erfasst.
const ALL_KEYS = [
  'mb_recurring_schedules',
  'mb_imported_events',
  'mb_confirmations',
  'mb_settings',
  'mb_counts',
  'mb_history',
  'mb_adjustments',
  'mb_skipped',
  'mb_yearly_targets',
];

export async function exportBackup() {
  const entries = await AsyncStorage.multiGet(ALL_KEYS);
  const data = {};
  for (const [key, value] of entries) {
    if (value != null) {
      try {
        data[key] = JSON.parse(value);
      } catch {
        // ignoriere kaputte/unlesbare Einträge statt das ganze Backup zu killen
      }
    }
  }

  const backup = {
    app: 'muellabfuhr',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  };

  const fileUri = FileSystem.cacheDirectory + `muellabfuhr-backup-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backup, null, 2));

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: 'application/json',
      dialogTitle: 'Backup speichern/teilen',
    });
  } else {
    throw new Error('Teilen wird auf diesem Gerät nicht unterstützt.');
  }
}

export async function importBackupFromUri(uri) {
  const content = await FileSystem.readAsStringAsync(uri);
  const backup = JSON.parse(content);

  if (backup.app !== 'muellabfuhr' || !backup.data) {
    throw new Error('Das ist keine gültige Backup-Datei dieser App.');
  }

  const pairs = ALL_KEYS.filter((k) => backup.data[k] !== undefined).map((k) => [
    k,
    JSON.stringify(backup.data[k]),
  ]);
  await AsyncStorage.multiSet(pairs);

  return pairs.length;
}
