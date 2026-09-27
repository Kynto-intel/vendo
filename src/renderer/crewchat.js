// Crew-Tab: Bots direkt ansprechen (Offene Entscheidung 3).
// Zwei Reiter:
//   💬 Normaler Chat – direktes Gespräch mit Kira, Lira, Milla … (eigenes Gespräch „Jarves-OS“ im Profil des Bots,
//                      ohne Bot Mode). Mit Luzzy spricht Felix in der Zentrale.
//   🤖 Bot Mode      – der „Bot Chat“ eines Bots: dort arbeiten die Bots zusammen (message_agent, Übergaben
//                      Kira → Lira → Milla). Bei Luzzy: Aufträge, die sie an die Crew verteilt (Kanal „crew“).
// Zusätzlich: „Kira, …“ in der Zentrale geht direkt in den normalen Chat mit Kira.

import { unterhaltungErstellen } from './unterhaltung.js'
import { crewProfile, botName, LUZZY } from './ansichten.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

let h = { api: null, aktivitaet: () => {}, fertigWoanders: () => {} }
let bots = [] // [{ profil, name, rolle }]
let modus = 'normal'
let gewaehlt = { normal: null, botchat: LUZZY } // Profil pro Reiter
const gespraeche = new Map() // kanal → { unterhaltung, liste, geoeffnet }
const warten = new Map() // kanal → fn(text) für Anfragen aus der Zentrale

try {
  const g = JSON.parse(localStorage.getItem('crew-auswahl') || 'null')
  if (g?.modus) ({ modus } = g)
  if (g?.gewaehlt) gewaehlt = { ...gewaehlt, ...g.gewaehlt }
} catch {
  // ohne Speicher: Standard
}
function merken() {
  try {
    localStorage.setItem('crew-auswahl', JSON.stringify({ modus, gewaehlt }))
  } catch {
    // egal
  }
}

const kanalFuer = (m, profil) => (m === 'botchat' && profil === LUZZY ? 'crew' : `${m}:${profil}`)
const botVon = (profil) => bots.find((b) => b.profil === profil) || { profil, ...botName({ name: profil || '' }) }
function botVonKanal(kanal) {
  if (kanal === 'crew') return { ...botVon(LUZZY), modus: 'botchat' }
  const [m, profil] = kanal.split(':')
  return { ...botVon(profil), modus: m }
}

// Gespräch zu einem Kanal (wird beim ersten Mal angelegt, mit eigener Liste, gemeinsame Eingabe)
function gespraech(kanal) {
  if (gespraeche.has(kanal)) return gespraeche.get(kanal)
  const bot = botVonKanal(kanal)
  let liste = kanal === 'crew' ? $('crew-gespraech') : null
  if (!liste) {
    liste = document.createElement('div')
    liste.className = 'gespraech'
    liste.hidden = true
    $('crew-listen').appendChild(liste)
  }
  liste.dataset.kanal = kanal
  const eintrag = { liste, geoeffnet: false }
  eintrag.unterhaltung = unterhaltungErstellen({
    kanal,
    liste,
    form: $('crew-form'),
    namen: { felix: 'FELIX', luzzy: bot.name.toUpperCase() },
    wer: bot.name,
    leerText: kanal === 'crew'
      ? 'Noch keine Crew-Aufträge. Sag Luzzy, was die Bots erledigen sollen.'
      : bot.modus === 'botchat'
        ? `${bot.name}s Bot Chat ist noch leer. Hier kommt an, was andere Bots ${bot.name} schicken.`
        : `Noch nichts gesagt. Frag ${bot.name} direkt, z. B. „${bot.name}, was kannst du für mich tun?“`,
    istAktiv: () => aktuellerKanal() === kanal,
    beiAktivitaet: (text, laeuft) => h.aktivitaet(text, laeuft),
    beiFertig: (text) => {
      const zurueck = warten.get(kanal)
      warten.delete(kanal)
      if (zurueck) return zurueck(text)
      if (!(h.crewSichtbar() && aktuellerKanal() === kanal)) h.fertigWoanders(bot, text)
    }
  })
  gespraeche.set(kanal, eintrag)
  return eintrag
}

export const aktuellerKanal = () => {
  const profil = gewaehlt[modus]
  return profil ? kanalFuer(modus, profil) : null
}

export function crewChatEinrichten(helfer) {
  h = { ...h, crewSichtbar: () => false, ...helfer }
  gespraech('crew') // Luzzys Bot Chat gibt es immer
  $('crew-modus').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-modus]')
    if (!knopf) return
    modus = knopf.dataset.modus
    wechseln()
  })
  $('crew-bots').addEventListener('click', (e) => {
    const knopf = e.target.closest('[data-bot]')
    if (!knopf) return
    gewaehlt[modus] = knopf.dataset.bot
    wechseln()
  })
  // Klick auf eine Bot-Karte oben: Gespräch mit diesem Bot (Luzzy: ihr Bot Chat)
  $('crew-karten').addEventListener('click', (e) => {
    if (e.target.closest('button, select, input, a, .modell-liste')) return
    const karte = e.target.closest('article.bot[data-profil]')
    if (!karte) return
    const profil = karte.dataset.profil
    modus = profil === LUZZY ? 'botchat' : 'normal'
    gewaehlt[modus] = profil
    wechseln()
    $('crew-form').querySelector('textarea').focus()
  })
}

