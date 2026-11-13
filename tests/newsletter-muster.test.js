// Newsletter-Plugin: die fertigen Muster im Stil der Marke — zugleich die Grundvorlagen.
//
// Geprüft wird, dass jedes Muster Vendos eigene Prüfungen besteht — kein Bild ohne
// Adresse, kein Knopf ohne Ziel, kein erfundener Streichpreis, kein doppeltes Bild, kein
// doppeltes Produkt, kein Logo und kein Fuß — und dass die Farben aus den Markenangaben
// kommen. Alle Daten sind erfunden, es geht nichts nach außen.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import musterModul from '../plugins/newsletter/muster.js'
import vorlagenModul from '../plugins/newsletter/vorlagen.js'
import htmlMail from '../plugins/newsletter/html-mail.js'
import kampagnenModul from '../plugins/newsletter/kampagnen.js'
import shoplinks from '../plugins/newsletter/shoplinks.js'
import bots from '../plugins/newsletter/bots.js'
import starten from '../plugins/newsletter/haupt.js'

const { musterListe, musterHtml, DUNKEL, ORDNER, kopfLesen, ersetzen } = musterModul
const { vorlagePruefen } = vorlagenModul
const { bilderOhneAdresse, linksOhneZiel, felderLesen, mailAusHtml } = htmlMail
const { personalisierenHtml } = kampagnenModul

const MARKE = { titel: 'Donnerwolf', impressum: 'Beispiel GmbH, Musterweg 1, 12345 Musterstadt' }

// ── Es sind sechs, und sie decken die drei Fälle ab ──

test('die Muster kommen aus eigenen HTML-Dateien', () => {
  const dateien = fs.readdirSync(ORDNER).filter((n) => n.endsWith('.html'))
  assert.equal(dateien.length, musterListe().length, 'je Datei ein Muster')
  for (const mu of musterListe()) {
    assert.ok(dateien.includes(`${mu.id}.html`), `${mu.id}.html fehlt`)
  }
})

test('jede Datei nennt Name, Art und Beschreibung im Kopf', () => {
  for (const datei of fs.readdirSync(ORDNER).filter((n) => n.endsWith('.html'))) {
    const roh = fs.readFileSync(path.join(ORDNER, datei), 'utf8')
    for (const feld of ['name', 'art', 'beschreibung']) {
      assert.ok(kopfLesen(roh, feld), `${datei}: ${feld} fehlt im Kopf`)
    }
  }
})

test('kein Platzhalter bleibt ungefüllt', () => {
  for (const mu of musterListe()) {
    const offen = musterHtml(mu.id, { marke: MARKE }).match(/%[A-Z0-9]+%/g)
    assert.equal(offen, null, `${mu.id}: ${offen && offen.join(', ')}`)
  }
  // Ein unbekannter Token bleibt stehen, statt still zu verschwinden
  assert.match(ersetzen('<p>%GIBTSNICHT%</p>', {}), /%GIBTSNICHT%/)
})

test('die Anleitung aus den Dateien landet nicht in der Mail', () => {
  for (const mu of musterListe()) {
    const html = musterHtml(mu.id, { marke: MARKE })
    assert.doesNotMatch(html, /<!--/, `${mu.id}: Kommentar in der Mail`)
    assert.doesNotMatch(html, /%TOKEN%|von Hand änderbar/, `${mu.id}: Anleitung in der Mail`)
  }
})

test('es gibt Muster für Newsletter, Warenkorb und Willkommen', () => {
  const liste = musterListe()
  assert.ok(liste.length >= 6, `nur ${liste.length} Muster`)
  const arten = liste.map((x) => x.art)
  assert.ok(arten.filter((a) => a === 'kampagne').length >= 3, 'mindestens drei Newsletter')
  assert.ok(arten.includes('warenkorb'), 'ein Warenkorb-Muster fehlt')
  assert.ok(arten.includes('willkommen'), 'ein Willkommens-Muster fehlt')
  for (const x of liste) {
    assert.ok(x.id && x.name && x.beschreibung, `${x.id} ist unvollständig beschrieben`)
  }
  assert.equal(new Set(liste.map((x) => x.id)).size, liste.length, 'die Kennungen sind eindeutig')
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
    // Ein randloses Bild darf 600 px breit sein; eine Tabelle mit dieser Höchstbreite wäre
    // dagegen die äußere Hülle, und die macht Vendo.
    assert.deepEqual(
      [...html.matchAll(/<table[^>]*>/gi)].map((t) => t[0]).filter((t) => /max-width/i.test(t)),
      [],
      'eine Tabelle bringt eine eigene Höchstbreite mit'
    )
    assert.doesNotMatch(html, /Impressum/i)
  })

  test(`Muster „${mu.id}" markiert, was pro Kampagne neu geschrieben wird`, () => {
    const felder = felderLesen(musterHtml(mu.id, { marke: MARKE }))
    assert.ok(felder.length >= 5, `nur ${felder.length} Felder markiert`)
    for (const f of felder) assert.ok(f.hinweis, `Feld ${f.name} hat keinen Hinweis`)
    assert.equal(new Set(felder.map((f) => f.name)).size, felder.length, 'Feldnamen sind eindeutig')
  })
}

