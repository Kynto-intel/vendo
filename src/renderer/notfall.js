// Notfall-Luzzy (Idee 33): Ist Hermes nicht erreichbar oder scheitert die Antwort, weil Internet oder Cloud-Modell
// weg sind, antwortet Luzzy lokal über Ollama (kleinstes installiertes Modell, z. B. gemma4:12b).
// Sie bekommt Datum, Uhrzeit und alles, was die Plugins wissen (Termine, Aufgaben, Notizen …), hat aber keine
// Werkzeuge: kein Shop, keine Mails, kein Internet. Das sagt sie dann ehrlich.

let h = { api: null, kontext: async () => '', felix: () => {}, luzzy: () => {}, untertitel: () => {}, sprechen: () => {}, zuhoeren: () => {}, modell: () => '' }
const verlauf = [] // letzte Wechsel im Notbetrieb (für Rückfragen)
let laeuft = false

// Fehlertexte, die nach „kein Internet / Cloud gestört“ aussehen
export const NETZ_FEHLER = /(connect|connection|network|netzwerk|timeout|timed out|unreachable|getaddrinfo|enotfound|econn|dns|offline|internet|socket|name resolution|temporarily unavailable|service unavailable|\b50[234]\b|verbindung)/i

export function notfallEinrichten(helfer) {
  h = { ...h, ...helfer }
}

export const notfallLaeuft = () => laeuft

function systemText(kontext) {
  const jetzt = new Date()
  const wann = `${jetzt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${jetzt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr`
  return `Du bist Luzzy, die rechte Hand von Felix bei Donnerwolf (Shopify-Shop für Wikinger- und Norse-Kleidung).
Du duzt Felix, antwortest auf Deutsch, locker, direkt und kurz (meist 1 bis 4 Sätze), ohne Tabellen.

NOTBETRIEB: Das Internet oder das Cloud-Modell ist gerade nicht erreichbar. Du läufst lokal auf Felix' PC,
ohne Werkzeuge. Du kannst NICHT: im Shop nachsehen oder etwas ändern, Mails lesen, im Internet suchen,
Dateien bearbeiten, die Crew beauftragen, Termine eintragen. Wird so etwas gebraucht, sag das ehrlich in einem Satz
und dass es wieder geht, sobald die Verbindung zurück ist. Erfinde keine Zahlen, Bestellungen oder Fakten.
Was Vendo selbst kann, geht weiter: Timer, Wecker, Erinnerungen, Notizen („Merk dir …“), Aufgaben.

Jetzt ist ${wann}.
${kontext ? `\nDas weiß Vendo gerade (lokal gespeichert, kann veraltet sein):\n${kontext}` : ''}`
}

// Frage im Notbetrieb beantworten. ohneFrage: Felix' Nachricht steht schon im Gespräch (Antwort ist gescheitert)
export async function notfallAntworten(frage, { gesprochen = false, ohneFrage = false, grund = '' } = {}) {
  if (laeuft || !frage) return false
  laeuft = true
  if (!ohneFrage) h.felix(frage)
  h.untertitel(`🛟 Notbetrieb: ${grund || 'Hermes ist nicht erreichbar'}. Ich antworte lokal, das erste Mal dauert es etwas …`)
  try {
    const kontext = await h.kontext().catch(() => '')
    const nachrichten = [{ role: 'system', content: systemText(kontext) }, ...verlauf.slice(-8), { role: 'user', content: frage }]
    const { text, modell } = await h.api.notfall.fragen(nachrichten, h.modell())
    const antwort = text || 'Da ist gerade nichts rausgekommen. Frag mich nochmal.'
    verlauf.push({ role: 'user', content: frage }, { role: 'assistant', content: antwort })
    h.luzzy(antwort, modell)
    h.untertitel(antwort)
    if (gesprochen) h.sprechen(antwort).then(() => h.zuhoeren())
    return true
  } catch (e) {
    const satz = `Im Notbetrieb klappt es gerade auch nicht: ${String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
    h.untertitel(satz)
    h.luzzy(satz, '')
    return false
  } finally {
    laeuft = false
  }
}
