'use strict'
// Newsletter-Plugin: Shopify.
//
// Holt die Abonnenten (nur mit Marketing-Zustimmung) und schreibt Abmeldungen zurück.
// Eigener Zugang im Plugin, kein Griff in Hermes' Konfiguration: so bleibt das Plugin
// unabhängig und zieht beim Serverumzug mit.
//
// GraphQL statt REST: die REST-Admin-API ist seit Oktober 2024 Legacy.
// Benötigte Scopes: read_customers zum Holen, write_customers zum Zurückschreiben.
//
// `holen` ist einspritzbar, damit Tests ohne Netzzugriff laufen.

const API_VERSION = '2025-07'
const SEITE = 250 // Shopify erlaubt höchstens 250 Knoten je Seite
const MAX_SEITEN = 40 // Schutz gegen eine Endlosschleife: 40 × 250 = 10.000 Kontakte
const FRIST = 60000

const SHOP_FORM = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i
const TOKEN_FORM = /^shp(at|ca|pa)_[A-Za-z0-9]{20,}$/

// Die Felder zur Zustimmung haben in den API-Versionen gewechselt. Deshalb zwei Abfragen:
// erst die mit Zustimmungsdatum, und wenn Shopify ein Feld nicht kennt, die schlanke.
const ABFRAGE_REICH = `query($cursor: String) {
  customers(first: ${SEITE}, after: $cursor, query: "accepts_marketing:true") {
    pageInfo { hasNextPage endCursor }
    nodes {
      id email firstName lastName createdAt
      defaultEmailAddress { marketingState marketingUpdatedAt }
    }
  }
}`

const ABFRAGE_SCHLANK = `query($cursor: String) {
  customers(first: ${SEITE}, after: $cursor, query: "accepts_marketing:true") {
    pageInfo { hasNextPage endCursor }
    nodes { id email firstName lastName createdAt }
  }
}`

// Abgebrochene Warenkörbe. Scope read_orders, dazu Zugriff auf geschützte Kundendaten.
// `abandonedCheckoutUrl` ist der Link, der den Warenkorb beim Kunden wiederherstellt — ohne
// den wäre die Mail wertlos.
const WARENKOERBE_REICH = `query($cursor: String, $filter: String!) {
  abandonedCheckouts(first: 50, after: $cursor, query: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id createdAt abandonedCheckoutUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id email firstName }
      lineItems(first: 20) { nodes { title quantity } }
    }
  }
}`

const WARENKOERBE_SCHLANK = `query($cursor: String, $filter: String!) {
  abandonedCheckouts(first: 50, after: $cursor, query: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id createdAt abandonedCheckoutUrl
      customer { id email firstName }
    }
  }
}`

// Bestellungen, um Automationen abzubrechen, deren Zweck erfüllt ist
const BESTELLUNGEN = `query($cursor: String, $filter: String!) {
  orders(first: 100, after: $cursor, query: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes { id createdAt customer { email } }
  }
}`

const ABMELDUNG = `mutation($input: CustomerEmailMarketingConsentUpdateInput!) {
  customerEmailMarketingConsentUpdate(input: $input) {
    customer { id }
    userErrors { field message }
  }
}`

