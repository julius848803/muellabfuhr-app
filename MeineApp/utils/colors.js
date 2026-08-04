// Weist Tonnen-Typen konsistente Farben zu (bekannte Typen fest, unbekannte per Hash).
const KNOWN = {
  restmüll: '#9aa0a6',
  restabfall: '#9aa0a6',
  biomüll: '#a9682f',
  bioabfall: '#a9682f',
  biotonne: '#a9682f',
  papier: '#4a90e2',
  papiertonne: '#4a90e2',
  'gelber sack': '#f4d03f',
  gelbersack: '#f4d03f',
  wertstoff: '#f4d03f',
  glas: '#2ecc71',
};

const PALETTE = ['#e74c3c', '#9b59b6', '#1abc9c', '#e67e22', '#3498db', '#f39c12'];

export function colorForType(type) {
  const key = type.toLowerCase().trim();
  if (KNOWN[key]) return KNOWN[key];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) % PALETTE.length;
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
