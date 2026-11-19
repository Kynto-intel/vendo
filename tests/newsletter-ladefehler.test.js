// Newsletter-Plugin: Ladefehler in der Oberfläche.
// Geprüft wird, dass ein Fehler beim Holen aus dem Hintergrundteil nicht mehr wie eine leere
// Liste aussieht: oben steht ein Hinweis mit dem betroffenen Bereich und „Erneut laden“, und
// nach einem erfolgreichen zweiten Versuch verschwindet er wieder.
// Es gibt kein echtes Fenster: `ctx.element` ist ein kleiner Ersatz, der nur das gezeichnete
// HTML festhält. Alle Daten sind erfunden; der Hintergrundteil ist ein Ersatz, der nichts sendet.

import assert from 'node:assert/strict'
import test from 'node:test'
import { starten } from '../plugins/newsletter/ansicht.js'

// Ein Element, das nur festhält, was hineingeschrieben wird
function ersatzElement() {
  const inhalt = { innerHTML: '' }
  const klicks = []
  return {
    inhalt,
    klicks,
    innerHTML: '',
    ownerDocument: { activeElement: null },
    contains: () => false,
    querySelector: (sel) => (sel === '[data-inhalt]' ? inhalt : null),
    querySelectorAll: () => [],
    addEventListener: (art, f) => {
      if (art === 'click') klicks.push(f)
    }
  }
}

