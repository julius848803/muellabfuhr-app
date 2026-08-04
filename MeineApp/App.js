import { useState } from 'react';
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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';

function weatherInfo(code) {
  if (code === 0) return { emoji: '☀️', text: 'Klarer Himmel' };
  if (code === 1) return { emoji: '🌤️', text: 'Meist klar' };
  if (code === 2) return { emoji: '⛅', text: 'Teilweise bewölkt' };
  if (code === 3) return { emoji: '☁️', text: 'Bedeckt' };
  if (code === 45 || code === 48) return { emoji: '🌫️', text: 'Nebel' };
  if ([51, 53, 55, 56, 57].includes(code)) return { emoji: '🌦️', text: 'Nieselregen' };
  if ([61, 63, 65, 66, 67].includes(code)) return { emoji: '🌧️', text: 'Regen' };
  if ([80, 81, 82].includes(code)) return { emoji: '🌧️', text: 'Regenschauer' };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { emoji: '❄️', text: 'Schnee' };
  if ([95, 96, 99].includes(code)) return { emoji: '⛈️', text: 'Gewitter' };
  return { emoji: '🌡️', text: '' };
}

function gradientFor(code, isNight) {
  if (isNight) return ['#0f1a3c', '#2a3a63'];
  if (code === 0 || code === 1) return ['#4a90d9', '#8fc6ec'];
  if (code === 2 || code === 3) return ['#6f8ba6', '#a9bcc9'];
  if ([45, 48].includes(code)) return ['#7c8a94', '#adb8bf'];
  if ([61, 63, 65, 66, 67, 80, 81, 82, 51, 53, 55, 56, 57].includes(code))
    return ['#4a5c72', '#7c93a8'];
  if ([71, 73, 75, 77, 85, 86].includes(code)) return ['#5b7a8a', '#8fa3b0'];
  if ([95, 96, 99].includes(code)) return ['#2c2f42', '#565b74'];
  return ['#4a90d9', '#8fc6ec'];
}

function isNightNow(sunrise, sunset) {
  if (!sunrise || !sunset) return false;
  const now = Date.now();
  return now < new Date(sunrise).getTime() || now > new Date(sunset).getTime();
}

function formatTime(isoString) {
  if (!isoString) return '–';
  return new Date(isoString).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

function formatHour(isoString) {
  return new Date(isoString).toLocaleTimeString('de-DE', { hour: '2-digit' }).replace(' ', '');
}

function formatWeekday(dateString, index) {
  if (index === 0) return 'Heute';
  return new Date(dateString).toLocaleDateString('de-DE', { weekday: 'short' });
}

async function geocodeCity(name) {
  const res = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      name
    )}&count=1&language=de&format=json`
  );
  const data = await res.json();
  if (!data.results || data.results.length === 0) {
    throw new Error('Ort nicht gefunden');
  }
  const r = data.results[0];
  return { name: r.name, country: r.country ?? '', lat: r.latitude, lon: r.longitude };
}

async function fetchOpenMeteo(lat, lon) {
  const res = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,precipitation,weather_code&hourly=temperature_2m,precipitation,weather_code&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,sunrise,sunset,weather_code&timezone=auto&forecast_days=7`
  );
  const data = await res.json();

  const nowMs = Date.now();
  const hourlyTimes = data.hourly.time;
  let startIdx = hourlyTimes.findIndex((t) => new Date(t).getTime() >= nowMs);
  if (startIdx === -1) startIdx = 0;

  const hourly = hourlyTimes.slice(startIdx, startIdx + 24).map((t, i) => ({
    time: t,
    temp: data.hourly.temperature_2m[startIdx + i],
    precipitation: data.hourly.precipitation[startIdx + i],
    code: data.hourly.weather_code[startIdx + i],
  }));

  const daily = data.daily.time.map((t, i) => ({
    date: t,
    max: data.daily.temperature_2m_max[i],
    min: data.daily.temperature_2m_min[i],
    precipitation: data.daily.precipitation_sum[i],
    sunrise: data.daily.sunrise[i],
    sunset: data.daily.sunset[i],
    code: data.daily.weather_code[i],
  }));

  return {
    current: {
      temp: data.current.temperature_2m,
      precipitation: data.current.precipitation,
      code: data.current.weather_code,
    },
    hourly,
    daily,
  };
}

async function fetchWttr(lat, lon) {
  const res = await fetch(`https://wttr.in/${lat},${lon}?format=j1`);
  const data = await res.json();
  const current = data.current_condition[0];
  return {
    temp: current.temp_C,
    precipitation: current.precipMM,
    desc: current.weatherDesc?.[0]?.value ?? '',
  };
}

