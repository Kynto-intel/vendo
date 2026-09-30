// Fennis Farben aus dem Design (Einstellungen → Aussehen). mini.js setzt --akzent-rgb und --akzent-hell-rgb aus dem
// gemerkten Design; daraus werden Fell, Ohren, Schnauze und Effekte gemischt. Gold-Design = goldener Welpe,
// Eisen = silberner, Nordlicht = eisblauer usw.

const zahlen = (text, ersatz) => (String(text || '').trim() || ersatz).split(',').map((z) => Number(z) || 0)
const mischen = (a, b, anteil) => a.map((w, i) => Math.round(w * (1 - anteil) + b[i] * anteil))
const rgba = (w, deckkraft = 1) => `rgba(${w.join(', ')}, ${deckkraft})`

export function fenniFarben(stil = getComputedStyle(document.documentElement)) {
  const akzent = zahlen(stil.getPropertyValue('--akzent-rgb'), '201, 161, 74')
  const hell = zahlen(stil.getPropertyValue('--akzent-hell-rgb'), '227, 190, 108')
  return {
    fell: rgba(hell),
    fellDunkel: rgba(mischen(hell, akzent, 0.55)), // Hinterbacken, ferne Beine, Schwanz (rumpf.js)
    ballen: 'rgba(226, 140, 150, 0.95)', // rosa Pfotenballen
    linie: rgba(mischen(akzent, [0, 0, 0], 0.3), 0.35), // feine Trennlinie zwischen den Vorderbeinen
    dunkel: rgba(akzent), // Ohren
    innen: rgba(mischen(akzent, [0, 0, 0], 0.45)), // Innenseite der Ohren
    schnauze: rgba(mischen(hell, [255, 255, 255], 0.5)),
    auge: '#1a1408',
    augeWeiss: '#fffaf0',
    maul: '#7a3a2a',
    zunge: '#e8828a', // beim Hecheln
    zungeLinie: 'rgba(150, 50, 60, 0.55)',
    wange: 'rgba(214, 120, 90, 0.28)',
    effekt: rgba(hell, 0.85)
  }
}
