// Newsletter-Plugin: Aufträge von Hermes-Bots.
// Ein Bot steuert alles im Plugin — nur versenden kann er nicht. Geprüft wird vor allem,
// was ein Bot NICHT kann (senden, planen, starten, einschalten, einzelne Kontakte sehen,
// Impressum ändern, Geplantes anfassen), dazu die Sperre gegen erfundene Platzhalter und
// Bilder ohne Adresse, der Freigabe-Weg, Automationen, Marke, Auswertung und der
// Eingangskorb als Dateien in frischen Ordnern unter dem Temp-Verzeichnis.
// Alle Daten sind erfunden; es wird nie eine SMTP- oder Shopify-Verbindung aufgebaut.

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import botsModul from '../plugins/newsletter/bots.js'
import starten from '../plugins/newsletter/haupt.js'

const { auftragPruefen, zeitpunktLesen, eingangLesen, auftragNehmen, antwortSchreiben, aufraeumen, AKTIONEN } = botsModul

const MORGEN = new Date(Date.now() + 86400000)
const MORGEN_TEXT = `${MORGEN.getFullYear()}-${String(MORGEN.getMonth() + 1).padStart(2, '0')}-${String(MORGEN.getDate()).padStart(2, '0')} 10:00`
const GUT = { name: 'Herbst', betreff: 'Zwei neue Motive', vorschauText: 'Limitiert, schwere Qualität', html: '<p>Hallo {{vorname}}</p>' }

// Ein gespielter Shop statt Netz: beispielshop.myshopify.com leitet auf beispielshop.de,
// die Produktliste hat zwei erfundene Produkte, Seiten mit „gibt-es-nicht“ antworten 404.
function shopSpielen(url) {
  const u = new URL(url)
  const antwort = (status, daten = null, ziel = url) => ({ status, ok: status >= 200 && status < 300, url: ziel, json: async () => daten })
  if (u.host === 'beispielshop.myshopify.com') return antwort(200, null, 'https://beispielshop.de/')
  if (u.pathname === '/products.json') {
    return antwort(200, {
      products:
        u.searchParams.get('page') === '1'
          ? [
              { title: 'Sturm Hoodie', handle: 'sturm-hoodie', product_type: 'Hoodie', tags: ['Wikinger'], variants: [{ price: '59.99', available: true }], images: [{ src: 'https://cdn.shopify.com/s/files/sturm.png' }] },
              { title: 'Rabe Shirt', handle: 'rabe-shirt', product_type: 'Shirt', tags: '', variants: [{ price: '29.95' }], images: [] }
            ]
          : []
    })
  }
  if (u.pathname === '/collections.json') return antwort(200, { collections: [{ title: 'Neu', handle: 'neu' }] })
  return antwort(u.pathname.includes('gibt-es-nicht') ? 404 : 200)
}

function ordnerNeu(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `vendo-newsletter-${name}-`))
}

// Der Hintergrundteil mit erfundenen Daten im Speicher. Eingangskorb aus, Protokoll in
// einem Temp-Ordner. Kein Passwort hinterlegt: Testmails scheitern vor jeder Verbindung.
function hauptStarten({ protokoll = [], ohneShop = false } = {}) {
  const protokollOrdner = ordnerNeu('protokoll')
  if (protokoll.length) fs.writeFileSync(path.join(protokollOrdner, 'protokoll-2026-11.ndjson'), protokoll.map((e) => JSON.stringify(e)).join('\n') + '\n')
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.de', farben: {} },
    shopify: ohneShop ? {} : { shop: 'beispielshop.myshopify.com', primaerDomain: 'beispielshop.de' },
    kontakte: [{ email: 'kundin@beispiel.de', vorname: 'Kim', nachname: 'Muster', quelle: 'shopify', zustimmungAm: '2026-10-01', zustand: 'SUBSCRIBED' }],
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
    bereitstellen: (name, f) => {
      fn[name] = f
    },
    fragen: async () => '',
    eingangOrdner: false,
    protokollOrdner,
    abrufen: async (url) => shopSpielen(url)
  })
  return { fn, daten: () => daten, bot: (aktion, argumente = {}) => fn.botAuftrag({ aktion, argumente, von: 'Vala' }) }
}

