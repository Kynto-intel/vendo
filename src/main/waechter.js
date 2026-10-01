// Wächter: prüft regelmäßig, ob etwas Wichtiges passiert ist, und meldet es an die Oberfläche.
//   - neue Bestellungen (direkt bei Shopify, Zugang aus der Hermes-Einstellung wie beim IONOS-Mail-Plugin),
//     angesagt mit Artikel, Größe, Stadt und der wievielten Bestellung dieser Person („Der Laden redet mit dir“)
//   - neue ungelesene Mails (über das IONOS-Mail-Plugin von Hermes)
//   - fehlgeschlagene Hermes-Jobs
//   - Meilensteine: 10., 25., 50., 100. … 1.000. Bestellung, danach alle 500 (Luzzy feiert, Liste im Vault)
// Beim ersten Durchlauf wird nur der Stand gemerkt, gemeldet wird erst, was danach neu dazukommt.
// Der Shopify-Zugang bleibt in diesem Prozess: nie an die Oberfläche, nie ins Log, nie gespeichert.

const fs = require('node:fs')
const path = require('node:path')
const { EventEmitter } = require('node:events')

const HERMES_HOME = path.join(process.env.LOCALAPPDATA || '', 'hermes')
const STAND_DATEI = path.join(__dirname, '..', '..', 'daten', 'waechter-stand.json')
const TAKT = 60_000
const SHOPIFY_VERSION = '2025-07'

function standLaden() {
  try {
    return JSON.parse(fs.readFileSync(STAND_DATEI, 'utf8'))
  } catch {
    return {}
  }
}
function standSpeichern(stand) {
  try {
    fs.mkdirSync(path.dirname(STAND_DATEI), { recursive: true })
    fs.writeFileSync(STAND_DATEI, JSON.stringify(stand, null, 2), 'utf8')
  } catch {
    // nächstes Mal
  }
}

// Shopify-Zugänge aus den Hermes-Einstellungen sammeln (bei jedem Aufruf frisch), Luzzys Profil zuerst.
// Einfacher Zeilen-Leser statt YAML-Bibliothek. Mehrere Kandidaten, weil der Token an mehreren Stellen
// stehen kann und nicht überall gleich aktuell sein muss.
const PROFIL_ORDNER = path.join(HERMES_HOME, 'profiles', 'donnerwolf')
function shopifyKandidaten() {
  const kandidaten = []
  const dazu = (token, shop) => {
    token = String(token || '').trim()
    shop = String(shop || '').trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (token && shop && !kandidaten.some((k) => k.token === token)) kandidaten.push({ token, shop })
  }
  const lesen = (datei) => {
    try {
      return fs.readFileSync(datei, 'utf8')
    } catch {
      return ''
    }
  }
  for (const datei of [path.join(PROFIL_ORDNER, 'config.yaml'), path.join(HERMES_HOME, 'config.yaml')]) {
    const text = lesen(datei)
    const block = text.match(/\n\s*shopify:\s*\n([\s\S]*?)(?=\n\s{0,2}\S[^\n]*:\s*\n|\n\S)/)
    const inhalt = block ? block[1] : ''
    const wert = (name) => (inhalt.match(new RegExp(`${name}:\\s*['"]?([^'"\\n]+)['"]?`)) || [])[1]
    dazu(wert('SHOPIFY_ACCESS_TOKEN'), wert('SHOPIFY_STORE'))
  }
  for (const datei of [path.join(PROFIL_ORDNER, '.env'), path.join(HERMES_HOME, '.env')]) {
    const text = lesen(datei)
    const wert = (name) => (text.match(new RegExp(`^\\s*${name}\\s*=\\s*['"]?([^'"\\r\\n]+)`, 'm')) || [])[1]
    dazu(wert('SHOPIFY_ACCESS_TOKEN'), wert('SHOPIFY_STORE_DOMAIN') || wert('SHOPIFY_STORE') || kandidaten[0]?.shop)
  }
  return kandidaten
}
const zugangFuer = (kandidaten, token) => kandidaten.find((k) => k.token === token) || kandidaten[0]
function shopifyZugang() {
  return shopifyKandidaten()[0] || null
}

const ungelesenAnzahl = (antwort) => (antwort?.messages || []).length

