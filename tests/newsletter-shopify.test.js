// Newsletter-Plugin, Phase 2: Shopify.
// Geprüft wird das Holen der Abonnenten (mit Seitenwechsel und Rückfall auf die schlanke
// Abfrage), das Zurückschreiben einer Abmeldung und die Fehlerbehandlung. Es wird nie eine
// echte Verbindung aufgebaut: `holen` ist ein Ersatz für fetch, der die Fixture ausliefert.

import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'
import shopify from '../plugins/newsletter/shopify.js'

const { zugangPruefen, abonnentenHolen, abmeldungSchreiben, warenkoerbeHolen, bestellerHolen, kontaktAus, warenkorbAus, istFeldFehler, seitFilter, API_VERSION } = shopify

const fixture = JSON.parse(await readFile(new URL('./fixtures/newsletter/shopify-kunden.json', import.meta.url), 'utf8'))

const ZUGANG = { shop: 'meinshop.myshopify.com', token: 'shpat_abcdefghijklmnopqrstuvwxyz1234' }

// Ein fetch-Ersatz, der die vorgegebenen Antworten der Reihe nach ausliefert und mitschreibt,
// was angefragt wurde.
function fetchErsatz(antworten) {
  const anfragen = []
  let i = 0
  const holen = async (url, optionen) => {
    anfragen.push({ url, optionen, koerper: JSON.parse(optionen.body) })
    const naechste = antworten[Math.min(i++, antworten.length - 1)]
    if (typeof naechste === 'number') return { ok: false, status: naechste, json: async () => ({}) }
    if (naechste instanceof Error) throw naechste
    return { ok: true, status: 200, json: async () => naechste }
  }
  return { holen, anfragen }
}

// ── Zugang prüfen ──

test('zugangPruefen nimmt eine myshopify-Adresse an und putzt sie', () => {
  const e = zugangPruefen({ shop: ' https://MeinShop.myshopify.com/admin ', token: ZUGANG.token })
  assert.equal(e.ok, true)
  assert.equal(e.wert.shop, 'meinshop.myshopify.com')
})

test('zugangPruefen lehnt eine eigene Domain und kaputte Token ab', () => {
  assert.equal(zugangPruefen({ shop: 'meinshop.de' }).ok, false)
  assert.equal(zugangPruefen({}).ok, false)
  const token = zugangPruefen({ shop: ZUGANG.shop, token: 'geheim123' })
  assert.equal(token.ok, false)
  assert.match(token.fehler.join(' '), /Shopify-Token/)
})

test('zugangPruefen erlaubt einen leeren Token (dann bleibt der gespeicherte)', () => {
  assert.equal(zugangPruefen({ shop: ZUGANG.shop, token: '' }).ok, true)
})

// ── Kontakt aus einem Knoten ──

test('kontaktAus nimmt den Zeitpunkt der Zustimmung, sonst das Anlegedatum', () => {
  const mit = kontaktAus(fixture.seite1.data.customers.nodes[0])
  assert.equal(mit.email, 'anna.beispiel@beispiel.de', 'Adresse wird kleingeschrieben')
  assert.equal(mit.zustimmungAm, '2025-06-01T08:30:00Z')
  assert.match(mit.zustimmungNachweis, /Marketing-Zustimmung/)

  const ohne = kontaktAus(fixture.seite1.data.customers.nodes[1])
  assert.equal(ohne.zustimmungAm, '2025-04-02T11:00:00Z', 'Rückfall auf createdAt')
  assert.match(ohne.zustimmungNachweis, /angelegt/)
})

test('kontaktAus speichert den Zustand mit, damit er nachprüfbar ist', () => {
  const k = kontaktAus(fixture.seite1.data.customers.nodes[0])
  assert.equal(k.zustand, 'SUBSCRIBED')
  assert.match(k.zustimmungNachweis, /SUBSCRIBED/)

  const ohneZustand = kontaktAus(fixture.schlankeSeite.data.customers.nodes[0])
  assert.equal(ohneZustand.zustand, null, 'die schlanke Abfrage liefert keinen Zustand')
})

test('kontaktAus wirft Kunden ohne Adresse weg', () => {
  assert.equal(kontaktAus(fixture.seite1.data.customers.nodes[2]), null)
  assert.equal(kontaktAus(null), null)
})

// ── Abonnenten holen ──

