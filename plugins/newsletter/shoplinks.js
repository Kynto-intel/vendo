'use strict'
// Newsletter-Plugin: nur echte Adressen aus dem eigenen Shop.
//
// Felix' Regel für Mails, die ein Bot baut: jeder Link ist eine echte Adresse aus seinem
// Shop. Nicht erfunden, nicht zusammengesetzt, nicht „ungefähr richtig“. Deshalb:
//   - Die öffentliche Shop-Adresse ermittelt Vendo selbst: die myshopify-Adresse leitet
//     auf sie weiter. Kein Zugang nötig.
//   - Produkte und Sammlungen liest Vendo aus den öffentlichen Listen des Shops
//     (/products.json, /collections.json) und gibt dem Bot fertige Adressen. Der Bot muss
//     nichts zusammensetzen.
//   - Vor der Freigabe prüft Vendo jeden Link: gehört er zum Shop, und gibt es die Seite?
//     Eine erfundene Produktseite antwortet mit 404 und sperrt.
//
// Netzzugriff nur über das übergebene `abrufen` (in Vendo: fetch), damit Tests ohne Netz
// laufen.

const BILD_HOSTS = ['cdn.shopify.com']
const FRIST = 8000
const GLEICHZEITIG = 5
const MERKEN = 10 * 60000 // Ergebnisse zehn Minuten merken, damit der Shop nicht dauernd gefragt wird

const ergebnisse = new Map() // url → { status, zeit }

const sauber = (wert) => String(wert ?? '').trim()

function hostVon(url) {
  try {
    return new URL(url).host.toLowerCase()
  } catch {
    return ''
  }
}

// Die Adressen, die als „eigener Shop“ gelten: öffentliche Adresse mit und ohne www, dazu
// die myshopify-Adresse.
function shopHosts({ primaer = '', myshopify = '' } = {}) {
  const hosts = new Set()
  for (const h of [primaer, myshopify].map((x) => sauber(x).toLowerCase()).filter(Boolean)) {
    hosts.add(h)
    hosts.add(h.startsWith('www.') ? h.slice(4) : `www.${h}`)
  }
  return [...hosts]
}

async function mitFrist(abrufen, url, optionen = {}) {
  const steuerung = new AbortController()
  const uhr = setTimeout(() => steuerung.abort(), FRIST)
  try {
    return await abrufen(url, { redirect: 'follow', ...optionen, signal: steuerung.signal })
  } finally {
    clearTimeout(uhr)
  }
}

// Die öffentliche Adresse: wohin leitet die myshopify-Adresse weiter?
async function primaerDomain(myshopify, abrufen) {
  const host = sauber(myshopify).toLowerCase()
  if (!host) return { ok: false, text: 'Es ist kein Shop eingetragen (Reiter „Kontakte“).' }
  try {
    const antwort = await mitFrist(abrufen, `https://${host}/`)
    const ziel = hostVon(antwort.url) || host
    return { ok: true, host: ziel.replace(/^www\./, '') }
  } catch (fehler) {
    return { ok: false, text: `Der Shop ist nicht erreichbar: ${String(fehler?.message || fehler).slice(0, 80)}` }
  }
}

// Produkte aus der öffentlichen Liste des Shops, mit fertigen Adressen
async function produkteLaden(domain, abrufen, { suche = '', anzahl = 30 } = {}) {
  const alle = []
  for (let seite = 1; seite <= 4; seite++) {
    let daten
    try {
      const antwort = await mitFrist(abrufen, `https://${domain}/products.json?limit=250&page=${seite}`)
      if (!antwort.ok) break
      daten = await antwort.json()
    } catch {
      break
    }
    const liste = Array.isArray(daten?.products) ? daten.products : []
    for (const p of liste) {
      const variante = (p.variants || [])[0] || {}
      alle.push({
        titel: sauber(p.title),
        url: `https://${domain}/products/${encodeURIComponent(sauber(p.handle))}`,
        preis: variante.price ? `${String(variante.price).replace('.', ',')} €` : '',
        vergleichspreis: variante.compare_at_price ? `${String(variante.compare_at_price).replace('.', ',')} €` : '',
        verfuegbar: (p.variants || []).some((v) => v.available !== false),
        bild: (p.images || [])[0]?.src || '',
        typ: sauber(p.product_type),
        tags: Array.isArray(p.tags) ? p.tags.slice(0, 10) : String(p.tags || '').split(',').map(sauber).filter(Boolean).slice(0, 10)
      })
    }
    if (liste.length < 250) break
  }
  const worte = sauber(suche).toLowerCase().split(/\s+/).filter(Boolean)
  const treffer = worte.length ? alle.filter((p) => worte.every((w) => `${p.titel} ${p.typ} ${p.tags.join(' ')}`.toLowerCase().includes(w))) : alle
  return { gesamt: alle.length, passend: treffer.length, produkte: treffer.slice(0, anzahl) }
}