// ── Was erlaubt ist, steht in einer Liste ──

test('ein Bot hat keine Aktion zum Senden, Planen, Starten, Einschalten oder für einzelne Kontakte', () => {
  const namen = Object.keys(AKTIONEN)
  for (const verboten of ['senden', 'starten', 'planen', 'einschalten', 'schalten', 'abmeld', 'zugang', 'passwort', 'impressum', 'budget', 'sperren']) {
    assert.ok(!namen.some((n) => n.includes(verboten)), `keine Aktion mit „${verboten}“`)
  }
  assert.deepEqual(namen.filter((n) => n.includes('kontakt')), ['kontakte_abgleichen'], 'bei Kontakten nur der Abgleich mit Shopify')
})

test('unbekannte Aktionen werden abgelehnt statt geraten', () => {
  for (const aktion of ['kampagneStarten', 'kampagne_starten', 'kampagnePlanen', 'automation_einschalten', 'kontakteLesen', 'zugangLesen', '__proto__', 'constructor']) {
    assert.equal(auftragPruefen({ aktion }).ok, false, aktion)
  }
})

test('fremde Felder fallen weg, zu lange, mehrzeilige und falsche Zahlen werden abgelehnt', () => {
  const r = auftragPruefen({ aktion: 'kampagne_aendern', argumente: { id: 'k123456', betreff: 'Hallo', zustand: 'geplant', geplantAm: 1 } })
  assert.equal(r.ok, true)
  assert.deepEqual(Object.keys(r.argumente).sort(), ['betreff', 'id'], 'zustand und geplantAm kommen nicht durch')
  assert.equal(auftragPruefen({ aktion: 'kampagne_aendern', argumente: { id: 'k123456', betreff: 'a\nb' } }).ok, false)
  assert.equal(auftragPruefen({ aktion: 'kampagne_aendern', argumente: { id: 'k123456', betreff: 'x'.repeat(201) } }).ok, false)
  assert.equal(auftragPruefen({ aktion: 'automation_schritt_neu', argumente: { id: 'a123456', nach_stunden: -1 } }).ok, false)
  assert.equal(auftragPruefen({ aktion: 'marke_aendern', argumente: { farben: 'rot' } }).ok, false)
})

test('der Wunschtermin muss lesbar sein und in der Zukunft liegen', () => {
  assert.equal(zeitpunktLesen('').wert, null, 'ohne Termin ist erlaubt')
  assert.ok(zeitpunktLesen(MORGEN_TEXT).wert > Date.now())
  assert.equal(zeitpunktLesen('2020-01-01 10:00').ok, false)
  assert.equal(zeitpunktLesen('nächsten Dienstag').ok, false)
})

// ── Lesen: keine einzelnen Kontakte ──

test('Überblick und Auswertung nennen Zahlen, aber keine Adresse und keinen Namen', async () => {
  const { bot } = hauptStarten({ protokoll: [{ zeit: new Date().toISOString(), an: 'k***@beispiel.de', betreff: 'x', art: 'kampagne', kampagneId: 'k1', ok: true }] })
  for (const aktion of ['ueberblick', 'auswertung']) {
    const r = await bot(aktion)
    assert.equal(r.ok, true, aktion)
    const alles = JSON.stringify(r)
    assert.doesNotMatch(alles, /kundin|@beispiel|Kim|Muster|Musterweg/, `${aktion}: keine Kontaktdaten, kein Impressum`)
  }
})