test('abonnentenHolen blättert durch alle Seiten und filtert auf Abonnenten', async () => {
  const { holen, anfragen } = fetchErsatz([fixture.seite1, fixture.seite2])
  const ergebnis = await abonnentenHolen({ ...ZUGANG, holen })

  assert.equal(ergebnis.ok, true)
  assert.equal(ergebnis.seiten, 2)
  assert.deepEqual(
    ergebnis.kontakte.map((k) => k.email),
    ['anna.beispiel@beispiel.de', 'bo@beispiel.de', 'cem@beispiel.de'],
    'der Kunde ohne Adresse fehlt'
  )
  assert.equal(anfragen.length, 2)
  assert.match(anfragen[0].url, new RegExp(`/admin/api/${API_VERSION}/graphql\\.json$`))
  assert.equal(anfragen[0].optionen.headers['X-Shopify-Access-Token'], ZUGANG.token)
  assert.match(anfragen[0].koerper.query, /accepts_marketing:true/, 'nur Kunden mit Zustimmung')
  assert.equal(anfragen[1].koerper.variables.cursor, 'cursor-seite-2', 'die zweite Seite nutzt den Cursor')
})

test('kennt die API-Version das Zustimmungsfeld nicht, wird die schlanke Abfrage genommen', async () => {
  const { holen, anfragen } = fetchErsatz([fixture.feldFehler, fixture.schlankeSeite])
  const ergebnis = await abonnentenHolen({ ...ZUGANG, holen })

  assert.equal(ergebnis.ok, true)
  assert.equal(ergebnis.schlank, true)
  assert.equal(ergebnis.kontakte.length, 1)
  assert.equal(ergebnis.kontakte[0].zustimmungAm, '2025-02-02T12:00:00Z')
  assert.match(anfragen[0].koerper.query, /defaultEmailAddress/)
  assert.ok(!anfragen[1].koerper.query.includes('defaultEmailAddress'), 'der zweite Versuch lässt das Feld weg')
})

test('istFeldFehler erkennt nur echte Feldfehler', () => {
  assert.equal(istFeldFehler(fixture.feldFehler.errors), true)
  assert.equal(istFeldFehler([{ message: 'Throttled' }]), false)
  assert.equal(istFeldFehler(null), false)
})

test('abonnentenHolen meldet einen abgelehnten Token verständlich', async () => {
  const { holen } = fetchErsatz([401])
  const ergebnis = await abonnentenHolen({ ...ZUGANG, holen })
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.fehler, /abgelehnt/)
  assert.match(ergebnis.fehler, /read_customers/)
})

test('abonnentenHolen meldet Drosselung und Netzprobleme getrennt', async () => {
  const gebremst = await abonnentenHolen({ ...ZUGANG, holen: fetchErsatz([429]).holen })
  assert.match(gebremst.fehler, /bremst/)

  const weg = await abonnentenHolen({ ...ZUGANG, holen: fetchErsatz([new Error('offline')]).holen })
  assert.match(weg.fehler, /nicht erreichbar/)
})

test('abonnentenHolen gibt GraphQL-Fehler weiter, die kein Feldfehler sind', async () => {
  const { holen } = fetchErsatz([{ errors: [{ message: 'Throttled' }] }])
  const ergebnis = await abonnentenHolen({ ...ZUGANG, holen })
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.fehler, /Throttled/)
})

// ── Abmeldung zurückschreiben ──

test('abmeldungSchreiben setzt den Zustand auf UNSUBSCRIBED', async () => {
  const { holen, anfragen } = fetchErsatz([fixture.abmeldungOk])
  const ergebnis = await abmeldungSchreiben({ ...ZUGANG, shopifyId: 'gid://shopify/Customer/1001', zeit: new Date('2026-11-09T12:00:00Z'), holen })

  assert.equal(ergebnis.ok, true)
  const eingabe = anfragen[0].koerper.variables.input
  assert.match(anfragen[0].koerper.query, /customerEmailMarketingConsentUpdate/)
  assert.equal(eingabe.customerId, 'gid://shopify/Customer/1001')
  assert.equal(eingabe.emailMarketingConsent.marketingState, 'UNSUBSCRIBED')
  assert.equal(eingabe.emailMarketingConsent.consentUpdatedAt, '2026-11-09T12:00:00.000Z')
})

test('abmeldungSchreiben gibt die Begründung von Shopify weiter', async () => {
  const { holen } = fetchErsatz([fixture.abmeldungFehler])
  const ergebnis = await abmeldungSchreiben({ ...ZUGANG, shopifyId: 'gid://shopify/Customer/9999', holen })
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.fehler, /does not exist/)
})

