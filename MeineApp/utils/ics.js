// Sehr einfacher ICS-Parser: liest VEVENT-Blöcke mit SUMMARY und DTSTART aus.
// Bewusst schlank gehalten, da Abfuhrkalender (z.B. Bremer Stadtreinigung)
// üblicherweise einzelne Termine ohne komplexe RRULE-Wiederholungen exportieren.

function parseDtStart(line) {
  // Beispiele: "DTSTART;VALUE=DATE:20260115" oder "DTSTART:20260115T060000Z"
  const value = line.split(':').pop().trim();
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length < 8) return null;
  const year = parseInt(digits.slice(0, 4), 10);
  const month = parseInt(digits.slice(4, 6), 10);
  const day = parseInt(digits.slice(6, 8), 10);
  const y = year;
  const m = String(month).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function unfoldLines(text) {
  // ICS erlaubt Zeilenumbrüche mit führendem Leerzeichen als Fortsetzung derselben Zeile
  const rawLines = text.split(/\r\n|\n|\r/);
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else {
      lines.push(line);
    }
  }
  return lines;
}

export function parseIcs(text) {
  const lines = unfoldLines(text);
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line.startsWith('BEGIN:VEVENT')) {
      current = { summary: '', date: null };
    } else if (line.startsWith('END:VEVENT')) {
      if (current && current.date) {
        events.push(current);
      }
      current = null;
    } else if (current) {
      if (line.startsWith('SUMMARY')) {
        current.summary = line.split(':').slice(1).join(':').trim();
      } else if (line.startsWith('DTSTART')) {
        current.date = parseDtStart(line);
      }
    }
  }

  return events;
}
