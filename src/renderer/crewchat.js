// Crew-Tab: Bots direkt ansprechen (Offene Entscheidung 3).
// Zwei Reiter:
//   💬 Normaler Chat – direktes Gespräch mit Luzzy (= die Gespräche der Zentrale, „Allgemein ▾“), Kira, Lira, Milla …
//                      ohne Bot Mode. Pro Bot mehrere Chats: anlegen, wechseln, löschen.
//   🤖 Bot Mode      – der „Bot Chat“ eines Bots: dort arbeiten die Bots zusammen (message_agent, Übergaben
//                      Kira → Lira → Milla). Bei Luzzy: Aufträge, die sie an die Crew verteilt (Kanal „crew“).
// Zusätzlich: „Kira, …“ in der Zentrale geht direkt in den normalen Chat mit Kira.

import { unterhaltungErstellen } from './unterhaltung.js'
import { crewProfile, botName, LUZZY } from './ansichten.js'
import { bestaetigen } from './fenster.js'

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

const kanalFuer = (m, profil) => (profil === LUZZY ? (m === 'botchat' ? 'crew' : 'zentrale') : `${m}:${profil}`)
const botVon = (profil) => bots.find((b) => b.profil === profil) || { profil, ...botName({ name: profil || '' }) }
function botVonKanal(kanal) {
  if (kanal === 'crew') return { ...botVon(LUZZY), modus: 'botchat' }
  const [m, profil] = kanal.split(':')
  return { ...botVon(profil), modus: m }
}

// Gespräch zu einem Kanal (wird beim ersten Mal angelegt, mit eigener Liste, gemeinsame Eingabe)
function gespraech(kanal) {
  if (gespraeche.has(kanal)) return gespraeche.get(kanal)
  if (kanal === 'zentrale') {
    // Luzzys normaler Chat ist das Gespräch der Zentrale: Liste, Eingabe und Anzeige macht app.js
    const eintrag = { liste: $('gespraech'), geoeffnet: true, unterhaltung: null }
    gespraeche.set(kanal, eintrag)
    return eintrag
  }
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
  // Luzzys Gespräch (früher rechts angedockt) wohnt jetzt im Crew-Tab: Liste, Eingabe und „Allgemein ▾“
  const alt = $('gespraech-panel')
  const wahl = alt?.querySelector('.gespraech-wahl')
  if (wahl) {
    wahl.querySelector('h3')?.remove()
    $('crew-thema-luzzy').appendChild(wahl)
  }
  $('crew-listen').appendChild($('gespraech'))
  const luzzyForm = alt?.querySelector('form.eingabe-form')
  if (luzzyForm) {
    luzzyForm.id = 'luzzy-form'
    luzzyForm.hidden = true
    $('crew-form').after(luzzyForm)
  }
  gespraech('zentrale')
  gespraech('crew') // Luzzys Bot Chat gibt es immer
  chatAuswahlEinrichten()
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
    if (e.target.closest('button, select, input, a, .modell-wahl')) return
    const karte = e.target.closest('article.bot[data-profil]')
    if (!karte) return
    gewaehlt[modus] = karte.dataset.profil // der gewählte Reiter (Normaler Chat / Bot Mode) bleibt
    wechseln()
    $('crew-form').querySelector('textarea').focus()
  })
}

// Bots aus den Hermes-Profilen (Crew-Tab lädt sie ohnehin)
export async function crewBotsLaden() {
  const d = await h.api.hermes.lesen('/api/profiles').catch(() => null)
  if (!d?.profiles) return bots
  bots = crewProfile(d.profiles).map((p) => ({ profil: p.name, ...botName(p) }))
  if (!gewaehlt.normal || !bots.some((b) => b.profil === gewaehlt.normal)) gewaehlt.normal = bots[0]?.profil || null
  if (!bots.some((b) => b.profil === gewaehlt.botchat)) gewaehlt.botchat = LUZZY
  zeichnen()
  return bots
}