test('die Auswertung zählt Versand, Kontakte und sagt ehrlich, was sie nicht misst', async () => {
  const jetzt = new Date().toISOString()
  const { bot } = hauptStarten({
    protokoll: [
      { zeit: jetzt, art: 'kampagne', kampagneId: 'k1', ok: true },
      { zeit: jetzt, art: 'kampagne', kampagneId: 'k1', ok: true },
      { zeit: jetzt, art: 'kampagne', kampagneId: 'k1', ok: false, fehler: 'EAUTH' },
      { zeit: jetzt, art: 'test', kampagneId: 'k1', ok: true }
    ]
  })
  const r = await bot('auswertung')
  assert.equal(r.daten.versandLetzte30Tage.gesendet, 3)
  assert.equal(r.daten.versandLetzte30Tage.fehlgeschlagen, 1)
  assert.deepEqual(r.daten.versandLetzte30Tage.haeufigsteFehler, [['EAUTH', 1]])
  assert.equal(r.daten.kontakte.empfaenger, 1)
  assert.deepEqual(r.daten.kontakte.neuJeMonat, { '2026-10': 1 })
  assert.match(r.daten.hinweis, /Öffnungen und Klicks misst Vendo nicht/)
})

// ── Entwürfe ──

test('ein Kampagnen-Entwurf braucht echten Betreff und Vorschautext', async () => {
  const { bot, daten } = hauptStarten()
  assert.match((await bot('kampagne_neu', { name: 'X', vorschauText: 'v', html: '<p>x</p>' })).text, /Betreff fehlt/)
  assert.match((await bot('kampagne_neu', { name: 'X', betreff: 'b', html: '<p>x</p>' })).text, /Vorschautext fehlt/)
  assert.match((await bot('kampagne_neu', { name: 'X', betreff: '{{betreff}}', vorschauText: 'v', html: '<p>x</p>' })).text, /Platzhalter, die Vendo nicht ersetzt/)
  assert.equal(daten().kampagnen.length, 0, 'nichts davon wurde angelegt')

  const gut = await bot('kampagne_neu', GUT)
  assert.equal(gut.ok, true, gut.text)
  assert.equal(daten().kampagnen[0].zustand, 'entwurf')
  assert.equal(daten().kampagnen[0].erstelltVon, 'Vala')
})

// Genau Valas erster Entwurf: Lücken wie {{headline}} und Bilder mit Platzhalter-Adresse
test('erfundene Platzhalter und Bilder ohne Adresse: Hinweis in der Antwort, Freigabe gesperrt', async () => {
  const { bot, fn, daten } = hauptStarten()
  const html = '<h1>{{headline}}</h1><img src="{{heroBild}}" alt="" /><p>{{inhalt}}</p>'
  const neu = await bot('kampagne_neu', { ...GUT, html })
  assert.equal(neu.ok, true)
  assert.match(neu.text, /Noch offen: .*Unbekannte Platzhalter: \{\{headline\}\}/, 'der Bot liest es im Text, nicht nur im JSON')
  assert.match(neu.text, /keine gültige Adresse/)

  const freigabe = await bot('kampagne_zur_freigabe', { id: neu.daten.id })
  assert.equal(freigabe.ok, false)
  assert.match(freigabe.text, /Unbekannte Platzhalter/)

  // Auch Felix kann so etwas nicht planen
  const geplant = fn.kampagnePlanen({ id: neu.daten.id, geplantAm: Date.now() + 86400000 })
  assert.equal(geplant.ok, false)
  assert.equal(daten().kampagnen[0].zustand, 'entwurf')
})

test('ein Entwurf aus einer Vorlage übernimmt ihr HTML', async () => {
  const { bot } = hauptStarten()
  const v = await bot('vorlage_neu', { name: 'Produkt', html: '<p data-feld="text">Aus der Vorlage</p>' })
  assert.equal(v.ok, true, v.text)
  const k = await bot('kampagne_neu', { ...GUT, html: undefined, vorlage_id: v.daten.id })
  assert.equal(k.daten.html, '<p data-feld="text">Aus der Vorlage</p>')
})

