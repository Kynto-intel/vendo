// Newsletter-Plugin: die sechs fertigen Vorlagen im Stil der Marke.
//
// Geprüft wird, dass jedes Muster Vendos eigene Prüfungen besteht — kein Bild ohne
// Adresse, kein Knopf ohne Ziel, kein erfundener Streichpreis, kein doppeltes Bild, kein
// doppeltes Produkt, kein Logo und kein Fuß — und dass die Farben aus den Markenangaben
// kommen. Alle Daten sind erfunden, es geht nichts nach außen.

import assert from 'node:assert/strict'
import test from 'node:test'
import musterModul from '../plugins/newsletter/muster.js'
import vorlagenModul from '../plugins/newsletter/vorlagen.js'
import htmlMail from '../plugins/newsletter/html-mail.js'
import kampagnenModul from '../plugins/newsletter/kampagnen.js'
import shoplinks from '../plugins/newsletter/shoplinks.js'
import bots from '../plugins/newsletter/bots.js'
import starten from '../plugins/newsletter/haupt.js'

const { musterListe, musterHtml, DUNKEL } = musterModul
const { vorlagePruefen } = vorlagenModul
const { bilderOhneAdresse, linksOhneZiel, felderLesen, mailAusHtml } = htmlMail
const { personalisierenHtml } = kampagnenModul

const MARKE = { titel: 'Donnerwolf', impressum: 'Beispiel GmbH, Musterweg 1, 12345 Musterstadt' }

// ── Es sind sechs, und sie decken die drei Fälle ab ──

test('es gibt sechs Muster für Newsletter, Warenkorb und Willkommen', () => {
  const liste = musterListe()
  assert.equal(liste.length, 6)
  const arten = liste.map((x) => x.art)
  assert.ok(arten.filter((a) => a === 'kampagne').length >= 3, 'mindestens drei Newsletter')
  assert.ok(arten.includes('warenkorb'), 'ein Warenkorb-Muster fehlt')
  assert.ok(arten.includes('willkommen'), 'ein Willkommens-Muster fehlt')
  for (const x of liste) {
    assert.ok(x.id && x.name && x.beschreibung, `${x.id} ist unvollständig beschrieben`)
  }
  assert.equal(new Set(liste.map((x) => x.id)).size, 6, 'die Kennungen sind eindeutig')
})

test('ein unbekanntes Muster gibt null statt eines halben HTML', () => {
  assert.equal(musterHtml('gibtsnicht', { marke: MARKE }), null)
})

// ── Jedes Muster besteht Vendos Prüfungen ──

for (const mu of musterListe()) {
  test(`Muster „${mu.id}" besteht die Vorlagenprüfung`, () => {
    const html = musterHtml(mu.id, { marke: MARKE })
    const geprueft = vorlagePruefen({ name: mu.name, html })
    assert.equal(geprueft.ok, true, geprueft.fehler.join(' | '))
  })

  test(`Muster „${mu.id}" hat keine leeren Bilder und keine toten Knöpfe`, () => {
    const html = musterHtml(mu.id, { marke: MARKE })
    assert.deepEqual(bilderOhneAdresse(html), [], 'Bild ohne Adresse')
    assert.deepEqual(linksOhneZiel(html), [], 'Knopf ohne Ziel')
  })

  test(`Muster „${mu.id}" wiederholt kein Bild und kein Produkt`, () => {
    const html = musterHtml(mu.id, { marke: MARKE })
    assert.deepEqual(shoplinks.doppelteBilder(html), [], 'dasselbe Bild mehrfach')
    assert.deepEqual(shoplinks.doppelteProdukte(html), [], 'dasselbe Produkt mehrfach')
  })

  test(`Muster „${mu.id}" erfindet keinen Rabatt`, () => {
    const html = musterHtml(mu.id, { marke: MARKE })
    // Der Shop führt keine Vergleichspreise: jeder Streichpreis wäre erfunden
    assert.deepEqual(shoplinks.erfundenePreise(html, []), [])
    assert.doesNotMatch(html, /line-through/, 'kein durchgestrichener Preis')
    assert.doesNotMatch(html, /-\d{1,2}\s*%/, 'kein Rabatt-Abzeichen')
  })

  test(`Muster „${mu.id}" bringt weder Logo noch Fuß mit`, () => {
    const html = musterHtml(mu.id, { marke: MARKE })
    assert.doesNotMatch(html, /abmeld/i, 'der Fuß kommt von Vendo')
    assert.doesNotMatch(html, /max-width:\s*600px/, 'die äußere Hülle macht Vendo')
    assert.doesNotMatch(html, /Impressum/i)
  })

  test(`Muster „${mu.id}" markiert, was pro Kampagne neu geschrieben wird`, () => {
    const felder = felderLesen(musterHtml(mu.id, { marke: MARKE }))
    assert.ok(felder.length >= 5, `nur ${felder.length} Felder markiert`)
    for (const f of felder) assert.ok(f.hinweis, `Feld ${f.name} hat keinen Hinweis`)
    assert.equal(new Set(felder.map((f) => f.name)).size, felder.length, 'Feldnamen sind eindeutig')
  })
}

// ── Farben ──

test('ohne eigene Markenfarben nimmt ein Muster die dunkle Welt der Marke', () => {
  const html = musterHtml('neue-motive', { marke: MARKE })
  assert.ok(html.includes(DUNKEL.akzent), 'das Gold fehlt')
  assert.ok(html.includes(DUNKEL.text), 'die helle Schrift fehlt')
  assert.ok(!html.includes('#8a6a3b'), 'nicht Vendos helle Grundeinstellung')
})

