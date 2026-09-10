// Zugriff auf die öffentliche Abfallkalender-API der Bremer Stadtreinigung.
// Reverse-engineered aus die-bremer-stadtreinigung.de/abfallkalender –
// es gibt kein offizielles ICS/Public-API-Angebot, aber diese Endpunkte
// werden von der Webseite selbst genutzt und liefern strukturierte JSON-Daten.

const BASE_URL = 'https://www.die-bremer-stadtreinigung.de';

const TYPE_LABELS = {
  residual: 'Restmüll',
  organic: 'Biomüll',
  paper: 'Papier',
  'yellow-bag': 'Gelber Sack',
  pine: 'Weihnachtsbaum',
};

export function bremenTypeLabel(code) {
  return TYPE_LABELS[code] ?? code;
}

export async function searchBremenStreets(term) {
  const query = term.trim();
  if (query.length < 2) return [];

  const body = new URLSearchParams();
  body.append('filters[0]', `Name eq ${query}*`);
  body.append('filters[1]', 'Ort/Name eq Bremen');

  const res = await fetch(`${BASE_URL}/api/c-trace/streets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) throw new Error('Straßensuche fehlgeschlagen');
  const data = await res.json();
  return (data.content ?? []).map((s) => ({
    id: s.StrassenId,
    name: s.Name,
    plz: s.Plz,
  }));
}

// Liefert Abfuhrtermine für eine Adresse. Ein Aufruf deckt bereits ca. 1,5
// Jahre im Voraus ab (von der Bremer API selbst so ausgeliefert).
export async function fetchBremenCalendar(street, houseNo) {
  const now = new Date();
  const firstMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const form = new FormData();
  form.append('street', street);
  form.append('houseNo', houseNo);
  form.append('firstMonth', firstMonth);

  const res = await fetch(`${BASE_URL}/api/c-trace/app/garbage-calendar-web`, {
    method: 'POST',
    body: form,
  });
  if (!res.ok) throw new Error('Termine konnten nicht geladen werden');
  const data = await res.json();

  if (!data.list || Array.isArray(data.list)) {
    throw new Error('Keine Termine für diese Adresse gefunden. Bitte Straße/Hausnummer prüfen.');
  }

  const events = [];
  for (const [date, entry] of Object.entries(data.list)) {
    for (const w of entry.waste ?? []) {
      events.push({
        type: bremenTypeLabel(w.type),
        date, // tatsächlicher Abholtag (Feiertagsverschiebung bereits berücksichtigt)
        originalDate: w.isAltered ? entry.TerminOri : undefined,
        isAltered: !!w.isAltered,
      });
    }
  }
  return events;
}