const maskieren = (t) => String(t ?? '').replace(/[&<>"']/g, (z) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[z])

async function ansichtStarten(antworten) {
  const element = ersatzElement()
  const ctx = {
    element,
    maskieren,
    aufrufen: async (name) => {
      const a = antworten[name]
      if (a instanceof Error) throw a
      return typeof a === 'function' ? a() : (a ?? null)
    },
    daten: { laden: async () => ({}), speichern: async () => {} },
    bestaetigen: async () => false,
    fragen: async () => '',
    melden: () => {}
  }
  // Die Oberfläche startet einen Zeitgeber für Bot-Änderungen; im Test nicht
  const echtesIntervall = globalThis.setInterval
  globalThis.setInterval = () => 0
  let api
  try {
    api = await starten(ctx)
  } finally {
    globalThis.setInterval = echtesIntervall
  }
  return { element, api }
}

// Einen Knopf mit data-nl drücken, als käme der Klick aus der Oberfläche
async function druecken(element, aktion) {
  const knopf = { dataset: { nl: aktion }, closest: (sel) => (sel === '[data-nl]' ? knopf : null) }
  const ziel = { closest: (sel) => (sel === '[data-nl]' ? knopf : null) }
  for (const f of element.klicks) await f({ target: ziel, preventDefault() {} })
}

const ZUGANG = { benutzer: 'info@beispiel.invalid', passwortGesetzt: true }

test('ein Ladefehler erscheint als Hinweis mit Bereich und Erneut-laden-Knopf', async () => {
  const { element, api } = await ansichtStarten({
    zugangLesen: ZUGANG,
    drosselLesen: {},
    warteschlangeLesen: new Error('Hintergrundteil antwortet nicht')
  })
  await api.laden()
  const html = element.inhalt.innerHTML
  assert.match(html, /nl-ladefehler/)
  assert.match(html, /Warteschlange: Hintergrundteil antwortet nicht/)
  assert.match(html, /data-nl="nachladen"/)
})

test('ohne Fehler gibt es keinen Hinweis', async () => {
  const { element, api } = await ansichtStarten({ zugangLesen: ZUGANG, drosselLesen: {}, warteschlangeLesen: { offen: 0, faellig: 0, wartend: 0 } })
  await api.laden()
  assert.doesNotMatch(element.inhalt.innerHTML, /nl-ladefehler/)
})

test('Erneut laden holt neu, und nach einem Erfolg verschwindet der Hinweis', async () => {
  let fehlschlagen = true
  const { element, api } = await ansichtStarten({
    zugangLesen: ZUGANG,
    drosselLesen: {},
    warteschlangeLesen: () => {
      if (fehlschlagen) throw new Error('kurz weg')
      return { offen: 0, faellig: 0, wartend: 0 }
    }
  })
  await api.laden()
  assert.match(element.inhalt.innerHTML, /kurz weg/)
  fehlschlagen = false
  await druecken(element, 'nachladen')
  assert.doesNotMatch(element.inhalt.innerHTML, /nl-ladefehler/)
})

test('Fehlertexte werden maskiert, bevor sie ins HTML kommen', async () => {
  const { element, api } = await ansichtStarten({ zugangLesen: ZUGANG, drosselLesen: {}, warteschlangeLesen: new Error('<img src=x onerror=alert(1)>') })
  await api.laden()
  assert.doesNotMatch(element.inhalt.innerHTML, /<img/)
  assert.match(element.inhalt.innerHTML, /&lt;img/)
})

// ── Rückläufer im Reiter „Kontakte“ ──
// Hier, weil diese Datei das Ersatz-Element für die Oberfläche schon hat.

async function reiterWaehlen(element, bereich) {
  const reiter = { dataset: { bereich } }
  const ziel = { closest: (sel) => (sel === '[data-bereich]' ? reiter : null) }
  for (const f of element.klicks) await f({ target: ziel, preventDefault() {} })
}

const KONTAKTE = {
  gesamt: 2, empfaenger: 1, gesperrt: 1, ruecklaeufer: 1, ohneZustimmung: 0, offeneBestaetigung: 0, ausShopify: 2, ausImport: 0,
  liste: [
    { email: 'kim@kunden.invalid', vorname: 'Kim', nachname: '', quelle: 'shopify', zustand: 'SUBSCRIBED', zustimmungAm: '2026-01-01', gesperrt: true, gesperrtGrund: 'Rückläufer: Adresse gibt es nicht (mehr) (5.1.1)', sperrArt: 'ruecklaeufer' },
    { email: 'lou@kunden.invalid', vorname: 'Lou', nachname: '', quelle: 'shopify', zustand: 'SUBSCRIBED', zustimmungAm: '2026-01-01', gesperrt: false, ruecklaeufer: { weich: 2, abgelehnt: 0 } }
  ],
  gefunden: 2
}

test('der Reiter „Kontakte“ zeigt Rückläufer-Bereich, Sperrart und gezählte Fehler', async () => {
  const { element, api } = await ansichtStarten({
    zugangLesen: ZUGANG,
    drosselLesen: {},
    warteschlangeLesen: { offen: 0, faellig: 0, wartend: 0 },
    kontakteLesen: KONTAKTE,
    shopifyLesen: {},
    abmeldungenLesen: { ordner: 'Abmeldungen', postfachBereit: true },
    ruecklaeuferLesen: {
      aktiv: true, ordner: 'Ruecklaeufer', standardOrdner: 'Ruecklaeufer', host: 'imap.ionos.de', postfachBereit: true,
      gesperrt: 1, beschwerden: 0, mitWeichen: 1, letzterLauf: 1_700_000_000_000, letzterText: '1 gelesen, 1 gesperrt',
      letzte: [{ am: 1_700_000_000_000, an: 'k***@kunden.invalid', art: 'hart', status: '5.1.1', grund: '<b>tot</b>' }]
    }
  })
  await api.laden()
  await reiterWaehlen(element, 'kontakte')
  const html = element.inhalt.innerHTML
  assert.match(html, /Rückläufer per Mail · 1 gesperrt/)
  assert.match(html, /data-rueck-form/)
  assert.match(html, /data-nl="rueck-jetzt"/)
  assert.match(html, /Adresse tot/)
  assert.match(html, /&lt;b&gt;tot&lt;\/b&gt;/, 'der Grund kommt maskiert ins HTML')
  assert.match(html, />Rückläufer<\/span>/, 'die Liste zeigt die Sperrart')
  assert.match(html, /2× Rückläufer/, 'gezählte vorübergehende Fehler bei einem aktiven Kontakt')
  assert.match(html, /1 durch Rückläufer/)
  assert.doesNotMatch(html, /nl-ladefehler/)
})

// ── Zustellung: Übersicht und angehaltene Kampagne ──

const ZUSTELL_ROT = {
  stufe: 'rot',
  kampagnen: [
    {
      id: 'k1', name: 'Herbst', zustand: 'pausiert', pausiertVon: 'vendo', pausiertGrund: '6 tote Adressen bei 100 verschickten Mails (6 %)',
      stufe: 'rot', zahlen: { gesendet: 100, hart: 6, abgelehnt: 0, beschwerde: 0 },
      gruende: [{ art: 'hart', stufe: 'rot', text: '6 tote Adressen bei 100 verschickten Mails (6 %)', rat: 'Die Liste enthält <veraltete> Adressen.' }]
    }
  ]
}

test('die Übersicht zeigt die Zustellungs-Ampel und den Kasten mit Rat', async () => {
  const { element, api } = await ansichtStarten({
    zugangLesen: ZUGANG,
    drosselLesen: {},
    warteschlangeLesen: { offen: 1, faellig: 0, wartend: 1 },
    rennerLesen: null,
    zustellungLesen: ZUSTELL_ROT
  })
  await api.laden()
  const html = element.inhalt.innerHTML
  assert.match(html, /Zustellung/)
  assert.match(html, />Problem</)
  assert.match(html, /Vendo hat „Herbst“ angehalten/)
  assert.match(html, /6 tote Adressen bei 100 verschickten Mails/)
  assert.match(html, /&lt;veraltete&gt;/, 'der Rat kommt maskiert ins HTML')
  assert.match(html, /Mit „Fortsetzen“ geht es weiter/)
})

test('eine angehaltene Kampagne zeigt Fortsetzen und Abbrechen, aber kein Speichern', async () => {
  const kampagnenListe = {
    maxHtml: 100000, empfaenger: 2, beispielHtml: '',
    liste: [{ id: 'k1', name: 'Herbst', betreff: 'Neu', html: '<p>x</p>', zustand: 'pausiert', pausiertVon: 'vendo', pausiertGrund: '6 tote Adressen', eingereiht: 2 }]
  }
  const { element, api } = await ansichtStarten({
    zugangLesen: ZUGANG, drosselLesen: {}, warteschlangeLesen: { offen: 1, faellig: 0, wartend: 1 },
    kampagnenLesen: kampagnenListe, markeLesen: {}, vorlagenLesen: { liste: [] }, kampagnenErgebnisse: { zeilen: [] },
    zustellungLesen: ZUSTELL_ROT
  })
  await api.laden()
  await reiterWaehlen(element, 'kampagnen')
  const knopf = { dataset: { nl: 'kampagne-auf', id: 'k1' } }
  for (const f of element.klicks) await f({ target: { closest: (sel) => (sel === '[data-nl]' ? knopf : null) }, preventDefault() {} })
  const html = element.inhalt.innerHTML
  assert.match(html, /data-nl="kampagne-fortsetzen"/)
  assert.match(html, /data-nl="kampagne-stop"/)
  assert.doesNotMatch(html, /data-nl="kampagne-anhalten"/)
  assert.match(html, /form="kampagne-form" disabled/, 'Speichern ist gesperrt')
  assert.match(html, /angehalten/)
  assert.match(html, /Vendo hat „Herbst“ angehalten/)
})
