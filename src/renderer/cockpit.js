// Cockpit in der Zentrale: auf einen Blick sehen, was los ist.
//   • Instrumente: Erfolgsquote der Agenten · Aufträge (Mission Control) · Ø Bearbeitungszeit · Systemstatus, CPU, RAM, Platte
//   • Agenten-Orchestrierung: Luzzy (Chefin) oben, darunter die 5 aktivsten Bots (Klick: kleines Chat-Fenster)
// Zahlen, ehrlich aus Hermes berechnet (30 Tage, alle Agenten):
//   Auftrag = eine Nachricht an einen Agenten (von Felix oder einem anderen Bot). Erfolgreich, wenn danach eine fertige
//   Antwort kommt (finish_reason „stop“); gescheitert, wenn keine kommt (nächster Auftrag kam trotzdem, oder > 15 Min.).
//   Bearbeitungszeit = Auftrag bis fertige Antwort. Hermes selbst führt keine Erfolgsquote.

import { crewProfile, botName, LUZZY } from './ansichten.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const TAG = 24 * 3600 * 1000
const ZEITRAUM = 30 * TAG
const HAENGT = 15 * 60 * 1000
// Hinweise von Hermes (Hintergrundprozess fertig …) sind keine Aufträge
const HINWEIS = /^\s*\[(?:important|system|background|notification|process|hinweis)|background process|^\s*<(?:system|notification)/i

let h = { api: null, verbunden: () => false, botFenster: () => {}, crewOeffnen: () => {}, zentraleSichtbar: () => true }
const nachrichtenCache = new Map() // sitzung → { stand, nachrichten }
const bilder = {}
let stand = null
let system = null
let laeuft = false
let uhr = 0
let anstoss = 0

const ms = (t) => (!t ? 0 : typeof t === 'number' ? (t < 1e12 ? t * 1000 : t) : Date.parse(t) || 0)
const textVon = (m) => (typeof m.content === 'string' ? m.content : Array.isArray(m.content) ? m.content.map((c) => c?.text || '').join('') : '')
const dauerText = (d) => {
  if (!d) return '–'
  const s = d / 1000
  return s < 60 ? `${s.toFixed(1).replace('.', ',')} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')} Min.`
}
const tagText = (t) => {
  const d = new Date(t)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Aufträge aus einem Verlauf ──
function auftraegeAus(nachrichten, jetzt) {
  const z = nachrichten.filter((m) => m.role === 'user' || m.role === 'assistant')
  const liste = []
  for (let i = 0; i < z.length; i++) {
    const m = z[i]
    if (m.role !== 'user' || m.display_kind === 'hidden') continue
    const text = textVon(m).trim()
    if (!text || HINWEIS.test(text)) continue
    const start = ms(m.timestamp)
    let ende = 0
    let naechster = false
    for (let j = i + 1; j < z.length; j++) {
      if (z[j].role === 'user' && !HINWEIS.test(textVon(z[j]))) {
        naechster = true
        break
      }
      if (z[j].role === 'assistant' && z[j].finish_reason === 'stop' && textVon(z[j]).trim()) ende = ms(z[j].timestamp)
    }
    const ergebnis = ende ? 'ok' : naechster || jetzt - start > HAENGT ? 'fehler' : 'laeuft'
    liste.push({ start, ende, ergebnis, dauer: ende ? Math.max(0, ende - start) : 0 })
  }
  return liste
}

// ── Nachlesen bei Hermes (Verläufe nur neu holen, wenn sich die Sitzung geändert hat) ──
async function nachlesen() {
  if (laeuft || !h.verbunden()) return
  laeuft = true
  try {
    const jetzt = Date.now()
    const profile = crewProfile((await h.api.hermes.lesen('/api/profiles').catch(() => null))?.profiles || [])
    if (!profile.length) return
    const agenten = await Promise.all(
      profile.map(async (p) => {
        const liste = (await h.api.hermes.lesen(`/api/sessions?profile=${encodeURIComponent(p.name)}&limit=40&order=recent`).catch(() => null))?.sessions || []
        // Der „Bot Chat“ ist bei Hermes versteckt und fehlt in /api/sessions: über den Titel dazuholen
        for (const b of await h.api.hermes.sitzungenMitTitel('Bot Chat', p.name).catch(() => [])) {
          if (b.id && !liste.some((s) => s.id === b.id)) liste.push({ id: b.id, last_active: b.zuletzt, message_count: -1 })
        }
        // nach Aktivität filtern, nicht nach message_count: den meldet Hermes für Luzzys offene Chats oft als 0
        const sitzungen = liste.filter((s) => jetzt - ms(s.last_active || s.last_activity_at || s.started_at) < ZEITRAUM)
        const auftraege = []
        for (const s of sitzungen) {
          const id = s.id
          const sStand = `${s.last_active}|${s.message_count}`
          let c = nachrichtenCache.get(id)
          if (!c || c.stand !== sStand) {
            const d = await h.api.hermes.lesen(`/api/sessions/${encodeURIComponent(id)}/messages?profile=${encodeURIComponent(p.name)}&limit=600&order=latest`).catch(() => null)
            if (!d) continue
            c = { stand: sStand, nachrichten: d.messages || [] }
            nachrichtenCache.set(id, c)
          }
          auftraege.push(...auftraegeAus(c.nachrichten, jetzt).filter((a) => jetzt - a.start < ZEITRAUM))
        }
        const heute = auftraege.filter((a) => jetzt - a.start < TAG)
        const fertig = auftraege.filter((a) => a.ergebnis === 'ok')
        return {
          profil: p.name,
          ...botName(p),
          auftraege,
          anzahl: auftraege.length,
          heute: heute.length,
          ok: fertig.length,
          fehler: auftraege.filter((a) => a.ergebnis === 'fehler').length,
          arbeitet: auftraege.some((a) => a.ergebnis === 'laeuft'),
          schnitt: fertig.length ? fertig.reduce((s, a) => s + a.dauer, 0) / fertig.length : 0,
          sitzungen: sitzungen.length
        }
      })
    )
    const alle = agenten.flatMap((a) => a.auftraege)
    const fertig = alle.filter((a) => a.ergebnis === 'ok')
    const bewertet = alle.filter((a) => a.ergebnis !== 'laeuft')
    // Verlauf der letzten 14 Tage (Erfolgsquote und Ø Zeit pro Tag)
    const verlauf = []
    for (let i = 13; i >= 0; i--) {
      const tag = tagText(jetzt - i * TAG)
      const amTag = alle.filter((a) => tagText(a.start) === tag)
      const b = amTag.filter((a) => a.ergebnis !== 'laeuft')
      const f = amTag.filter((a) => a.ergebnis === 'ok')
      verlauf.push({ quote: b.length ? f.length / b.length : null, zeit: f.length ? f.reduce((s, a) => s + a.dauer, 0) / f.length : null })
    }
    stand = {
      anzahl: alle.length,
      quote: bewertet.length ? fertig.length / bewertet.length : null,
      ok: fertig.length,
      bewertet: bewertet.length,
      fehlerHeute: alle.filter((a) => a.ergebnis === 'fehler' && jetzt - a.start < TAG).length,
      schnitt: fertig.length ? fertig.reduce((s, a) => s + a.dauer, 0) / fertig.length : 0,
      verlauf,
      agenten
    }
  } finally {
    laeuft = false
  }
}

async function systemLesen() {
  const [werte, details, verbindungen] = await Promise.all([
    h.api.system.werte().catch(() => null),
    h.api.system.details().catch(() => null),
    h.api.waechter.verbindungen().catch(() => ({}))
  ])
  const platte = details?.platten?.find((p) => /^c/i.test(p.name)) || details?.platten?.[0]
  const probleme = Object.entries(verbindungen || {}).filter(([, v]) => v && v.ok === false).map(([q]) => ({ shopify: 'Shopify', mail: 'Postfach', jobs: 'Jobs' })[q] || q)
  system = {
    cpu: werte?.cpu ?? null,
    ram: werte ? Math.round((werte.ramBelegt / werte.ramGesamt) * 100) : null,
    platte: platte ? Math.round((platte.belegt / (platte.belegt + platte.frei)) * 100) : null,
    probleme
  }
}

// ── Zeichnen ──
function linie(werte) {
  const punkte = werte.map((w, i) => ({ i, w })).filter((p) => p.w != null)
  if (punkte.length < 2) return '<svg class="ck-linie" viewBox="0 0 140 34"><line x1="0" y1="30" x2="140" y2="30" class="leer" /></svg>'
  const max = Math.max(...punkte.map((p) => p.w))
  const min = Math.min(...punkte.map((p) => p.w))
  const y = (w) => (max === min ? 17 : 30 - ((w - min) / (max - min)) * 26)
  const pfad = punkte.map((p) => `${Math.round((p.i / (werte.length - 1)) * 140)},${y(p.w).toFixed(1)}`).join(' ')
  return `<svg class="ck-linie" viewBox="0 0 140 34" preserveAspectRatio="none"><polyline points="${pfad}" /></svg>`
}

function statusVon() {
  if (!h.verbunden()) return { stufe: 'gestoert', text: 'Hermes getrennt' }
  const p = system?.probleme || []
  if (p.length) return { stufe: 'eingeschraenkt', text: `${p.join(', ')} nicht erreichbar` }
  if (stand?.fehlerHeute) return { stufe: 'eingeschraenkt', text: `${stand.fehlerHeute} Auftrag${stand.fehlerHeute === 1 ? '' : 'e'} heute gescheitert` }
  return { stufe: 'optimal', text: 'Optimal' }
}

function balken(name, wert, text) {
  const w = wert == null ? 0 : Math.max(0, Math.min(100, wert))
  return `<div class="ck-zelle"><div class="ck-zelle-kopf"><span>${name}</span><b>${text ?? (wert == null ? '–' : `${w} %`)}</b></div><div class="ck-balken${w >= 90 ? ' voll' : ''}"><div style="width:${w}%"></div></div></div>`
}

function bildVon(profil) {
  if (!(profil in bilder)) {
    bilder[profil] = ''
    h.api.hermes.botBild(profil).then((b) => {
      if (!b?.bild) return
      bilder[profil] = b.bild
      zeichnen()
    }).catch(() => {})
  }
  return bilder[profil]
}
const avatar = (a) => {
  const b = bildVon(a.profil)
  return `<span class="ck-avatar${a.arbeitet ? ' aktiv' : ''}">${b ? `<img src="${b}" alt="" />` : maskieren(a.name.charAt(0))}</span>`
}

function ring(anteil) {
  const u = 2 * Math.PI * 15
  const teil = Math.max(0, Math.min(1, anteil)) * u
  return `<svg class="ck-ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" class="spur" /><circle cx="18" cy="18" r="15" class="wert" stroke-dasharray="${teil.toFixed(1)} ${u.toFixed(1)}" /></svg><span class="ck-ring-zahl">${Math.round(anteil * 100)}%</span>`
}

export function zeichnen() {
  const el = $('cockpit')
  if (!el || el.hidden) return
  const st = statusVon()
  const s = stand
  const quote = s?.quote == null ? '–' : `${Math.round(s.quote * 100)}%`
  el.innerHTML = `
    <div class="ck-instrumente">
      <div class="ck-fluegel links">
        <span class="ck-titel">Erfolgsquote</span>
        <b class="ck-gross">${quote}</b>
        <small>${s ? `${s.ok} von ${s.bewertet} Aufträgen · 30 Tage` : 'wird berechnet …'}</small>
        ${linie(s?.verlauf.map((v) => v.quote) || [])}
      </div>
      <div class="ck-mitte" title="Aufträge an Luzzy und die Crew in den letzten 30 Tagen">
        <svg class="ck-kreis" viewBox="0 0 200 200"><circle cx="100" cy="100" r="92" class="aussen" /><circle cx="100" cy="100" r="80" class="punkte" /></svg>
        <span class="ck-titel">Mission Control</span>
        <b class="ck-zahl">${s ? s.anzahl : '…'}</b>
        <span class="ck-titel">Aufträge · 30 Tage</span>
        <span class="ck-status ${st.stufe}"><i></i>${maskieren(st.stufe === 'optimal' ? 'Systemstatus: Optimal' : st.text)}</span>
      </div>
      <div class="ck-fluegel rechts">
        <span class="ck-titel">Ø Bearbeitungszeit</span>
        <b class="ck-gross">${s ? dauerText(s.schnitt) : '–'}</b>
        <small>vom Auftrag bis zur fertigen Antwort</small>
        ${linie(s?.verlauf.map((v) => v.zeit) || [])}
      </div>
      <div class="ck-leiste">
        ${balken('Systemstatus', st.stufe === 'optimal' ? 100 : st.stufe === 'eingeschraenkt' ? 60 : 15, `<span class="ck-punkt ${st.stufe}"></span>${st.stufe === 'optimal' ? 'Optimal' : st.stufe === 'eingeschraenkt' ? 'Eingeschränkt' : 'Gestört'}`)}
        ${balken('CPU', system?.cpu)}
        ${balken('RAM', system?.ram)}
        ${balken('Festplatte', system?.platte)}
      </div>
    </div>
    ${orchesterHtml()}`
}

function orchesterHtml() {
  const agenten = stand?.agenten || []
  const chef = agenten.find((a) => a.profil === LUZZY)
  const bots = agenten.filter((a) => a.profil !== LUZZY).sort((a, b) => b.heute - a.heute || b.anzahl - a.anzahl).slice(0, 5)
  if (!chef && !bots.length) return '<div class="ck-orchester"><div class="ck-orchester-kopf"><span class="ck-titel">Agenten-Orchestrierung</span></div><div class="leise klein">Lade die Agenten …</div></div>'
  const summeHeute = Math.max(1, bots.reduce((s, b) => s + b.heute, 0) + (chef?.heute || 0))
  const maxHeute = Math.max(1, ...bots.map((b) => b.heute))
  const arbeiten = agenten.filter((a) => a.arbeitet).length
  const n = bots.length || 1
  const linien = bots.map((_, i) => {
    const x = ((i + 0.5) / n) * 100
    return `<path d="M50 0 C50 10, ${x} 6, ${x} 18" />`
  }).join('')
  return `
    <div class="ck-orchester">
      <div class="ck-orchester-kopf"><span class="ck-titel">Agenten-Orchestrierung</span><button class="ck-link" data-ck-crew type="button">Alle Agenten ›</button></div>
      ${chef ? `<div class="ck-chef" data-ck-chef tabindex="0" title="Luzzy ist hier in der Zentrale – einfach unten schreiben">
        ${avatar(chef)}
        <div class="ck-chef-text"><b>${maskieren(chef.name)}</b><small>Chefin · verteilt die Aufträge</small></div>
        <div class="ck-chef-zahl"><b>${arbeiten}</b><small>arbeiten gerade</small></div>
      </div>` : ''}
      ${bots.length ? `<svg class="ck-verbinder" viewBox="0 0 100 18" preserveAspectRatio="none">${linien}</svg>
      <div class="ck-bots" style="--n:${n}">
        ${bots.map((b, i) => `
          <div class="ck-bot${b.arbeitet ? ' aktiv' : ''}" data-ck-bot="${maskieren(b.profil)}" tabindex="0" title="Klick: Chat mit ${maskieren(b.name)}">
            <div class="ck-bot-kopf">${avatar(b)}<div><b>${maskieren(b.name)}</b><small>${b.arbeitet ? '● arbeitet' : 'Bereit'}${b.rolle ? ` · ${maskieren(b.rolle)}` : ''}</small></div><span class="ck-nr">${String(i + 1).padStart(2, '0')}</span></div>
            <div class="ck-bot-mitte">
              <div class="ck-ring-box">${ring(b.heute / summeHeute)}</div>
              <div class="ck-bot-balken"><span class="ck-titel">Aufträge · 24 h</span><b>${b.heute}</b><div class="ck-balken"><div style="width:${Math.round((b.heute / maxHeute) * 100)}%"></div></div></div>
            </div>
            <div class="ck-bot-fuss"><div><span class="ck-titel">Ø Antwort</span><b>${dauerText(b.schnitt)}</b></div><div><span class="ck-titel">Sitzungen</span><b>${b.sitzungen}</b></div></div>
          </div>`).join('')}
      </div>` : ''}
    </div>`
}

// ── Takt: nur rechnen, solange die Zentrale zu sehen ist ──
async function runde() {
  clearTimeout(uhr)
  const sichtbar = !document.hidden && h.zentraleSichtbar() && !$('cockpit')?.hidden
  if (sichtbar) {
    await Promise.all([nachlesen().catch((e) => console.warn('Cockpit:', e.message)), systemLesen().catch(() => {})])
    zeichnen()
  }
  const arbeitet = stand?.agenten?.some((a) => a.arbeitet)
  // noch keine Zahlen (Hermes startet noch): bald wieder versuchen; arbeitet jemand: öfter; sonst in Ruhe
  uhr = setTimeout(runde, sichtbar ? (!stand ? 3000 : arbeitet ? 8000 : 45000) : 15000)
}

// Etwas ist passiert (Antwort, Werkzeug, Crew): bald neu rechnen
export function cockpitAnstossen() {
  clearTimeout(anstoss)
  anstoss = setTimeout(runde, 2500)
}

export function cockpitAnzeigen(an) {
  const el = $('cockpit')
  if (!el) return
  el.hidden = !an
  document.querySelector('.ansicht-zentrale')?.classList.toggle('mit-cockpit', an)
  luzzyPlatzieren()
  if (an) runde()
}

// Mit Cockpit wohnt Luzzy (Reaktor, Name, Zustand) unten in der rechten Spalte, ohne Untertitel – nie in der Zentrale
// (Felix' Wunsch: dort nur Cockpit und Chat-Eingabe). Nur ohne Cockpit steht sie wieder an ihrem alten Platz.
let luzzyHeimat = null
function luzzyPlatzieren() {
  const luzzy = document.querySelector('.luzzy-bereich')
  const spalte = document.querySelector('aside.live')
  if (!luzzy || !spalte) return
  luzzyHeimat ??= { eltern: luzzy.parentNode, danach: luzzy.nextSibling }
  const rechts = !$('cockpit').hidden
  if (rechts && luzzy.parentNode !== spalte) spalte.appendChild(luzzy)
  else if (!rechts && luzzy.parentNode !== luzzyHeimat.eltern) luzzyHeimat.eltern.insertBefore(luzzy, luzzyHeimat.danach)
  luzzy.classList.toggle('in-spalte', rechts)
}

export function cockpitEinrichten(helfer) {
  h = { ...h, ...helfer }
  $('cockpit').addEventListener('click', (e) => {
    const bot = e.target.closest('[data-ck-bot]')
    if (bot) return h.botFenster(bot.dataset.ckBot)
    if (e.target.closest('[data-ck-chef]')) return document.querySelector('.befehl .eingabe-text')?.focus()
    if (e.target.closest('[data-ck-crew]')) return h.crewOeffnen()
  })
  $('cockpit').addEventListener('keydown', (e) => e.key === 'Enter' && e.target.closest('[data-ck-bot],[data-ck-chef]')?.click())
  document.addEventListener('visibilitychange', () => !document.hidden && cockpitAnstossen())
  runde()
}