// ── Die Dateien sind gültiges HTML ──
// Vorher standen %TOKEN% in den style-Attributen; jeder Editor meldete dort ungültiges CSS.

test('in keinem style-Attribut steht ein Platzhalter', () => {
  for (const datei of fs.readdirSync(ORDNER).filter((n) => n.endsWith('.html'))) {
    const roh = fs.readFileSync(path.join(ORDNER, datei), 'utf8')
    const schlecht = [...roh.matchAll(/style="([^"]*)"/g)].map((t) => t[1]).filter((w) => /%[A-Z0-9]+%|\{\{/.test(w))
    assert.deepEqual(schlecht, [], `${datei}: ungültiges CSS`)
  }
})

test('die Dateien enthalten überhaupt keine Platzhalter mehr', () => {
  for (const datei of fs.readdirSync(ORDNER).filter((n) => n.endsWith('.html'))) {
    const roh = fs.readFileSync(path.join(ORDNER, datei), 'utf8')
    assert.equal(roh.match(/%[A-Z0-9]+%/g), null, `${datei}: Platzhalter übrig`)
  }
})

test('jede Farbe der Standardwelt kommt nur in einer Rolle vor', () => {
  // Ersetzt wird Wert für Wert; zwei Rollen mit derselben Farbe bekämen beide die neue
  const werte = Object.values(DUNKEL).map((w) => w.toLowerCase())
  assert.equal(new Set(werte).size, werte.length, 'zwei Rollen teilen sich eine Farbe')
})

test('die Bildflächen zeigen auf das mitgeschickte Platzhalterbild', () => {
  for (const mu of musterListe()) {
    const html = musterHtml(mu.id, { marke: MARKE })
    const bilder = [...html.matchAll(/<img[^>]*src="([^"]+)"/g)].map((t) => t[1])
    for (const src of bilder) {
      assert.match(src, /^cid:vendo-nl-bild$/, `${mu.id}: ${src} ist kein Platzhalter`)
    }
  }
})

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

// ── Muster sind Vorlagen: eine Liste, Kopie erst beim Ändern ──
// Vorher legte jeder Klick auf ein Muster eine Kopie an, und die Muster standen zusätzlich
// daneben: aus sieben Mustern wurden elf Vorlagen plus sieben Muster.