function zugangPruefen({ shop, token } = {}) {
  const fehler = []
  const laden = String(shop || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
  if (!laden) fehler.push('Die Shop-Adresse fehlt.')
  else if (!SHOP_FORM.test(laden)) fehler.push('Die Shop-Adresse muss so aussehen: meinshop.myshopify.com')
  const schluessel = String(token || '').trim()
  if (schluessel && !TOKEN_FORM.test(schluessel)) fehler.push('Der Zugriffstoken sieht nicht wie ein Shopify-Token aus (beginnt mit shpat_).')
  return { ok: fehler.length === 0, fehler, wert: { shop: laden, token: schluessel } }
}

// Eine Anfrage an Shopify. Gibt { daten } oder { fehler } zurück.
async function anfrage({ shop, token, query, variables = {}, holen = null } = {}) {
  const fetchFn = holen || (typeof fetch === 'function' ? fetch : null)
  if (!fetchFn) return { fehler: 'In dieser Umgebung gibt es kein fetch.' }

  let antwort
  try {
    antwort = await fetchFn(`https://${shop}/admin/api/${API_VERSION}/graphql.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Shopify-Access-Token': token },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(FRIST)
    })
  } catch {
    return { fehler: 'Shopify ist gerade nicht erreichbar.' }
  }

  if (antwort.status === 401 || antwort.status === 403) {
    return { fehler: 'Shopify hat den Zugriffstoken abgelehnt. Token und Berechtigungen (read_customers, write_customers) prüfen.' }
  }
  if (antwort.status === 429) return { fehler: 'Shopify bremst die Anfragen gerade. Später erneut versuchen.' }
  if (!antwort.ok) return { fehler: `Shopify antwortet mit ${antwort.status}.` }

  let inhalt
  try {
    inhalt = await antwort.json()
  } catch {
    return { fehler: 'Shopify hat keine verwertbare Antwort geschickt.' }
  }
  if (Array.isArray(inhalt.errors) && inhalt.errors.length) {
    const texte = inhalt.errors.map((e) => e?.message).filter(Boolean)
    return { fehler: texte.join(' ').slice(0, 300) || 'Shopify hat die Abfrage abgelehnt.', graphqlFehler: inhalt.errors }
  }
  return { daten: inhalt.data }
}

// Erkennt, ob Shopify ein Feld der Abfrage nicht kennt (dann lohnt die schlanke Variante)
function istFeldFehler(graphqlFehler) {
  return (graphqlFehler || []).some((e) => /doesn't exist on type|Field '[^']+' doesn't exist|undefinedField/i.test(String(e?.message || '')))
}

function kontaktAus(knoten) {
  const email = String(knoten?.email || '').trim().toLowerCase()
  if (!email) return null
  const zustimmung = knoten?.defaultEmailAddress?.marketingUpdatedAt || null
  // Den Zustand mitnehmen und speichern: nur so lässt sich hinterher nachsehen, wer wirklich
  // zugestimmt hat (SUBSCRIBED) und wer eine Bestätigung offen hat (PENDING, Double-Opt-In).
  const zustand = String(knoten?.defaultEmailAddress?.marketingState || '').toUpperCase() || null
  return {
    email,
    vorname: String(knoten?.firstName || '').trim(),
    nachname: String(knoten?.lastName || '').trim(),
    shopifyId: knoten?.id || null,
    quelle: 'shopify',
    zustand,
    zustimmungAm: zustimmung || knoten?.createdAt || null,
    zustimmungNachweis: zustimmung
      ? `Shopify: Marketing-Zustimmung${zustand ? ` (${zustand})` : ''}`
      : `Shopify: Kunde angelegt${zustand ? `, Zustand ${zustand}` : ''}`
  }
}

// Alle Abonnenten holen, Seite für Seite.
async function abonnentenHolen({ shop, token, holen = null } = {}) {
  const kontakte = []
  let abfrage = ABFRAGE_REICH
  let cursor = null
  let seiten = 0
  let schlank = false

  while (seiten < MAX_SEITEN) {
    const { daten, fehler, graphqlFehler } = await anfrage({ shop, token, query: abfrage, variables: { cursor }, holen })
    if (fehler) {
      // Kennt diese API-Version das Zustimmungsfeld nicht, einmal ohne versuchen
      if (!schlank && istFeldFehler(graphqlFehler)) {
        schlank = true
        abfrage = ABFRAGE_SCHLANK
        continue
      }
      return { ok: false, fehler, kontakte }
    }
    const block = daten?.customers
    if (!block) return { ok: false, fehler: 'Shopify hat keine Kundenliste geliefert.', kontakte }

    for (const knoten of block.nodes || []) {
      const kontakt = kontaktAus(knoten)
      if (kontakt) kontakte.push(kontakt)
    }
    seiten++
    if (!block.pageInfo?.hasNextPage) break
    cursor = block.pageInfo.endCursor
  }

  return { ok: true, kontakte, seiten, schlank, abgebrochen: seiten >= MAX_SEITEN }
}

// Abmeldung zurückschreiben, damit der nächste Sync die Person nicht wieder hereinholt.
async function abmeldungSchreiben({ shop, token, shopifyId, zeit = new Date(), holen = null } = {}) {
  if (!shopifyId) return { ok: false, fehler: 'Für diesen Kontakt ist keine Shopify-Kundennummer bekannt.' }
  const input = {
    customerId: shopifyId,
    emailMarketingConsent: {
      marketingState: 'UNSUBSCRIBED', // erlaubt sind nur SUBSCRIBED, UNSUBSCRIBED und PENDING
      consentUpdatedAt: new Date(zeit).toISOString()
    }
  }
  const { daten, fehler } = await anfrage({ shop, token, query: ABMELDUNG, variables: { input }, holen })
  if (fehler) return { ok: false, fehler }

  const nutzerFehler = daten?.customerEmailMarketingConsentUpdate?.userErrors || []
  if (nutzerFehler.length) {
    return { ok: false, fehler: nutzerFehler.map((e) => e?.message).filter(Boolean).join(' ').slice(0, 300) || 'Shopify hat die Abmeldung abgelehnt.' }
  }
  return { ok: true }
}

// Zeitfilter für die query-Argumente von Shopify
const seitFilter = (feld, seit) => `${feld}:>'${new Date(seit).toISOString()}'`

function warenkorbAus(knoten) {
  const email = String(knoten?.customer?.email || '').trim().toLowerCase()
  if (!email || !knoten?.id) return null
  const posten = (knoten.lineItems?.nodes || [])
    .map((p) => ({ titel: String(p?.title || '').trim(), menge: Number(p?.quantity) || 1 }))
    .filter((p) => p.titel)
  const geld = knoten.totalPriceSet?.shopMoney
  return {
    id: knoten.id,
    email,
    vorname: String(knoten?.customer?.firstName || '').trim(),
    shopifyId: knoten?.customer?.id || null,
    erstelltAm: knoten.createdAt || null,
    link: String(knoten.abandonedCheckoutUrl || '').trim(),
    summe: geld ? `${geld.amount} ${geld.currencyCode}` : '',
    posten
  }
}

// Abgebrochene Warenkörbe seit einem Zeitpunkt. Ohne E-Mail-Adresse ist ein Warenkorb für
// uns wertlos (wir könnten niemanden anschreiben) und fällt heraus.
async function warenkoerbeHolen({ shop, token, seit, holen = null } = {}) {
  const filter = seitFilter('created_at', seit || Date.now() - 86400000)
  let abfrage = WARENKOERBE_REICH
  let schlank = false
  let cursor = null
  let seiten = 0
  const koerbe = []

  while (seiten < MAX_SEITEN) {
    const { daten, fehler, graphqlFehler } = await anfrage({ shop, token, query: abfrage, variables: { cursor, filter }, holen })
    if (fehler) {
      if (!schlank && istFeldFehler(graphqlFehler)) {
        schlank = true
        abfrage = WARENKOERBE_SCHLANK
        continue
      }
      return { ok: false, fehler, koerbe }
    }
    const block = daten?.abandonedCheckouts
    if (!block) return { ok: false, fehler: 'Shopify hat keine Warenkörbe geliefert.', koerbe }
    for (const knoten of block.nodes || []) {
      const korb = warenkorbAus(knoten)
      if (korb) koerbe.push(korb)
    }
    seiten++
    if (!block.pageInfo?.hasNextPage) break
    cursor = block.pageInfo.endCursor
  }
  return { ok: true, koerbe, seiten, schlank, abgebrochen: seiten >= MAX_SEITEN }
}

// Adressen, die seit einem Zeitpunkt bestellt haben: damit brechen Automationen ab, deren
// Zweck erfüllt ist.
async function bestellerHolen({ shop, token, seit, holen = null } = {}) {
  const filter = seitFilter('created_at', seit || Date.now() - 86400000)
  let cursor = null
  let seiten = 0
  const adressen = new Set()

  while (seiten < MAX_SEITEN) {
    const { daten, fehler } = await anfrage({ shop, token, query: BESTELLUNGEN, variables: { cursor, filter }, holen })
    if (fehler) return { ok: false, fehler, adressen: [...adressen] }
    const block = daten?.orders
    if (!block) return { ok: false, fehler: 'Shopify hat keine Bestellungen geliefert.', adressen: [...adressen] }
    for (const knoten of block.nodes || []) {
      const email = String(knoten?.customer?.email || '').trim().toLowerCase()
      if (email) adressen.add(email)
    }
    seiten++
    if (!block.pageInfo?.hasNextPage) break
    cursor = block.pageInfo.endCursor
  }
  return { ok: true, adressen: [...adressen], seiten }
}

module.exports = {
  zugangPruefen,
  anfrage,
  abonnentenHolen,
  abmeldungSchreiben,
  warenkoerbeHolen,
  bestellerHolen,
  kontaktAus,
  warenkorbAus,
  istFeldFehler,
  seitFilter,
  API_VERSION,
  SEITE,
  MAX_SEITEN,
  ABFRAGE_REICH,
  ABFRAGE_SCHLANK,
  WARENKOERBE_REICH,
  WARENKOERBE_SCHLANK,
  BESTELLUNGEN
}
