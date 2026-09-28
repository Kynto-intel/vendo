// Testlauf-Fenster der Werkstatt: lädt den Entwurf wie Jarves-OS, aber mit nachgebildetem ctx.
// Daten bleiben im Speicher, Luzzy/Meldungen/Vorlesen werden nur protokolliert, der Hintergrundteil läuft in einem
// eigenen Prozess. Jeder Fehler landet im Protokoll und im Bericht an die Werkstatt.

import { markdownZuHtml } from '../../src/renderer/markdown.js'
import { bestaetigen, hinweis } from '../../src/renderer/fenster.js'

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const test = window.werkstattTest
const fehler = []
let gestartet = false
const start = Date.now()

function log(art, text) {
  const zeile = document.createElement('div')
  zeile.className = `tl-zeile ${art}`
  zeile.innerHTML = `<time>${((Date.now() - start) / 1000).toFixed(1)}s</time><span>${maskieren(text)}</span>`
  $('tl-log').appendChild(zeile)
  $('tl-log').scrollTop = $('tl-log').scrollHeight
}
function berichten() {
  const ok = gestartet && !fehler.length
  $('tl-status').textContent = !gestartet && !fehler.length ? 'Startet …' : ok ? '✓ Läuft ohne Fehler' : `✗ ${fehler.length} Fehler`
  $('tl-status').className = `tl-status ${ok ? 'ok' : fehler.length ? 'fehler' : ''}`
  test.bericht({ ok, gestartet, fehler: fehler.slice(0, 20) })
}
function fehlerMelden(wo, e) {
  const text = `${wo}: ${String(e?.message || e)}`
  if (fehler.includes(text)) return
  fehler.push(text)
  log('fehler', text)
  berichten()
}
window.addEventListener('error', (e) => fehlerMelden('Fehler im Plugin', e.error || e.message))
window.addEventListener('unhandledrejection', (e) => fehlerMelden('Fehler im Plugin (async)', e.reason))
const altError = console.error
console.error = (...a) => {
  altError(...a)
  fehlerMelden('console.error', a.map((x) => x?.message || x).join(' '))
}
test.beiKind((n) => {
  if (n.typ === 'fehler') fehlerMelden('Hintergrundteil', n.text)
  if (n.typ === 'log') log('info', n.text)
  if (n.typ === 'bereit') log('ok', `Hintergrundteil läuft (Funktionen: ${n.funktionen.join(', ') || 'keine'})`)
})

const info = await test.info()
document.title = `Testlauf: ${info.name}`
$('tl-name').textContent = info.name
$('tl-titel').textContent = info.bereich || info.name
$('tl-beschreibung').textContent = info.beschreibung || ''
$('tl-bereich').dataset.ansicht = `plugin-${info.id}`
if (info.stilUrl) {
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = info.stilUrl
  document.head.appendChild(link)
}
log('info', `Teste „${info.name}“${info.hatHaupt ? ' mit Hintergrundteil' : ''}. Klick dich ruhig durch.`)