async function sammlungenLaden(domain, abrufen) {
  try {
    const antwort = await mitFrist(abrufen, `https://${domain}/collections.json?limit=250`)
    if (!antwort.ok) return []
    const daten = await antwort.json()
    return (Array.isArray(daten?.collections) ? daten.collections : []).map((c) => ({ titel: sauber(c.title), url: `https://${domain}/collections/${encodeURIComponent(sauber(c.handle))}` }))
  } catch {
    return []
  }
}

// Alle Links und Bilder einer Mail. Anker (#), mailto und Platzhalter-Links wie
// {{warenkorbLink}} sind keine Adressen zum Prüfen.
function adressenSammeln(html) {
  const text = String(html ?? '')
  const lesen = (muster) => [...text.matchAll(muster)].map((t) => sauber(t[2] ?? t[3] ?? t[4]))
  const links = lesen(/<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi).filter((u) => u && !u.startsWith('#') && !/^mailto:/i.test(u) && !/\{\{/.test(u))
  const bilder = lesen(/<img\b[^>]*?\ssrc\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi).filter((u) => u && !/\{\{/.test(u) && !/^(data|cid):/i.test(u))
  return { links: [...new Set(links)], bilder: [...new Set(bilder)] }
}

// Ohne Netz: gehört jede Adresse zum Shop? Links auf die Shop-Adressen, Bilder dazu auf
// Shopifys Bildserver. Alles andere ist fremd.
function fremdeAdressen(html, hosts) {
  const { links, bilder } = adressenSammeln(html)
  const eigen = new Set(hosts.map((h) => h.toLowerCase()))
  const fremd = []
  for (const url of links) {
    if (!/^https:\/\//i.test(url)) fremd.push({ url, grund: 'kein https-Link' })
    else if (eigen.size && !eigen.has(hostVon(url))) fremd.push({ url, grund: 'nicht aus deinem Shop' })
  }
  for (const url of bilder) {
    if (!/^https:\/\//i.test(url)) continue // fehlende Bildadressen meldet bilderOhneAdresse
    const host = hostVon(url)
    if (!BILD_HOSTS.includes(host) && !eigen.has(host)) fremd.push({ url, grund: 'Bild nicht aus deinem Shop' })
  }
  return fremd
}

async function statusVon(url, abrufen) {
  const gemerkt = ergebnisse.get(url)
  if (gemerkt && Date.now() - gemerkt.zeit < MERKEN) return gemerkt.status
  let status
  try {
    let antwort = await mitFrist(abrufen, url, { method: 'HEAD' })
    if (antwort.status === 405 || antwort.status === 501) antwort = await mitFrist(abrufen, url, { method: 'GET' })
    if (antwort.status === 429) {
      await new Promise((r) => setTimeout(r, 1500))
      antwort = await mitFrist(abrufen, url, { method: 'HEAD' })
    }
    status = antwort.status
  } catch {
    status = 0
  }
  if (status) ergebnisse.set(url, { status, zeit: Date.now() })
  return status
}

// Mit Netz: erst die Zugehörigkeit, dann ob es die Seite oder das Bild gibt
async function adressenPruefen(html, { hosts, abrufen }) {
  const probleme = fremdeAdressen(html, hosts)
  const schonGemeldet = new Set(probleme.map((p) => p.url))
  const { links, bilder } = adressenSammeln(html)
  const offen = [...links, ...bilder].filter((u) => /^https:\/\//i.test(u) && !schonGemeldet.has(u)).slice(0, 60)
  for (let i = 0; i < offen.length; i += GLEICHZEITIG) {
    const stapel = offen.slice(i, i + GLEICHZEITIG)
    const stati = await Promise.all(stapel.map((u) => statusVon(u, abrufen)))
    stapel.forEach((url, j) => {
      const s = stati[j]
      if (s >= 200 && s < 400) return
      probleme.push({ url, grund: s === 404 || s === 410 ? 'gibt es nicht (404)' : s ? `nicht erreichbar (Status ${s})` : 'nicht erreichbar' })
    })
  }
  return { ok: probleme.length === 0, geprueft: links.length + bilder.length, probleme }
}

function vergessen() {
  ergebnisse.clear()
}

// Gezählte Bestellposten mit den öffentlichen Produktdaten verbinden: erst über den
// `handle` aus der Bestellung, sonst über den Titel. Was sich nicht zuordnen lässt, bleibt
// mit Namen und Stückzahl stehen und wird mit `imShop: false` gekennzeichnet — lieber ohne
// Bild als stillschweigend verschwunden. So fällt auf, wenn ein Renner aus dem Shop
// genommen wurde.
function rennerVerbinden(liste, produkte = []) {
  const nachHandle = new Map()
  const nachTitel = new Map()
  for (const p of produkte) {
    const roh = (String(p?.url || '').split('/products/')[1] || '').toLowerCase()
    if (roh) {
      try {
        nachHandle.set(decodeURIComponent(roh), p)
      } catch {
        nachHandle.set(roh, p)
      }
    }
    if (p?.titel) nachTitel.set(String(p.titel).toLowerCase(), p)
  }
  return (Array.isArray(liste) ? liste : []).map((e) => {
    const handle = String(e?.handle || '').toLowerCase()
    const titel = String(e?.titel || '')
    const treffer = (handle && nachHandle.get(handle)) || nachTitel.get(titel.toLowerCase()) || null
    return {
      titel: treffer?.titel || titel,
      menge: Number(e?.menge) || 0,
      url: treffer?.url || '',
      bild: treffer?.bild || '',
      preis: treffer?.preis || '',
      vergleichspreis: treffer?.vergleichspreis || '',
      verfuegbar: treffer ? treffer.verfuegbar : null,
      imShop: Boolean(treffer)
    }
  })
}

// ── Zwei Prüfungen gegen das, was eine KI gern falsch macht ──

// Dasselbe Bild mehrfach in einer Mail. Kein Fehler, aber fast immer Faulheit: dann steht
// das Shirt-Foto im Aufmacher, beim ersten Produkt und nochmal auf dem Sammlungsband, und
// die Mail wirkt, als hätte der Shop drei Artikel. Verglichen wird ohne Abfrageteil
// (`?v=…`), denn das ist dasselbe Bild.
const BILD_SRC = /<img[^>]*?[\s"']src\s*=\s*"([^"]+)"/gi

function doppelteBilder(html) {
  const gezaehlt = new Map()
  for (const t of String(html ?? '').matchAll(BILD_SRC)) {
    const ohneVersion = t[1].split('?')[0].trim()
    if (!ohneVersion || !/^https?:/i.test(ohneVersion)) continue
    gezaehlt.set(ohneVersion, (gezaehlt.get(ohneVersion) || 0) + 1)
  }
  return [...gezaehlt.entries()]
    .filter(([, n]) => n > 1)
    .map(([url, anzahl]) => ({ url, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl)
}

// Durchgestrichene Preise, die es im Shop nicht gibt. Ein durchgestrichener Preis behauptet
// „war teurer" — steht dahinter kein echter Vergleichspreis, ist das irreführende Werbung,
// nicht bloß ein Schönheitsfehler. Deshalb wird jeder gefundene Preis gegen die
// Vergleichspreise des Shops gehalten; was dort nicht vorkommt, ist erfunden.
// Preise werden auf die Ziffern reduziert verglichen, damit „31,95 €" und „31,95€" gleich sind.
const preisKern = (text) => String(text ?? '').replace(/[^\d,.]/g, '').replace(',', '.').replace(/\.(?=.*\.)/g, '')

function erfundenePreise(html, produkte = []) {
  const echte = new Set()
  for (const p of Array.isArray(produkte) ? produkte : []) {
    if (p?.vergleichspreis) echte.add(preisKern(p.vergleichspreis))
  }
  const gefunden = new Set()
  // Ein durchgestrichener Preis steht entweder im Element mit `line-through` oder direkt
  // dahinter; beide Schreibweisen kommen in Mail-HTML vor.
  for (const t of String(html ?? '').matchAll(/line-through[^>]*>([^<]{0,40})</gi)) {
    const kern = preisKern(t[1])
    if (!kern || Number(kern) <= 0) continue // leeres Feld ist kein erfundener Preis
    if (!echte.has(kern)) gefunden.add(t[1].trim())
  }
  return [...gefunden]
}

// Dasselbe Produkt mehrfach in einer Mail: drei Kacheln, die auf dieselbe Seite zeigen,
// sind drei Kacheln zu viel. Gezählt werden nur Produktadressen (/products/…), damit ein
// Shop-Link im Aufmacher und im Schluss nicht als Dopplung gilt.
const LINK_HREF = /<a[^>]*?[\s"']href\s*=\s*"([^"]+)"/gi
const PRODUKT_URL = /^https?:\/\/[^\s/]+\/products\/.+/i

function doppelteProdukte(html) {
  const gezaehlt = new Map()
  for (const t of String(html ?? '').matchAll(LINK_HREF)) {
    const url = t[1].split('?')[0].trim().replace(/\/$/, '')
    if (!PRODUKT_URL.test(url)) continue
    gezaehlt.set(url, (gezaehlt.get(url) || 0) + 1)
  }
  // Bild und Knopf derselben Kachel zeigen absichtlich beide auf das Produkt: erst ab
  // drei Vorkommen ist es wirklich zweimal dasselbe Produkt.
  return [...gezaehlt.entries()]
    .filter(([, n]) => n > 2)
    .map(([url, anzahl]) => ({ url, anzahl }))
    .sort((a, b) => b.anzahl - a.anzahl)
}

module.exports = {
  doppelteBilder,
  doppelteProdukte,
  erfundenePreise,
  preisKern,
  rennerVerbinden, BILD_HOSTS, shopHosts, primaerDomain, produkteLaden, sammlungenLaden, adressenSammeln, fremdeAdressen, adressenPruefen, vergessen }