test('kopieren, aus einer Kampagne eine Vorlage machen, löschen', async () => {
  const { bot, daten } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', GUT)
  const kopie = await bot('kampagne_kopieren', { id: k.id })
  assert.equal(kopie.ok, true)
  assert.equal(daten().kampagnen.length, 2)
  assert.equal(daten().kampagnen[1].betreff, GUT.betreff)

  const v = await bot('vorlage_aus_kampagne', { id: k.id, name: 'Aus Herbst' })
  assert.equal(v.ok, true)
  assert.equal(daten().vorlagen[0].html, GUT.html)

  assert.equal((await bot('kampagne_loeschen', { id: kopie.daten.id })).ok, true)
  assert.equal((await bot('vorlage_loeschen', { id: v.daten.id })).ok, true)
  assert.equal(daten().kampagnen.length, 1)
  assert.equal(daten().vorlagen.length, 0)
})

// ── Freigabe ──

test('zur Freigabe: Zustand „freigabe“, Wunschtermin gemerkt, nichts in der Warteschlange', async () => {
  const { bot, daten } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', GUT)
  const r = await bot('kampagne_zur_freigabe', { id: k.id, zeitpunkt: MORGEN_TEXT })
  assert.equal(r.ok, true, r.text)
  const gespeichert = daten().kampagnen[0]
  assert.equal(gespeichert.zustand, 'freigabe')
  assert.equal(gespeichert.geplantAm, null, 'der Bot plant nicht selbst')
  assert.ok(gespeichert.freigabe.gewuenschtAm > Date.now())
  assert.equal(daten().warteschlange.length, 0, 'an Empfänger ist nichts eingereiht')
})

test('scheitert die Testmail, sagt die Antwort es ehrlich', async () => {
  const { bot } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', GUT)
  const r = await bot('kampagne_zur_freigabe', { id: k.id })
  assert.match(r.text, /Testmail kam nicht raus/)
  assert.match(r.text, /Felix sieht die Kampagne trotzdem/)
})

test('Ändern zieht eine offene Freigabe zurück', async () => {
  const { bot, daten } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', GUT)
  await bot('kampagne_zur_freigabe', { id: k.id })
  const r = await bot('kampagne_aendern', { id: k.id, html: '<p>Anders</p>' })
  assert.match(r.text, /zurückgezogen/)
  assert.equal(daten().kampagnen[0].zustand, 'entwurf')
  assert.equal(daten().kampagnen[0].freigabe, null)
})

test('erst Felix plant: danach kann der Bot die Kampagne weder ändern noch löschen', async () => {
  const { bot, fn, daten } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', GUT)
  await bot('kampagne_zur_freigabe', { id: k.id, zeitpunkt: MORGEN_TEXT })
  assert.equal(fn.kampagnePlanen({ id: k.id, geplantAm: daten().kampagnen[0].freigabe.gewuenschtAm }).ok, true)
  assert.equal(daten().kampagnen[0].zustand, 'geplant')

  for (const [aktion, argumente] of [
    ['kampagne_aendern', { id: k.id, html: '<p>heimlich</p>' }],
    ['kampagne_zur_freigabe', { id: k.id }],
    ['kampagne_loeschen', { id: k.id }]
  ]) {
    assert.equal((await bot(aktion, argumente)).ok, false, aktion)
  }
  assert.equal(daten().kampagnen.length, 1)
  assert.equal(daten().kampagnen[0].html, GUT.html, 'der Inhalt ist unverändert')
  // Kopieren geht: daraus wird ein neuer Entwurf, das Geplante bleibt
  assert.equal((await bot('kampagne_kopieren', { id: k.id })).ok, true)
  assert.equal(daten().kampagnen[0].zustand, 'geplant')
})

test('Felix kann eine Freigabe zurück in den Entwurf schicken; freigabenLesen nennt, was wartet', async () => {
  const { bot, fn, daten } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', GUT)
  assert.deepEqual(fn.freigabenLesen(), [])
  await bot('kampagne_zur_freigabe', { id: k.id })
  assert.equal(fn.freigabenLesen()[0].von, 'Vala')
  fn.kampagneZurueckZumEntwurf(k.id)
  assert.equal(daten().kampagnen[0].zustand, 'entwurf')
  assert.deepEqual(fn.freigabenLesen(), [])
})

// ── Automationen ──