// Bots aus den Hermes-Profilen (Crew-Tab lädt sie ohnehin)
export async function crewBotsLaden() {
  const d = await h.api.hermes.lesen('/api/profiles').catch(() => null)
  if (!d?.profiles) return bots
  bots = crewProfile(d.profiles).map((p) => ({ profil: p.name, ...botName(p) }))
  const normale = bots.filter((b) => b.profil !== LUZZY)
  if (!gewaehlt.normal || !normale.some((b) => b.profil === gewaehlt.normal)) gewaehlt.normal = normale[0]?.profil || null
  if (!bots.some((b) => b.profil === gewaehlt.botchat)) gewaehlt.botchat = LUZZY
  zeichnen()
  return bots
}

function zeichnen() {
  for (const k of $('crew-modus').querySelectorAll('[data-modus]')) k.classList.toggle('an', k.dataset.modus === modus)
  const liste = modus === 'normal' ? bots.filter((b) => b.profil !== LUZZY) : bots
  $('crew-bots').innerHTML = liste.length
    ? liste.map((b) => `<button class="crew-bot${b.profil === gewaehlt[modus] ? ' an' : ''}" data-bot="${maskieren(b.profil)}" type="button" title="Hermes-Profil: ${maskieren(b.profil)}">${maskieren(b.name)}${b.rolle ? `<small>${maskieren(b.rolle)}</small>` : ''}</button>`).join('')
    : '<span class="leise klein">Noch keine Bots außer Luzzy.</span>'
  const bot = botVon(gewaehlt[modus])
  $('crew-chat-hinweis').textContent = modus === 'normal'
    ? `Direktes Gespräch mit ${bot.name}, ohne Bot Mode. Mit Luzzy sprichst du in der Zentrale.`
    : bot.profil === LUZZY
      ? 'Luzzys Bot Chat: sie verteilt Aufträge an die Crew und bekommt die Ergebnisse zurück.'
      : `${bot.name}s Bot Chat: hier arbeiten die Bots zusammen (Übergaben wie Kira → Lira → Milla).`
  $('crew-form').querySelector('textarea').placeholder = modus === 'normal'
    ? `Nachricht an ${bot.name} …`
    : bot.profil === LUZZY ? 'Auftrag für die Crew, z. B. „Kira soll Trends für Herbst-Shirts suchen“ …' : `Nachricht in ${bot.name}s Bot Chat …`
}

// Gewählten Kanal sichtbar machen und (beim ersten Mal) bei Hermes öffnen
export async function wechseln() {
  merken()
  zeichnen()
  const kanal = aktuellerKanal()
  for (const [k, g] of gespraeche) g.liste.hidden = k !== kanal
  if (!kanal) return
  const g = gespraech(kanal)
  g.liste.hidden = false
  g.unterhaltung.aktivieren()
  if (!g.geoeffnet) {
    g.geoeffnet = true
    try {
      if (kanal === 'crew') await h.api.hermes.crewOeffnen()
      else await h.api.hermes.botOeffnen(kanal)
    } catch (e) {
      g.geoeffnet = false
      g.liste.insertAdjacentHTML('beforeend', `<div class="msg system">Konnte das Gespräch nicht öffnen: ${maskieren(e.message)}</div>`)
    }
  }
}

// Ereignisse und Verlauf von Hermes für alle Kanäle außer der Zentrale
export function crewEreignis(ev) {
  gespraech(ev.kanal).unterhaltung.ereignis(ev)
}
export function crewVerlauf(v) {
  gespraech(v.kanal).unterhaltung.verlauf(v.verlauf)
}

// „Kira, was ist gerade Trend?“ → { bot, text } (nur Bots außer Luzzy, Name am Satzanfang)
export function botAnrede(satz) {
  const s = String(satz || '').trim().replace(/^\s*(?:hey|hi|hallo|ok)\s+/i, '')
  for (const b of bots) {
    if (b.profil === LUZZY) continue
    const t = new RegExp(`^${b.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[,:!]\\s*|\\s+)(.{2,})$`, 'is').exec(s)
    if (t) return { bot: b, text: t[1].trim() }
  }
  return null
}

// Aus der Zentrale an einen Bot schicken (normaler Chat). fertig(text) bekommt seine Antwort.
export async function anBotSenden(bot, text, fertig) {
  const kanal = kanalFuer('normal', bot.profil)
  const g = gespraech(kanal)
  if (!g.geoeffnet) {
    g.geoeffnet = true
    await h.api.hermes.botOeffnen(kanal).catch((e) => {
      g.geoeffnet = false
      throw e
    })
  }
  if (g.unterhaltung.beschaeftigt()) return false
  if (fertig) warten.set(kanal, fertig)
  g.unterhaltung.senden(text)
  return true
}
