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
import { buehneEinrichten, buehneStarten, buehneAnstossen } from './buehne.js'

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
      if (!(h.crewSichtbar() && aktuellerKanal() === kanal) && fensterKanal !== kanal) h.fertigWoanders(bot, text) // im Bot-Fenster sieht Felix die Antwort ja
    }
  })
  gespraeche.set(kanal, eintrag)
  return eintrag
}

export const aktuellerKanal = () => {
  if (modus === 'buehne') return null
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
  botFensterEinrichten()
  neuerBotEinrichten()
  luzzyHilfeEinrichten()
  buehneEinrichten({
    sichtbar: () => h.crewSichtbar() && !document.hidden,
    buehneOffen: () => modus === 'buehne' && h.crewSichtbar(),
    botChatZeigen,
    buehneZeigen: () => {
      modus = 'buehne'
      h.crewOeffnen?.() // Crew-Bereich zeigen (app.js)
      return wechseln()
    }
  })
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
    if (modus === 'buehne') modus = 'botchat' // auf der Arbeitsbühne: Klick zeigt den Bot Chat des Bots
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
  $('crew-bots').hidden = true // Bot-Auswahl läuft über die Karten oben (der gewählte Bot ist dort hervorgehoben)
  kartenMarkieren()
  werZeigen() // Kopf links: Bild, Name, Rolle des gewählten Bots
  if (modus === 'buehne') {
    $('crew-chat-hinweis').textContent = 'Live: wer gerade woran arbeitet und was die Bots einander übergeben. Klick auf eine Zeile zeigt alles.'
    return
  }
  const liste = bots
  $('crew-bots').innerHTML = liste.length
    ? liste.map((b) => `<button class="crew-bot${b.profil === gewaehlt[modus] ? ' an' : ''}" data-bot="${maskieren(b.profil)}" type="button" title="Hermes-Profil: ${maskieren(b.profil)}">${maskieren(b.name)}${b.rolle ? `<small>${maskieren(b.rolle)}</small>` : ''}</button>`).join('')
    : '<span class="leise klein">Noch keine Bots außer Luzzy.</span>'
  const bot = botVon(gewaehlt[modus])
  $('crew-chat-hinweis').textContent = modus === 'normal'
    ? bot.profil === LUZZY ? 'Dein Gespräch mit Luzzy aus der Zentrale, ohne Bot Mode. Über „Allgemein ▾“ wechselst, erstellst und löschst du Chats.' : `Direktes Gespräch mit ${bot.name}, ohne Bot Mode. Über die Chat-Auswahl rechts wechselst, erstellst und löschst du Chats.`
    : bot.profil === LUZZY
      ? 'Luzzys Bot Chat: sie verteilt Aufträge an die Crew und bekommt die Ergebnisse zurück.'
      : `${bot.name}s Bot Chat: hier arbeiten die Bots zusammen (Übergaben wie Kira → Lira → Milla).`
  $('crew-form').querySelector('textarea').placeholder = modus === 'normal'
    ? `Nachricht an ${bot.name} …`
    : bot.profil === LUZZY ? 'Auftrag für die Crew, z. B. „Kira soll Trends für Herbst-Shirts suchen“ …' : `Nachricht in ${bot.name}s Bot Chat …`
}

// Karte des gewählten Bots oben hervorheben (nicht auf der Arbeitsbühne)
function kartenMarkieren() {
  const profil = modus === 'buehne' ? null : gewaehlt[modus]
  for (const k of document.querySelectorAll('#crew-karten article.bot[data-profil]')) k.classList.toggle('gewaehlt', k.dataset.profil === profil)
}
document.addEventListener('crew-karten-gezeichnet', kartenMarkieren) // Karten werden regelmäßig neu gezeichnet