test('eigene Markenfarben gewinnen', () => {
  const html = musterHtml('neue-motive', { marke: { ...MARKE, farben: { akzent: '#ff0000' } } })
  assert.ok(html.includes('#ff0000'))
  assert.ok(!html.includes(DUNKEL.akzent))
})

// ── Die Warenkorb-Muster ──

test('die Warenkorb-Muster nutzen die Platzhalter, die Vendo dort ersetzt', () => {
  for (const id of ['warenkorb-erinnerung', 'warenkorb-letzter']) {
    const html = musterHtml(id, { marke: MARKE })
    for (const platzhalter of ['{{warenkorb}}', '{{summe}}', '{{warenkorbLink}}']) {
      assert.ok(html.includes(platzhalter), `${id}: ${platzhalter} fehlt`)
    }
  }
})

test('das Willkommens-Muster redet den Empfänger an', () => {
  assert.match(musterHtml('willkommen', { marke: MARKE }), /\{\{vorname\}\}/)
})

test('kein Muster erfindet eine Frist oder einen Rabattcode', () => {
  for (const mu of musterListe()) {
    // Die Feld-Hinweise sind Anweisungen an die KI und werden vor dem Versand entfernt;
    // geprüft wird, was beim Empfänger ankommt.
    const html = htmlMail.feldMarkenEntfernen(musterHtml(mu.id, { marke: MARKE })).toLowerCase()
    for (const wort of ['nur noch heute', 'nur für kurze zeit', 'countdown', 'läuft ab in']) {
      assert.ok(!html.includes(wort), `${mu.id} enthält „${wort}"`)
    }
  }
})

// ── Eine fertige Mail daraus ──

test('aus jedem Muster baut Vendo eine vollständige Mail mit Kopf und Fuß', () => {
  const korb = { warenkorb: '1 × Beispielartikel', warenkorbLink: 'https://donnerwolf.de/checkout/abc', summe: '59,99 EUR' }
  for (const mu of musterListe()) {
    // Vendo ersetzt die Platzhalter, bevor es säubert (siehe mailBauenAus in haupt.js) —
    // sonst würde {{warenkorbLink}} als unbrauchbare Adresse entfernt.
    const roh = personalisierenHtml(musterHtml(mu.id, { marke: MARKE }), { vorname: 'Felix' }, korb)
    const gebaut = mailAusHtml(roh, {
      marke: { ...MARKE, logo: 'https://beispiel.de/logo.png' },
      abmeldeAdresse: 'info@beispiel.de',
      rahmen: true
    })
    assert.equal(gebaut.hinweis, '', `${mu.id}: beim Säubern wurde etwas entfernt (${gebaut.hinweis})`)
    assert.match(gebaut.html, /logo\.png/, `${mu.id}: der Kopf fehlt`)
    assert.match(gebaut.html, /subject=Abmeldung/, `${mu.id}: der Fuß fehlt`)
  }
})

// ── Anlegen in Vendo und über den Bot ──

function hauptStarten() {
  let daten = {
    zugang: {},
    shopify: {},
    marke: MARKE,
    kontakte: [],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: []
  }
  const fn = {}
  starten({
    datenLaden: () => JSON.parse(JSON.stringify(daten)),
    datenSpeichern: (d) => {
      daten = JSON.parse(JSON.stringify(d))
    },
    bereitstellen: (n, f) => {
      fn[n] = f
    },
    fragen: async () => '',
    abrufen: async () => ({ ok: false }),
    eingangOrdner: false
  })
  return { fn, daten: () => daten }
}

test('musterLesen gibt die Liste an die Oberfläche', () => {
  const { fn } = hauptStarten()
  assert.equal(fn.musterLesen().liste.length, 6)
})

test('vorlageAusMuster legt eine fertige Vorlage an', () => {
  const { fn, daten } = hauptStarten()
  const r = fn.vorlageAusMuster({ id: 'willkommen' })
  assert.equal(r.ok, true, r.text)
  assert.equal(daten().vorlagen.length, 1)
  const angelegt = daten().vorlagen[0]
  assert.equal(angelegt.name, 'Willkommen')
  assert.ok(angelegt.beschreibung)
  assert.equal(vorlagePruefen(angelegt).ok, true, 'die angelegte Vorlage ist nicht sauber')
})

test('ein unbekanntes Muster legt nichts an', () => {
  const { fn, daten } = hauptStarten()
  assert.equal(fn.vorlageAusMuster({ id: 'gibtsnicht' }).ok, false)
  assert.equal(daten().vorlagen.length, 0)
})

test('der Bot sieht die Muster im ueberblick und kann eines anlegen', async () => {
  const { fn, daten } = hauptStarten()
  const ueberblick = await fn.botAuftrag({ aktion: 'ueberblick', argumente: {} })
  assert.equal(ueberblick.daten.muster.length, 6, 'die Muster stehen schon im ueberblick')

  const falsch = await fn.botAuftrag({ aktion: 'vorlage_aus_muster', argumente: { id: 'gibtsnicht' } })
  assert.equal(falsch.ok, false)
  assert.match(falsch.text, /willkommen/, 'die gültigen Kennungen stehen im Text')

  const angelegt = await fn.botAuftrag({ aktion: 'vorlage_aus_muster', argumente: { id: 'bestseller' } })
  assert.equal(angelegt.ok, true, angelegt.text)
  assert.equal(daten().vorlagen.length, 1)
  assert.equal(daten().vorlagen[0].name, 'Meistverkauft')
})

test('die Aktion steht im Bot-Vertrag und ändert etwas', () => {
  assert.deepEqual(bots.AKTIONEN.vorlage_aus_muster, ['id'])
  assert.ok(!bots.NUR_LESEN.includes('vorlage_aus_muster'), 'sie legt etwas an, Vendo muss neu zeichnen')
})