function InfoTile({ label, value }) {
  return (
    <View style={styles.infoTile}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function CityDetail({ city, onBack }) {
  const om = city.openMeteo;
  const wt = city.wttr;
  const today = om?.daily?.[0];
  const night = today ? isNightNow(today.sunrise, today.sunset) : false;
  const info = om ? weatherInfo(om.current.code) : { emoji: '⏳', text: '' };
  const colors = om ? gradientFor(om.current.code, night) : ['#4a90d9', '#8fc6ec'];

  const dailyMax = today ? Math.round(today.max) : null;
  const dailyMin = today ? Math.round(today.min) : null;
  let maxAll = 1;
  if (om) {
    maxAll = Math.max(...om.daily.map((d) => d.max)) || 1;
  }
  const minAll = om ? Math.min(...om.daily.map((d) => d.min)) : 0;

  return (
    <LinearGradient colors={colors} style={styles.gradientContainer}>
      <ScrollView contentContainerStyle={styles.detailScroll} showsVerticalScrollIndicator={false}>
        <Pressable onPress={onBack} hitSlop={10} style={styles.backButtonWrap}>
          <Text style={styles.backButton}>‹ Städte</Text>
        </Pressable>

        <Text style={styles.detailCity}>{city.name}</Text>

        {om ? (
          <>
            <Text style={styles.hugeTemp}>{Math.round(om.current.temp)}°</Text>
            <Text style={styles.conditionText}>{info.emoji} {info.text}</Text>
            <Text style={styles.hiLoText}>
              H:{dailyMax}° L:{dailyMin}°
            </Text>
          </>
        ) : city.openMeteoError ? (
          <Text style={styles.conditionText}>Fehler beim Laden</Text>
        ) : (
          <ActivityIndicator color="#fff" style={{ marginVertical: 30 }} />
        )}

        {om && (
          <View style={styles.glassCard}>
            <Text style={styles.glassCardLabel}>STÜNDLICHE VORHERSAGE</Text>
            <FlatList
              horizontal
              data={om.hourly}
              keyExtractor={(item) => item.time}
              showsHorizontalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={{ width: 18 }} />}
              renderItem={({ item, index }) => {
                const h = weatherInfo(item.code);
                return (
                  <View style={styles.hourlyItem}>
                    <Text style={styles.hourlyTime}>{index === 0 ? 'Jetzt' : formatHour(item.time)}</Text>
                    <Text style={styles.hourlyEmoji}>{h.emoji}</Text>
                    <Text style={styles.hourlyTemp}>{Math.round(item.temp)}°</Text>
                  </View>
                );
              }}
            />
          </View>
        )}

        {om && (
          <View style={styles.glassCard}>
            <Text style={styles.glassCardLabel}>7-TAGE-VORHERSAGE</Text>
            {om.daily.map((d, index) => {
              const info2 = weatherInfo(d.code);
              const barLeft = ((d.min - minAll) / (maxAll - minAll || 1)) * 100;
              const barWidth = ((d.max - d.min) / (maxAll - minAll || 1)) * 100;
              return (
                <View key={d.date} style={styles.dailyRow}>
                  <Text style={styles.dailyDay}>{formatWeekday(d.date, index)}</Text>
                  <Text style={styles.dailyEmoji}>{info2.emoji}</Text>
                  <Text style={styles.dailyMin}>{Math.round(d.min)}°</Text>
                  <View style={styles.barTrack}>
                    <View
                      style={[
                        styles.barFill,
                        { left: `${barLeft}%`, width: `${Math.max(barWidth, 6)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.dailyMax}>{Math.round(d.max)}°</Text>
                </View>
              );
            })}
          </View>
        )}

        {om && today && (
          <View style={styles.tileGrid}>
            <InfoTile label="SONNENAUFGANG" value={formatTime(today.sunrise)} />
            <InfoTile label="SONNENUNTERGANG" value={formatTime(today.sunset)} />
            <InfoTile label="NIEDERSCHLAG" value={`${today.precipitation} mm`} />
            <InfoTile
              label="WTTR.IN VERGLEICH"
              value={wt ? `${Math.round(wt.temp)}°C` : city.wttrError ? 'Fehler' : '…'}
            />
          </View>
        )}
      </ScrollView>
      <StatusBar style="light" />
    </LinearGradient>
  );
}

function CityListItem({ city, onPress, onRemove }) {
  const om = city.openMeteo;
  const today = om?.daily?.[0];
  const night = today ? isNightNow(today.sunrise, today.sunset) : false;
  const info = om ? weatherInfo(om.current.code) : null;
  const colors = om ? gradientFor(om.current.code, night) : ['#3a3a55', '#3a3a55'];

  return (
    <Pressable onPress={onPress}>
      <LinearGradient colors={colors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.listCard}>
        <View style={styles.listCardTop}>
          <View>
            <Text style={styles.listCityName}>{city.name}</Text>
            <Text style={styles.listCondition}>{om ? info.text : 'Lädt…'}</Text>
          </View>
          <Pressable onPress={onRemove} hitSlop={12}>
            <Text style={styles.removeText}>✕</Text>
          </Pressable>
        </View>
        <View style={styles.listCardBottom}>
          <Text style={styles.listEmoji}>{om ? info.emoji : '⏳'}</Text>
          <Text style={styles.listTemp}>{om ? `${Math.round(om.current.temp)}°` : '–'}</Text>
        </View>
        {om && today && (
          <Text style={styles.listHiLo}>
            H:{Math.round(today.max)}° L:{Math.round(today.min)}°
          </Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export default function App() {
  const [cities, setCities] = useState([]);
  const [input, setInput] = useState('');
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');
  const [selectedCityId, setSelectedCityId] = useState(null);

  const addCity = async () => {
    const name = input.trim();
    if (!name) return;
    setAdding(true);
    setAddError('');
    try {
      const geo = await geocodeCity(name);
      const id = `${geo.lat}-${geo.lon}-${Date.now()}`;
      const newCity = { id, ...geo, openMeteo: null, wttr: null };
      setCities((prev) => [...prev, newCity]);
      setInput('');

      fetchOpenMeteo(geo.lat, geo.lon)
        .then((weather) =>
          setCities((prev) => prev.map((c) => (c.id === id ? { ...c, openMeteo: weather } : c)))
        )
        .catch(() =>
          setCities((prev) => prev.map((c) => (c.id === id ? { ...c, openMeteoError: true } : c)))
        );

      fetchWttr(geo.lat, geo.lon)
        .then((weather) =>
          setCities((prev) => prev.map((c) => (c.id === id ? { ...c, wttr: weather } : c)))
        )
        .catch(() =>
          setCities((prev) => prev.map((c) => (c.id === id ? { ...c, wttrError: true } : c)))
        );
    } catch (e) {
      setAddError(e.message || 'Fehler beim Suchen');
    } finally {
      setAdding(false);
    }
  };

  const removeCity = (id) => {
    setCities((prev) => prev.filter((c) => c.id !== id));
    if (selectedCityId === id) setSelectedCityId(null);
  };

  const selectedCity = cities.find((c) => c.id === selectedCityId);

  if (selectedCity) {
    return <CityDetail city={selectedCity} onBack={() => setSelectedCityId(null)} />;
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Text style={styles.title}>Wetter</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Stadt eingeben (z.B. Berlin)"
          placeholderTextColor="#888"
          value={input}
          onChangeText={setInput}
          onSubmitEditing={addCity}
          returnKeyType="search"
        />
        <Pressable style={styles.addButton} onPress={addCity} disabled={adding}>
          {adding ? <ActivityIndicator color="#fff" /> : <Text style={styles.addButtonText}>+</Text>}
        </Pressable>
      </View>
      {addError ? <Text style={styles.errorText}>{addError}</Text> : null}

      <FlatList
        data={cities}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <CityListItem
            city={item}
            onPress={() => setSelectedCityId(item.id)}
            onRemove={() => removeCity(item.id)}
          />
        )}
        contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={styles.emptyText}>Noch keine Stadt hinzugefügt.</Text>}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0d0d18',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#fff',
    marginTop: 60,
    marginBottom: 16,
    paddingHorizontal: 16,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    backgroundColor: '#24243a',
    color: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    fontSize: 16,
  },
  addButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#2ecc71',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addButtonText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
  },
  errorText: {
    color: '#ff8a80',
    marginBottom: 8,
    paddingHorizontal: 16,
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  emptyText: {
    color: '#888',
    textAlign: 'center',
    marginTop: 40,
  },
  listCard: {
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
  },
  listCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  listCityName: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
  },
  listCondition: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginTop: 2,
  },
  removeText: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 16,
  },
  listCardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 18,
  },
  listEmoji: {
    fontSize: 30,
  },
  listTemp: {
    color: '#fff',
    fontSize: 40,
    fontWeight: '300',
  },
  listHiLo: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  gradientContainer: {
    flex: 1,
  },
  detailScroll: {
    paddingHorizontal: 16,
    paddingBottom: 50,
    alignItems: 'center',
  },
  backButtonWrap: {
    alignSelf: 'flex-start',
    marginTop: 55,
    marginBottom: 6,
  },
  backButton: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '500',
  },
  detailCity: {
    color: '#fff',
    fontSize: 28,
    fontWeight: '600',
    marginTop: 8,
  },
  hugeTemp: {
    color: '#fff',
    fontSize: 88,
    fontWeight: '200',
    marginTop: -4,
  },
  conditionText: {
    color: '#fff',
    fontSize: 18,
    marginTop: -6,
  },
  hiLoText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 15,
    marginTop: 4,
    marginBottom: 20,
  },
  glassCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 18,
    padding: 14,
    marginBottom: 16,
  },
  glassCardLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  hourlyItem: {
    alignItems: 'center',
  },
  hourlyTime: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
    marginBottom: 8,
  },
  hourlyEmoji: {
    fontSize: 22,
    marginBottom: 8,
  },
  hourlyTemp: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  dailyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.2)',
  },
  dailyDay: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    width: 55,
  },
  dailyEmoji: {
    fontSize: 18,
    width: 34,
    textAlign: 'center',
  },
  dailyMin: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    width: 32,
    textAlign: 'right',
  },
  barTrack: {
    flex: 1,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 2,
    marginHorizontal: 8,
  },
  barFill: {
    position: 'absolute',
    height: 4,
    backgroundColor: '#ffd166',
    borderRadius: 2,
  },
  dailyMax: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    width: 32,
  },
  tileGrid: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  infoTile: {
    width: '47%',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
    padding: 14,
  },
  infoLabel: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  infoValue: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '600',
  },
});