// Gewählten Kanal sichtbar machen und (beim ersten Mal) bei Hermes öffnen
export async function wechseln() {
  merken()
  zeichnen()
  const buehne = modus === 'buehne'
  $('crew-buehne').hidden = !buehne
  $('crew-listen').hidden = buehne
  if (buehne) {
    for (const k of ['crew-form', 'luzzy-form', 'crew-thema-luzzy', 'crew-thema-bot']) if ($(k)) $(k).hidden = true
    return buehneStarten()
  }
  const kanal = aktuellerKanal()
  if (kanal && kanal === fensterKanal) botFensterSchliessen() // derselbe Chat jetzt groß im Crew-Tab
  for (const [k, g] of gespraeche) if (k !== fensterKanal) g.liste.hidden = k !== kanal // die Liste im Bot-Fenster bleibt sichtbar
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

// „Aktualisieren“: den gerade gezeigten Chat neu aus Hermes holen (z. B. nach Löschen in der Hermes-App)
export async function aktuellenChatNeuLaden() {
  const kanal = aktuellerKanal()
  if (!kanal) return
  const g = gespraech(kanal)
  if (g.unterhaltung?.beschaeftigt()) throw new Error('Antwort läuft noch')
  await h.api.hermes.kanalNeuLaden(kanal)
  g.geoeffnet = true
  if (kanal !== 'zentrale' && modus === 'normal') await chatListeLaden()
}

// Bot Chat eines Bots zeigen (von der Arbeitsbühne aus)
export function botChatZeigen(profil) {
  modus = 'botchat'
  gewaehlt.botchat = profil
  return wechseln()
}

// Crew-Bereich wird sichtbar: Arbeitsbühne/Karten live halten (auch wenn gerade ein Chat-Reiter offen ist)
export function crewSichtbarGeworden() {
  buehneStarten()
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
  // Übergaben und fertige Antworten: Arbeitsbühne sofort nachlesen
  if (ev.type === 'tool.start' || ev.type === 'tool.complete' || ev.type === 'message.complete') buehneAnstossen()
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

// ── Kleines Bot-Fenster (aus der Suchleiste der Zentrale): direkt mit einem Bot schreiben ──
// Es ist derselbe „Normale Chat“ wie im Crew-Tab: die Liste des Gesprächs wandert ins Fenster und beim Schließen zurück.
let fensterKanal = null
let fensterTakt = 0
export const crewBots = () => bots
export const botFensterOffen = () => fensterKanal

export async function botFensterOeffnen(profil) {
  if (!bots.length) await crewBotsLaden()
  if (!profil || profil === LUZZY) return false // Luzzy ist die Zentrale selbst
  const kanal = kanalFuer('normal', profil)
  if (fensterKanal && fensterKanal !== kanal) botFensterSchliessen()
  const g = gespraech(kanal)
  const bot = botVon(profil)
  const f = $('botfenster')
  f.querySelector('.bf-name').textContent = bot.name
  f.querySelector('.bf-rolle').textContent = bot.rolle || ''
  const bild = f.querySelector('.bf-bild')
  bild.textContent = bot.name.charAt(0)
  h.api.hermes.botBild(profil).then((b) => b?.bild && (bild.innerHTML = `<img src="${b.bild}" alt="" />`)).catch(() => {})
  f.querySelector('textarea').placeholder = `Nachricht an ${bot.name} …`
  f.querySelector('.bf-liste').appendChild(g.liste)
  g.liste.hidden = false
  fensterKanal = kanal
  f.dataset.profil = profil
  f.hidden = false
  f.querySelector('textarea').focus()
  clearInterval(fensterTakt)
  fensterTakt = setInterval(fensterKnopf, 400) // Senden ↔ Stopp, solange der Bot antwortet
  if (!g.geoeffnet) {
    g.geoeffnet = true
    try {
      await h.api.hermes.botOeffnen(kanal)
    } catch (e) {
      g.geoeffnet = false
      g.liste.insertAdjacentHTML('beforeend', `<div class="msg system">Konnte das Gespräch nicht öffnen: ${maskieren(e.message)}</div>`)
    }
  }
  g.liste.scrollTop = g.liste.scrollHeight
  return true
}

export function botFensterSchliessen() {
  if (!fensterKanal) return
  const g = gespraeche.get(fensterKanal)
  const kanal = fensterKanal
  fensterKanal = null
  clearInterval(fensterTakt)
  $('botfenster').hidden = true
  if (g) {
    $('crew-listen').appendChild(g.liste)
    g.liste.hidden = aktuellerKanal() !== kanal
  }
}

function fensterKnopf() {
  const g = fensterKanal && gespraeche.get(fensterKanal)
  if (!g) return
  const knopf = $('botfenster').querySelector('.bf-senden')
  const laeuft = g.unterhaltung.beschaeftigt()
  knopf.textContent = laeuft ? 'Stopp' : 'Senden'
  knopf.classList.toggle('stopp', laeuft)
}

function botFensterEinrichten() {
  const f = $('botfenster')
  if (!f) return
  const feld = f.querySelector('textarea')
  const abschicken = () => {
    const g = fensterKanal && gespraeche.get(fensterKanal)
    if (!g) return
    if (g.unterhaltung.beschaeftigt()) return h.api.hermes.abbrechen(fensterKanal)
    const text = feld.value.trim()
    if (!text) return
    feld.value = ''
    feld.style.height = 'auto'
    g.unterhaltung.senden(text)
    fensterKnopf()
  }
  f.querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault()
    abschicken()
  })
  feld.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      abschicken()
    }
    if (e.key === 'Escape') botFensterSchliessen()
  })
  feld.addEventListener('input', () => {
    feld.style.height = 'auto'
    feld.style.height = `${Math.min(feld.scrollHeight, 120)}px`
  })
  f.querySelector('.bf-zu').addEventListener('click', botFensterSchliessen)
  // Groß öffnen: derselbe Chat im Crew-Tab
  f.querySelector('.bf-gross').addEventListener('click', () => {
    const profil = f.dataset.profil
    botFensterSchliessen()
    modus = 'normal'
    gewaehlt.normal = profil
    h.crewOeffnen?.()
    wechseln()
  })
}