test('ein Bot legt Automationen an und baut sie aus — eingeschaltet wird sie nicht', async () => {
  const { bot, daten } = hauptStarten()
  const neu = await bot('automation_neu', { art: 'warenkorb', name: 'Warenkorb-Serie' })
  assert.equal(neu.ok, true, neu.text)
  const id = neu.daten.id
  assert.equal(daten().automationen[0].aktiv, false)
  assert.equal(daten().automationen[0].name, 'Warenkorb-Serie')
  assert.equal((await bot('automation_neu', { art: 'warenkorb' })).ok, false, 'je Art eine')
  assert.equal((await bot('automation_neu', { art: 'gibtsnicht' })).ok, false)

  const schritt = await bot('automation_schritt_aendern', { id, schritt: 2, betreff: 'Noch da?', html: '<p>Dein Warenkorb: {{warenkorb}}</p>', nach_stunden: 30 })
  assert.equal(schritt.ok, true, schritt.text)
  assert.equal(daten().automationen[0].schritte[1].nach, 30 * 3600000)

  assert.equal((await bot('automation_schritt_neu', { id, betreff: 'Letzte Chance', html: '<p>Bis morgen</p>', nach_stunden: 48 })).ok, true)
  assert.equal(daten().automationen[0].schritte.length, 3)
  assert.equal((await bot('automation_schritt_loeschen', { id, schritt: 3 })).ok, true)
  assert.equal(daten().automationen[0].schritte.length, 2)
  assert.equal(daten().automationen[0].aktiv, false)
})

test('eingeschaltete Automationen: weder ändern noch Schritte noch löschen', async () => {
  const { bot, daten } = hauptStarten()
  const { daten: x } = await bot('automation_neu', { art: 'willkommen' })
  await bot('automation_schritt_aendern', { id: x.id, schritt: 1, betreff: 'Willkommen', html: '<p>vorher</p>' })
  daten().automationen[0].aktiv = true // eingeschaltet wird in Vendo; hier direkt im Stand

  for (const [aktion, argumente] of [
    ['automation_schritt_aendern', { id: x.id, schritt: 1, html: '<p>nachher</p>' }],
    ['automation_schritt_neu', { id: x.id, html: '<p>neu</p>' }],
    ['automation_schritt_loeschen', { id: x.id, schritt: 1 }],
    ['automation_loeschen', { id: x.id }]
  ]) {
    const r = await bot(aktion, argumente)
    assert.equal(r.ok, false, aktion)
    assert.match(r.text, /eingeschaltet/)
  }
  assert.equal(daten().automationen[0].schritte[0].html, '<p>vorher</p>')
})

test('erfundene Platzhalter sperren das Einschalten einer Automation; Warenkorb-Angaben nur beim Warenkorb', async () => {
  const { bot, fn } = hauptStarten()
  const { daten: w } = await bot('automation_neu', { art: 'willkommen' })
  for (const nummer of [1, 2]) await bot('automation_schritt_aendern', { id: w.id, schritt: nummer, betreff: 'Hallo', html: '<p>{{warenkorb}}</p>' })
  const r = fn.automationSchalten({ id: w.id, aktiv: true })
  assert.equal(r.ok, false)
  assert.match(r.text, /unbekannte Platzhalter \{\{warenkorb\}\}/)
})

// ── Marke und Kontakte ──

test('die Marke: Name, Logo, Farben ja — Impressum und Abmeldeadresse bleiben', async () => {
  const { bot, daten } = hauptStarten()
  const r = await bot('marke_aendern', { titel: 'Neuer Name', logo: 'https://cdn.shopify.com/logo.png', farben: { akzent: '#112233', quatsch: '#000000', text: 'rot' } })
  assert.equal(r.ok, true)
  const marke = daten().marke
  assert.equal(marke.titel, 'Neuer Name')
  assert.equal(marke.farben.akzent, '#112233')
  assert.equal(marke.impressum, 'Beispielshop, Musterweg 1')
  assert.equal(marke.abmeldeAdresse, 'abmelden@beispiel.de')
  assert.match(r.text, /Nicht übernommen.*quatsch.*text|Nicht übernommen.*text.*quatsch/)
  assert.equal((await bot('marke_aendern', { logo: 'http://unsicher.de/logo.png' })).ok, false)
})

