// Selbsttest: prüft mit einem Klick, ob alles läuft, und sagt klar, was nicht geht und was zu tun ist.
// Aufruf über System → „Selbsttest“, die Befehlspalette oder „Luzzy, mach einen Selbsttest“.

const $ = (id) => document.getElementById(id)
const maskieren = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
const api = window.jarves

const OHNE_HERMES = { ok: null, text: 'übersprungen, braucht Hermes' }

// Höchstens so lange auf eine Prüfung warten
function mitFrist(versprechen, ms = 12000) {
  return Promise.race([versprechen, new Promise((_, nein) => setTimeout(() => nein(new Error('keine Antwort')), ms))])
}

// ok: true = läuft, false = Problem, null = übersprungen (hängt an etwas, das schon fehlt; zählt nicht extra)
// h: { verbunden(), hermesText(), mikrofonZustand(), wakeGewuenscht(), wakeAktiv(), stimmOptionen(), pluginAnzahl() }
async function pruefungen(h) {
  const ergebnisse = []
  const pruefen = async (name, fn) => {
    try {
      ergebnisse.push({ name, ...(await mitFrist(fn())) })
    } catch (e) {
      ergebnisse.push({ name, ok: false, text: e.message, tun: 'Unerwarteter Fehler. Jarves-OS neu starten; wenn es bleibt, mir die Meldung schicken.' })
    }
    zeigen(ergebnisse, true)
  }

  await pruefen('Hermes', async () =>
    h.verbunden()
      ? { ok: true, text: 'verbunden' }
      : { ok: false, text: h.hermesText() || 'nicht verbunden', tun: 'Hermes-App öffnen oder Jarves-OS neu starten. Jarves-OS versucht es auch selbst alle paar Sekunden.' })

  await pruefen('Luzzy (Modell)', async () => {
    if (!h.verbunden()) return OHNE_HERMES
    const info = await api.hermes.info()
    return info.modell ? { ok: true, text: info.modell } : { ok: false, text: 'kein Modell gemeldet', tun: 'In Hermes im Profil donnerwolf ein Modell auswählen.' }
  })

  await pruefen('Mikrofon', async () => {
    const z = h.mikrofonZustand()
    if (z === 'bereit' || z === 'nimmt-auf') return { ok: true, text: z === 'bereit' ? 'bereit' : 'nimmt gerade auf' }
    if (z === 'kein-mikrofon') return { ok: false, text: 'kein Mikrofon gefunden', tun: 'Headset einstecken, dann auf den Mikrofon-Knopf klicken.' }
    if (z === 'verweigert') return { ok: false, text: 'gesperrt', tun: 'Windows-Einstellungen → Datenschutz → Mikrofon: Zugriff für Apps erlauben.' }
    return { ok: false, text: 'noch nicht gestartet', tun: 'Einmal auf den Mikrofon-Knopf klicken.' }
  })

  if (h.wakeGewuenscht()) {
    await pruefen('„Hey Luzzy“', async () =>
      h.wakeAktiv()
        ? { ok: true, text: 'hört zu' }
        : h.verbunden() ? { ok: false, text: 'aus', tun: h.wakeHinweis?.() || 'Mikrofon prüfen; sonst in Hermes (Profil donnerwolf) das Aktivierungswort prüfen.' } : OHNE_HERMES)
  }

  await pruefen('Stimme', async () => {
    // Pocket TTS (lokal): meldet seinen eigenen Zustand; bis er läuft, spricht Luzzy mit Edge
    if (String(h.stimmOptionen().stimme || '').startsWith('pocket')) {
      const z = await api.stimme.pocketZustand().catch(() => ({ zustand: 'fehler', text: 'nicht erreichbar' }))
      if (z.zustand === 'bereit') return { ok: true, text: `Pocket TTS ${z.text}` }
      if (z.zustand === 'startet') return { ok: true, text: 'Pocket TTS startet, bis dahin spricht Ingrid' }
      return { ok: false, text: `Pocket TTS: ${z.text}`, tun: 'In den Einstellungen unter Stimme auf „Probe hören“ klicken. Fehlt uv, im Terminal installieren: powershell -c "irm https://astral.sh/uv/install.ps1 | iex"' }
    }
    const tun = 'Die Stimme braucht Internet (Microsoft-Dienst). Internetverbindung prüfen.'
    try {
      const bytes = await api.stimme.sprechen('Test', h.stimmOptionen())
      return bytes?.byteLength || bytes?.length ? { ok: true, text: 'funktioniert' } : { ok: false, text: 'keine Antwort', tun }
    } catch {
      return { ok: false, text: 'nicht erreichbar', tun }
    }
  })

  // Shopify und Postfach: Wächter jetzt prüfen lassen, dann seinen Stand lesen
  if (h.verbunden()) await mitFrist(api.waechter.pruefen(), 20000).catch(() => {})
  const verbindungen = await api.waechter.verbindungen().catch(() => ({}))
  const quelle = (name, schluessel, tun) =>
    pruefen(name, async () => {
      const v = verbindungen[schluessel]
      if (!v) return h.verbunden() ? { ok: false, text: 'nicht geprüft', tun: 'Gleich nochmal testen.' } : OHNE_HERMES
      return v.ok ? { ok: true, text: v.text || 'verbunden' } : { ok: false, text: v.text || 'Problem', tun }
    })
  await quelle('Shopify', 'shopify', 'Shopify-Zugang prüfen, vielleicht ist der Token abgelaufen (siehe Vault-Notiz shopify-token).')
  await quelle('Postfach', 'mail', 'In Hermes das IONOS-Mail-Plugin prüfen (Zugangsdaten, Internet).')

  const plugins = await api.plugins.liste().catch(() => [])
  await pruefen('Plugins', async () => ({ ok: true, text: `${h.pluginAnzahl() ?? plugins.length} geladen` }))
  if (plugins.some((p) => p.id === 'wetter')) {
    await pruefen('Wetter', async () => {
      const ort = (await api.plugins.datenLaden('wetter'))?.ort || { name: 'Schongau', breite: 47.8124, laenge: 10.89664, zeitzone: 'Europe/Berlin' }
      try {
        await api.plugins.aufrufen('wetter', 'vorhersage', ort.breite, ort.laenge, ort.zeitzone)
        return { ok: true, text: ort.name }
      } catch {
        return { ok: false, text: 'nicht abrufbar', tun: 'Internetverbindung prüfen. Der Wetterdienst (Open-Meteo) ist manchmal kurz weg, später nochmal testen.' }
      }
    })
  }
  return ergebnisse
}

