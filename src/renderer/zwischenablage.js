// Zwischenablage an Luzzy: Text in irgendeinem Programm kopieren, Strg+Umschalt+L drücken.
// Jarves-OS kommt nach vorne und fragt, was Luzzy damit tun soll. Bei Verbessern, Übersetzen und Beantworten
// liegt das Ergebnis danach wieder in der Zwischenablage, fertig zum Einfügen.

const $ = (id) => document.getElementById(id)
const api = window.jarves

const AUFTRAEGE = {
  zusammenfassen: { name: 'Zusammenfassen', kopieren: false, prompt: 'Fasse diesen Text kurz zusammen: die Kernaussagen, höchstens fünf Punkte.' },
  verbessern: { name: 'Verbessern', kopieren: true, prompt: 'Verbessere diesen Text: Rechtschreibung, Grammatik, klarer und flüssiger, gleicher Ton, gleiche Sprache. Antworte nur mit dem verbesserten Text, ohne Einleitung, ohne Kommentar.' },
  uebersetzen: { name: 'Übersetzen', kopieren: true, prompt: 'Übersetze diesen Text: Ist er deutsch, ins Englische, sonst ins Deutsche. Antworte nur mit der Übersetzung, ohne Einleitung, ohne Kommentar.' },
  beantworten: { name: 'Beantworten', kopieren: true, prompt: 'Beantworte das. Ist es eine Mail oder Nachricht (z. B. von Kunden), schreib mir einen fertigen Antwortentwurf in meinem Ton, den ich direkt verwenden kann, nur den Entwurf ohne Einleitung. Ist es eine Frage, beantworte sie kurz.' }
}

let text = ''
let h = { luzzy: async () => false, verbunden: () => false }
let wartetAufErgebnis = null // { kopieren } für die nächste Antwort von Luzzy

function oeffnen(neu) {
  text = String(neu || '').trim()
  $('ablage-vorschau').textContent = text ? (text.length > 1200 ? `${text.slice(0, 1200)} …` : text) : 'Die Zwischenablage ist leer. Kopier erst einen Text (Strg+C).'
  $('ablage-laenge').textContent = text ? `${text.length.toLocaleString('de-DE')} Zeichen` : ''
  $('ablage-eigen').value = ''
  $('ablage-hinweis').textContent = h.verbunden() ? '' : 'Hermes ist gerade nicht verbunden, Luzzy kann erst danach loslegen.'
  for (const k of document.querySelectorAll('[data-ablage]')) k.disabled = !text
  if (!$('ablage').open) $('ablage').showModal()
  $('ablage').querySelector('[data-ablage="zusammenfassen"]')?.focus()
}

async function ausfuehren(art) {
  if (!text) return
  const eigen = $('ablage-eigen').value.trim()
  const auftrag = art === 'eigen' ? { name: eigen, kopieren: true, prompt: `${eigen}. Antworte nur mit dem Ergebnis, ohne Einleitung.` } : AUFTRAEGE[art]
  if (!auftrag?.prompt || (art === 'eigen' && !eigen)) return
  const kurz = text.replace(/\s+/g, ' ').slice(0, 70)
  const ok = await h.luzzy(`${auftrag.prompt}\n\n"""\n${text}\n"""`, { anzeige: `📋 ${auftrag.name}: „${kurz}${text.length > 70 ? '…' : ''}“` })
  if (ok === false) {
    $('ablage-hinweis').textContent = h.verbunden() ? 'Luzzy ist gerade noch beschäftigt. Gleich nochmal.' : 'Hermes ist nicht verbunden.'
    return
  }
  wartetAufErgebnis = { kopieren: auftrag.kopieren }
  $('ablage').close()
}

// Von app.js bei jeder fertigen Antwort aufgerufen: Ergebnis zurück in die Zwischenablage
export async function ablageErgebnis(antwort) {
  if (!wartetAufErgebnis) return null
  const { kopieren } = wartetAufErgebnis
  wartetAufErgebnis = null
  if (!kopieren || !antwort) return null
  await api.zwischenablage.schreiben(antwort.trim())
  return 'Liegt in der Zwischenablage, einfach einfügen (Strg+V).'
}

export function ablageEinrichten(helfer) {
  h = { ...h, ...helfer }
  api.zwischenablage.beiNeu(oeffnen)
  $('ablage').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-ablage]')
    if (knopf) ausfuehren(knopf.dataset.ablage)
    else if (e.target === $('ablage')) $('ablage').close()
  })
  $('ablage-eigen').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      ausfuehren('eigen')
    }
  })
  // Tasten 1 bis 4 im Fenster
  $('ablage').addEventListener('keydown', (e) => {
    if (e.target === $('ablage-eigen')) return
    const art = ['zusammenfassen', 'verbessern', 'uebersetzen', 'beantworten'][Number(e.key) - 1]
    if (art) {
      e.preventDefault()
      ausfuehren(art)
    }
  })
}

// Auch ohne Tastenkürzel (Befehlspalette, Knopf): aktuelle Zwischenablage holen
export async function ablageOeffnen() {
  oeffnen(await api.zwischenablage.lesen())
}