test('Kontakte abgleichen ohne Shopify-Zugang meldet den Grund und gibt keine Kontakte heraus', async () => {
  const { bot } = hauptStarten()
  const r = await bot('kontakte_abgleichen')
  assert.equal(r.ok, false)
  assert.ok(r.text.length > 5)
  assert.doesNotMatch(JSON.stringify(r), /kundin|@beispiel/)
})

// ── Sofort sichtbar in Vendo ──

test('standLesen zählt Änderungen eines Bots, Lesen zählt nicht', async () => {
  const { bot, fn } = hauptStarten()
  assert.equal(fn.standLesen().stand, 0)
  await bot('ueberblick')
  await bot('auswertung')
  assert.equal(fn.standLesen().stand, 0)
  const { daten: k } = await bot('kampagne_neu', GUT)
  const stand = fn.standLesen()
  assert.equal(stand.stand, 1)
  assert.equal(stand.zuletzt[0].id, k.id)
  assert.equal(stand.zuletzt[0].von, 'Vala')
  await bot('kampagne_neu', { name: 'abgelehnt' }) // abgelehnt: zählt nicht
  assert.equal(fn.standLesen().stand, 1)
})

// ── Nur echte Adressen aus dem Shop ──

test('shop_produkte liefert fertige Adressen aus dem Shop, auch gefiltert', async () => {
  const { bot } = hauptStarten()
  const r = await bot('shop_produkte', { suche: 'hoodie' })
  assert.equal(r.ok, true, r.text)
  assert.equal(r.daten.shop, 'https://beispielshop.de')
  assert.deepEqual(r.daten.produkte.map((p) => p.url), ['https://beispielshop.de/products/sturm-hoodie'])
  assert.equal(r.daten.produkte[0].preis, '59,99 €')
  assert.equal(r.daten.produkte[0].bild, 'https://cdn.shopify.com/s/files/sturm.png')
  assert.equal(r.daten.sammlungen[0].url, 'https://beispielshop.de/collections/neu')
})

test('Links auf fremde Seiten oder erfundene Produkte sperren die Freigabe', async () => {
  const { bot, daten } = hauptStarten()
  const fremd = await bot('kampagne_neu', { ...GUT, html: '<a href="https://fremd.de/angebot">Angebot</a>' })
  assert.match(fremd.text, /Noch offen: .*nicht aus deinem Shop/, 'schon beim Anlegen gemeldet, ohne Netz')
  const r1 = await bot('kampagne_zur_freigabe', { id: fremd.daten.id })
  assert.equal(r1.ok, false)
  assert.match(r1.text, /fremd\.de.*nicht aus deinem Shop/)

  const erfunden = await bot('kampagne_neu', { ...GUT, html: '<a href="https://beispielshop.de/products/gibt-es-nicht">Zum Produkt</a>' })
  const r2 = await bot('kampagne_zur_freigabe', { id: erfunden.daten.id })
  assert.equal(r2.ok, false)
  assert.match(r2.text, /gibt es nicht \(404\)/)
  assert.ok(daten().kampagnen.every((k) => k.zustand === 'entwurf'))

  const echt = await bot('kampagne_neu', { ...GUT, html: '<a href="https://beispielshop.de/products/sturm-hoodie"><img src="https://cdn.shopify.com/s/files/sturm.png" alt="Sturm" /></a>' })
  const r3 = await bot('kampagne_zur_freigabe', { id: echt.daten.id })
  assert.equal(r3.ok, true, r3.text)
})

test('ohne bekannte Shop-Adresse gibt es keine Freigabe', async () => {
  const { bot } = hauptStarten({ ohneShop: true })
  const { daten: k } = await bot('kampagne_neu', GUT)
  const r = await bot('kampagne_zur_freigabe', { id: k.id })
  assert.equal(r.ok, false)
  assert.match(r.text, /kennt die Adresse deines Shops nicht/)
})

