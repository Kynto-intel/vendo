// Crew-Arbeitsbühne (#38): live sehen, wie die Bots zusammenarbeiten.
//   • Bot-Karten oben: wer arbeitet (gold, mit Werkzeug und Zeit), wer fertig ist (grün, Ergebnis kurz), wer wartet
//   • Reiter „🎬 Arbeitsbühne“: Kette Luzzy → Kira → Lira → Milla, ein Brief wandert bei jeder Übergabe,
//     darunter der Ablauf des Auftrags (Klick: ganzer Auftrag und Antwort, „Im Bot Mode öffnen“)
// Datenquelle: die „Bot Chat“-Unterhaltungen der Bots bei Hermes. Jede Übergabe (message_agent) landet dort als
// „Message from 🤖 Kira (@kira-…): …“, die Antwort des Bots steht direkt danach. Jarves-OS liest nur mit (REST),
// solange der Crew-Bereich offen ist; ein Werkzeug-Ereignis in Luzzys Bot Chat stößt sofort ein Nachlesen an.

import { crewProfile, botName, LUZZY } from './ansichten.js'

const api = window.jarves
const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const BOT_CHAT = 'bot chat'
const VON = /^\s*Message from\s+(?:🤖\s*)?(.+?)\s+\(@([\w.-]+)\):\s*([\s\S]*)$/i
// Benachrichtigungen von Hermes (Antwort eines Bots kommt zurück) sind keine Aufträge von Felix
const HINWEIS = /^\s*\[(?:system|background|notification|process|hinweis)|background process|process (?:completed|finished|exited)|exit code|^\s*<(?:system|notification)/i

// ── Hermes-Zeilen vereinheitlichen ──
function zeitMs(w) {
  if (w == null || w === '') return 0
  if (typeof w === 'number') return w < 1e12 ? w * 1000 : w
  const d = Date.parse(w)
  return Number.isNaN(d) ? 0 : d
}
function textVon(m) {
  const c = m.display_content ?? m.content
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map((t) => (typeof t === 'string' ? t : t?.text || '')).join('')
  return ''
}
export function zeile(m = {}) {
  const werkzeuge = (Array.isArray(m.tool_calls) ? m.tool_calls : []).map((c) => c?.function?.name || c?.name).filter(Boolean)
  if (m.tool_name) werkzeuge.push(m.tool_name)
  return { rolle: m.role, text: textVon(m), zeit: zeitMs(m.timestamp ?? m.created_at ?? m.time), werkzeuge, versteckt: m.display_kind === 'hidden' }
}

const kurz = (t, n = 60) => {
  const s = String(t || '').replace(/[#*_`>]/g, '').replace(/\s+/g, ' ').trim()
  return s.length > n ? `${s.slice(0, n - 1)}…` : s
}

// ── Modell: aus den Bot Chats aller Bots den Ablauf eines Auftrags bauen (reine Funktion, testbar) ──
// bots: [{ profil, name, rolle }], Luzzy zuerst. protokolle: { [profil]: { zeilen: [zeile], aktivZeit } }
export function buehneModell(bots, protokolle, { auftrag = -1, jetzt = Date.now() } = {}) {
  const botZu = (handle, anzeige) =>
    bots.find((b) => b.profil.toLowerCase() === String(handle).toLowerCase()) ||
    bots.find((b) => b.name.toLowerCase() === String(anzeige || handle).toLowerCase()) || { profil: handle, name: anzeige || handle, fremd: true }

  // Übergaben: in jedem Bot Chat die „Message from …“-Zeilen, mit der Antwort des Bots dahinter
  const uebergaben = []
  for (const b of bots) {
    const zeilen = protokolle[b.profil]?.zeilen || []
    for (let i = 0; i < zeilen.length; i++) {
      const z = zeilen[i]
      if (z.rolle !== 'user') continue
      const t = VON.exec(z.text)
      if (!t) continue
      let antwort = ''
      let fertigZeit = 0
      const werkzeuge = []
      for (let j = i + 1; j < zeilen.length && zeilen[j].rolle !== 'user'; j++) {
        werkzeuge.push(...zeilen[j].werkzeuge.filter((w) => w !== 'message_agent'))
        if (zeilen[j].werkzeuge.includes('message_agent')) werkzeuge.push('Übergabe')
        if (zeilen[j].rolle === 'assistant' && zeilen[j].text.trim() && !zeilen[j].werkzeuge.length) {
          antwort = zeilen[j].text
          fertigZeit = zeilen[j].zeit
        }
      }
      uebergaben.push({ von: botZu(t[2], t[1]), an: b, text: t[3].trim(), zeit: z.zeit, antwort, fertigZeit, werkzeuge, fertig: Boolean(antwort) })
    }
  }

  // Aufträge: Felix' Nachrichten in Luzzys Bot Chat
  const luzzy = protokolle[LUZZY]?.zeilen || []
  const auftraege = luzzy
    .map((z, i) => ({ z, i }))
    .filter(({ z }) => z.rolle === 'user' && z.text.trim() && !VON.test(z.text) && !HINWEIS.test(z.text) && !z.versteckt)
  if (!auftraege.length) return { leer: true, anzahl: 0, uebergaben }
  const nr = auftrag < 0 ? auftraege.length - 1 : Math.min(auftrag, auftraege.length - 1)
  const start = auftraege[nr].z.zeit
  const ende = auftraege[nr + 1]?.z.zeit || Infinity
  const imAuftrag = uebergaben.filter((u) => u.zeit >= start - 2000 && u.zeit < ende).sort((a, b) => a.zeit - b.zeit)

  // Luzzys Schlusswort: ihre letzte Antwort im Auftrag, nachdem alle Übergaben zurück sind
  const offen = imAuftrag.filter((u) => !u.fertig)
  let schluss = null
  for (let i = auftraege[nr].i + 1; i < luzzy.length && (auftraege[nr + 1] ? i < auftraege[nr + 1].i : true); i++) {
    const z = luzzy[i]
    if (z.rolle === 'assistant' && z.text.trim() && !z.werkzeuge.length) schluss = z
  }
  const letzteRueckgabe = Math.max(0, ...imAuftrag.map((u) => u.fertigZeit || 0))
  const fertig = !offen.length && schluss && schluss.zeit >= letzteRueckgabe
  const endeZeit = fertig ? schluss.zeit : jetzt

  // Stationen: Luzzy + alle Bots
  const stationen = bots.map((b) => {
    const an = imAuftrag.filter((u) => u.an.profil === b.profil)
    const aktivGerade = protokolle[b.profil]?.aktivZeit && jetzt - protokolle[b.profil].aktivZeit < 20000
    if (b.profil === LUZZY) {
      if (fertig) return { ...b, zustand: 'fertig', was: 'hat berichtet' }
      // Solange irgendein Bot noch arbeitet, wartet Luzzy (auf den, der gerade dran ist)
      const wartetAuf = [...offen].reverse()[0]
      if (wartetAuf) return { ...b, zustand: 'wartet', was: `wartet auf ${wartetAuf.an.name}` }
      return { ...b, zustand: 'aktiv', was: imAuftrag.length ? 'fasst zusammen' : 'plant den Auftrag' }
    }
    const laeuft = an.find((u) => !u.fertig)
    if (laeuft) {
      const werkzeug = laeuft.werkzeuge.at(-1) || ''
      return { ...b, zustand: 'aktiv', was: werkzeug === 'Übergabe' ? 'gibt weiter' : 'arbeitet', werkzeug: werkzeug === 'Übergabe' ? '' : werkzeug, seit: laeuft.zeit }
    }
    if (an.length) return { ...b, zustand: 'fertig', was: kurz(an.at(-1).antwort.split('\n')[0], 34), dauer: an.at(-1).fertigZeit - an.at(-1).zeit }
    if (aktivGerade) return { ...b, zustand: 'aktiv', was: 'arbeitet' }
    const vorher = [...offen].reverse().find((u) => u.an.profil !== b.profil)
    return { ...b, zustand: 'wartet', was: vorher && !fertig ? `wartet auf ${vorher.an.name}` : 'wartet' }
  })

  // Brief: die jüngste noch offene Übergabe (unterwegs), sonst eine Antwort, die gerade zurückkam
  const unterwegs = [...offen].reverse()[0]
  const zurueck = !unterwegs && !fertig && imAuftrag.filter((u) => u.fertig && jetzt - u.fertigZeit < 8000).at(-1)
  const brief = unterwegs
    ? { von: unterwegs.von.profil, an: unterwegs.an.profil, text: kurz(unterwegs.text, 18) }
    : zurueck
      ? { von: zurueck.an.profil, an: zurueck.von.profil, text: '✓ Antwort' }
      : null

  return {
    leer: false,
    anzahl: auftraege.length,
    nr,
    titel: kurz(auftraege[nr].z.text, 48),
    start,
    dauer: Math.max(0, endeZeit - start),
    fertig: Boolean(fertig),
    zeilen: [
      { von: { name: 'Felix', profil: 'felix' }, an: bots[0], text: auftraege[nr].z.text, zeit: start, antwort: schluss?.text || '', fertig: Boolean(fertig) },
      ...imAuftrag
    ],
    stationen,
    brief
  }
}

// ── Mitlesen bei Hermes ──
let bots = []
const sitzung = {} // profil → { id, zeit }
const protokolle = {}
let auftragWahl = -1 // -1: der neueste
let uhr = 0
let laeuft = false
let offeneZeile = null
let h = { botChatZeigen: () => {}, sichtbar: () => false, buehneOffen: () => false }

async function sitzungFinden(profil) {
  const s = sitzung[profil]
  if (s && Date.now() - s.zeit < 60000) return s.id
  const d = await api.hermes.lesen(`/api/sessions?profile=${encodeURIComponent(profil)}&order=recent&limit=30`).catch(() => null)
  const bc = (d?.sessions || []).find((x) => String(x.title || '').trim().toLowerCase() === BOT_CHAT)
  sitzung[profil] = { id: bc ? bc.resolved_id || bc.id : null, zeit: Date.now(), aktiv: zeitMs(bc?.last_active || bc?.updated_at) }
  return sitzung[profil].id
}

async function nachlesen() {
  if (laeuft) return
  laeuft = true
  try {
    const d = await api.hermes.lesen('/api/profiles').catch(() => null)
    if (d?.profiles) bots = crewProfile(d.profiles).map((p) => ({ profil: p.name, ...botName(p) }))
    await Promise.all(
      bots.map(async (b) => {
        const id = await sitzungFinden(b.profil)
        if (!id) return (protokolle[b.profil] = { zeilen: [] })
        const m = await api.hermes.lesen(`/api/sessions/${encodeURIComponent(id)}/messages?profile=${encodeURIComponent(b.profil)}&limit=150&order=latest`).catch(() => null)
        const zeilen = (m?.messages || []).map(zeile)
        const letzte = zeilen.at(-1)
        // „gerade aktiv“: die letzte Zeile ist frisch und noch keine fertige Antwort
        const aktivZeit = letzte && !(letzte.rolle === 'assistant' && !letzte.werkzeuge.length) ? letzte.zeit : 0
        protokolle[b.profil] = { zeilen, aktivZeit }
      })
    )
    zeichnen()
  } finally {
    laeuft = false
  }
}

function planen() {
  clearTimeout(uhr)
  if (!h.sichtbar()) return
  const modell = bots.length ? buehneModell(bots, protokolle, { auftrag: auftragWahl }) : null
  const aktiv = modell && !modell.leer && !modell.fertig
  uhr = setTimeout(async () => {
    await nachlesen()
    planen()
  }, aktiv ? 2500 : 5000)
}

// Von außen: Crew-Bereich geöffnet/geschlossen, Werkzeug-Ereignis (sofort nachlesen)
export async function buehneStarten() {
  await nachlesen()
  planen()
}
export function buehneAnstossen() {
  if (!h.sichtbar()) return
  nachlesen().then(planen)
}

// ── Zeichnen ──
const dauerText = (ms) => {
  const s = Math.max(0, Math.round(ms / 1000))
  return s < 60 ? `${s} Sek.` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')} Min.`
}
const uhrzeit = (ms) => (ms ? new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '–')

function zeichnen() {
  const modell = bots.length ? buehneModell(bots, protokolle, { auftrag: auftragWahl }) : { leer: true }
  kartenZeichnen(modell)
  if (!h.buehneOffen()) return
  const el = $('crew-buehne')
  if (modell.leer) {
    el.innerHTML = `<div class="bue-leer">Noch kein Crew-Auftrag.<br />Gib Luzzy im <b>🤖 Bot Mode</b> einen Auftrag, zum Beispiel „Kira soll Trends für Herbst-Shirts suchen und an Lira geben“.<br />Hier siehst du dann live, wie die Bots zusammenarbeiten.</div>`
    return
  }
  const n = modell.stationen.length
  const pos = (profil) => {
    const i = modell.stationen.findIndex((s) => s.profil === profil)
    return i < 0 ? null : ((i + 0.5) / n) * 100
  }
  // Linien: je Übergabe ein Stück, fertig grün, offen gold
  const stuecke = modell.zeilen
    .slice(1)
    .map((u) => ({ a: pos(u.von.profil), b: pos(u.an.profil), fertig: u.fertig }))
    .filter((s) => s.a != null && s.b != null)
    .map((s) => `<div class="bue-stueck${s.fertig ? ' fertig' : ' offen'}" style="left:${Math.min(s.a, s.b)}%;width:${Math.abs(s.b - s.a)}%"></div>`)
    .join('')
  const brief = modell.brief && pos(modell.brief.von) != null && pos(modell.brief.an) != null
    ? `<div class="bue-brief" style="--von:${pos(modell.brief.von)}%;--an:${pos(modell.brief.an)}%">✉ ${maskieren(modell.brief.text)}</div>`
    : ''
  const station = (s) => `
    <div class="bue-station ${s.zustand}" data-profil="${maskieren(s.profil)}" title="${maskieren(s.name)}: ${maskieren(s.was)}">
      <div class="bue-kreis">${maskieren(s.name.charAt(0))}</div>
      <b>${maskieren(s.name)}</b>
      <div class="bue-was">${s.zustand === 'fertig' ? '✓ ' : ''}${maskieren(s.was)}${s.dauer ? `<br /><small>${dauerText(s.dauer)}</small>` : ''}${s.seit ? `<br /><small>seit ${dauerText(Date.now() - s.seit)}</small>` : ''}</div>
      ${s.werkzeug ? `<span class="bue-werkzeug">⚙ ${maskieren(s.werkzeug)}</span>` : ''}
    </div>`
  const zeile = (u, i) => {
    const auf = offeneZeile === i
    const chip = u.fertig ? '<span class="bue-chip ok">✓ fertig</span>' : '<span class="bue-chip laeuft">● läuft</span>'
    return `
    <div class="bue-zeile${auf ? ' auf' : ''}" data-nr="${i}" tabindex="0">
      <time>${uhrzeit(u.zeit)}</time>
      <div class="bue-von">${maskieren(u.von.name)} <i>→</i> ${maskieren(u.an.name)}</div>
      <p>${maskieren(kurz(u.text, 140))}</p>${chip}
      ${auf ? `<div class="bue-detail"><b>Auftrag:</b><div class="bue-text">${maskieren(u.text)}</div><b>Antwort:</b><div class="bue-text">${u.antwort ? maskieren(u.antwort) : 'kommt gleich …'}</div>
        ${u.an.fremd ? '' : `<button class="knopf-flach" data-botchat="${maskieren(u.an.profil)}" type="button">${maskieren(u.an.name)}s Bot Chat öffnen</button>`}</div>` : ''}
    </div>`
  }
  el.innerHTML = `
    <div class="bue-kette" style="--anzahl:${n}">
      <div class="bue-linie" style="left:${50 / n}%;right:${50 / n}%"></div>${stuecke}${brief}
      ${modell.stationen.map(station).join('')}
    </div>
    <div class="bue-kopf">
      <span>Ablauf · Auftrag „${maskieren(modell.titel)}“</span>
      <span>${modell.anzahl > 1 ? `<button class="bue-blaettern" data-auftrag="-1" type="button" ${modell.nr === 0 ? 'disabled' : ''} title="Früherer Auftrag">‹</button> ${modell.nr + 1}/${modell.anzahl} <button class="bue-blaettern" data-auftrag="1" type="button" ${modell.nr === modell.anzahl - 1 ? 'disabled' : ''} title="Späterer Auftrag">›</button> · ` : ''}seit ${uhrzeit(modell.start)} · ${dauerText(modell.dauer)}${modell.fertig ? ' · ✓ fertig' : ''}</span>
    </div>
    <div class="bue-ablauf">${modell.zeilen.map(zeile).join('')}</div>
    <div class="bue-fuss">Klick auf eine Zeile: ganzer Auftrag und Antwort. Jarves liest die Bot Chats nur mit, geändert wird nichts.</div>`
}

// Bot-Karten oben: Live-Zeile statt „vor x Min.“, gold = arbeitet, grün = fertig
function kartenZeichnen(modell) {
  const stationen = modell?.stationen || []
  for (const karte of document.querySelectorAll('#crew-karten article.bot[data-profil]')) {
    const s = stationen.find((x) => x.profil === karte.dataset.profil)
    karte.classList.toggle('live-aktiv', s?.zustand === 'aktiv' && !modell.fertig)
    karte.classList.toggle('live-fertig', s?.zustand === 'fertig')
    let live = karte.querySelector('.bot-live')
    if (!s || modell.leer || (modell.fertig && Date.now() - modell.start - modell.dauer > 10 * 60 * 1000)) {
      live?.remove() // nichts los (oder Auftrag lange fertig): die normale Zeile „vor x Min.“ bleibt
      continue
    }
    if (!live) {
      live = document.createElement('div')
      live.className = 'bot-live'
      karte.querySelector('.bot-info')?.appendChild(live)
    }
    live.textContent = `${s.zustand === 'aktiv' ? '● ' : s.zustand === 'fertig' ? '✓ ' : ''}${s.was}${s.seit ? ` · ${dauerText(Date.now() - s.seit)}` : ''}`
  }
}

export function buehneEinrichten(helfer) {
  h = { ...h, ...helfer }
  // Karten werden alle 15 s neu gezeichnet: Live-Zeile gleich wieder drauf
  document.addEventListener('crew-karten-gezeichnet', () => kartenZeichnen(bots.length ? buehneModell(bots, protokolle, { auftrag: auftragWahl }) : null))
  $('crew-buehne').addEventListener('click', (e) => {
    const bc = e.target.closest('[data-botchat]')
    if (bc) return h.botChatZeigen(bc.dataset.botchat)
    const blaettern = e.target.closest('[data-auftrag]')
    if (blaettern) {
      const modell = buehneModell(bots, protokolle, { auftrag: auftragWahl })
      const neu = modell.nr + Number(blaettern.dataset.auftrag)
      auftragWahl = neu >= modell.anzahl - 1 ? -1 : Math.max(0, neu)
      offeneZeile = null
      return zeichnen()
    }
    const z = e.target.closest('.bue-zeile')
    if (!z || e.target.closest('.bue-detail')) return
    offeneZeile = offeneZeile === Number(z.dataset.nr) ? null : Number(z.dataset.nr)
    zeichnen()
  })
  $('crew-buehne').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.classList.contains('bue-zeile') && e.target.click())
}
