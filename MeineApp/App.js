import { useState, useEffect, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  FlatList,
  ScrollView,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import DateTimePicker from '@react-native-community/datetimepicker';

import { parseIcs } from './utils/ics';
import { colorForType } from './utils/colors';
import { getUpcomingPickups, formatRelativeDay, daysFromToday } from './utils/pickups';
import {
  getRecurringSchedules,
  setRecurringSchedules,
  getImportedEvents,
  setImportedEvents,
  getConfirmations,
  setConfirmations,
  getSettings,
  setSettings,
  getCounts,
  setCounts,
} from './utils/storage';
import {
  setupNotifications,
  rescheduleAllReminders,
  cancelRemindersForPickup,
  addNotificationResponseListener,
} from './utils/notifications';

const INTERVAL_OPTIONS = [
  { label: 'wöchentlich', weeks: 1 },
  { label: 'alle 2 Wochen', weeks: 2 },
  { label: 'alle 4 Wochen', weeks: 4 },
];

const TYPE_PRESETS = ['Restmüll', 'Biomüll', 'Papier', 'Gelber Sack'];

function dateKeyFromDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateKeyDisplay(dateKey) {
  const [y, m, d] = dateKey.split('-');
  return `${d}.${m}.${y}`;
}

// ---------- Übersicht ----------

function PickupRow({ pickup, confirmed, onConfirm, onUnconfirm }) {
  const color = colorForType(pickup.type);
  const diff = daysFromToday(pickup.date);
  const urgent = diff <= 1 && !confirmed;
  const canConfirmYet = diff <= 1;

  return (
    <View style={[styles.pickupRow, urgent && styles.pickupRowUrgent]}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pickupType}>{pickup.type}</Text>
        <Text style={styles.pickupDate}>
          {formatRelativeDay(pickup.date)} · {formatDateKeyDisplay(pickup.date)}
        </Text>
        {pickup.holidayName && (
          <Text style={styles.holidayWarning}>
            ⚠️ {pickup.holidayName} — Termin evtl. verschoben, bitte prüfen
          </Text>
        )}
      </View>
      {confirmed ? (
        <Pressable onPress={() => onUnconfirm(pickup.id)} hitSlop={8}>
          <Text style={styles.confirmedBadge}>✓ Draußen</Text>
        </Pressable>
      ) : canConfirmYet ? (
        <Pressable style={styles.confirmButton} onPress={() => onConfirm(pickup.id)}>
          <Text style={styles.confirmButtonText}>Draußen</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CountersBar({ counts, types }) {
  if (types.length === 0) return null;
  return (
    <View style={styles.countersBar}>
      {types.map((type) => (
        <View key={type} style={styles.counterChip}>
          <View style={[styles.colorDot, { backgroundColor: colorForType(type) }]} />
          <Text style={styles.counterType}>{type}</Text>
          <Text style={styles.counterValue}>{counts[type] ?? 0}×</Text>
        </View>
      ))}
    </View>
  );
}

function HomeTab({ pickups, confirmations, onConfirm, onUnconfirm, counts, types, loading }) {
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#2ecc71" />
      </View>
    );
  }
  return (
    <FlatList
      data={pickups}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.tabContent}
      ListHeaderComponent={<CountersBar counts={counts} types={types} />}
      renderItem={({ item }) => (
        <PickupRow
          pickup={item}
          confirmed={!!confirmations[item.id]}
          onConfirm={onConfirm}
          onUnconfirm={onUnconfirm}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          Noch keine Termine. Leg unter "Termine" welche an oder importiere eine ICS-Datei.
        </Text>
      }
    />
  );
}

// ---------- Termine verwalten ----------

function SchedulesTab({
  recurringSchedules,
  importedEvents,
  onAddSchedule,
  onDeleteSchedule,
  onImport,
  onClearImported,
  importing,
}) {
  const [type, setType] = useState(TYPE_PRESETS[0]);
  const [customType, setCustomType] = useState('');
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [startDate, setStartDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const finalType = customType.trim() || type;

  const handleAdd = () => {
    onAddSchedule({
      id: `${finalType}-${Date.now()}`,
      type: finalType,
      intervalWeeks,
      startDate: dateKeyFromDate(startDate),
    });
    setCustomType('');
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.sectionTitle}>ICS-Kalender importieren</Text>
      <Pressable style={styles.importButton} onPress={onImport} disabled={importing}>
        {importing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.importButtonText}>📄 ICS-Datei auswählen</Text>
        )}
      </Pressable>
      {importedEvents.length > 0 && (
        <Pressable onPress={onClearImported} style={{ marginTop: 8 }}>
          <Text style={styles.linkText}>
            {importedEvents.length} importierte Termine löschen
          </Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Neuer wiederkehrender Termin</Text>

      <View style={styles.chipRow}>
        {TYPE_PRESETS.map((t) => (
          <Pressable
            key={t}
            style={[styles.chip, type === t && !customType && styles.chipActive]}
            onPress={() => {
              setType(t);
              setCustomType('');
            }}
          >
            <Text style={[styles.chipText, type === t && !customType && styles.chipTextActive]}>
              {t}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        style={styles.input}
        placeholder="…oder eigener Name"
        placeholderTextColor="#888"
        value={customType}
        onChangeText={setCustomType}
      />

      <Text style={styles.fieldLabel}>Rhythmus</Text>
      <View style={styles.chipRow}>
        {INTERVAL_OPTIONS.map((opt) => (
          <Pressable
            key={opt.weeks}
            style={[styles.chip, intervalWeeks === opt.weeks && styles.chipActive]}
            onPress={() => setIntervalWeeks(opt.weeks)}
          >
            <Text
              style={[
                styles.chipText,
                intervalWeeks === opt.weeks && styles.chipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.fieldLabel}>Erster Abholtermin</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowPicker(true)}>
        <Text style={styles.dateButtonText}>{dateKeyFromDate(startDate)}</Text>
      </Pressable>
      {showPicker && (
        <DateTimePicker
          value={startDate}
          mode="date"
          themeVariant="dark"
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={(event, selected) => {
            setShowPicker(Platform.OS === 'ios');
            if (selected) setStartDate(selected);
          }}
        />
      )}

      <Pressable style={styles.addButton} onPress={handleAdd}>
        <Text style={styles.addButtonText}>+ Termin hinzufügen</Text>
      </Pressable>

      {recurringSchedules.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Deine wiederkehrenden Termine</Text>
          {recurringSchedules.map((s) => (
            <View key={s.id} style={styles.scheduleRow}>
              <View style={[styles.colorDot, { backgroundColor: colorForType(s.type) }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.pickupType}>{s.type}</Text>
                <Text style={styles.pickupDate}>
                  {INTERVAL_OPTIONS.find((o) => o.weeks === s.intervalWeeks)?.label} · ab{' '}
                  {formatDateKeyDisplay(s.startDate)}
                </Text>
              </View>
              <Pressable onPress={() => onDeleteSchedule(s.id)} hitSlop={10}>
                <Text style={styles.removeText}>✕</Text>
              </Pressable>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

// ---------- Einstellungen ----------

function Stepper({ value, onChange, min = 1, max = 60, suffix = '' }) {
  return (
    <View style={styles.stepperRow}>
      <Pressable style={styles.stepperButton} onPress={() => onChange(Math.max(min, value - 1))}>
        <Text style={styles.stepperButtonText}>−</Text>
      </Pressable>
      <Text style={styles.stepperValue}>
        {value} {suffix}
      </Text>
      <Pressable style={styles.stepperButton} onPress={() => onChange(Math.min(max, value + 1))}>
        <Text style={styles.stepperButtonText}>+</Text>
      </Pressable>
    </View>
  );
}

function SettingsTab({ settings, onChange }) {
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [h, m] = settings.reminderTime.split(':').map(Number);
  const timeAsDate = new Date();
  timeAsDate.setHours(h, m, 0, 0);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.sectionTitle}>Wann soll erinnert werden?</Text>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, settings.reminderMode === 'evening' && styles.chipActive]}
          onPress={() => onChange({ ...settings, reminderMode: 'evening' })}
        >
          <Text
            style={[
              styles.chipText,
              settings.reminderMode === 'evening' && styles.chipTextActive,
            ]}
          >
            Am Vorabend
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, settings.reminderMode === 'morning' && styles.chipActive]}
          onPress={() => onChange({ ...settings, reminderMode: 'morning' })}
        >
          <Text
            style={[
              styles.chipText,
              settings.reminderMode === 'morning' && styles.chipTextActive,
            ]}
          >
            Am Abholtag
          </Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>Uhrzeit der ersten Erinnerung</Text>
      <Pressable style={styles.dateButton} onPress={() => setShowTimePicker(true)}>
        <Text style={styles.dateButtonText}>{settings.reminderTime} Uhr</Text>
      </Pressable>
      {showTimePicker && (
        <DateTimePicker
          value={timeAsDate}
          mode="time"
          is24Hour
          themeVariant="dark"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            setShowTimePicker(Platform.OS === 'ios');
            if (selected) {
              const hh = String(selected.getHours()).padStart(2, '0');
              const mm = String(selected.getMinutes()).padStart(2, '0');
              onChange({ ...settings, reminderTime: `${hh}:${mm}` });
            }
          }}
        />
      )}

      <Text style={styles.sectionTitle}>Falls du nicht reagierst</Text>
      <Text style={styles.fieldLabel}>Erinnerung wiederholen alle</Text>
      <Stepper
        value={settings.escalationIntervalMinutes}
        onChange={(v) => onChange({ ...settings, escalationIntervalMinutes: v })}
        min={1}
        max={60}
        suffix="Min."
      />

      <Text style={styles.fieldLabel}>Maximale Anzahl Wiederholungen</Text>
      <Stepper
        value={settings.escalationMaxRepeats}
        onChange={(v) => onChange({ ...settings, escalationMaxRepeats: v })}
        min={1}
        max={30}
        suffix="×"
      />

      <Text style={styles.hintText}>
        Die Erinnerungen erscheinen als dringende Mitteilung (durchbricht z.B. "Bitte nicht
        stören"), aber ohne Ton. In der Benachrichtigung kannst du direkt "Ist draußen"
        bestätigen oder um 5 Minuten verschieben.
      </Text>
    </ScrollView>
  );
}

// ---------- App ----------

export default function App() {
  const [tab, setTab] = useState('home');
  const [loading, setLoading] = useState(true);
  const [recurringSchedules, setRecurringSchedulesState] = useState([]);
  const [importedEvents, setImportedEventsState] = useState([]);
  const [confirmations, setConfirmationsState] = useState({});
  const [settings, setSettingsState] = useState(null);
  const [counts, setCountsState] = useState({});
  const [importing, setImporting] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    (async () => {
      const [rs, ie, conf, set, cnt] = await Promise.all([
        getRecurringSchedules(),
        getImportedEvents(),
        getConfirmations(),
        getSettings(),
        getCounts(),
      ]);
      setRecurringSchedulesState(rs);
      setImportedEventsState(ie);
      setConfirmationsState(conf);
      setSettingsState(set);
      setCountsState(cnt);
      setLoading(false);
      initialized.current = true;
      await setupNotifications();
    })();
  }, []);

  const typeFromId = (id) => id.split('__')[0];

  const handleConfirm = useCallback(async (pickupIdOrIds) => {
    const ids = Array.isArray(pickupIdOrIds) ? pickupIdOrIds : [pickupIdOrIds];
    setConfirmationsState((prev) => {
      const next = { ...prev };
      for (const id of ids) next[id] = true;
      setConfirmations(next);
      return next;
    });
    setCountsState((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const type = typeFromId(id);
        next[type] = (next[type] ?? 0) + 1;
      }
      setCounts(next);
      return next;
    });
    for (const id of ids) {
      await cancelRemindersForPickup(id);
    }
  }, []);

  const handleUnconfirm = useCallback(async (pickupId) => {
    setConfirmationsState((prev) => {
      const next = { ...prev };
      delete next[pickupId];
      setConfirmations(next);
      return next;
    });
    setCountsState((prev) => {
      const type = typeFromId(pickupId);
      const next = { ...prev, [type]: Math.max(0, (prev[type] ?? 0) - 1) };
      setCounts(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const sub = addNotificationResponseListener(
      (pickupIds) => handleConfirm(pickupIds),
      (pickupIds) => {
        // Snooze: kurz warten, dann greift die reguläre Eskalation erneut,
        // da wir hier nichts zusätzlich planen müssen — die Erinnerung
        // kommt gemäß Einstellungen ohnehin in Kürze wieder.
      }
    );
    return () => sub.remove();
  }, [handleConfirm]);

  const pickups = getUpcomingPickups({ recurringSchedules, importedEvents, daysAhead: 21 });

  const allTypes = Array.from(
    new Set([
      ...recurringSchedules.map((s) => s.type),
      ...importedEvents.map((e) => e.type),
      ...Object.keys(counts),
    ])
  );

  useEffect(() => {
    if (!initialized.current || !settings) return;
    rescheduleAllReminders(pickups, confirmations, settings);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringSchedules, importedEvents, confirmations, settings]);

  const handleAddSchedule = async (schedule) => {
    const next = [...recurringSchedules, schedule];
    setRecurringSchedulesState(next);
    await setRecurringSchedules(next);
  };

  const handleDeleteSchedule = async (id) => {
    const next = recurringSchedules.filter((s) => s.id !== id);
    setRecurringSchedulesState(next);
    await setRecurringSchedules(next);
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/calendar', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setImporting(true);
      const content = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const events = parseIcs(content);
      if (events.length === 0) {
        Alert.alert('Keine Termine gefunden', 'Die Datei enthielt keine gültigen Termine.');
        return;
      }
      const newEvents = events.map((e) => ({ type: e.summary || 'Abholung', date: e.date }));
      const merged = [...importedEvents];
      for (const ev of newEvents) {
        if (!merged.some((m) => m.type === ev.type && m.date === ev.date)) {
          merged.push(ev);
        }
      }
      setImportedEventsState(merged);
      await setImportedEvents(merged);
      Alert.alert('Import erfolgreich', `${newEvents.length} Termine wurden importiert.`);
    } catch (e) {
      Alert.alert('Fehler beim Import', e.message ?? 'Unbekannter Fehler');
    } finally {
      setImporting(false);
    }
  };

  const handleClearImported = () => {
    Alert.alert('Importierte Termine löschen?', '', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          setImportedEventsState([]);
          await setImportedEvents([]);
        },
      },
    ]);
  };

  const handleSettingsChange = async (next) => {
    setSettingsState(next);
    await setSettings(next);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Müllabfuhr</Text>

      {tab === 'home' && (
        <HomeTab
          pickups={pickups}
          confirmations={confirmations}
          onConfirm={handleConfirm}
          onUnconfirm={handleUnconfirm}
          counts={counts}
          types={allTypes}
          loading={loading}
        />
      )}
      {tab === 'schedules' && !loading && (
        <SchedulesTab
          recurringSchedules={recurringSchedules}
          importedEvents={importedEvents}
          onAddSchedule={handleAddSchedule}
          onDeleteSchedule={handleDeleteSchedule}
          onImport={handleImport}
          onClearImported={handleClearImported}
          importing={importing}
        />
      )}
      {tab === 'settings' && settings && (
        <SettingsTab settings={settings} onChange={handleSettingsChange} />
      )}

      <View style={styles.tabBar}>
        {[
          { key: 'home', label: '🗓️ Übersicht' },
          { key: 'schedules', label: '📋 Termine' },
          { key: 'settings', label: '⚙️ Einstellungen' },
        ].map((t) => (
          <Pressable key={t.key} style={styles.tabBarItem} onPress={() => setTab(t.key)}>
            <Text style={[styles.tabBarLabel, tab === t.key && styles.tabBarLabelActive]}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <StatusBar style="light" />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#14141f',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginTop: 60,
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 20,
  },
  countersBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  counterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#24243a',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  counterType: {
    color: '#ccc',
    fontSize: 12,
    fontWeight: '600',
  },
  counterValue: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  pickupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#24243a',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  pickupRowUrgent: {
    borderWidth: 1.5,
    borderColor: '#e8c547',
  },
  colorDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  pickupType: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  pickupDate: {
    color: '#999',
    fontSize: 13,
    marginTop: 2,
  },
  holidayWarning: {
    color: '#e8c547',
    fontSize: 12,
    marginTop: 4,
  },
  confirmButton: {
    backgroundColor: '#2ecc71',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 13,
  },
  confirmedBadge: {
    color: '#2ecc71',
    fontWeight: '700',
    fontSize: 13,
  },
  sectionTitle: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
    marginTop: 22,
    marginBottom: 10,
  },
  fieldLabel: {
    color: '#999',
    fontSize: 13,
    marginTop: 14,
    marginBottom: 8,
  },
  importButton: {
    backgroundColor: '#3a7bd5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  importButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  linkText: {
    color: '#e74c3c',
    fontSize: 13,
    textAlign: 'center',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    backgroundColor: '#24243a',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  chipActive: {
    backgroundColor: '#2ecc71',
  },
  chipText: {
    color: '#ccc',
    fontSize: 13,
    fontWeight: '600',
  },
  chipTextActive: {
    color: '#fff',
  },
  input: {
    backgroundColor: '#24243a',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 15,
    marginTop: 10,
  },
  dateButton: {
    backgroundColor: '#24243a',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  dateButtonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
  },
  addButton: {
    backgroundColor: '#2ecc71',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 18,
  },
  addButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#24243a',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    gap: 12,
  },
  removeText: {
    color: '#777',
    fontSize: 16,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  stepperButton: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#24243a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  stepperValue: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    minWidth: 70,
    textAlign: 'center',
  },
  hintText: {
    color: '#777',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
  },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#333',
    backgroundColor: '#1a1a28',
    paddingBottom: Platform.OS === 'ios' ? 54 : 10,
    paddingTop: 10,
  },
  tabBarItem: {
    flex: 1,
    alignItems: 'center',
  },
  tabBarLabel: {
    color: '#777',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBarLabelActive: {
    color: '#2ecc71',
  },
});