test('links_pruefen meldet jede unechte Adresse einzeln', async () => {
  const { bot } = hauptStarten()
  const { daten: k } = await bot('kampagne_neu', { ...GUT, html: '<a href="http://beispielshop.de/x">A</a><a href="https://beispielshop.de/products/gibt-es-nicht-2">B</a><img src="https://bilder.fremd.de/b.png" alt="" />' })
  const r = await bot('links_pruefen', { id: k.id })
  assert.equal(r.ok, false)
  assert.deepEqual(r.daten.probleme.map((p) => p.grund).sort(), ['Bild nicht aus deinem Shop', 'gibt es nicht (404)', 'kein https-Link'])
})

// ── Richtige Vorlagen ──

test('eine Vorlage ohne markierte Felder ist eine fertige Mail und wird abgelehnt', async () => {
  const { bot, daten } = hauptStarten()
  const r = await bot('vorlage_neu', { name: 'Fertige Mail', html: '<h1>Herbst-Drop</h1><p>Zwei Motive.</p>' })
  assert.equal(r.ok, false)
  assert.match(r.text, /fertige Mail, keine Vorlage/)
  assert.equal(daten().vorlagen.length, 0)
})

test('eine Kampagne aus einer Vorlage: übrig gebliebener Beispieltext sperrt die Freigabe', async () => {
  const { bot } = hauptStarten()
  const vorlage = '<h1 data-feld="ueberschrift">Der Sturm ist da</h1><p data-feld="einleitung" data-feld-hinweis="Zwei Sätze">Zwei neue Motive aus schwerer Baumwolle, limitiert.</p>'
  const v = await bot('vorlage_neu', { name: 'Drop', html: vorlage })
  assert.deepEqual(v.daten.felder.map((f) => f.name), ['ueberschrift', 'einleitung'])
  assert.equal(v.daten.felder[1].hinweis, 'Zwei Sätze')

  const k = await bot('kampagne_neu', { ...GUT, html: undefined, vorlage_id: v.daten.id })
  assert.match(k.text, /Noch Beispielinhalt aus der Vorlage in: ueberschrift, einleitung/)
  const nurMinimum = await bot('kampagne_aendern', { id: k.daten.id, html: vorlage.replace('Der Sturm ist da', 'Herbst ist da') })
  assert.match(nurMinimum.text, /Noch Beispielinhalt aus der Vorlage in: einleitung/, 'nur die Überschrift zu ändern reicht nicht')
  assert.equal((await bot('kampagne_zur_freigabe', { id: k.daten.id })).ok, false)

  await bot('kampagne_aendern', { id: k.daten.id, html: '<h1 data-feld="ueberschrift">Herbst ist da</h1><p data-feld="einleitung">Der Rabe und der Sturm, beide jetzt im Shop.</p>' })
  const freigabe = await bot('kampagne_zur_freigabe', { id: k.daten.id })
  assert.equal(freigabe.ok, true, freigabe.text)
})

test('ein Vorlagen-Entwurf von Luzzy bekommt markierte Felder, ist also keine fertige Mail', async () => {
  const { fn } = hauptStarten()
  const antwort = JSON.stringify({ name: 'Drop', beschreibung: 'Neues Produkt', bausteine: [{ art: 'titel', text: 'Neu im Shop' }, { art: 'text', text: 'Zwei Motive.' }] })
  const r = fn.vorlageKiUebernehmen({ text: antwort })
  assert.equal(r.ok, true, r.text)
  const v = fn.vorlagenLesen().liste[0]
  assert.deepEqual(v.felder.map((f) => f.name), ['titel1', 'text1'])
  assert.match(v.vorschau, /^<!DOCTYPE html/, 'die fertige Mail für das Vorschaubild')
})

// ── Eingangskorb ──

