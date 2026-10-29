const HINWEIS = /^\s*\[(?:important|system|background|notification|process|hinweis)|background process|^\s*<(?:system|notification)/i

const ms = (wert) => (!wert ? 0 : typeof wert === 'number' ? (wert < 1e12 ? wert * 1000 : wert) : Date.parse(wert) || 0)
const textVon = (nachricht) => (typeof nachricht.content === 'string' ? nachricht.content : Array.isArray(nachricht.content) ? nachricht.content.map((teil) => teil?.text || '').join('') : '')

export function auftraegeAus(nachrichten, jetzt) {
  const verlauf = nachrichten.filter((nachricht) => (nachricht.role === 'user' || nachricht.role === 'assistant') && nachricht.display_kind !== 'hidden')
  const liste = []
  for (let i = 0; i < verlauf.length; i++) {
    const nachricht = verlauf[i]
    if (nachricht.role !== 'user' || nachricht.display_kind === 'hidden') continue
    const text = textVon(nachricht).trim()
    if (!text || HINWEIS.test(text)) continue
    const start = ms(nachricht.timestamp)
    let ende = 0
    let naechster = false
    for (let j = i + 1; j < verlauf.length; j++) {
      if (verlauf[j].role === 'user' && !HINWEIS.test(textVon(verlauf[j]))) {
        naechster = true
        break
      }
      if (verlauf[j].role === 'assistant' && verlauf[j].finish_reason === 'stop' && textVon(verlauf[j]).trim()) ende = ms(verlauf[j].timestamp)
    }
    const ergebnis = ende ? 'ok' : naechster || jetzt - start > 15 * 60 * 1000 ? 'fehler' : 'laeuft'
    liste.push({ start, ende, ergebnis, dauer: ende ? Math.max(0, ende - start) : 0, text })
  }
  return liste
}

const datumText = (datum) => `${datum.getFullYear()}-${String(datum.getMonth() + 1).padStart(2, '0')}-${String(datum.getDate()).padStart(2, '0')}`
const datumGueltig = (wert) => /^\d{4}-\d{2}-\d{2}$/.test(String(wert || '')) && !Number.isNaN(Date.parse(`${wert}T00:00:00`))
const zeitpunkt = (datum, zeit = '') => {
  const [jahr, monat, tag] = datum.split('-').map(Number)
  const [stunde, minute] = (zeit || '00:00').split(':').map(Number)
  return new Date(jahr, monat - 1, tag, stunde || 0, minute || 0)
}

export function tagesplanErstellen(termine = [], aufgaben = [], jetzt = new Date()) {
  const heute = datumText(jetzt)
  const grenze = new Date(jetzt)
  grenze.setDate(grenze.getDate() + 7)
  const bis = datumText(grenze)
  const eintraege = []

  for (const termin of Array.isArray(termine) ? termine : []) {
    if (!datumGueltig(termin.datum) || termin.datum < heute || termin.datum > bis || !String(termin.titel || '').trim()) continue
    const beginn = zeitpunkt(termin.datum, termin.zeit)
    const ende = beginn.getTime() + Math.max(0, Number(termin.dauer) || 60) * 60000
    if (termin.zeit && ende < jetzt.getTime()) continue
    eintraege.push({ art: 'termin', id: String(termin.id || ''), text: String(termin.titel), datum: termin.datum, zeit: String(termin.zeit || ''), sort: beginn.getTime() })
  }

  for (const aufgabe of Array.isArray(aufgaben) ? aufgaben : []) {
    if (aufgabe.erledigt || !datumGueltig(aufgabe.datum) || aufgabe.datum > bis || !String(aufgabe.text || '').trim()) continue
    const beginn = zeitpunkt(aufgabe.datum, aufgabe.zeit)
    eintraege.push({ art: 'aufgabe', id: String(aufgabe.id || ''), text: String(aufgabe.text), datum: aufgabe.datum, zeit: String(aufgabe.zeit || ''), ueberfaellig: aufgabe.datum < heute, sort: beginn.getTime() })
  }

  const sortiert = eintraege.sort((a, b) => a.sort - b.sort || (a.art === 'aufgabe' ? -1 : 1))
  const ueberfaellig = sortiert.filter((eintrag) => eintrag.ueberfaellig).sort((a, b) => b.sort - a.sort).slice(0, 3)
  const kommend = sortiert.filter((eintrag) => !eintrag.ueberfaellig)
  return [...ueberfaellig, ...kommend]
    .slice(0, 8)
    .map(({ sort, ...eintrag }) => eintrag)
}

export async function tagesdatenLaden(pluginIds, datenLaden, jetzt = new Date()) {
  const verfuegbar = new Set((pluginIds || []).map((id) => String(id).replace(/^plugin-/, '')))
  const laden = (id) => verfuegbar.has(id)
    ? Promise.resolve().then(() => datenLaden(id)).catch(() => null)
    : Promise.resolve(null)
  const [kalender, aufgaben] = await Promise.all([laden('kalender'), laden('aufgaben')])
  return tagesplanErstellen(kalender?.termine, aufgaben?.aufgaben, jetzt)
}

export function laufendeAuftraege(agenten = []) {
  const alle = agenten.flatMap((agent) => (agent.auftraege || []).map((auftrag) => ({
    ...auftrag,
    profil: agent.profil,
    name: agent.name,
    rolle: agent.rolle
  })))
  return alle.filter((auftrag) => auftrag.ergebnis === 'laeuft').sort((a, b) => a.start - b.start).slice(0, 5)
}

export function sitzungsCacheBereinigen(cache, sitzungen) {
  const vorhanden = new Set(sitzungen)
  for (const id of cache.keys()) if (!vorhanden.has(id)) cache.delete(id)
}