function zeichnen() {
  for (const k of $('crew-modus').querySelectorAll('[data-modus]')) k.classList.toggle('an', k.dataset.modus === modus)
  const liste = bots
  $('crew-bots').innerHTML = liste.length
    ? liste.map((b) => `<button class="crew-bot${b.profil === gewaehlt[modus] ? ' an' : ''}" data-bot="${maskieren(b.profil)}" type="button" title="Hermes-Profil: ${maskieren(b.profil)}">${maskieren(b.name)}${b.rolle ? `<small>${maskieren(b.rolle)}</small>` : ''}</button>`).join('')
    : '<span class="leise klein">Noch keine Bots außer Luzzy.</span>'
  const bot = botVon(gewaehlt[modus])
  $('crew-chat-hinweis').textContent = modus === 'normal'
    ? bot.profil === LUZZY ? 'Dein Gespräch mit Luzzy aus der Zentrale, ohne Bot Mode. Über „Allgemein ▾“ wechselst, erstellst und löschst du Chats.' : `Direktes Gespräch mit ${bot.name}, ohne Bot Mode. Über den Knopf links wechselst, erstellst und löschst du Chats.`
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
  const zentrale = kanal === 'zentrale'
  $('crew-form').hidden = zentrale
  if ($('luzzy-form')) $('luzzy-form').hidden = !zentrale
  $('crew-thema-luzzy').hidden = !zentrale
  $('crew-thema-bot').hidden = zentrale || modus !== 'normal'
  if (!zentrale && modus === 'normal') chatListeLaden()
  if (zentrale) {
    g.liste.scrollTop = g.liste.scrollHeight
    return
  }
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

// ── Mehrere Chats pro Bot (nur Normaler Chat; bei Luzzy macht das gespraeche.js mit „Allgemein ▾“) ──
let chatStand = { liste: [], aktiv: 'Allgemein' }
async function chatListeLaden() {
  const profil = gewaehlt.normal
  if (!profil || profil === LUZZY) return
  chatStand = (await h.api.botChats.liste(profil).catch(() => null)) || { liste: [{ name: 'Allgemein' }], aktiv: 'Allgemein' }
  chatAuswahlZeichnen()
}
function chatAuswahlZeichnen() {
  $('crew-thema-name').textContent = chatStand.aktiv
  $('crew-thema-menue').innerHTML = `${chatStand.liste
    .map((c) => `<div class="gm-eintrag${c.name === chatStand.aktiv ? ' aktiv' : ''}" data-name="${maskieren(c.name)}" tabindex="0">
        <span>${maskieren(c.name)}</span>${c.name === chatStand.aktiv ? '<small>offen</small>' : '<button class="gm-weg" type="button" title="Chat endgültig löschen" aria-label="Chat löschen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9zm4 2v8h1.5v-8H10zm3.5 0v8H15v-8h-1.5z"/></svg></button>'}
      </div>`)
    .join('')}
    <form class="gm-neu"><input maxlength="40" placeholder="Neuer Chat, z. B. Herbst-Kollektion …" autocomplete="off" /><button class="knopf-flach" type="submit">+</button></form>`
}
function chatAuswahlEinrichten() {
  const knopf = $('crew-thema-knopf')
  const menue = $('crew-thema-menue')
  const zu = () => (menue.hidden = true)
  knopf.addEventListener('click', (e) => {
    e.stopPropagation()
    menue.hidden = !menue.hidden
    if (!menue.hidden) menue.querySelector('input')?.focus()
  })
  document.addEventListener('click', (e) => !menue.contains(e.target) && e.target !== knopf && zu())
  menue.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') zu()
    if (e.key === 'Enter' && e.target.classList.contains('gm-eintrag')) e.target.click()
  })
  const profil = () => gewaehlt.normal
  const kanal = () => kanalFuer('normal', profil())
  const hinweis = (text) => gespraech(kanal()).liste.insertAdjacentHTML('beforeend', `<div class="msg system">${maskieren(text)}</div>`)
  const oeffnen = async (name) => {
    if (gespraech(kanal()).unterhaltung?.beschaeftigt()) return hinweis(`${botVon(profil()).name} antwortet noch. Danach wechseln.`)
    zu()
    try {
      gespraech(kanal()).geoeffnet = true
      chatStand = await h.api.botChats.wechseln(profil(), name)
      chatAuswahlZeichnen()
    } catch (err) {
      hinweis(`Chat: ${String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
    }
  }
  menue.addEventListener('click', async (e) => {
    const eintrag = e.target.closest('.gm-eintrag')
    if (!eintrag) return
    const name = eintrag.dataset.name
    if (e.target.closest('.gm-weg')) {
      e.stopPropagation()
      if (!(await bestaetigen(`Chat „${name}“ mit ${botVon(profil()).name} endgültig löschen? Das lässt sich nicht rückgängig machen.`, { titel: 'Chat löschen', ja: 'Löschen', gefahr: true }))) return
      try {
        chatStand = await h.api.botChats.loeschen(profil(), name)
        chatAuswahlZeichnen()
      } catch (err) {
        hinweis(`Löschen: ${String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`)
      }
      return
    }
    if (name !== chatStand.aktiv) oeffnen(name)
    else zu()
  })
  menue.addEventListener('submit', (e) => {
    e.preventDefault()
    const feld = e.target.querySelector('input')
    if (feld.value.trim()) oeffnen(feld.value.trim())
  })
}

// Luzzys Chat (Zentrale) im Crew-Tab zeigen (Gesprächs-Karte rechts, Strg+K, Klick auf den Untertitel)
export function luzzyChatZeigen() {
  modus = 'normal'
  gewaehlt.normal = LUZZY
  return wechseln()
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