// ── nachgebildetes ctx ──
let daten = structuredClone(info.daten || {})
const kontexte = []
const begruessungen = []
const befehle = []
const filter = []
const ctx = {
  id: info.id,
  name: info.name,
  element: $('tl-inhalt'),
  kopfKnoepfe: $('tl-kopfknoepfe'),
  daten: {
    laden: async () => structuredClone(daten),
    speichern: async (d) => {
      daten = structuredClone(d ?? {})
      log('info', 'Daten gespeichert (nur im Test)')
      return true
    },
    beiAenderung: () => {}
  },
  aufrufen: async (name, ...argumente) => {
    try {
      return await test.aufrufen(name, argumente)
    } catch (e) {
      const text = String(e.message).replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
      fehlerMelden(`Hintergrund „${name}“`, text)
      throw new Error(text)
    }
  },
  karte(titel) {
    const hinweisKarten = $('tl-karten').querySelector('.leise')
    hinweisKarten?.remove()
    const karte = document.createElement('section')
    karte.className = 'karte hud plugin-karte'
    karte.innerHTML = `<h3>${maskieren(titel)}</h3><div class="plugin-karte-inhalt"></div>`
    $('tl-karten').appendChild(karte)
    return karte.querySelector('.plugin-karte-inhalt')
  },
  melden: (m) => log('melden', `Meldung: ${m?.titel || ''}${m?.anzeige ? ` – ${m.anzeige}` : ''}${m?.text ? ` (Luzzy würde sagen: „${m.text}“)` : ''}`),
  vorlesen: async (text) => log('luzzy', `Luzzy würde vorlesen: „${text}“`),
  luzzy: async (text, o = {}) => (log('luzzy', `Würde an Luzzy schicken: „${String(o.anzeige || text).slice(0, 300)}“`), true),
  kontext: (fn) => kontexte.push(fn),
  kontextVon: async () => '',
  kontextFuer: async () => '',
  begruessung: (fn) => begruessungen.push(fn),
  eingabeFilter: (fn) => filter.push(fn),
  befehl: (fn) => befehle.push(fn),
  knoepfe: (liste) => {
    const leiste = $('tl-knoepfe')
    leiste.innerHTML = ''
    for (const k of Array.isArray(liste) ? liste : []) {
      const b = document.createElement('button')
      b.className = 'schnell'
      b.type = 'button'
      b.textContent = k.name
      b.title = k.titel || ''
      b.addEventListener('click', () => {
        try {
          k.fn?.()
        } catch (e) {
          fehlerMelden(`Knopf „${k.name}“`, e)
        }
      })
      leiste.appendChild(b)
    }
  },
  bereit: () => true,
  nichtStoeren: (bis) => log('info', bis ? `„Nicht stören“ bis ${new Date(bis).toLocaleTimeString('de-DE')} (nur Test)` : '„Nicht stören“ aus (nur Test)'),
  oeffnen: () => {},
  maskieren,
  markdownZuHtml,
  bestaetigen,
  hinweis
}

// ── Plugin starten ──
try {
  const modul = await import(`${info.ansichtUrl}?t=${Date.now()}`)
  if (typeof modul.starten !== 'function') throw new Error('ansicht.js hat keine Funktion starten(ctx).')
  const r = (await modul.starten(ctx)) || {}
  gestartet = true
  log('ok', 'starten() ist fertig')
  if (typeof r.laden === 'function') {
    await r.laden()
    log('ok', 'laden() läuft')
    setInterval(() => Promise.resolve().then(() => r.laden()).catch((e) => fehlerMelden('laden()', e)), Math.max(2000, Number(r.takt) || 60000))
  }
  for (const fn of begruessungen) log('luzzy', `Begrüßung: „${(await fn()) || '(nichts)'}“`)
  for (const fn of kontexte) {
    const text = await fn()
    if (text) log('info', `Weiß für Luzzy: ${String(text).slice(0, 200)}${String(text).length > 200 ? ' …' : ''}`)
  }
} catch (e) {
  fehlerMelden('Beim Start', e)
}
berichten()

// ── Befehle ausprobieren ──
$('tl-befehl-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const text = $('tl-befehl').value.trim()
  if (!text) return
  $('tl-befehl').value = ''
  log('info', `Befehl: „${text}“`)
  try {
    for (const fn of befehle) {
      const antwort = await fn(text, { gesprochen: false })
      if (antwort === true) return log('ok', 'Befehl erledigt (ohne Antwort)')
      if (antwort) return log('luzzy', `Antwort: „${antwort}“`)
    }
    for (const fn of filter) {
      const t = await fn(text)
      if (t?.text) return log('luzzy', `Würde an Luzzy schicken: „${String(t.anzeige || t.text).slice(0, 300)}“`)
    }
    log('info', 'Das Plugin reagiert nicht auf diesen Satz (er ginge normal an Luzzy).')
  } catch (err) {
    fehlerMelden('Befehl', err)
  }
})