// ── Neuer Aufbau (links Chat, rechts Bots): Kopf mit dem gewählten Bot, „Bot finden …“, Netzwerk-Karte ──
const werBilder = {}
function werZeigen() {
  const bildEl = $('crew-wer-bild')
  if (!bildEl) return
  if (modus === 'buehne') {
    bildEl.textContent = '🎬'
    $('crew-wer-name').textContent = 'Arbeitsbühne'
    $('crew-wer-rolle').textContent = 'Live sehen, wie die Crew zusammenarbeitet'
    return
  }
  const bot = botVon(gewaehlt[modus])
  $('crew-wer-name').textContent = bot.name || 'Crew'
  $('crew-wer-rolle').textContent = [bot.rolle, modus === 'botchat' ? 'Bot Mode' : 'Normaler Chat'].filter(Boolean).join(' · ')
  const profil = bot.profil
  const zeigen = () => (werBilder[profil] ? (bildEl.innerHTML = `<img src="${werBilder[profil]}" alt="" />`) : (bildEl.textContent = (bot.name || '?').charAt(0)))
  zeigen()
  if (profil && !(profil in werBilder)) {
    werBilder[profil] = ''
    h.api?.hermes.botBild(profil).then((b) => {
      werBilder[profil] = b?.bild || ''
      if (botVon(gewaehlt[modus]).profil === profil && modus !== 'buehne') zeigen()
    }).catch(() => {})
  }
}

// Bot-Liste rechts filtern (die Karten werden regelmäßig neu gezeichnet: danach Filter wieder anwenden)
function crewFiltern() {
  const text = String($('crew-finden')?.value || '').trim().toLowerCase()
  for (const k of document.querySelectorAll('#crew-karten article.bot[data-profil]')) {
    k.hidden = Boolean(text) && !k.textContent.toLowerCase().includes(text) && !k.dataset.profil.includes(text)
  }
}

// Netzwerk-Karte unten rechts: wie viele Bots, wie viele arbeiten gerade
function netzZeigen() {
  const el = $('crew-netz')
  if (!el) return
  const karten = document.querySelectorAll('#crew-karten article.bot[data-profil]')
  const aktiv = document.querySelectorAll('#crew-karten article.bot.live-aktiv').length
  el.innerHTML = `<span class="ck-titel">Crew-Netzwerk</span><b>${karten.length} ${karten.length === 1 ? 'Agent' : 'Agenten'}. Ein Team.</b><small>${aktiv ? `● ${aktiv} ${aktiv === 1 ? 'arbeitet' : 'arbeiten'} gerade` : 'Alle bereit'}</small>`
}