test('der Korb liest Aufträge, ältester zuerst, und meldet kaputte statt sie zu verschlucken', () => {
  const ordner = ordnerNeu('korb')
  fs.writeFileSync(path.join(ordner, 'auftrag01.auftrag.json'), JSON.stringify({ aktion: 'ueberblick' }))
  fs.writeFileSync(path.join(ordner, 'auftrag02.auftrag.json'), '{ kaputt')
  fs.writeFileSync(path.join(ordner, '..__boese.auftrag.json'), '{}')
  fs.writeFileSync(path.join(ordner, 'notiz.txt'), 'egal')
  const alt = new Date(Date.now() - 5000)
  fs.utimesSync(path.join(ordner, 'auftrag01.auftrag.json'), alt, alt)

  const liste = eingangLesen(ordner)
  assert.deepEqual(liste.map((e) => e.id), ['auftrag01', 'auftrag02'])
  assert.equal(liste[0].roh.aktion, 'ueberblick')
  assert.match(liste[1].fehler, /kein gültiges JSON/)
})

test('ein zurückgezogener Auftrag wird nicht ausgeführt', () => {
  const ordner = ordnerNeu('korb')
  const datei = path.join(ordner, 'auftrag01.auftrag.json')
  fs.writeFileSync(datei, '{}')
  const [eintrag] = eingangLesen(ordner)
  fs.unlinkSync(datei)
  assert.equal(auftragNehmen(eintrag), false)
})

test('Antworten landen neben dem Auftrag, alte werden weggeräumt, fremde IDs nicht geschrieben', () => {
  const ordner = ordnerNeu('korb')
  assert.equal(antwortSchreiben('auftrag01', { ok: true }, ordner), true)
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(ordner, 'auftrag01.antwort.json'), 'utf8')), { ok: true })
  assert.equal(antwortSchreiben('../ausbruch', { ok: true }, ordner), false, 'kein Pfad aus dem Korb heraus')
  const alt = new Date(Date.now() - 11 * 60000)
  fs.utimesSync(path.join(ordner, 'auftrag01.antwort.json'), alt, alt)
  assert.equal(aufraeumen(ordner), 1)
})

// Der ganze Weg: Auftragsdatei hinein, Vendo arbeitet sie im Takt ab, Antwort liegt daneben.
// Als letzter Test, weil der Korb-Zeitgeber je Prozess nur einmal startet.
test('ein Auftrag im Korb wird ausgeführt und beantwortet', async () => {
  const ordner = ordnerNeu('korb')
  let daten = { zugang: {}, marke: { titel: 'Beispielshop' }, kontakte: [], kampagnen: [], vorlagen: [], automationen: [], laeufe: [], warteschlange: [] }
  starten({
    datenLaden: () => JSON.parse(JSON.stringify(daten)),
    datenSpeichern: (d) => {
      daten = JSON.parse(JSON.stringify(d))
    },
    bereitstellen: () => {},
    fragen: async () => '',
    eingangOrdner: ordner,
    protokollOrdner: ordnerNeu('protokoll')
  })

  fs.writeFileSync(path.join(ordner, 'probe-1234.auftrag.json'), JSON.stringify({ aktion: 'kampagne_neu', von: 'Vala', argumente: { ...GUT, name: 'Aus dem Korb' } }))
  fs.writeFileSync(path.join(ordner, 'probe-5678.auftrag.json'), JSON.stringify({ aktion: 'kampagne_starten', argumente: { id: 'x' } }))

  const antwortDatei = (id) => path.join(ordner, `${id}.antwort.json`)
  for (let i = 0; i < 40 && !(fs.existsSync(antwortDatei('probe-1234')) && fs.existsSync(antwortDatei('probe-5678'))); i++) {
    await new Promise((r) => setTimeout(r, 100))
  }
  const angelegt = JSON.parse(fs.readFileSync(antwortDatei('probe-1234'), 'utf8'))
  assert.equal(angelegt.ok, true, angelegt.text)
  assert.equal(daten.kampagnen[0].name, 'Aus dem Korb')
  const abgelehnt = JSON.parse(fs.readFileSync(antwortDatei('probe-5678'), 'utf8'))
  assert.equal(abgelehnt.ok, false)
  assert.match(abgelehnt.text, /nicht erlaubte Aktion/)
})
