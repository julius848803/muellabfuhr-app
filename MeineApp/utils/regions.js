// Registry deutscher Städte für den automatischen Termin-Import.
// "supported: true" bedeutet: volle automatische Anbindung wie bei Bremen.
// Alle anderen zeigen nur einen Link zur offiziellen Kalenderseite der Stadt,
// von der man sich bei Bedarf eine ICS-Datei besorgen und importieren kann.
// lat/lon = ungefähres Stadtzentrum, für die Standort-Erkennung.

export const REGIONS = [
  { id: 'bremen', name: 'Bremen', supported: true, lat: 53.0793, lon: 8.8017 },
  { id: 'berlin', name: 'Berlin', supported: false, url: 'https://www.bsr.de/abfuhrkalender-25455.php', lat: 52.5200, lon: 13.4050 },
  { id: 'hamburg', name: 'Hamburg', supported: false, url: 'https://www.stadtreinigung.hamburg/abfuhrkalender/', lat: 53.5511, lon: 9.9937 },
  { id: 'muenchen', name: 'München', supported: false, url: 'https://www.awm-muenchen.de', lat: 48.1351, lon: 11.5820 },
  { id: 'stuttgart', name: 'Stuttgart', supported: false, url: 'https://www.stuttgart.de/aws', lat: 48.7758, lon: 9.1829 },
  { id: 'duesseldorf', name: 'Düsseldorf', supported: false, url: 'https://www.awista.de', lat: 51.2277, lon: 6.7735 },
  { id: 'hannover', name: 'Hannover', supported: false, url: 'https://www.aha-region.de', lat: 52.3759, lon: 9.7320 },
  { id: 'wiesbaden', name: 'Wiesbaden', supported: false, url: 'https://www.eswiesbaden.de', lat: 50.0782, lon: 8.2398 },
  { id: 'mainz', name: 'Mainz', supported: false, url: 'https://www.mainz.de/abfall', lat: 49.9929, lon: 8.2473 },
  { id: 'saarbruecken', name: 'Saarbrücken', supported: false, url: 'https://www.evs.de', lat: 49.2401, lon: 6.9969 },
  { id: 'dresden', name: 'Dresden', supported: false, url: 'https://www.srdresden.de/kundenservice/abfuhrtermine', lat: 51.0504, lon: 13.7373 },
  { id: 'magdeburg', name: 'Magdeburg', supported: false, url: 'https://www.sab-magdeburg.de', lat: 52.1205, lon: 11.6276 },
  { id: 'kiel', name: 'Kiel', supported: false, url: 'https://www.abfallwirtschaft-kiel.de', lat: 54.3233, lon: 10.1228 },
  { id: 'schwerin', name: 'Schwerin', supported: false, url: 'https://www.weu-schwerin.de', lat: 53.6355, lon: 11.4012 },
  { id: 'erfurt', name: 'Erfurt', supported: false, url: 'https://www.saubere-heimat.info', lat: 50.9848, lon: 11.0299 },
  { id: 'potsdam', name: 'Potsdam', supported: false, url: 'https://www.stew-potsdam.de', lat: 52.3906, lon: 13.0645 },
];

export function getRegion(id) {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Findet die Stadt aus REGIONS, die den gegebenen Koordinaten am nächsten liegt.
export function findNearestRegion(lat, lon) {
  let nearest = REGIONS[0];
  let minDist = Infinity;
  for (const r of REGIONS) {
    const d = distanceKm(lat, lon, r.lat, r.lon);
    if (d < minDist) {
      minDist = d;
      nearest = r;
    }
  }
  return { region: nearest, distanceKm: Math.round(minDist) };
}
