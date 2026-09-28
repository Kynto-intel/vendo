// Kosten-Wächter (Idee 1, Runde 2): was Luzzy und die Crew heute und diesen Monat kosten, mit Budget.
// Zahlen aus Hermes' Nutzungsstatistik (/api/analytics/usage pro Profil, in Dollar wie Hermes rechnet).
// Karte im System-Tab; Warnung als Meldung bei 80 % und 100 % des Tages- oder Monatsbudgets (je einmal).
// Budget in den Einstellungen: kosten: { tag, monat } (Dollar, leer = kein Budget).

import { botName } from './ansichten.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const dollar = (n) => `${(Number(n) || 0).toFixed(2).replace('.', ',')} $`
const kostenVon = (t) => t.actual_cost || t.estimated_cost || 0
const tokensVon = (t) => (t.input_tokens || 0) + (t.output_tokens || 0)
const tokenText = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1).replace('.', ',')} Mio.` : n >= 1000 ? `${Math.round(n / 1000)} Tsd.` : String(n))
const summe = (tage, filter, wert) => tage.filter(filter).reduce((s, t) => s + wert(t), 0)
const tagText = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

let h = { api: null, einstellungen: () => ({}), speichern: async () => {}, melden: () => {} }
let stand = null
let geholt = 0

// Nutzung aller Profile holen (höchstens einmal pro Minute, sonst aus dem Zwischenspeicher)
async function holen(erzwingen = false) {
  if (!erzwingen && stand && Date.now() - geholt < 60000) return stand
  const profile = (await h.api.hermes.lesen('/api/profiles').catch(() => null))?.profiles
  if (!profile) return stand
  const heute = tagText(new Date())
  const monat = heute.slice(0, 7)
  const tage = new Date().getDate() + 1 // der ganze Monat bis heute
  const proProfil = await Promise.all(
    profile.map(async (p) => {
      const d = await h.api.hermes.lesen(`/api/analytics/usage?days=${Math.max(tage, 14)}&profile=${encodeURIComponent(p.name)}`).catch(() => null)
      const tageswerte = d?.daily || []
      return {
        profil: p.name,
        name: p.name === 'default' ? 'Hermes (Standard)' : botName(p).name,
        heute: summe(tageswerte, (t) => t.day === heute, kostenVon),
        monat: summe(tageswerte, (t) => String(t.day).startsWith(monat), kostenVon),
        tokensHeute: summe(tageswerte, (t) => t.day === heute, tokensVon),
        tokensMonat: summe(tageswerte, (t) => String(t.day).startsWith(monat), tokensVon),
        aufrufeMonat: summe(tageswerte, (t) => String(t.day).startsWith(monat), (t) => t.api_calls || 0),
        tage: tageswerte
      }
    })
  )
  // Verlauf der letzten 14 Tage über alle Profile
  const verlauf = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const tag = tagText(d)
    const amTag = (wert) => proProfil.reduce((s, p) => s + summe(p.tage, (t) => t.day === tag, wert), 0)
    verlauf.push({ tag, wert: amTag(kostenVon), tokens: amTag(tokensVon) })
  }
  stand = {
    heute: proProfil.reduce((s, p) => s + p.heute, 0),
    monat: proProfil.reduce((s, p) => s + p.monat, 0),
    tokensHeute: proProfil.reduce((s, p) => s + p.tokensHeute, 0),
    tokensMonat: proProfil.reduce((s, p) => s + p.tokensMonat, 0),
    aufrufeMonat: proProfil.reduce((s, p) => s + p.aufrufeMonat, 0),
    proProfil: proProfil.filter((p) => p.tokensMonat > 0).sort((a, b) => b.monat - a.monat || b.tokensMonat - a.tokensMonat),
    verlauf,
    tag: heute
  }
  geholt = Date.now()
  return stand
}

const budget = () => {
  const k = h.einstellungen()?.kosten || {}
  const zahl = (v) => (Number(v) > 0 ? Number(v) : null)
  return { tag: zahl(k.tag), monat: zahl(k.monat) }
}

// Warnen bei 80 % und 100 %, je Stufe einmal pro Tag bzw. Monat
async function pruefen(s) {
  if (!s) return
  const b = budget()
  const gewarnt = { ...(h.einstellungen()?.kostenGewarnt || {}) }
  const monat = s.tag.slice(0, 7)
  let neu = false
  for (const [art, wert, grenze, zeitraum, wann] of [['tag', s.heute, b.tag, s.tag, 'heute'], ['monat', s.monat, b.monat, monat, 'diesen Monat']]) {
    if (!grenze) continue
    for (const stufe of [100, 80]) {
      if (wert < (grenze * stufe) / 100) continue
      const schluessel = `${art}${stufe}`
      if (gewarnt[schluessel] === zeitraum) break // diese (oder die höhere) Stufe schon gemeldet
      gewarnt[schluessel] = zeitraum
      if (stufe === 100) gewarnt[`${art}80`] = zeitraum
      neu = true
      const text = stufe === 100
        ? `Felix, das ${art === 'tag' ? 'Tagesbudget' : 'Monatsbudget'} ist aufgebraucht: ${wann} schon ${dollar(wert).replace(' $', ' Dollar')} von ${dollar(grenze).replace(' $', ' Dollar')}.`
        : `Felix, ${wann} sind schon ${Math.round((wert / grenze) * 100)} Prozent vom ${art === 'tag' ? 'Tagesbudget' : 'Monatsbudget'} verbraucht.`
      h.melden({ art: 'kosten', titel: stufe === 100 ? `${art === 'tag' ? 'Tages' : 'Monats'}budget aufgebraucht` : `${stufe} % vom ${art === 'tag' ? 'Tages' : 'Monats'}budget`, text, anzeige: `${dollar(wert)} von ${dollar(grenze)} ${wann}`, zeit: Date.now() })
      break
    }
  }
  if (neu) await h.speichern({ kostenGewarnt: gewarnt })
}

// ── Karte im System-Tab ──
function balken(wert, grenze) {
  if (!grenze) return ''
  const anteil = Math.min(100, Math.round((wert / grenze) * 100))
  const stufe = wert >= grenze ? ' voll' : anteil >= 80 ? ' knapp' : ''
  return `<div class="kw-balken${stufe}"><div style="width:${anteil}%"></div></div><div class="leise klein">${anteil} % von ${dollar(grenze)}</div>`
}

function zeichnen() {
  const el = $('system-kostenwaechter')
  if (!el) return
  if (!stand) {
    el.innerHTML = '<div class="leise">Hermes antwortet gerade nicht.</div>'
    return
  }
  const b = budget()
  // Verlauf nach Kosten; kostet alles nichts (kostenlose Modelle), nach Tokens
  const nachKosten = stand.verlauf.some((v) => v.wert > 0)
  const wertVon = (v) => (nachKosten ? v.wert : v.tokens)
  const hoch = Math.max(...stand.verlauf.map(wertVon), 0.0001)
  el.innerHTML = `
    <div class="kw-zahlen">
      <div><span class="leise klein">Heute</span><b>${dollar(stand.heute)}</b><span class="leise klein">${tokenText(stand.tokensHeute)} Tokens</span>${balken(stand.heute, b.tag)}</div>
      <div><span class="leise klein">Diesen Monat</span><b>${dollar(stand.monat)}</b><span class="leise klein">${tokenText(stand.tokensMonat)} Tokens · ${stand.aufrufeMonat} Aufrufe</span>${balken(stand.monat, b.monat)}</div>
    </div>
    <div class="leise klein kw-titel">Letzte 14 Tage · ${nachKosten ? 'Kosten' : 'Tokens'}</div>
    <div class="kw-verlauf">${stand.verlauf.map((v) => `<span style="height:${Math.max(2, Math.round((wertVon(v) / hoch) * 100))}%" title="${v.tag.slice(8)}.${v.tag.slice(5, 7)}.: ${dollar(v.wert)} · ${tokenText(v.tokens)} Tokens"${v.tag === stand.tag ? ' class="heute"' : ''}></span>`).join('')}</div>
    ${stand.proProfil.length ? `<table class="tabelle kw-tabelle"><thead><tr><th>Wer</th><th>Heute</th><th>Monat</th><th>Tokens (Monat)</th></tr></thead><tbody>
      ${stand.proProfil.map((p) => `<tr><td>${maskieren(p.name)}</td><td>${dollar(p.heute)}</td><td>${dollar(p.monat)}</td><td>${tokenText(p.tokensMonat)}</td></tr>`).join('')}
    </tbody></table>` : '<div class="leise klein">Diesen Monat noch nichts verbraucht.</div>'}
    <form class="kw-budget" id="kw-budget">
      <label>Tagesbudget <input name="tag" type="number" min="0" step="0.5" placeholder="kein" value="${b.tag ?? ''}" /> $</label>
      <label>Monatsbudget <input name="monat" type="number" min="0" step="1" placeholder="kein" value="${b.monat ?? ''}" /> $</label>
      <button class="knopf-flach" type="submit">Speichern</button>
    </form>
    <div class="leise klein">Luzzy warnt bei 80 % und 100 % (je einmal). Kosten in Dollar, so wie Hermes sie rechnet; kostenlose Modelle zählen 0 $ (die Tokens zeigen trotzdem, wie viel los war).${stand.monat === 0 && stand.tokensMonat > 0 ? ' Zurzeit laufen alle genutzten Modelle kostenlos.' : ''}</div>`
}

// System-Tab offen: Karte laden (höchstens einmal pro Minute neu bei Hermes nachfragen)
export async function kostenKarteLaden() {
  // Nicht neu zeichnen, während Felix gerade ein Budget eintippt
  if (document.activeElement?.closest?.('#kw-budget')) return
  await holen()
  zeichnen()
  pruefen(stand).catch(() => {})
}

export function kostenEinrichten(helfer) {
  h = { ...h, ...helfer }
  document.addEventListener('submit', async (e) => {
    if (e.target.id !== 'kw-budget') return
    e.preventDefault()
    const f = e.target
    const zahl = (v) => (Number(String(v).replace(',', '.')) > 0 ? Number(String(v).replace(',', '.')) : null)
    await h.speichern({ kosten: { tag: zahl(f.tag.value), monat: zahl(f.monat.value) }, kostenGewarnt: {} })
    document.activeElement?.blur?.()
    zeichnen()
    pruefen(stand).catch(() => {})
  })
  // Auch ohne offenen System-Tab alle 10 Minuten prüfen (nur wenn ein Budget eingestellt ist)
  const imHintergrund = async () => {
    const b = budget()
    if (!b.tag && !b.monat) return
    await holen(true).catch(() => null)
    await pruefen(stand).catch(() => {})
  }
  setTimeout(imHintergrund, 60000)
  setInterval(imHintergrund, 10 * 60000)
}
export { pruefen as kostenPruefen } // auch für Tests