test('jede fertige Muster-Mail trägt den Handy-Stil, und kein Muster hat starre Spalten', () => {
  const { starreSpalten } = htmlMail
  for (const x of musterListe()) {
    const html = musterHtml(x.id, { marke: MARKE })
    assert.equal(starreSpalten(html), 0, `${x.id}: Zelle ohne class="spalte"`)
    const mail = mailAusHtml(html, { marke: MARKE, abmeldeAdresse: 'abmelden@beispiel.de' }).html
    assert.match(mail, /@media only screen and \(max-width: \d+px\)[\s\S]*\.spalte \{ display: block !important/, x.id)
  }
})

test('ohne eigene Vorlagen stehen alle Muster in der Vorlagenliste, mit fertiger Vorschau', () => {
  const { fn, daten } = hauptStarten()
  const liste = fn.vorlagenLesen().liste
  assert.deepEqual(liste.map((v) => v.id), musterListe().map((x) => x.id))
  for (const v of liste) {
    assert.equal(v.muster, true)
    assert.ok(v.felder.length, `${v.id}: ohne Felder`)
    assert.ok(v.vorschau && v.vorschau.includes('<html'), `${v.id}: keine Vorschau`)
    assert.doesNotMatch(v.vorschau, /cid:/, `${v.id}: cid gehört nicht in die Oberfläche`)
  }
  assert.equal(daten().vorlagen.length, 0, 'nur ansehen legt nichts an')
  assert.equal(fn.musterLesen, undefined, 'keine zweite Liste mehr')
})

test('ein Muster lässt sich ansehen, testen und anwenden, ohne dass eine Kopie entsteht', () => {
  const { fn, daten } = hauptStarten()
  assert.equal(fn.vorlageVorschau('willkommen').ok, true)
  const kId = fn.kampagneAnlegen('Aus Muster').id
  const r = fn.vorlageAnwenden({ vorlageId: 'willkommen', ziel: 'kampagne', id: kId })
  assert.equal(r.ok, true, r.text)
  assert.equal(daten().kampagnen[0].html, musterHtml('willkommen', { marke: MARKE }))
  // Selbstspeichern beim Reiterwechsel mit unverändertem Inhalt: keine Kopie
  const gleich = fn.vorlagenLesen().liste.find((v) => v.id === 'willkommen')
  const s = fn.vorlageSpeichern({ id: 'willkommen', name: gleich.name, beschreibung: gleich.beschreibung, html: gleich.html, htmlRahmen: true })
  assert.equal(s.ok, true)
  assert.equal(s.id, 'willkommen')
  assert.equal(daten().vorlagen.length, 0)
})

test('wer ein Muster ändert, bekommt eine eigene Fassung — und die steht an seiner Stelle', () => {
  const { fn, daten } = hauptStarten()
  const html = musterHtml('willkommen', { marke: MARKE }).replace('</table>', '</table><p>Eigener Zusatz</p>')
  const s = fn.vorlageSpeichern({ id: 'willkommen', html })
  assert.equal(s.ok, true)
  assert.equal(s.kopiert, true)
  assert.notEqual(s.id, 'willkommen')
  assert.equal(daten().vorlagen.length, 1)
  assert.equal(daten().vorlagen[0].musterId, 'willkommen')
  assert.equal(daten().vorlagen[0].name, 'Willkommen')

  const liste = fn.vorlagenLesen().liste
  assert.equal(liste.length, musterListe().length, 'nicht eins mehr — die Fassung ersetzt das Muster')
  assert.ok(!liste.some((v) => v.id === 'willkommen'))
  const eigene = liste.find((v) => v.id === s.id)
  assert.equal(eigene.ausMuster, 'Willkommen')
  assert.equal(eigene.muster, false)

  // Weiter ändern trifft die Fassung, keine zweite Kopie
  assert.equal(fn.vorlageSpeichern({ id: s.id, html: `${html}<p>noch mehr</p>` }).kopiert, undefined)
  assert.equal(daten().vorlagen.length, 1)
})

test('zurücksetzen löscht die Fassung, das Muster ist wieder da; ein Muster selbst bleibt', () => {
  const { fn, daten } = hauptStarten()
  assert.equal(fn.vorlageLoeschen('willkommen').ok, false, 'ein Muster löscht man nicht')
  const s = fn.vorlageSpeichern({ id: 'willkommen', name: 'Hallo neu' })
  const r = fn.vorlageLoeschen(s.id)
  assert.equal(r.ok, true)
  assert.match(r.text, /wieder als Muster/)
  assert.equal(daten().vorlagen.length, 0)
  assert.ok(fn.vorlagenLesen().liste.some((v) => v.id === 'willkommen'))
})

test('alte Kopien ohne musterId verdecken ihr Muster über den Namen', () => {
  const { fn, daten } = hauptStarten()
  // so legte die frühere Fassung von vorlageAusMuster Kopien an
  fn.vorlageAnlegen({ name: 'Meistverkauft' })
  assert.equal(daten().vorlagen[0].musterId, undefined)
  const liste = fn.vorlagenLesen().liste
  assert.ok(!liste.some((v) => v.id === 'bestseller'), 'kein Muster neben seiner Kopie')
  assert.equal(liste.find((v) => v.id === daten().vorlagen[0].id).ausMuster, 'Meistverkauft')
})

test('der Bot nimmt nur die Muster aus dem Ordner — auch wenn Felix eines angepasst hat', async () => {
  const { fn, daten } = hauptStarten()
  const bot = (aktion, argumente = {}) => fn.botAuftrag({ aktion, argumente, von: 'Vala' })
  // Felix passt in Vendo das Muster „Meistverkauft" an
  const s = fn.vorlageSpeichern({ id: 'bestseller', html: '<p data-feld="eigen">Felix’ Fassung</p>' })
  assert.equal(s.kopiert, true)

  const ueberblick = await bot('ueberblick')
  assert.equal(ueberblick.daten.muster, undefined, 'keine zweite Liste')
  assert.deepEqual(ueberblick.daten.vorlagen.map((v) => v.id), musterListe().map((x) => x.id))

  const gezeigt = await bot('vorlage_zeigen', { id: 'bestseller' })
  assert.equal(gezeigt.ok, true, gezeigt.text)
  assert.equal(gezeigt.daten.muster, true)
  assert.equal(gezeigt.daten.html, musterHtml('bestseller', { marke: MARKE }), 'das Muster aus der Datei, nicht Felix’ Fassung')
  assert.equal((await bot('vorlage_zeigen', { id: s.id })).ok, false, 'Felix’ Fassung sieht der Bot nicht')

  const k = await bot('kampagne_neu', { vorlage_id: 'bestseller', betreff: 'Die Renner', vorschauText: 'Was gerade geht' })
  assert.equal(k.ok, true, k.text)
  assert.equal(daten().kampagnen[0].html, musterHtml('bestseller', { marke: MARKE }))

  const falsch = await bot('kampagne_neu', { name: 'Falsch', vorlage_id: 'gibtsnicht', betreff: 'x', vorschauText: 'y' })
  assert.equal(falsch.ok, false)
  assert.match(falsch.text, /willkommen/, 'die gültigen Kennungen stehen im Text')
})

test('Vorlagen anlegen, ändern oder löschen steht nicht im Bot-Vertrag', () => {
  for (const aktion of ['vorlage_neu', 'vorlage_aendern', 'vorlage_aus_kampagne', 'vorlage_aus_muster', 'vorlage_loeschen']) {
    assert.equal(bots.AKTIONEN[aktion], undefined, aktion)
  }
  assert.deepEqual(bots.AKTIONEN.vorlage_zeigen, ['id'])
  assert.ok(bots.NUR_LESEN.includes('vorlage_zeigen'))
})