// Meilensteine bei der Anzahl aller Bestellungen
// Einstellbar im Bereich Meilensteine (Speicher des Plugins: daten/plugins/meilensteine.json): Schrittweite ab 1.000
// und eigene Ziele
function meilensteinEinstellungen() {
  try {
    const d = JSON.parse(fs.readFileSync(require('./plugins').datenPfad('meilensteine'), 'utf8'))
    return {
      schritt: [250, 500, 1000].includes(Number(d.schritt)) ? Number(d.schritt) : 500,
      eigene: (Array.isArray(d.eigene) ? d.eigene : []).filter((e) => Number.isInteger(e?.anzahl) && e.anzahl > 0)
    }
  } catch {
    return { schritt: 500, eigene: [] }
  }
}
const istMeilenstein = (n, e = meilensteinEinstellungen()) =>
  [10, 25, 50, 100, 250, 500, 750].includes(n) || (n >= 1000 && n % e.schritt === 0) || e.eigene.some((x) => x.anzahl === n)
const tausender = (n) => n.toLocaleString('de-DE')

// ── „Der Laden redet mit dir“: eine Bestellung in einem Satz ──
// Nur Artikel, Größe, Stadt und Anzahl der Bestellungen; kein Name, keine Adresse, nichts wird gespeichert.
const ORDNUNG = ['', 'erste', 'zweite', 'dritte', 'vierte', 'fünfte', 'sechste', 'siebte', 'achte', 'neunte', 'zehnte', 'elfte', 'zwölfte']
const ZAHLWORT = ['', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn']
function landName(code) {
  try {
    return new Intl.DisplayNames(['de'], { type: 'region' }).of(code) || code
  } catch {
    return code
  }
}
function artikelText(posten, { gesprochen = true } = {}) {
  const teile = (posten || []).filter((p) => p?.title).map((p) => {
    const variante = p.variant_title && p.variant_title !== 'Default Title' ? p.variant_title.replace(/\s*\/\s*/g, gesprochen ? ' ' : ', ') : ''
    const menge = Number(p.quantity) > 1 ? (gesprochen ? `${ZAHLWORT[p.quantity] ? `${ZAHLWORT[p.quantity]}mal` : `${p.quantity} mal`} ` : `${p.quantity}× `) : ''
    return gesprochen ? `${menge}${p.title}${variante ? ` in ${variante}` : ''}` : `${menge}${p.title}${variante ? ` (${variante})` : ''}`
  })
  if (!teile.length) return ''
  if (teile.length <= 2) return teile.join(' und ')
  return `${teile[0]} und ${teile.length - 1} weitere Artikel`
}
function zielText(adresse) {
  if (!adresse?.city) return ''
  const land = adresse.country_code && adresse.country_code !== 'DE' ? `, ${landName(adresse.country_code)}` : ''
  return `${adresse.city}${land}`
}
function bestellSatz(b, betrag, wievielte) {
  const artikel = artikelText(b.line_items)
  const ziel = zielText(b.shipping_address)
  let satz = `Felix, neue Bestellung${artikel ? `: ${artikel}` : ` ${b.name}`}${ziel ? ` nach ${ziel}` : ''}, ${betrag}.`
  if (wievielte === 1) satz += ' Die Person bestellt zum ersten Mal bei dir.'
  else if (wievielte > 1) satz += ` Das ist schon die ${ORDNUNG[wievielte] || `${wievielte}.`} Bestellung von dieser Person.`
  if (b.financial_status === 'pending') satz += ' Die Zahlung ist noch offen.'
  return satz
}
function bestellAnzeige(b, betrag, wievielte) {
  const ziel = zielText(b.shipping_address)
  return [
    betrag, // die Nummer steht schon im Titel
    artikelText(b.line_items, { gesprochen: false }),
    ziel,
    wievielte === 1 ? 'Neukunde' : wievielte > 1 ? `${wievielte}. Bestellung` : '',
    b.financial_status === 'pending' ? 'Zahlung offen' : ''
  ].filter(Boolean).join(' · ')
}

class Waechter extends EventEmitter {
  constructor(hermes) {
    super()
    this.hermes = hermes
    this.stand = standLaden()
    this.uhr = null
    this.laeuft = false
    this.probleme = {} // pro Quelle der letzte Fehler, damit er nur einmal gemeldet wird
    this.verbindungen = {} // quelle → { ok, text, zeit } für die Anzeige oben
  }

  starten() {
    if (this.uhr) return
    this.uhr = setInterval(() => this.pruefen(), TAKT)
    setTimeout(() => this.pruefen(), 8000)
  }

  stoppen() {
    clearInterval(this.uhr)
    this.uhr = null
  }

  melden(art, titel, text, daten = {}) {
    this.emit('meldung', { art, titel, text, zeit: Date.now(), ...daten })
  }

  verbindung(quelle, ok, text = '') {
    this.verbindungen[quelle] = { ok, text, zeit: Date.now() }
    this.emit('verbindung', { quelle, ...this.verbindungen[quelle] })
  }

  problem(quelle, fehler) {
    this.verbindung(quelle, false, String(fehler?.message || fehler))
    const text = String(fehler?.message || fehler)
    if (this.probleme[quelle] === text) return
    this.probleme[quelle] = text
    this.emit('problem', { quelle, text })
  }

  async pruefen() {
    if (this.laeuft || this.hermes.zustand !== 'bereit') return
    this.laeuft = true
    try {
      await Promise.all([this.bestellungen(), this.mails(), this.jobs()])
      standSpeichern(this.stand)
    } finally {
      this.laeuft = false
    }
  }

  // ── Neue Bestellungen ──
  async bestellungen() {
    const kandidaten = shopifyKandidaten()
    if (!kandidaten.length) return this.verbindung('shopify', false, 'Kein Shopify-Zugang in den Hermes-Einstellungen gefunden.')
    try {
      // Der zuletzt funktionierende Token zuerst, dann die übrigen
      kandidaten.sort((a, b) => (b.token === this.shopifyToken) - (a.token === this.shopifyToken))
      let antwort = null
      for (const zugang of kandidaten) {
        const url = `https://${zugang.shop}/admin/api/${SHOPIFY_VERSION}/orders.json?status=any&limit=10&fields=id,name,created_at,total_price,currency,financial_status,line_items,shipping_address,customer`
        antwort = await fetch(url, {
          headers: { 'X-Shopify-Access-Token': zugang.token, Accept: 'application/json' },
          signal: AbortSignal.timeout(20000)
        })
        if (antwort.ok) {
          this.shopifyToken = zugang.token
          break
        }
      }
      if (antwort.status === 401) throw new Error('Shopify-Zugang abgelaufen (401). Token erneuern.')
      if (!antwort.ok) throw new Error(`Shopify antwortet mit ${antwort.status}.`)
      const bestellungen = (await antwort.json()).orders || []
      delete this.probleme.shopify
      this.verbindung('shopify', true, 'Verbunden')
      const hoechste = Math.max(0, ...bestellungen.map((b) => Number(b.id) || 0))
      if (this.stand.letzteBestellung == null) {
        this.stand.letzteBestellung = hoechste // erster Durchlauf: nur merken
        await this.meilensteinPruefen(zugangFuer(kandidaten, this.shopifyToken))
        return
      }
      const neue = bestellungen.filter((b) => Number(b.id) > this.stand.letzteBestellung).sort((a, b) => a.id - b.id)
      const zugang = zugangFuer(kandidaten, this.shopifyToken)
      for (const b of neue) {
        const betrag = `${Number(b.total_price).toFixed(2).replace('.', ',')} ${b.currency === 'EUR' ? 'Euro' : b.currency}`
        const wievielte = await this.bestellungenVon(zugang, b)
        this.melden('bestellung', `Neue Bestellung ${b.name}`, bestellSatz(b, betrag, wievielte), { anzeige: bestellAnzeige(b, betrag, wievielte) })
      }
      if (hoechste > this.stand.letzteBestellung) this.stand.letzteBestellung = hoechste
      // Bei neuen Bestellungen zählen; außerdem einmal, falls noch nie gezählt (Wächter lief schon vor den Meilensteinen)
      if (neue.length || this.stand.bestellAnzahl == null) await this.meilensteinPruefen(zugangFuer(kandidaten, this.shopifyToken), neue.at(-1))
    } catch (e) {
      this.problem('shopify', e)
    }
  }

  // Wie viele Bestellungen hat diese Person insgesamt? (0 = unbekannt, z. B. Gastbestellung oder keine Berechtigung)
  async bestellungenVon(zugang, bestellung) {
    const kunde = bestellung.customer
    if (!kunde?.id || !zugang) return 0
    try {
      const antwort = await fetch(`https://${zugang.shop}/admin/api/${SHOPIFY_VERSION}/customers/${Number(kunde.id)}/orders.json?status=any&limit=250&fields=id`, {
        headers: { 'X-Shopify-Access-Token': zugang.token, Accept: 'application/json' },
        signal: AbortSignal.timeout(15000)
      })
      if (antwort.ok) {
        const anzahl = ((await antwort.json()).orders || []).length
        if (anzahl) return anzahl
      }
    } catch {
      // unten: Wert aus der Bestellung
    }
    return Number(kunde.orders_count) || 0
  }

  // Anzahl aller Bestellungen bei Shopify: Meilenstein erreicht? (Bestellnummern starten bei #1001, taugen also nicht)
  async meilensteinPruefen(zugang, letzte = null) {
    if (!zugang) return
    try {
      const antwort = await fetch(`https://${zugang.shop}/admin/api/${SHOPIFY_VERSION}/orders/count.json?status=any`, {
        headers: { 'X-Shopify-Access-Token': zugang.token, Accept: 'application/json' },
        signal: AbortSignal.timeout(20000)
      })
      if (!antwort.ok) return
      const anzahl = Number((await antwort.json()).count) || 0
      const vorher = this.stand.bestellAnzahl
      this.stand.bestellAnzahl = anzahl
      this.stand.bestellAnzahlZeit = Date.now()
      if (vorher == null || anzahl <= vorher) return // erster Durchlauf: nur merken, Vergangenes nicht nachfeiern
      const e = meilensteinEinstellungen()
      const erreicht = []
      for (let n = vorher + 1; n <= anzahl; n++) if (istMeilenstein(n, e)) erreicht.push(n)
      if (!erreicht.length) return
      const n = erreicht.at(-1)
      const ziel = e.eigene.find((x) => x.anzahl === n)?.text // eigenes Ziel mit Text, z. B. „Neues Lager“
      this.melden(
        'meilenstein',
        `Meilenstein: ${tausender(n)}. Bestellung${ziel ? ` · ${ziel}` : ''}`,
        ziel
          ? `Felix! Die ${tausender(n)}. Bestellung ist da. Dein Ziel ist erreicht: ${ziel}. Skål!`
          : `Felix! Das ist die ${tausender(n)}. Bestellung bei Donnerwolf. Skål, darauf kannst du stolz sein!`,
        { anzeige: `${letzte?.name ? `${letzte.name} · ` : ''}${tausender(anzahl)} Bestellungen insgesamt` }
      )
      const heute = new Date().toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
      for (const m of erreicht) {
        await require('./vaultschreiben')
          .anhaengen('Meilensteine.md', `- ${heute} · ${tausender(m)}. Bestellung${letzte?.name ? ` (um ${letzte.name})` : ''}${(t => (t ? `: ${t}` : ''))(e.eigene.find((x) => x.anzahl === m)?.text)}`, {
            kopf: '# Meilensteine\n\nVon Jarves-OS: jede besondere Bestellung bei Donnerwolf.'
          })
          .catch(() => {}) // Vault nicht da: Meldung kam trotzdem
      }
    } catch {
      // nächstes Mal
    }
  }

  // ── Neue Mails ──
  async mails() {
    try {
      const antwort = await this.hermes.rest('/api/plugins/ionos-mail/inbox?limit=25&only_unread=true', { timeout: 30000 })
      delete this.probleme.mail
      this.verbindung('mail', true, `Verbunden, ${ungelesenAnzahl(antwort)} ungelesen`)
      const ungelesen = antwort?.messages || []
      const gesehen = new Set(this.stand.gesehen || [])
      if (!this.stand.gesehen) {
        this.stand.gesehen = ungelesen.map((m) => String(m.uid)) // erster Durchlauf: nur merken
        return
      }
      for (const m of ungelesen) {
        const uid = String(m.uid)
        if (gesehen.has(uid)) continue
        gesehen.add(uid)
        const absender = String(m.from || '').replace(/<.*?>/g, '').replace(/"/g, '').trim() || 'Unbekannt'
        const betreff = String(m.subject || '(kein Betreff)').trim()
        this.melden('mail', `Mail von ${absender}`, `Neue Mail von ${absender}: ${betreff}.`, { anzeige: betreff })
      }
      // Nur die letzten 200 merken
      this.stand.gesehen = [...gesehen].slice(-200)
    } catch (e) {
      // Plugin aus oder Postfach nicht erreichbar: einmal melden, dann still
      this.problem('mail', e)
    }
  }

  // ── Fehlgeschlagene Jobs ──
  async jobs() {
    try {
      const profile = ((await this.hermes.rest('/api/profiles'))?.profiles || []).map((p) => p.name)
      const listen = await Promise.all(
        profile.map((p) => this.hermes.rest(`/api/cron/jobs?profile=${encodeURIComponent(p)}`).catch(() => []))
      )
      const jobs = listen.flatMap((l) => (Array.isArray(l) ? l : l?.jobs || []))
      const bekannt = this.stand.jobLaeufe || {}
      const erster = !this.stand.jobLaeufe
      for (const j of jobs) {
        const lauf = String(j.last_run_at || '')
        if (!lauf) continue
        if (!erster && bekannt[j.id] !== lauf && j.last_status === 'error') {
          const name = j.name || j.id
          this.melden('job', `Job fehlgeschlagen: ${name}`, `Achtung, der Job ${name} ist gerade fehlgeschlagen.`, {
            anzeige: String(j.last_error || 'Fehler beim letzten Lauf').slice(0, 160)
          })
        }
        bekannt[j.id] = lauf
      }
      this.stand.jobLaeufe = bekannt
    } catch (e) {
      this.problem('jobs', e)
    }
  }
}

module.exports = { bestellSatz, bestellAnzeige, istMeilenstein, meilensteinEinstellungen, STAND_DATEI, Waechter, shopifyZugang }