function zeigen(ergebnisse, laeuft) {
  const fehler = ergebnisse.filter((e) => e.ok === false).length
  $('selbsttest-ergebnis').textContent = laeuft ? 'Prüfe …' : fehler ? `${fehler} ${fehler === 1 ? 'Problem' : 'Probleme'} gefunden` : 'Alles in Ordnung'
  $('selbsttest-liste').innerHTML = ergebnisse
    .map((e) => `<li class="${e.ok ? 'ok' : e.ok === null ? 'uebersprungen' : 'fehler'}">
      <span class="selbsttest-zeichen">${e.ok ? '✓' : e.ok === null ? '–' : '✗'}</span>
      <div><b>${maskieren(e.name)}</b> <span class="leise">${maskieren(e.text)}</span>${e.tun ? `<div class="selbsttest-tun">${maskieren(e.tun)}</div>` : ''}</div>
    </li>`)
    .join('')
}

let laeuft = false
// Führt den Test aus, zeigt ihn im Fenster und gibt Luzzys Zusammenfassung zurück
export async function selbsttestStarten(h) {
  if (!$('selbsttest').open) $('selbsttest').showModal()
  if (laeuft) return null
  laeuft = true
  $('selbsttest-nochmal').disabled = true
  try {
    zeigen([], true)
    const ergebnisse = await pruefungen(h)
    zeigen(ergebnisse, false)
    const probleme = ergebnisse.filter((e) => e.ok === false).map((e) => e.name.replace(/[„“]/g, ''))
    if (!probleme.length) return 'Selbsttest fertig: alles in Ordnung.'
    const liste = probleme.length > 1 ? `${probleme.slice(0, -1).join(', ')} und ${probleme.at(-1)}` : probleme[0]
    return `Selbsttest fertig. ${probleme.length === 1 ? 'Ein Problem' : `${probleme.length} Probleme`}: ${liste}. Was zu tun ist, steht im Fenster.`
  } finally {
    laeuft = false
    $('selbsttest-nochmal').disabled = false
  }
}
