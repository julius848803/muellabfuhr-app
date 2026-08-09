// Registry deutscher Städte für den automatischen Termin-Import.
// "supported: true" bedeutet: volle automatische Anbindung wie bei Bremen.
// Alle anderen zeigen nur einen Link zur offiziellen Kalenderseite der Stadt,
// von der man sich bei Bedarf eine ICS-Datei besorgen und importieren kann.

export const REGIONS = [
  { id: 'bremen', name: 'Bremen', supported: true },
  { id: 'berlin', name: 'Berlin', supported: false, url: 'https://www.bsr.de/abfuhrkalender-25455.php' },
  { id: 'hamburg', name: 'Hamburg', supported: false, url: 'https://www.stadtreinigung.hamburg/abfuhrkalender/' },
  { id: 'muenchen', name: 'München', supported: false, url: 'https://www.awm-muenchen.de' },
  { id: 'stuttgart', name: 'Stuttgart', supported: false, url: 'https://www.stuttgart.de/aws' },
  { id: 'duesseldorf', name: 'Düsseldorf', supported: false, url: 'https://www.awista.de' },
  { id: 'hannover', name: 'Hannover', supported: false, url: 'https://www.aha-region.de' },
  { id: 'wiesbaden', name: 'Wiesbaden', supported: false, url: 'https://www.eswiesbaden.de' },
  { id: 'mainz', name: 'Mainz', supported: false, url: 'https://www.mainz.de/abfall' },
  { id: 'saarbruecken', name: 'Saarbrücken', supported: false, url: 'https://www.evs.de' },
  { id: 'dresden', name: 'Dresden', supported: false, url: 'https://www.srdresden.de/kundenservice/abfuhrtermine' },
  { id: 'magdeburg', name: 'Magdeburg', supported: false, url: 'https://www.sab-magdeburg.de' },
  { id: 'kiel', name: 'Kiel', supported: false, url: 'https://www.abfallwirtschaft-kiel.de' },
  { id: 'schwerin', name: 'Schwerin', supported: false, url: 'https://www.weu-schwerin.de' },
  { id: 'erfurt', name: 'Erfurt', supported: false, url: 'https://www.saubere-heimat.info' },
  { id: 'potsdam', name: 'Potsdam', supported: false, url: 'https://www.stew-potsdam.de' },
];

export function getRegion(id) {
  return REGIONS.find((r) => r.id === id) ?? REGIONS[0];
}
