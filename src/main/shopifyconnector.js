const SHOPIFY = 'shopify'
const ALIAS = /^[a-z0-9][a-z0-9-]{0,31}$/

async function konten(hermes, profil) {
  const antwort = await hermes.rpc('connectors.accounts', { connector: SHOPIFY, profile: profil })
  return (Array.isArray(antwort?.accounts) ? antwort.accounts : []).filter((konto) => konto.connector === SHOPIFY)
}

function statusAus(konten) {
  const aktiv = konten.find((konto) => !konto.disabled && konto.active && konto.status === 'active')
  if (aktiv) return { ok: true, status: 'active', text: `Mit Hermes verbunden${aktiv.label ? ` · ${aktiv.label}` : ''}` }

  const offen = konten.find((konto) => !konto.disabled && konto.status === 'pending')
  if (offen) return { ok: false, status: 'pending', text: 'Shopify-Anmeldung bei Hermes läuft.' }

  const zuletzt = konten.find((konto) => !konto.disabled)
  if (!zuletzt) return { ok: false, status: 'missing', text: 'Kein Shopify-Konto in Hermes verbunden.' }
  if (zuletzt.status === 'expired' || zuletzt.status === 'revoked') {
    return { ok: false, status: zuletzt.status, text: 'Shopify-Zugang bei Hermes abgelaufen. Bitte erneut verbinden.' }
  }
  if (zuletzt.status === 'failed') return { ok: false, status: 'failed', text: 'Hermes konnte Shopify nicht verbinden.' }
  return { ok: false, status: zuletzt.status || 'inactive', text: 'Shopify ist bei Hermes nicht aktiv verbunden.' }
}

async function status(hermes, profil) {
  return statusAus(await konten(hermes, profil))
}

async function verbinden(hermes, profil, externOeffnen) {
  const vorhandene = (await konten(hermes, profil)).filter((konto) => !konto.disabled)
  vorhandene.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
  const konto = vorhandene.find((eintrag) => eintrag.status === 'active') || vorhandene[0]
  const parameter = {
    owner: { type: 'account' },
    connectors: [SHOPIFY],
    reconnect: Boolean(konto),
    profile: profil
  }

  if (konto?.alias && ALIAS.test(konto.alias)) parameter.alias = konto.alias
  else if (konto?.connection_id) parameter.connection_id = konto.connection_id

  const vorgang = await hermes.rpc('connectors.connect', parameter)
  const ziel = vorgang?.targets?.find((eintrag) => eintrag.name === SHOPIFY)
  const adresse = ziel?.connect_url
  if (adresse) {
    let url
    try {
      url = new URL(adresse)
    } catch {
      throw new Error('Hermes hat keine gültige Shopify-Anmeldeseite geliefert.')
    }
    if (url.protocol !== 'https:') throw new Error('Hermes hat eine unsichere Shopify-Anmeldeseite geliefert.')
    await externOeffnen(url.href)
  }

  return { gestartet: true, anmeldungGeoeffnet: Boolean(adresse) }
}

module.exports = { status, verbinden }