document.addEventListener('crew-karten-gezeichnet', () => {
  crewFiltern()
  netzZeigen()
})
document.addEventListener('input', (e) => e.target.id === 'crew-finden' && crewFiltern())
// Live-Zustand der Karten (gold = arbeitet) ändert sich zwischendurch: Netzwerk-Karte mitziehen
const netzBeobachter = new MutationObserver(() => netzZeigen())
if (document.getElementById('crew-karten')) netzBeobachter.observe(document.getElementById('crew-karten'), { subtree: true, attributes: true, attributeFilter: ['class'] })

// ── Neuen Bot anlegen (Knopf „＋ Neuer Bot“ in der Bot-Liste): hermes profile create über den Hauptprozess (bots.js) ──
let nbBild = null
async function neuerBotOeffnen() {
  if (!bots.length) await crewBotsLaden()
  const d = $('neuer-bot')
  const f = $('neuer-bot-form')
  f.reset()
  nbBild = null
  $('nb-bild').innerHTML = '<span>＋ Bild</span>'
  $('nb-status').textContent = ''
  $('nb-prompt').hidden = true
  $('nb-prompt').innerHTML = ''
  f.aufgaben.rows = 5
  $('nb-id').textContent = 'Profil: –'
  $('nb-anlegen').disabled = false
  // Vorlage: am besten ein Crew-Bot (nicht Luzzy), damit Modell und Skills passen
  const vorlagen = [...bots.filter((b) => b.profil !== LUZZY), ...bots.filter((b) => b.profil === LUZZY)]
  $('nb-vorlage').innerHTML = vorlagen.map((b) => `<option value="${maskieren(b.profil)}">${maskieren(b.name)}${b.rolle ? ` (${maskieren(b.rolle)})` : ''}</option>`).join('')
  d.showModal()
  f.name.focus()
}

async function nbIdZeigen() {
  const f = $('neuer-bot-form')
  const id = f.name.value.trim() ? await h.api.hermes.profilId(f.name.value, f.rolle.value).catch(() => '') : ''
  $('nb-id').textContent = `Profil: ${id || '–'}`
}

