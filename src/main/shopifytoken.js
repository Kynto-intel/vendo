// Shopify-Token an einer Stelle erneuern (System-Tab): Jarves-OS prüft den neuen Token bei Shopify und trägt ihn
// dann überall in Hermes ein, wo schon einer steht: hermes\config.yaml, hermes\.env und in jedem Profil
// (profiles\<name>\config.yaml und .env). Nur die Token-Zeile wird ersetzt, der Rest der Datei bleibt, wie er ist.
// Vor dem Schreiben: eine Sicherung pro Datei (<datei>.vor-jarves-token.bak, wird jedes Mal überschrieben,
// damit sich keine alten Tokens ansammeln). Der Token wird nie geloggt, angezeigt oder zurückgegeben.

const fs = require('node:fs')
const path = require('node:path')

const HERMES_HOME = process.env.JARVES_TEST_HERMES_HOME || path.join(process.env.LOCALAPPDATA || '', 'hermes')
const SHOPIFY_VERSION = '2025-07'
const TOKEN_FORM = /^shp(at|ca|pa)_[A-Za-z0-9]{20,}$/
const YAML_ZEILE = /^([ \t]*SHOPIFY_ACCESS_TOKEN:[ \t]*)(['"]?)[^'"\r\n]*\2([ \t]*)$/m
const ENV_ZEILE = /^([ \t]*SHOPIFY_ACCESS_TOKEN[ \t]*=[ \t]*)(['"]?)[^'"\r\n]*\2([ \t]*)$/m

// Alle Hermes-Dateien, in denen schon ein Shopify-Token steht
function dateienMitToken() {
  const ordner = [HERMES_HOME]
  const profile = path.join(HERMES_HOME, 'profiles')
  for (const e of fs.existsSync(profile) ? fs.readdirSync(profile, { withFileTypes: true }) : []) {
    if (e.isDirectory()) ordner.push(path.join(profile, e.name))
  }
  const liste = []
  for (const o of ordner) {
    for (const [name, muster] of [['config.yaml', YAML_ZEILE], ['.env', ENV_ZEILE]]) {
      const datei = path.join(o, name)
      let text = ''
      try {
        text = fs.readFileSync(datei, 'utf8')
      } catch {
        continue
      }
      if (muster.test(text)) liste.push({ datei, muster })
    }
  }
  return liste
}

// Shop-Adresse aus den Einstellungen (felix-hantschick.myshopify.com)
function shopAdresse() {
  for (const datei of [path.join(HERMES_HOME, 'profiles', 'donnerwolf', 'config.yaml'), path.join(HERMES_HOME, 'config.yaml')]) {
    try {
      const t = fs.readFileSync(datei, 'utf8').match(/SHOPIFY_STORE:[ \t]*['"]?([^'"\r\n]+)/)
      if (t) return t[1].trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    } catch {
      // nächste Datei
    }
  }
  for (const datei of [path.join(HERMES_HOME, 'profiles', 'donnerwolf', '.env'), path.join(HERMES_HOME, '.env')]) {
    try {
      const t = fs.readFileSync(datei, 'utf8').match(/^[ \t]*SHOPIFY_STORE_DOMAIN[ \t]*=[ \t]*['"]?([^'"\r\n]+)/m)
      if (t) return t[1].trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
    } catch {
      // nächste Datei
    }
  }
  return null
}

async function beiShopifyPruefen(token, shop) {
  let antwort
  try {
    antwort = await fetch(`https://${shop}/admin/api/${SHOPIFY_VERSION}/shop.json`, {
      headers: { 'X-Shopify-Access-Token': token, Accept: 'application/json' },
      signal: AbortSignal.timeout(20000)
    })
  } catch {
    throw new Error('Shopify ist gerade nicht erreichbar. Internet prüfen und nochmal versuchen.')
  }
  if (antwort.status === 401 || antwort.status === 403) throw new Error('Shopify lehnt diesen Token ab. Bitte prüfen, ob er vollständig kopiert ist und die nötigen Rechte hat.')
  if (!antwort.ok) throw new Error(`Shopify antwortet mit Fehler ${antwort.status}.`)
  const daten = await antwort.json().catch(() => ({}))
  return daten?.shop?.name || shop
}

// Token prüfen und überall eintragen. Liefert { shopName, dateien: [relative Pfade] } – nie den Token.
async function eintragen(tokenRoh, { ohnePruefung = false } = {}) {
  const token = String(tokenRoh || '').trim()
  if (!TOKEN_FORM.test(token)) throw new Error('Das sieht nicht wie ein Shopify-Token aus. Er beginnt mit „shpat_“ und hat danach viele Buchstaben und Zahlen.')
  const shop = shopAdresse()
  if (!shop) throw new Error('Die Shop-Adresse fehlt in den Hermes-Einstellungen (SHOPIFY_STORE).')
  const dateien = dateienMitToken()
  if (!dateien.length) throw new Error('In den Hermes-Einstellungen steht noch kein Shopify-Token, den Jarves-OS ersetzen könnte.')
  const shopName = ohnePruefung && process.env.JARVES_TEST_HERMES_HOME ? shop : await beiShopifyPruefen(token, shop)

  const geaendert = []
  for (const { datei, muster } of dateien) {
    const alt = fs.readFileSync(datei, 'utf8')
    const neu = alt.replace(muster, (_z, vorne, anf, hinten) => `${vorne}${anf || (datei.endsWith('.yaml') ? "'" : '')}${token}${anf || (datei.endsWith('.yaml') ? "'" : '')}${hinten}`)
    if (neu === alt) continue
    fs.writeFileSync(`${datei}.vor-jarves-token.bak`, alt, 'utf8') // eine Sicherung pro Datei
    fs.writeFileSync(`${datei}.jarves-neu`, neu, 'utf8')
    fs.renameSync(`${datei}.jarves-neu`, datei)
    geaendert.push(path.relative(HERMES_HOME, datei))
  }
  return { shopName, dateien: geaendert }
}

// Stellen zählen (für die Anzeige), ohne Werte
function stellen() {
  return dateienMitToken().map(({ datei }) => path.relative(HERMES_HOME, datei))
}

module.exports = { eintragen, stellen }