test('abmeldungSchreiben braucht eine Kundennummer', async () => {
  const ergebnis = await abmeldungSchreiben({ ...ZUGANG, shopifyId: null })
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.fehler, /Kundennummer/)
})

// ── Abgebrochene Warenkörbe (Phase 4) ──

test('warenkorbAus übernimmt Posten, Summe und den Wiederherstellungs-Link', () => {
  const korb = warenkorbAus(fixture.warenkoerbe.data.abandonedCheckouts.nodes[0])
  assert.equal(korb.email, 'anna.beispiel@beispiel.de')
  assert.equal(korb.vorname, 'Anna')
  assert.equal(korb.link, 'https://beispiel.myshopify.com/wiederherstellen/5001')
  assert.equal(korb.summe, '59.80 EUR')
  assert.deepEqual(korb.posten, [{ titel: 'Shirt Wolf', menge: 2 }, { titel: 'Tasse', menge: 1 }])
})

test('ein Warenkorb ohne Kundenkonto fällt heraus — ohne Adresse ist er für uns wertlos', () => {
  assert.equal(warenkorbAus(fixture.warenkoerbe.data.abandonedCheckouts.nodes[1]), null)
  assert.equal(warenkorbAus(null), null)
})

test('warenkoerbeHolen filtert nach Zeitpunkt und liefert nur anschreibbare Körbe', async () => {
  const { holen, anfragen } = fetchErsatz([fixture.warenkoerbe])
  const seit = Date.parse('2026-11-08T00:00:00Z')
  const ergebnis = await warenkoerbeHolen({ ...ZUGANG, seit, holen })

  assert.equal(ergebnis.ok, true)
  assert.equal(ergebnis.koerbe.length, 1, 'der Gast-Warenkorb ohne Adresse fehlt')
  assert.match(anfragen[0].koerper.query, /abandonedCheckouts/)
  assert.match(anfragen[0].koerper.variables.filter, /created_at:>'2026-11-08T00:00:00.000Z'/)
})

test('kennt die API-Version die Posten nicht, wird ohne sie weitergemacht', async () => {
  const { holen, anfragen } = fetchErsatz([fixture.warenkoerbeFeldFehler, fixture.warenkoerbeSchlank])
  const ergebnis = await warenkoerbeHolen({ ...ZUGANG, seit: Date.now() - 3600000, holen })

  assert.equal(ergebnis.ok, true)
  assert.equal(ergebnis.schlank, true)
  assert.equal(ergebnis.koerbe.length, 1)
  assert.deepEqual(ergebnis.koerbe[0].posten, [], 'ohne Posten, aber mit Link')
  assert.equal(ergebnis.koerbe[0].link, 'https://beispiel.myshopify.com/wiederherstellen/5003')
  assert.match(anfragen[0].koerper.query, /lineItems/)
  assert.ok(!anfragen[1].koerper.query.includes('lineItems'))
})

test('warenkoerbeHolen meldet Fehler statt leere Listen zu liefern', async () => {
  const abgelehnt = await warenkoerbeHolen({ ...ZUGANG, holen: fetchErsatz([401]).holen })
  assert.equal(abgelehnt.ok, false)
  assert.match(abgelehnt.fehler, /abgelehnt/)
})

// ── Besteller (Abbruch von Automationen) ──

test('bestellerHolen gibt die Adressen zurück, die seit dem Zeitpunkt bestellt haben', async () => {
  const { holen, anfragen } = fetchErsatz([fixture.bestellungen])
  const ergebnis = await bestellerHolen({ ...ZUGANG, seit: Date.parse('2026-11-09T00:00:00Z'), holen })

  assert.equal(ergebnis.ok, true)
  assert.deepEqual(ergebnis.adressen, ['anna.beispiel@beispiel.de'], 'Gastbestellung ohne Kundenkonto fehlt')
  assert.match(anfragen[0].koerper.query, /orders\(/)
  assert.match(anfragen[0].koerper.variables.filter, /created_at:>/)
})

test('seitFilter baut den Zeitfilter so, wie Shopify ihn erwartet', () => {
  assert.equal(seitFilter('created_at', Date.parse('2026-01-02T03:04:05Z')), "created_at:>'2026-01-02T03:04:05.000Z'")
})
