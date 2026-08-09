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
  Modal,
  Linking,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import Constants from 'expo-constants';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import DateTimePicker from '@react-native-community/datetimepicker';

import { parseIcs } from './utils/ics';
import { searchBremenStreets, fetchBremenCalendar } from './utils/bremenApi';
import * as Location from 'expo-location';
import { REGIONS, getRegion, findNearestRegion } from './utils/regions';
import { exportBackup, importBackupFromUri } from './utils/backup';
import { LEXIKON } from './utils/lexikon';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { NextPickupWidget } from './widgets/NextPickupWidget';
import { getNextPickupItems } from './utils/widgetData';
import { getYearlyBreakdown, getCurrentYearCount } from './utils/yearlyCounts';
import { colorForType } from './utils/colors';
import {
  getUpcomingPickups,
  getPastPickups,
  formatRelativeDay,
  daysFromToday,
} from './utils/pickups';
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
  getHistory,
  setHistory,
  getAdjustments,
  setAdjustments,
  getSkipped,
  setSkipped,
  getYearlyTargets,
  setYearlyTargets,
  MAX_PHASES,
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
const ONE_TIME_TYPE_PRESETS = ['Sperrmüll', 'Weihnachtsbaum'];

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

function PickupRow({ pickup, confirmed, skipped, onConfirm, onUnconfirm, onSkip, onUnskip }) {
  const color = colorForType(pickup.type);
  const diff = daysFromToday(pickup.date);
  const urgent = diff <= 1 && !confirmed && !skipped;
  const canActYet = diff <= 1;
  const dateLabel =
    diff <= 1
      ? `${formatRelativeDay(pickup.date)} · ${formatDateKeyDisplay(pickup.date)}`
      : formatRelativeDay(pickup.date);

  return (
    <View style={[styles.pickupRow, urgent && styles.pickupRowUrgent]}>
      <View style={[styles.colorDot, { backgroundColor: color }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.pickupType}>{pickup.type}</Text>
        <Text style={styles.pickupDate}>{dateLabel}</Text>
        {pickup.holidayName && (
          <Text style={styles.holidayWarning}>
            ⚠️ {pickup.holidayName} — Termin evtl. verschoben, bitte prüfen
          </Text>
        )}
      </View>
      <View style={styles.pickupActions}>
        {confirmed ? (
          <Pressable onPress={() => onUnconfirm(pickup.id)} hitSlop={8}>
            <Text style={styles.confirmedBadge}>✓ Draußen</Text>
          </Pressable>
        ) : skipped ? (
          <Pressable onPress={() => onUnskip(pickup.id)} hitSlop={8}>
            <Text style={styles.skippedBadge}>⏭ Übersprungen</Text>
          </Pressable>
        ) : canActYet ? (
          <>
            <Pressable style={styles.confirmButton} onPress={() => onConfirm(pickup.id)}>
              <Text style={styles.confirmButtonText}>Draußen</Text>
            </Pressable>
            <Pressable style={styles.skipButton} onPress={() => onSkip(pickup.id)}>
              <Text style={styles.skipButtonText}>Diesmal nicht</Text>
            </Pressable>
          </>
        ) : null}
      </View>
    </View>
  );
}

function CountersBar({ history, adjustments, yearlyTargets, types, onSelect }) {
  if (types.length === 0) return null;
  return (
    <View style={styles.countersBar}>
      {types.map((type) => {
        const current = getCurrentYearCount(history[type] ?? [], adjustments[type] ?? {});
        const target = yearlyTargets[type];
        return (
          <Pressable key={type} style={styles.counterChip} onPress={() => onSelect(type)}>
            <View style={[styles.colorDot, { backgroundColor: colorForType(type) }]} />
            <Text style={styles.counterType}>{type}</Text>
            <Text style={styles.counterValue}>
              {current}
              {target ? ` / ${target}` : ''}×
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function CounterDetailModal({
  type,
  count,
  history,
  adjustments,
  target,
  onAdjust,
  onSetTarget,
  onClose,
}) {
  const visible = !!type;
  const breakdown = getYearlyBreakdown(history ?? [], adjustments ?? {});

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <View style={styles.modalHeader}>
            <View style={[styles.colorDot, { backgroundColor: type ? colorForType(type) : '#666' }]} />
            <Text style={styles.modalTitle}>{type}</Text>
          </View>

          <View style={styles.modalCounterRow}>
            <Pressable style={styles.stepperButton} onPress={() => onAdjust(type, -1)}>
              <Text style={styles.stepperButtonText}>−</Text>
            </Pressable>
            <Text style={styles.modalCounterValue}>{count}×</Text>
            <Pressable style={styles.stepperButton} onPress={() => onAdjust(type, 1)}>
              <Text style={styles.stepperButtonText}>+</Text>
            </Pressable>
          </View>
          <Text style={styles.modalHint}>Zähler manuell anpassen (gesamt)</Text>

          <View style={styles.modalTargetRow}>
            <Text style={styles.modalTargetLabel}>Ziel pro Jahr</Text>
            <View style={styles.modalCounterRow}>
              <Pressable
                style={styles.stepperButtonSmall}
                onPress={() => onSetTarget(type, Math.max(0, (target ?? 0) - 1))}
              >
                <Text style={styles.stepperButtonText}>−</Text>
              </Pressable>
              <Text style={styles.modalTargetValue}>{target ? target : '–'}</Text>
              <Pressable
                style={styles.stepperButtonSmall}
                onPress={() => onSetTarget(type, (target ?? 0) + 1)}
              >
                <Text style={styles.stepperButtonText}>+</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView style={styles.modalHistoryList}>
            {breakdown.length === 0 ? (
              <Text style={styles.modalEmptyText}>Noch keine Bestätigungen erfasst.</Text>
            ) : (
              breakdown.map(({ year, total, historyDates, adjustments: yearAdj }) => (
                <View key={year} style={{ marginBottom: 14 }}>
                  <View style={styles.modalYearHeader}>
                    <Text style={styles.modalYearTitle}>{year}</Text>
                    <Text style={styles.modalYearTotal}>
                      {total}
                      {target ? ` / ${target}` : ''}×
                    </Text>
                  </View>
                  {historyDates.map((dateKey) => (
                    <Text key={dateKey} style={styles.modalHistoryItem}>
                      {formatDateKeyDisplay(dateKey)} — ✓ bestätigt
                    </Text>
                  ))}
                  {yearAdj.map(([dateKey, net]) => (
                    <Text key={dateKey} style={styles.modalHistoryItem}>
                      {formatDateKeyDisplay(dateKey)} — {net > 0 ? `+${net}` : net} (manuell)
                    </Text>
                  ))}
                </View>
              ))
            )}
          </ScrollView>

          <Pressable style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseButtonText}>Schließen</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function buildArchiveList(history) {
  const items = [];
  for (const [type, dates] of Object.entries(history)) {
    for (const date of dates) {
      items.push({ id: `${type}__${date}`, type, date });
    }
  }
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items;
}

function ArchiveRow({ item, status, onRequestConfirm, onRequestUndo }) {
  return (
    <View style={styles.archiveRow}>
      <View style={[styles.colorDot, { backgroundColor: colorForType(item.type) }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.archiveType}>{item.type}</Text>
        <Text style={styles.archiveDate}>
          {formatDateKeyDisplay(item.date)}
          {status === 'open' ? ' — nicht bestätigt' : status === 'skipped' ? ' — übersprungen' : ''}
        </Text>
      </View>
      {status === 'confirmed' ? (
        <Pressable onPress={() => onRequestUndo(item)} hitSlop={8}>
          <Text style={styles.archiveUndo}>Rückgängig</Text>
        </Pressable>
      ) : (
        <Pressable onPress={() => onRequestConfirm(item)} hitSlop={8}>
          <Text style={styles.archiveConfirm}>Bestätigen</Text>
        </Pressable>
      )}
    </View>
  );
}

function ArchiveSection({ pastPickups, history, confirmations, skipped, onConfirm, onUndo }) {
  const [expanded, setExpanded] = useState(false);

  const merged = new Map();
  for (const p of pastPickups) merged.set(p.id, p);
  for (const h of buildArchiveList(history)) merged.set(h.id, h);
  const items = Array.from(merged.values()).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : 0
  );

  if (items.length === 0) return null;

  const requestConfirm = (item) => {
    Alert.alert(
      'Nachträglich bestätigen?',
      `"${item.type}" vom ${formatDateKeyDisplay(item.date)} wird als "draußen" bestätigt und der Zähler entsprechend erhöht.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Bestätigen', onPress: () => onConfirm(item.id) },
      ]
    );
  };

  const requestUndo = (item) => {
    Alert.alert(
      'Eintrag zurücknehmen?',
      `"${item.type}" vom ${formatDateKeyDisplay(item.date)} wird wieder als nicht bestätigt markiert und der Zähler entsprechend angepasst.`,
      [
        { text: 'Abbrechen', style: 'cancel' },
        { text: 'Zurücknehmen', style: 'destructive', onPress: () => onUndo(item.id) },
      ]
    );
  };

  return (
    <View style={styles.archiveSection}>
      <Pressable style={styles.archiveHeader} onPress={() => setExpanded((e) => !e)}>
        <Text style={styles.archiveTitle}>🗄️ Archiv ({items.length})</Text>
        <Text style={styles.archiveToggle}>{expanded ? '▲' : '▼'}</Text>
      </Pressable>
      {expanded &&
        items.map((item) => {
          const status = confirmations[item.id]
            ? 'confirmed'
            : skipped[item.id]
              ? 'skipped'
              : 'open';
          return (
            <ArchiveRow
              key={item.id}
              item={item}
              status={status}
              onRequestConfirm={requestConfirm}
              onRequestUndo={requestUndo}
            />
          );
        })}
    </View>
  );
}

function HomeTab({
  pickups,
  confirmations,
  onConfirm,
  onUnconfirm,
  skipped,
  onSkip,
  onUnskip,
  counts,
  types,
  onSelectCounter,
  history,
  adjustments,
  yearlyTargets,
  pastPickups,
  loading,
}) {
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
      ListHeaderComponent={
        <CountersBar
          history={history}
          adjustments={adjustments}
          yearlyTargets={yearlyTargets}
          types={types}
          onSelect={onSelectCounter}
        />
      }
      renderItem={({ item }) => (
        <PickupRow
          pickup={item}
          confirmed={!!confirmations[item.id]}
          skipped={!!skipped[item.id]}
          onConfirm={onConfirm}
          onUnconfirm={onUnconfirm}
          onSkip={onSkip}
          onUnskip={onUnskip}
        />
      )}
      ListEmptyComponent={
        <Text style={styles.emptyText}>
          Noch keine Termine. Leg unter "Termine" welche an oder importiere eine ICS-Datei.
        </Text>
      }
      ListFooterComponent={
        <ArchiveSection
          pastPickups={pastPickups}
          history={history}
          confirmations={confirmations}
          skipped={skipped}
          onConfirm={onConfirm}
          onUndo={onUnconfirm}
        />
      }
    />
  );
}

// ---------- Termine verwalten ----------

function RegionPickerModal({ visible, selectedId, onSelect, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
          <Text style={styles.modalTitle}>Stadt wählen</Text>
          <ScrollView style={{ maxHeight: 360, marginTop: 12 }}>
            {REGIONS.map((r) => (
              <Pressable
                key={r.id}
                style={styles.suggestionRow}
                onPress={() => {
                  onSelect(r.id);
                  onClose();
                }}
              >
                <Text style={styles.suggestionText}>
                  {r.name} {r.id === selectedId ? '✓' : ''}
                  {!r.supported ? ' (nur Link)' : ''}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable style={styles.modalCloseButton} onPress={onClose}>
            <Text style={styles.modalCloseButtonText}>Schließen</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function BremenAutoImport({ onBremenImport }) {
  const [regionId, setRegionId] = useState('bremen');
  const [showRegionPicker, setShowRegionPicker] = useState(false);
  const [locating, setLocating] = useState(false);
  const region = getRegion(regionId);

  const [street, setStreet] = useState('');
  const [houseNo, setHouseNo] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const handleUseLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Kein Zugriff', 'Standort-Berechtigung wurde nicht erteilt.');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({});
      const { region: nearest, distanceKm } = findNearestRegion(
        pos.coords.latitude,
        pos.coords.longitude
      );
      setRegionId(nearest.id);
      Alert.alert(
        'Stadt erkannt',
        `${nearest.name} (ca. ${distanceKm} km entfernt) wurde ausgewählt.`
      );
    } catch (e) {
      Alert.alert('Fehler', e.message ?? 'Standort konnte nicht ermittelt werden.');
    } finally {
      setLocating(false);
    }
  };

  const onChangeStreet = (text) => {
    setStreet(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (text.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await searchBremenStreets(text);
        setSuggestions(results);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  };

  const handleLoad = async () => {
    if (!street.trim() || !houseNo.trim()) {
      Alert.alert('Angaben fehlen', 'Bitte Straße und Hausnummer eingeben.');
      return;
    }
    setLoading(true);
    try {
      const addedCount = await onBremenImport(street.trim(), houseNo.trim());
      Alert.alert('Termine geladen', `${addedCount} Termine wurden übernommen.`);
      setSuggestions([]);
    } catch (e) {
      Alert.alert('Fehler', e.message ?? 'Termine konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View>
      <Text style={styles.sectionTitle}>Automatisch laden</Text>

      <Text style={styles.fieldLabel}>Stadt</Text>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Pressable
          style={[styles.dateButton, { flex: 1 }]}
          onPress={() => setShowRegionPicker(true)}
        >
          <Text style={styles.dateButtonText}>{region.name} ▾</Text>
        </Pressable>
        <Pressable style={styles.locateButton} onPress={handleUseLocation} disabled={locating}>
          {locating ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.locateButtonText}>📍</Text>
          )}
        </Pressable>
      </View>
      <RegionPickerModal
        visible={showRegionPicker}
        selectedId={regionId}
        onSelect={setRegionId}
        onClose={() => setShowRegionPicker(false)}
      />

      {region.supported ? (
        <>
          <Text style={[styles.hintText, { marginTop: 10 }]}>
            Zieht Restmüll, Biomüll, Papier, Gelber Sack und Weihnachtsbaum-Termine direkt
            von der Bremer Stadtreinigung, inkl. feiertagsbedingter Verschiebungen.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="Straße"
            placeholderTextColor="#888"
            value={street}
            onChangeText={onChangeStreet}
          />
          {suggestions.length > 0 && (
            <View style={styles.suggestionBox}>
              {suggestions.map((s) => (
                <Pressable
                  key={s.id}
                  style={styles.suggestionRow}
                  onPress={() => {
                    setStreet(s.name);
                    setSuggestions([]);
                  }}
                >
                  <Text style={styles.suggestionText}>
                    {s.name} {s.plz ? `(${s.plz})` : ''}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          {searching && <ActivityIndicator color="#8ab4f8" style={{ marginTop: 4 }} />}

          <TextInput
            style={[styles.input, { marginTop: 8 }]}
            placeholder="Hausnummer"
            placeholderTextColor="#888"
            value={houseNo}
            onChangeText={setHouseNo}
            keyboardType="numbers-and-punctuation"
          />

          <Pressable style={styles.importButton} onPress={handleLoad} disabled={loading}>
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.importButtonText}>📍 Termine automatisch laden</Text>
            )}
          </Pressable>
        </>
      ) : (
        <View style={{ marginTop: 10 }}>
          <Text style={styles.hintText}>
            Für {region.name} gibt's noch keine automatische Anbindung. Öffne die offizielle
            Kalenderseite, um dir dort ggf. eine ICS-Datei zu besorgen und weiter unten zu
            importieren.
          </Text>
          <Pressable
            style={styles.importButton}
            onPress={() => region.url && Linking.openURL(region.url)}
          >
            <Text style={styles.importButtonText}>🔗 Kalenderseite von {region.name} öffnen</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

function SchedulesTab({
  recurringSchedules,
  importedEvents,
  onAddSchedule,
  onDeleteSchedule,
  onImport,
  onClearImported,
  onDeleteImportedEvent,
  importing,
  onBremenImport,
  onAddOneTime,
}) {
  const [mode, setMode] = useState('recurring'); // 'recurring' | 'once'
  const [showImportedList, setShowImportedList] = useState(false);
  const [type, setType] = useState(TYPE_PRESETS[0]);
  const [customType, setCustomType] = useState('');
  const [intervalWeeks, setIntervalWeeks] = useState(2);
  const [startDate, setStartDate] = useState(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const presets = mode === 'recurring' ? TYPE_PRESETS : ONE_TIME_TYPE_PRESETS;
  const finalType = customType.trim() || type;

  const handleAdd = () => {
    if (mode === 'recurring') {
      onAddSchedule({
        id: `${finalType}-${Date.now()}`,
        type: finalType,
        intervalWeeks,
        startDate: dateKeyFromDate(startDate),
      });
    } else {
      onAddOneTime({ type: finalType, date: dateKeyFromDate(startDate) });
    }
    setCustomType('');
  };

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <BremenAutoImport onBremenImport={onBremenImport} />

      <Text style={styles.sectionTitle}>ICS-Kalender importieren</Text>
      <Pressable style={styles.importButton} onPress={onImport} disabled={importing}>
        {importing ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.importButtonText}>📄 ICS-Datei auswählen</Text>
        )}
      </Pressable>
      {importedEvents.length > 0 && (
        <>
          <Pressable
            style={styles.archiveHeader}
            onPress={() => setShowImportedList((v) => !v)}
          >
            <Text style={styles.archiveTitle}>
              📋 {importedEvents.length} importierte Termine
            </Text>
            <Text style={styles.archiveToggle}>{showImportedList ? '▲' : '▼'}</Text>
          </Pressable>
          {showImportedList &&
            [...importedEvents]
              .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
              .map((e) => (
                <View key={`${e.type}__${e.date}`} style={styles.scheduleRow}>
                  <View style={[styles.colorDot, { backgroundColor: colorForType(e.type) }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickupType}>{e.type}</Text>
                    <Text style={styles.pickupDate}>{formatDateKeyDisplay(e.date)}</Text>
                  </View>
                  <Pressable
                    onPress={() => onDeleteImportedEvent(e.type, e.date)}
                    hitSlop={10}
                  >
                    <Text style={styles.removeText}>✕</Text>
                  </Pressable>
                </View>
              ))}
          <Pressable onPress={onClearImported} style={{ marginTop: 8 }}>
            <Text style={styles.linkText}>Alle importierten Termine löschen</Text>
          </Pressable>
        </>
      )}

      <Text style={styles.sectionTitle}>Neuer Termin</Text>

      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, mode === 'recurring' && styles.chipActive]}
          onPress={() => {
            setMode('recurring');
            setType(TYPE_PRESETS[0]);
            setCustomType('');
          }}
        >
          <Text style={[styles.chipText, mode === 'recurring' && styles.chipTextActive]}>
            Wiederkehrend
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, mode === 'once' && styles.chipActive]}
          onPress={() => {
            setMode('once');
            setType(ONE_TIME_TYPE_PRESETS[0]);
            setCustomType('');
          }}
        >
          <Text style={[styles.chipText, mode === 'once' && styles.chipTextActive]}>
            Einmalig (z.B. Sperrmüll)
          </Text>
        </Pressable>
      </View>

      <View style={[styles.chipRow, { marginTop: 10 }]}>
        {presets.map((t) => (
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

      {mode === 'recurring' && (
        <>
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
        </>
      )}

      <Text style={styles.fieldLabel}>
        {mode === 'recurring' ? 'Erster Abholtermin' : 'Abholdatum'}
      </Text>
      <Pressable style={styles.dateButton} onPress={() => setShowPicker(true)}>
        <Text style={styles.dateButtonText}>{dateKeyFromDate(startDate)}</Text>
      </Pressable>
      {showPicker && (
        <>
          <DateTimePicker
            value={startDate}
            mode="date"
            themeVariant="dark"
            display={Platform.OS === 'ios' ? 'inline' : 'default'}
            onChange={(event, selected) => {
              if (Platform.OS !== 'ios') setShowPicker(false);
              if (selected) setStartDate(selected);
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable style={styles.pickerDoneButton} onPress={() => setShowPicker(false)}>
              <Text style={styles.pickerDoneButtonText}>Fertig</Text>
            </Pressable>
          )}
        </>
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

function PhaseRow({
  phase,
  index,
  showPicker,
  onShowPicker,
  onHidePicker,
  onChangeTime,
  onChangeInterval,
  onChangeDayMode,
  onRemove,
  canRemove,
}) {
  const [h, m] = phase.time.split(':').map(Number);
  const timeAsDate = new Date();
  timeAsDate.setHours(h, m, 0, 0);

  return (
    <View style={styles.phaseCard}>
      <View style={styles.phaseHeader}>
        <Text style={styles.phaseLabel}>Zeitraum {index + 1}</Text>
        {canRemove && (
          <Pressable onPress={onRemove} hitSlop={10}>
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        )}
      </View>

      <Text style={styles.fieldLabel}>Bezieht sich auf</Text>
      <View style={styles.chipRow}>
        <Pressable
          style={[styles.chip, phase.dayMode === 'evening' && styles.chipActive]}
          onPress={() => onChangeDayMode('evening')}
        >
          <Text style={[styles.chipText, phase.dayMode === 'evening' && styles.chipTextActive]}>
            Vorabend
          </Text>
        </Pressable>
        <Pressable
          style={[styles.chip, phase.dayMode === 'pickupDay' && styles.chipActive]}
          onPress={() => onChangeDayMode('pickupDay')}
        >
          <Text style={[styles.chipText, phase.dayMode === 'pickupDay' && styles.chipTextActive]}>
            Abholtag
          </Text>
        </Pressable>
      </View>

      <Text style={styles.fieldLabel}>Ab Uhrzeit</Text>
      <Pressable style={styles.dateButton} onPress={onShowPicker}>
        <Text style={styles.dateButtonText}>{phase.time} Uhr</Text>
      </Pressable>
      {showPicker && (
        <>
        <DateTimePicker
          value={timeAsDate}
          mode="time"
          is24Hour
          themeVariant="dark"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(event, selected) => {
            if (Platform.OS !== 'ios') onHidePicker();
            if (selected) {
              const hh = String(selected.getHours()).padStart(2, '0');
              const mm = String(selected.getMinutes()).padStart(2, '0');
              onChangeTime(`${hh}:${mm}`);
            }
          }}
        />
        {Platform.OS === 'ios' && (
          <Pressable style={styles.pickerDoneButton} onPress={onHidePicker}>
            <Text style={styles.pickerDoneButtonText}>Fertig</Text>
          </Pressable>
        )}
        </>
      )}

      <Text style={styles.fieldLabel}>Intervall (Wiederholung alle)</Text>
      <Stepper value={phase.intervalMinutes} onChange={onChangeInterval} min={1} max={180} suffix="Min." />
    </View>
  );
}

function LexikonTab() {
  const [query, setQuery] = useState('');
  const filtered = query.trim()
    ? LEXIKON.filter((e) => e.item.toLowerCase().includes(query.trim().toLowerCase()))
    : LEXIKON;

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: 16 }}>
        <TextInput
          style={styles.input}
          placeholder="Suchen (z.B. Batterien, Pizzakarton...)"
          placeholderTextColor="#888"
          value={query}
          onChangeText={setQuery}
        />
      </View>
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.item}
        contentContainerStyle={styles.tabContent}
        renderItem={({ item }) => (
          <View style={styles.lexikonRow}>
            <View style={[styles.colorDot, { backgroundColor: colorForType(item.bin) }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.pickupType}>{item.item}</Text>
              <Text style={styles.lexikonBin}>{item.bin}</Text>
              {item.hint && <Text style={styles.lexikonHint}>{item.hint}</Text>}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.emptyText}>Nichts gefunden. Im Zweifel: örtlicher Entsorger fragen.</Text>
        }
      />
    </View>
  );
}

function SettingsTab({ settings, onChange, onExportBackup, onImportBackup, backupBusy }) {
  const [showPickerForId, setShowPickerForId] = useState(null);

  const sortedPhases = [...settings.phases].sort((a, b) => (a.time < b.time ? -1 : 1));

  const updatePhase = (id, patch) => {
    const phases = settings.phases.map((p) => (p.id === id ? { ...p, ...patch } : p));
    onChange({ ...settings, phases });
  };

  const removePhase = (id) => {
    onChange({ ...settings, phases: settings.phases.filter((p) => p.id !== id) });
  };

  const addPhase = () => {
    if (settings.phases.length >= MAX_PHASES) return;
    const last = sortedPhases[sortedPhases.length - 1];
    let newTime = '20:00';
    if (last) {
      const [h, m] = last.time.split(':').map(Number);
      const d = new Date();
      d.setHours(h + 1, m, 0, 0);
      newTime = `${String(d.getHours() % 24).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    }
    const id = `p${Date.now()}`;
    onChange({
      ...settings,
      phases: [...settings.phases, { id, time: newTime, intervalMinutes: 15, dayMode: 'evening' }],
    });
  };

  const [showStopPicker, setShowStopPicker] = useState(false);
  const [stopH, stopM] = settings.stopTime.split(':').map(Number);
  const stopTimeAsDate = new Date();
  stopTimeAsDate.setHours(stopH, stopM, 0, 0);

  return (
    <ScrollView contentContainerStyle={styles.tabContent}>
      <Text style={styles.sectionTitle}>Erinnerungs-Zeiträume</Text>
      <Text style={styles.hintText}>
        Jeder Zeitraum erinnert ab seiner Startzeit im gewählten Intervall, bis der
        nächste Zeitraum beginnt (oder bis zur Stopp-Zeit unten beim letzten). Ist ein
        Zeitraum vorbei, sendet nur noch der aktuelle Zeitraum Erinnerungen. "Vorabend"
        bezieht die Uhrzeit auf den Tag vor der Abholung, "Abholtag" auf den Abholtag
        selbst.
      </Text>

      {sortedPhases.map((phase, index) => (
        <PhaseRow
          key={phase.id}
          phase={phase}
          index={index}
          showPicker={showPickerForId === phase.id}
          onShowPicker={() => setShowPickerForId(phase.id)}
          onHidePicker={() => setShowPickerForId(null)}
          onChangeTime={(time) => updatePhase(phase.id, { time })}
          onChangeInterval={(v) => updatePhase(phase.id, { intervalMinutes: v })}
          onChangeDayMode={(dayMode) => updatePhase(phase.id, { dayMode })}
          onRemove={() => removePhase(phase.id)}
          canRemove={settings.phases.length > 1}
        />
      ))}

      {settings.phases.length < MAX_PHASES && (
        <Pressable style={styles.addButton} onPress={addPhase}>
          <Text style={styles.addButtonText}>+ Zeitraum hinzufügen</Text>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Wann soll spätestens Schluss sein?</Text>
      <Text style={styles.hintText}>
        Ab dieser Uhrzeit am Abholtag werden keine weiteren Erinnerungen mehr
        geschickt, auch wenn du noch nicht bestätigt hast.
      </Text>
      <Pressable style={styles.dateButton} onPress={() => setShowStopPicker(true)}>
        <Text style={styles.dateButtonText}>{settings.stopTime} Uhr</Text>
      </Pressable>
      {showStopPicker && (
        <>
          <DateTimePicker
            value={stopTimeAsDate}
            mode="time"
            is24Hour
            themeVariant="dark"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={(event, selected) => {
              if (Platform.OS !== 'ios') setShowStopPicker(false);
              if (selected) {
                const hh = String(selected.getHours()).padStart(2, '0');
                const mm = String(selected.getMinutes()).padStart(2, '0');
                onChange({ ...settings, stopTime: `${hh}:${mm}` });
              }
            }}
          />
          {Platform.OS === 'ios' && (
            <Pressable style={styles.pickerDoneButton} onPress={() => setShowStopPicker(false)}>
              <Text style={styles.pickerDoneButtonText}>Fertig</Text>
            </Pressable>
          )}
        </>
      )}

      <Text style={styles.hintText}>
        Die Erinnerungen erscheinen als dringende Mitteilung (durchbricht z.B. "Bitte nicht
        stören"), aber ohne Ton. In der Benachrichtigung kannst du direkt "Ist draußen"
        bestätigen oder um 5 Minuten verschieben.
      </Text>

      <Text style={styles.sectionTitle}>Backup & Wiederherstellung</Text>
      <Text style={styles.hintText}>
        Alle Daten liegen nur auf diesem Gerät. Ein Backup schützt dich vor Datenverlust
        bei App-Löschung oder Handywechsel.
      </Text>
      <Pressable style={styles.importButton} onPress={onExportBackup} disabled={backupBusy}>
        {backupBusy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.importButtonText}>⬆️ Backup exportieren</Text>
        )}
      </Pressable>
      <Pressable
        style={[styles.importButton, { marginTop: 8, backgroundColor: '#555' }]}
        onPress={onImportBackup}
        disabled={backupBusy}
      >
        <Text style={styles.importButtonText}>⬇️ Backup importieren</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Rechtliches</Text>
      <Pressable
        style={styles.legalRow}
        onPress={() => Linking.openURL('https://julius848803.github.io/muellabfuhr-app/datenschutz.html')}
      >
        <Text style={styles.legalRowText}>Datenschutzerklärung</Text>
        <Text style={styles.legalRowArrow}>›</Text>
      </Pressable>
      <Pressable
        style={styles.legalRow}
        onPress={() => Linking.openURL('https://julius848803.github.io/muellabfuhr-app/impressum.html')}
      >
        <Text style={styles.legalRowText}>Impressum</Text>
        <Text style={styles.legalRowArrow}>›</Text>
      </Pressable>

      <Text style={styles.sectionTitle}>Feedback</Text>
      <Pressable style={styles.legalRow} onPress={handleSendFeedback}>
        <Text style={styles.legalRowText}>Feedback geben / Fehler melden</Text>
        <Text style={styles.legalRowArrow}>›</Text>
      </Pressable>
    </ScrollView>
  );
}

function handleSendFeedback() {
  const appVersion = Constants.expoConfig?.version ?? 'unbekannt';
  const platformInfo = `${Platform.OS} ${Platform.Version}`;
  const subject = encodeURIComponent('Feedback Müllabfuhr App');
  const body = encodeURIComponent(
    `Hier dein Feedback / die Fehlerbeschreibung:\n\n\n\n---\nApp-Version: ${appVersion}\nGerät: ${platformInfo}`
  );
  Linking.openURL(`mailto:google@julian-blume.de?subject=${subject}&body=${body}`);
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
  const [history, setHistoryState] = useState({});
  const [adjustments, setAdjustmentsState] = useState({});
  const [yearlyTargets, setYearlyTargetsState] = useState({});
  const [skipped, setSkippedState] = useState({});
  const [selectedCounterType, setSelectedCounterType] = useState(null);
  const [importing, setImporting] = useState(false);
  const [backupBusy, setBackupBusy] = useState(false);
  const initialized = useRef(false);

  useEffect(() => {
    (async () => {
      const [rs, ie, conf, set, cnt, hist, adj, skip, targets] = await Promise.all([
        getRecurringSchedules(),
        getImportedEvents(),
        getConfirmations(),
        getSettings(),
        getCounts(),
        getHistory(),
        getAdjustments(),
        getSkipped(),
        getYearlyTargets(),
      ]);
      setRecurringSchedulesState(rs);
      setImportedEventsState(ie);
      setConfirmationsState(conf);
      setSettingsState(set);
      setCountsState(cnt);
      setHistoryState(hist);
      setAdjustmentsState(adj);
      setSkippedState(skip);
      setYearlyTargetsState(targets);
      setLoading(false);
      initialized.current = true;
      await setupNotifications();
    })();
  }, []);

  const typeFromId = (id) => id.split('__')[0];
  const dateFromId = (id) => id.split('__')[1];

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
    setHistoryState((prev) => {
      const next = { ...prev };
      for (const id of ids) {
        const type = typeFromId(id);
        const date = dateFromId(id);
        const list = next[type] ? [...next[type]] : [];
        if (!list.includes(date)) list.push(date);
        next[type] = list;
      }
      setHistory(next);
      return next;
    });
    setSkippedState((prev) => {
      const next = { ...prev };
      for (const id of ids) delete next[id];
      setSkipped(next);
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
    setHistoryState((prev) => {
      const type = typeFromId(pickupId);
      const date = dateFromId(pickupId);
      const next = { ...prev, [type]: (prev[type] ?? []).filter((d) => d !== date) };
      setHistory(next);
      return next;
    });
  }, []);

  const handleAdjustCounter = useCallback(
    (type, delta) => {
      // Zähler darf nie unter 0 fallen — geloggt wird nur die tatsächlich
      // angewendete Änderung, damit der Verlauf nicht von der Anzeige abweicht.
      const oldValue = counts[type] ?? 0;
      const newValue = Math.max(0, oldValue + delta);
      const effectiveDelta = newValue - oldValue;

      const nextCounts = { ...counts, [type]: newValue };
      setCountsState(nextCounts);
      setCounts(nextCounts);

      if (effectiveDelta !== 0) {
        const todayKey = dateKeyFromDate(new Date());
        const forType = { ...(adjustments[type] ?? {}) };
        const net = (forType[todayKey] ?? 0) + effectiveDelta;
        if (net === 0) {
          delete forType[todayKey];
        } else {
          forType[todayKey] = net;
        }
        const nextAdjustments = { ...adjustments, [type]: forType };
        setAdjustmentsState(nextAdjustments);
        setAdjustments(nextAdjustments);
      }
    },
    [counts, adjustments]
  );

  const handleSetYearlyTarget = useCallback(
    (type, value) => {
      const next = { ...yearlyTargets, [type]: value };
      setYearlyTargetsState(next);
      setYearlyTargets(next);
    },
    [yearlyTargets]
  );

  const handleSkip = useCallback(async (pickupId) => {
    setSkippedState((prev) => {
      const next = { ...prev, [pickupId]: true };
      setSkipped(next);
      return next;
    });
    await cancelRemindersForPickup(pickupId);
  }, []);

  const handleUnskip = useCallback((pickupId) => {
    setSkippedState((prev) => {
      const next = { ...prev };
      delete next[pickupId];
      setSkipped(next);
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
  const pastPickups = getPastPickups({ recurringSchedules, importedEvents, daysBack: 30 });

  const allTypes = Array.from(
    new Set([
      ...recurringSchedules.map((s) => s.type),
      ...importedEvents.map((e) => e.type),
      ...Object.keys(counts),
    ])
  );

  useEffect(() => {
    if (!initialized.current || !settings) return;
    rescheduleAllReminders(pickups, confirmations, settings, skipped);
    requestWidgetUpdate({
      widgetName: 'NextPickupWidget',
      renderWidget: async () => <NextPickupWidget items={await getNextPickupItems()} />,
    }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recurringSchedules, importedEvents, confirmations, skipped, settings]);

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

  const mergeImportedEvents = async (newEvents) => {
    const merged = [...importedEvents];
    let addedCount = 0;
    for (const ev of newEvents) {
      if (!merged.some((m) => m.type === ev.type && m.date === ev.date)) {
        merged.push({ type: ev.type, date: ev.date });
        addedCount++;
      }
    }
    setImportedEventsState(merged);
    await setImportedEvents(merged);
    return addedCount;
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
      const addedCount = await mergeImportedEvents(newEvents);
      Alert.alert('Import erfolgreich', `${addedCount} Termine wurden importiert.`);
    } catch (e) {
      Alert.alert('Fehler beim Import', e.message ?? 'Unbekannter Fehler');
    } finally {
      setImporting(false);
    }
  };

  const handleBremenImport = async (street, houseNo) => {
    const events = await fetchBremenCalendar(street, houseNo);
    if (events.length === 0) {
      throw new Error('Keine Termine für diese Adresse gefunden.');
    }
    const addedCount = await mergeImportedEvents(events);
    return addedCount;
  };

  const handleAddOneTime = async (event) => {
    await mergeImportedEvents([event]);
  };

  const handleDeleteImportedEvent = (type, date) => {
    const next = importedEvents.filter((e) => !(e.type === type && e.date === date));
    setImportedEventsState(next);
    setImportedEvents(next);
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

  const handleExportBackup = async () => {
    setBackupBusy(true);
    try {
      await exportBackup();
    } catch (e) {
      Alert.alert('Fehler beim Export', e.message ?? 'Unbekannter Fehler');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleImportBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setBackupBusy(true);
      await importBackupFromUri(result.assets[0].uri);
      Alert.alert(
        'Backup importiert',
        'Die Daten wurden wiederhergestellt. Bitte starte die App einmal neu, damit alles korrekt angezeigt wird.'
      );
    } catch (e) {
      Alert.alert('Fehler beim Import', e.message ?? 'Unbekannter Fehler');
    } finally {
      setBackupBusy(false);
    }
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
          skipped={skipped}
          onSkip={handleSkip}
          onUnskip={handleUnskip}
          counts={counts}
          types={allTypes}
          onSelectCounter={setSelectedCounterType}
          history={history}
          adjustments={adjustments}
          yearlyTargets={yearlyTargets}
          pastPickups={pastPickups}
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
          onDeleteImportedEvent={handleDeleteImportedEvent}
          importing={importing}
          onBremenImport={handleBremenImport}
          onAddOneTime={handleAddOneTime}
        />
      )}
      {tab === 'settings' && settings && (
        <SettingsTab
          settings={settings}
          onChange={handleSettingsChange}
          onExportBackup={handleExportBackup}
          onImportBackup={handleImportBackup}
          backupBusy={backupBusy}
        />
      )}
      {tab === 'lexikon' && <LexikonTab />}

      <View style={styles.tabBar}>
        {[
          { key: 'home', label: '🗓️ Übersicht' },
          { key: 'schedules', label: '📋 Termine' },
          { key: 'lexikon', label: '🔍 Lexikon' },
          { key: 'settings', label: '⚙️ Einstellungen' },
        ].map((t) => (
          <Pressable key={t.key} style={styles.tabBarItem} onPress={() => setTab(t.key)}>
            <Text
              style={[styles.tabBarLabel, tab === t.key && styles.tabBarLabelActive]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <CounterDetailModal
        type={selectedCounterType}
        count={selectedCounterType ? counts[selectedCounterType] ?? 0 : 0}
        history={selectedCounterType ? history[selectedCounterType] ?? [] : []}
        adjustments={selectedCounterType ? adjustments[selectedCounterType] ?? {} : {}}
        target={selectedCounterType ? yearlyTargets[selectedCounterType] : undefined}
        onAdjust={handleAdjustCounter}
        onSetTarget={handleSetYearlyTarget}
        onClose={() => setSelectedCounterType(null)}
      />

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
    paddingBottom: 110,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
    lineHeight: 20,
  },
  archiveSection: {
    marginTop: 24,
  },
  archiveHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e1e30',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  archiveTitle: {
    color: '#999',
    fontSize: 13,
    fontWeight: '700',
  },
  archiveToggle: {
    color: '#666',
    fontSize: 11,
  },
  archiveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#2a2a3d',
  },
  archiveType: {
    color: '#ccc',
    fontSize: 14,
    fontWeight: '600',
  },
  archiveDate: {
    color: '#777',
    fontSize: 12,
    marginTop: 2,
  },
  archiveUndo: {
    color: '#e74c3c',
    fontSize: 12,
    fontWeight: '600',
  },
  archiveConfirm: {
    color: '#2ecc71',
    fontSize: 12,
    fontWeight: '600',
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: '#24243a',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxWidth: 360,
    maxHeight: '70%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 16,
  },
  modalTitle: {
    color: '#fff',
    fontSize: 19,
    fontWeight: '700',
  },
  modalCounterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  modalTargetRow: {
    marginTop: 18,
    alignItems: 'center',
  },
  modalTargetLabel: {
    color: '#999',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 6,
  },
  stepperButtonSmall: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#1e1e30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTargetValue: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'center',
  },
  modalYearHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
    marginTop: 4,
  },
  modalYearTitle: {
    color: '#8ab4f8',
    fontSize: 15,
    fontWeight: '700',
  },
  modalYearTotal: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  modalCounterValue: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '700',
    minWidth: 60,
    textAlign: 'center',
  },
  modalHint: {
    color: '#777',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  modalSectionTitle: {
    color: '#999',
    fontSize: 13,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  modalEmptyText: {
    color: '#777',
    fontSize: 13,
  },
  modalHistoryList: {
    maxHeight: 180,
  },
  modalHistoryItem: {
    color: '#ccc',
    fontSize: 14,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a55',
  },
  modalCloseButton: {
    marginTop: 18,
    backgroundColor: '#2ecc71',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseButtonText: {
    color: '#fff',
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
  lexikonRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#24243a',
    borderRadius: 14,
    padding: 14,
    marginTop: 10,
    gap: 12,
  },
  lexikonBin: {
    color: '#8ab4f8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  lexikonHint: {
    color: '#999',
    fontSize: 12,
    marginTop: 4,
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
  pickupActions: {
    alignItems: 'flex-end',
    gap: 6,
  },
  skipButton: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  skipButtonText: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  skippedBadge: {
    color: '#888',
    fontWeight: '700',
    fontSize: 13,
  },
  pickerDoneButton: {
    alignSelf: 'flex-end',
    backgroundColor: '#2ecc71',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginTop: 6,
  },
  pickerDoneButtonText: {
    color: '#fff',
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
  locateButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#3a7bd5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  locateButtonText: {
    fontSize: 18,
  },
  suggestionBox: {
    backgroundColor: '#2a2a3d',
    borderRadius: 12,
    marginTop: 4,
    overflow: 'hidden',
  },
  suggestionRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a55',
  },
  suggestionText: {
    color: '#fff',
    fontSize: 14,
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
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#24243a',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginTop: 8,
  },
  legalRowText: {
    color: '#fff',
    fontSize: 15,
  },
  legalRowArrow: {
    color: '#666',
    fontSize: 18,
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
    marginTop: 12,
    marginBottom: 8,
  },
  phaseCard: {
    backgroundColor: '#24243a',
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  phaseHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  phaseLabel: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
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
    paddingHorizontal: 2,
  },
  tabBarLabel: {
    color: '#777',
    fontSize: 12,
    fontWeight: '600',
    maxWidth: '100%',
  },
  tabBarLabelActive: {
    color: '#2ecc71',
  },
});