function neuerBotEinrichten() {
  const f = $('neuer-bot-form')
  if (!f) return
  $('crew-neu-bot')?.addEventListener('click', neuerBotOeffnen)
  $('nb-abbrechen').addEventListener('click', () => $('neuer-bot').close())
  f.name.addEventListener('input', nbIdZeigen)
  f.rolle.addEventListener('input', nbIdZeigen)
  $('nb-bild').addEventListener('click', async () => {
    const pfad = await h.api.hermes.bildWaehlen().catch(() => null)
    if (!pfad) return
    nbBild = pfad
    $('nb-bild').innerHTML = `<span>✓ Bild</span><small>${maskieren(pfad.split(/[\\/]/).pop())}</small>`
  })
  f.addEventListener('submit', async (e) => {
    e.preventDefault()
    $('nb-anlegen').disabled = true
    $('nb-status').textContent = 'Hermes legt den Bot an … (kann einen Moment dauern)'
    try {
      const r = await h.api.hermes.botAnlegen({
        name: f.name.value, rolle: f.rolle.value, beschreibung: f.beschreibung.value, aufgaben: f.aufgaben.value,
        // Beginnt mit „Du bist …“: das ist eine fertige SOUL (von Luzzy oder selbst geschrieben) und wird genau so gespeichert
        soulKomplett: /^\s*Du bist\b/.test(f.aufgaben.value) && f.aufgaben.value.trim().length > 200,
        vorlage: f.vorlage.value, bild: nbBild, andere: bots.map((b) => ({ profil: b.profil, name: b.name, rolle: b.rolle }))
      })
      $('neuer-bot').close()
      await crewBotsLaden()
      document.querySelector('[data-neu-laden="crew"]')?.click() // Karten rechts neu zeichnen
      // gleich den Chat mit dem neuen Bot öffnen
      modus = 'normal'
      gewaehlt.normal = r.id
      wechseln()
    } catch (err) {
      $('nb-status').textContent = `Hat nicht geklappt: ${String(err.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
      $('nb-anlegen').disabled = false
    }
  })
}

// ── Luzzy hilft beim neuen Bot: SOUL.md schreiben, Bild-Prompt im Stil von Kira, Lira und Milla ──
// (Anleitung: ihr Hermes-Skill jarves-bot-erstellen; läuft als einmalige Anfrage, nicht in ihrem Chat)
function nbDaten() {
  const f = $('neuer-bot-form')
  return { name: f.name.value, rolle: f.rolle.value, beschreibung: f.beschreibung.value, aufgaben: f.aufgaben.value, andere: bots.map((b) => ({ profil: b.profil, name: b.name, rolle: b.rolle })) }
}
const fehlerText = (err) => String(err?.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')

// Luzzys Antwort mit Codeblöcken: jeden Block mit eigenem „Kopieren“-Knopf zeigen
function promptZeigen(text) {
  const el = $('nb-prompt')
  const teile = []
  let rest = text
  const block = /```[a-z]*\n?([\s\S]*?)```/g
  let m
  let zuletzt = 0
  while ((m = block.exec(text))) {
    const davor = text.slice(zuletzt, m.index).replace(/\*\*/g, '').trim()
    if (davor) teile.push(`<div class="nb-prompt-text">${maskieren(davor)}</div>`)
    teile.push(`<div class="nb-prompt-block"><pre>${maskieren(m[1].trim())}</pre><button class="knopf-mini" type="button" data-kopieren="${teile.length}">Kopieren</button></div>`)
    zuletzt = block.lastIndex
  }
  rest = text.slice(zuletzt).replace(/\*\*/g, '').trim()
  if (rest) teile.push(`<div class="nb-prompt-text">${maskieren(rest)}</div>`)
  el.innerHTML = teile.join('')
  el.hidden = false
}

function luzzyHilfeEinrichten() {
  const f = $('neuer-bot-form')
  if (!f || !$('nb-soul')) return
  $('nb-soul').addEventListener('click', async () => {
    if (!f.name.value.trim()) return ($('nb-status').textContent = 'Bitte erst den Namen eintragen.')
    const knopf = $('nb-soul')
    knopf.disabled = true
    knopf.textContent = '✨ Luzzy schreibt …'
    $('nb-status').textContent = 'Luzzy schreibt die SOUL.md. Das dauert meist 20 bis 60 Sekunden.'
    try {
      const soul = await h.api.hermes.luzzyHilft('soul', nbDaten())
      f.aufgaben.value = soul
      f.aufgaben.rows = 14
      $('nb-status').textContent = '✓ Luzzy hat die SOUL.md geschrieben. Lies drüber und ändere, was nicht passt – gespeichert wird sie genau so.'
    } catch (err) {
      $('nb-status').textContent = `Luzzy konnte die SOUL nicht schreiben: ${fehlerText(err)}`
    } finally {
      knopf.disabled = false
      knopf.textContent = '✨ Luzzy schreibt die SOUL'
    }
  })
  $('nb-prompt-knopf').addEventListener('click', async () => {
    if (!f.name.value.trim()) return ($('nb-status').textContent = 'Bitte erst den Namen eintragen.')
    const knopf = $('nb-prompt-knopf')
    knopf.disabled = true
    knopf.textContent = '🎨 Luzzy überlegt …'
    try {
      promptZeigen(await h.api.hermes.luzzyHilft('bild', nbDaten()))
      $('nb-status').textContent = 'Prompt kopieren, Bild erzeugen, dann oben links mit „＋ Bild“ auswählen.'
    } catch (err) {
      $('nb-status').textContent = `Luzzy konnte keinen Prompt schreiben: ${fehlerText(err)}`
    } finally {
      knopf.disabled = false
      knopf.textContent = '🎨 Bild-Prompt von Luzzy'
    }
  })
  $('nb-prompt').addEventListener('click', (e) => {
    const k = e.target.closest('[data-kopieren]')
    if (!k) return
    navigator.clipboard.writeText(k.previousElementSibling.textContent).then(() => {
      k.textContent = '✓ Kopiert'
      setTimeout(() => (k.textContent = 'Kopieren'), 1500)
    }).catch(() => {})
  })
}
