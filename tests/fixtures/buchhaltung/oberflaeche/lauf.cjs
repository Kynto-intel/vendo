'use strict'
// Electron-Lauf für die Oberflächentests des Rechnungen-Plugins (gestartet von tests/rechnungen-oberflaeche.test.js).
// Lädt die echte ansicht.js in ein verstecktes Fenster mit einem Test-ctx (nur synthetische Antworten), klickt die
// USB-Einrichtung (Schritt 1.8) durch und gibt die Beobachtungen als JSON-Zeile aus. Kein Netz, keine echten Daten.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const ansichtPfad = path.resolve(process.argv.at(-1))
const ansicht = pathToFileURL(ansichtPfad).href
// Wie in der App: style.css und die stil.css ALLER Plugins liegen global auf der Seite (plugin-host.js lädt jede einzeln)
const vendo = path.resolve(path.dirname(ansichtPfad), '..', '..')
const stile = [path.join(vendo, 'src', 'renderer', 'style.css'), ...fs.readdirSync(path.join(vendo, 'plugins'), { withFileTypes: true }).filter((d) => d.isDirectory() || (d.isSymbolicLink() && fs.statSync(path.join(vendo, 'plugins', d.name)).isDirectory())).map((d) => path.join(vendo, 'plugins', d.name, 'stil.css')).filter((d) => fs.existsSync(d))]
const FELDER = require(path.join(path.dirname(ansichtPfad), 'angaben.js')).FELDER // echtes Feldschema des getesteten Plugins
const stilLinks = stile.map((d) => `<link rel="stylesheet" href="${pathToFileURL(d).href}">`).join('')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-oberflaeche-'))
const seite = path.join(tmp, 'seite.html')
fs.writeFileSync(seite, `<!doctype html><html lang="de"><head><meta charset="utf-8">${stilLinks}</head><body>
<main class="mitte" style="position:relative;width:1000px;height:420px"><section class="ansicht ansicht-seite plugin-ansicht" data-ansicht="plugin-rechnungen"><header class="seiten-kopf"><div><h2>Rechnungen</h2></div><div class="seiten-knoepfe plugin-knoepfe" id="kopf"></div></header><div class="plugin-inhalt" id="inhalt"></div></section></main>
<script type="module">
  const SCHLUESSEL = 'K7QF2-ABCDE-12345-FGHJK-67890-MNPQR'
  const log = []
  // Hintergrund-Timer ab 1 Minute sofort auslösen (wöchentliche Prüfung startet sonst erst nach 2 Minuten)
  const echtesSetTimeout = window.setTimeout
  window.setTimeout = (f, ms, ...a) => echtesSetTimeout(f, ms >= 60000 ? 0 : ms, ...a)
  let wartungOk = false
  const FELDER = ${JSON.stringify(FELDER)}
  let gespeicherteAngaben = null
  const leereAngaben = Object.fromEntries(FELDER.map((f) => [f.feld, f.typ === 'liste' ? [] : (f.standard || '')]))
  const vorschlag = { firmenname: 'Synthetik-Shop', inhaber: 'Erika Muster', strasse: 'Teststraße 1', plz: '12345', ort: 'Musterstadt', land: 'DE', email: 'test@example.test', wId: 'DE123456789', iban: 'DE89370400440532013000', eigeneNamen: ['Synthetik', 'Muster'] }
  const pruefungFuer = (w) => {
    const fehler = {}
    if (w.iban && w.iban.replace(/ /g, '') !== 'DE89370400440532013000') fehler.iban = 'Die IBAN ist ungültig (Prüfsumme oder Länge stimmt nicht).'
    const fehlend = FELDER.filter((f) => f.pflicht && !w[f.feld]).map((f) => f.feld)
    if (!w.steuernummer && !w.ustId && !w.wId) fehlend.push('steuerkennung')
    const sz = w.steuerzeitraeume || []
    if (!sz.length) fehlend.push('steuerzeitraeume')
    if (sz.some((z) => z.art === 'regel' && !String(z.satz ?? '').trim())) fehler.steuerzeitraeume = 'Zeile 2: Bitte den Steuersatz in Prozent angeben, z. B. 19.'
    return { ok: !Object.keys(fehler).length, vollstaendig: !Object.keys(fehler).length && !fehlend.length, fehler, fehlend, hinweise: [] }
  }
  // Steuerstatus je Zeitraum (Schritt 2.2): Vorschlag wie aus angaben.steuerVorschlag, Abgleich nach dem Speichern
  const steuerVorschlag = { anzahl: 12, von: '2024-04-03', bis: '2024-05-28', satz: 19, steuer: 45.6, zeitraeume: [{ von: '', bis: '2024-04-02', art: 'klein', satz: null }, { von: '2024-04-03', bis: '2024-05-28', art: 'regel', satz: 19 }, { von: '2024-05-29', bis: '', art: 'klein', satz: null }] }
  const steuerFuer = (w) => (w.steuerzeitraeume || []).length
    ? { daten: true, bestellungen: 41, vorschlag: null, abgleich: { geprueft: 41, steuerTrotzKlein: [{ nr: '<b>9</b>', datum: '2024-08-01' }], ohneSteuerBeiRegel: [], ohneStatus: [] } }
    : { daten: true, bestellungen: 41, vorschlag: steuerVorschlag, abgleich: null }
  // wie haupt.js seit Schritt 2.3: Vorschlag nur für noch leere Felder, auch nach dem Speichern
  const vorschlagFuer = (w) => Object.entries(vorschlag).filter(([f]) => Array.isArray(w[f]) ? !w[f].length : !w[f])
  const vorschlagFuerLeere = (w) => vorschlagFuer(w).length ? Object.fromEntries(vorschlagFuer(w)) : null
  window.__firmennameLeeren = () => { gespeicherteAngaben.firmenname = '' }
  // Schritt 4.1: eine synthetische Shopify-Bestellung, bestellt am 31.12.2024, per Überweisung bezahlt am 02.01.2025, teilweise erstattet
  const BESTELLUNG = { id: 's9001', name: 'Bestellung #9001 (Version 1)', groesse: 0, zeit: Date.parse('2024-12-31T10:00:00Z'), scanStand: Date.parse('2025-01-03T10:00:00Z'), methode: 'api', seiten: 1, zeichen: 0, quelle: 'shopify', beleg: { version: 1, pdf: '2024/umsatzbeleg/synthetisch.pdf' },
    rechnung: { anbieter: 'shopify-api', lieferant: 'Synthetik-Shop', waehrung: 'EUR', preisart: 'brutto', referenz: '9001', bestellnummer: '9001', rechnungsnummer: '#9001', datum: '2024-12-31', empfaenger: { name: 'Test Kunde' },
      positionen: [{ typ: 'artikel', bezeichnung: 'Test-Shirt', menge: 1, einzelpreis: 20, gesamt: 20 }], versand: 0, anzahlPositionen: 1, anzahlEntfernt: 0, anzahlArtikel: 1,
      art: 'einnahme', wirksam: 18, wirksamArt: 'ohne MwSt (§ 19)', kleinunternehmer: true, summen: { brutto: 18, mwst: 0, netto: 18, zwischensumme: null, mwstSatz: 0 }, rabatt: 0, zusatzErstattung: 2, offen: 0, retouren: [],
      zahlung: { art: 'Bank Deposit', bezahlt: true, datum: '2025-01-02', eingaenge: [{ datum: '2025-01-02', betrag: 20 }], erstattungen: [{ datum: '2025-01-10', betrag: 2 }], manuell: true, bekannt: true },
      storniert: false, version: 'api-1', pruefung: { ok: true, hinweise: [] } } }
  const BESTELLUNG2 = { ...BESTELLUNG, id: 's9002', name: 'Bestellung #9002 (Version 1)', zeit: Date.parse('2024-11-15T10:00:00Z'), beleg: undefined,
    rechnung: { ...BESTELLUNG.rechnung, referenz: '9002', bestellnummer: '9002', rechnungsnummer: '#9002', datum: '2024-11-15', empfaenger: { name: 'Test Kunde 2' }, wirksam: 12, summen: { brutto: 12, mwst: 0, netto: 12, zwischensumme: null, mwstSatz: 0 }, zahlung: { art: 'Bank Deposit', bezahlt: true, datum: '2025-03-01', eingaenge: [{ datum: '2025-03-01', betrag: 12 }], erstattungen: [], manuell: true, bekannt: true } } }
  const SHIRTIGO = { id: 'tT-9001', name: 'Shirtigo T-9001 · Rechnung R-9001', groesse: 0, zeit: Date.parse('2025-01-08T10:00:00Z'), scanStand: Date.parse('2025-01-09T10:00:00Z'), methode: 'shirtigo-api', seiten: 1, zeichen: 0, quelle: 'shirtigo-api',
    rechnung: { anbieter: 'shirtigo-api', lieferant: 'Shirtigo GmbH', rechnungsnummer: 'R-9001', referenz: '9001', bestellnummer: 'T-9001', datum: '2025-01-08', art: 'ausgabe', wirksam: 8, wirksamArt: 'inkl. MwSt', summen: { netto: 8, brutto: 8, mwst: 0 }, positionen: [], anzahlPositionen: 0, anzahlArtikel: 0, zahlung: { bezahlt: true } } }
  const SHIRTIGO2 = { ...SHIRTIGO, id: 'tT-9002', name: 'Shirtigo T-9002 · Rechnung R-9002', zeit: Date.parse('2025-03-02T10:00:00Z'),
    rechnung: { ...SHIRTIGO.rechnung, rechnungsnummer: 'R-9002', referenz: '9002', bestellnummer: 'T-9002', datum: '2025-03-02', wirksam: 4, summen: { netto: 4, brutto: 4, mwst: 0 } } }
  const FIXKOSTEN = { id: 'r' + 'd4'.repeat(10), name: 'Fixkosten.pdf', groesse: 0, zeit: Date.parse('2024-12-30T10:00:00Z'), scanStand: Date.parse('2025-01-03T10:00:00Z'), methode: 'text', seiten: 1, zeichen: 1, quelle: null,
    rechnung: { anbieter: 'shop-rechnung', lieferant: 'Shopify', rechnungsnummer: 'FIX-1', datum: '2024-12-30', zahlung: { datum: '2025-01-03' }, art: 'ausgabe', wirksam: 3, wirksamArt: 'inkl. MwSt', summen: { netto: 3, brutto: 3, mwst: 0 }, positionen: [], anzahlPositionen: 0 } }
  let p13bAm = null
  // Schritt 4.5: Dashboard (synthetisch) – Aufgaben mit Zielen, EÜR-Zeilen, erledigte Jahresaufgabe
  let erledigt = {}
  const AUFGABEN = [
    { schluessel: 'p13b-2026-09', stufe: 'rot', titel: '§ 13b-Voranmeldung 09.2026', text: 'Überfällig seit 12.10.2026 – <b>19,00</b> € Steuer.', frist: '2026-10-12', ziel: 'steuer', erledigbar: false },
    { schluessel: 'angaben', stufe: 'gelb', titel: 'Pflichtangaben fehlen', text: 'Ohne Pflichtangaben erzeugt Vendo keine neuen Umsatzbelege.', frist: null, ziel: 'angaben', erledigbar: false },
    { schluessel: 'usb', stufe: 'gelb', titel: 'USB-Sicherung fällig', text: 'Letzte Sicherung vor 9 Tagen.', frist: null, ziel: 'usb', erledigbar: false },
    { schluessel: 'euer-2025', stufe: 'info', titel: 'Steuererklärung 2025 mit Anlage EÜR', text: 'Abgabe ohne Steuerberater bis 31.07.2026.', frist: '2026-07-31', ziel: 'uebersicht', erledigbar: true }
  ]
  let getestet = false
  let gesichert = false
  const sticks = [{ laufwerk: 'D:', name: 'TESTSTICK', dateisystem: 'FAT32', frei: 29e9, vendo: false }]
  window.__sticks = sticks
  let usb = { vorhanden: false, bestaetigt: false, kennung: null, erstellt: null, bestaetigtAm: null, verschluesselung: true }
  const dienste = {
    // Plan 11.3: Persönliche Angaben, Menü, ELSTER, Export (synthetisch)
    persoenlichLaden: () => ({ felder: [{ feld: 'vorname', gruppe: 'Steuerpflichtige Person', label: 'Vorname', typ: 'text' }, { feld: 'religion', gruppe: 'Steuerpflichtige Person', label: 'Religion', typ: 'text', vorschlaege: ['keine'] }, { feld: 'veranlagung', gruppe: 'Veranlagung', label: 'Art', typ: 'auswahl', optionen: ['', 'einzeln'] }], werte: { vorname: 'Erika', religion: '', veranlagung: '' }, gespeichert: true }),
    persoenlichSpeichern: () => ({ ok: true, pruefung: { ok: true, fehler: [] } }),
    menueLaden: () => ({ ausblendbar: ['bestellungen', 'rechnungen', 'steuer'], aus: [] }),
    menueSpeichern: (aus) => ({ ausblendbar: ['bestellungen', 'rechnungen', 'steuer'], aus }),
    elsterUebersicht: () => ({ jahre: ['2025'], jahr: '2025', hinweis: 'Ohne Gewähr.', hauptvordruck: [{ label: 'Name', wert: 'Erika Muster' }], gewinn: { anlage: 'Anlage G', label: 'Gewinn', wert: 580 }, euer: [{ kz: 'Kz 111', label: 'Einnahmen', wert: 1500 }], firma: { steuernummer: '', finanzamt: 'Musterstadt' } }),
    pruefwert: () => ({ wert: 'a'.repeat(64), eintraege: 3, zeit: '2026-10-29T00:00:00Z' }),
    pruefwertVergleichen: () => ({ gueltig: true, bekannt: true, nr: 2, zeit: '2026-10-28T00:00:00Z', seitdemNeu: 1 }),
    datenbankStatus: () => ({ zustand: { zustand: 'aus', meldung: 'Keine Datenbank.' }, index: null, pruefung: null }),
    jahresarchivJahre: () => ['2025', '2024'],
    // Schritt 4.2: Umsatz je Jahr (synthetisch), 2024 mit Regelbesteuerung, 2023 mit geschätztem Zahlungsdatum
    umsatzJahre: () => ({ jahre: [
      { jahr: '2024', umsatz: 15000, ust: 400, eingaenge: 15600, erstattungen: 200, nachBestelldatum: 15000, bestellungen: 150, geschaetzt: 0, sonstige: 0 },
      { jahr: '2023', umsatz: 3000, ust: 0, eingaenge: 3000, erstattungen: 0, nachBestelldatum: 2980, bestellungen: 40, geschaetzt: 2, sonstige: 1 }
    ],
    // Schritt 4.3: Wächter (synthetisch) – über 25.000 €, EU nahe 10.000 €, Steuerstatus sagt noch Kleinunternehmer
    waechter: { jahr: '2026', stufe: 'orange', gruendungsjahr: false, kleinunternehmer: true,
      meldungen: [{ stufe: 'orange', text: 'Umsatz 2026 über 25.000 €: Ab 01.01.2027 gilt die Regelbesteuerung – Umstellung vorbereiten.' }, { stufe: 'gelb', text: 'EU-Fernverkäufe 2026 <b>8.000,00 €</b> – nahe an 10.000 €.' }],
      laufend: { umsatz: 26000, grenze: 100000, grenze25: 25000, ueberschritten: null }, vorjahr: { jahr: '2025', umsatz: 3540, grenze: 25000 },
      eu: { umsatz: 8000, vorjahr: 0, grenze: 10000, laender: ['AT', 'NL'], ueberschritten: null } },
    statusPasst: false }),
    // Schritt 4.4: § 13b (synthetisch) – Meta (EU, erkannt), Zahlungsdienst (vermutlich steuerfrei), US-Anbieter in USD
    p13bUebersicht: () => ({ heute: '2026-10-29',
      monate: [
        { monat: '2026-09', rechnungen: 2, steuerfrei: 1, eu: { bemessung: 100, steuer: 19 }, drittland: { bemessung: 0, steuer: 0 }, offenWaehrung: 0, steuer: 19, faellig: '2026-10-12', angemeldet: p13bAm, pflicht: true, ueberfaellig: !p13bAm },
        { monat: '2026-08', rechnungen: 1, steuerfrei: 0, eu: { bemessung: 0, steuer: 0 }, drittland: { bemessung: 50, steuer: 9.5 }, offenWaehrung: 1, steuer: 9.5, faellig: '2026-09-10', angemeldet: '2026-09-08', pflicht: true, ueberfaellig: false }
      ],
      lieferanten: [{ lieferant: 'Meta Platforms Ireland Limited', einstufung: null, herkunft: null, vermutetFrei: false }, { lieferant: 'Viva Wallet <b>X</b>', einstufung: null, herkunft: null, vermutetFrei: true }],
      faelle: [
        { id: 'r' + 'a1'.repeat(10), name: 'meta.pdf', lieferant: 'Meta Platforms Ireland Limited', datum: '2026-09-30', betrag: 100, waehrung: 'EUR', erkannt: true, eintrag: {}, fall: { monat: '2026-09', herkunft: 'eu', satz: 19, bemessung: 100, steuer: 19, steuerfrei: false, vermutetFrei: false, waehrungFehlt: false, kz: ['46', '47'], quelle: 'erkannt' } },
        { id: 'r' + 'b2'.repeat(10), name: 'viva.pdf', lieferant: 'Viva Wallet <b>X</b>', datum: '2026-09-15', betrag: 12, waehrung: 'EUR', erkannt: false, eintrag: { aktiv: true }, fall: { monat: '2026-09', herkunft: 'eu', satz: 19, bemessung: 12, steuer: 0, steuerfrei: true, vermutetFrei: true, waehrungFehlt: false, kz: ['46', '47'], quelle: 'manuell' } },
        { id: 'r' + 'c3'.repeat(10), name: 'acme.pdf', lieferant: 'Acme Inc.', datum: '2026-08-20', betrag: 50, waehrung: 'USD', erkannt: false, eintrag: {}, fall: null }
      ] }),
    p13bSetzen: () => null, p13bAnbieter: () => null,
    dashboard: () => ({ heute: '2026-10-29', erledigt: { ...erledigt },
      aufgaben: AUFGABEN.filter((a) => !erledigt[a.schluessel]),
      euer: [
        { jahr: '2026', kz111: 1500, kz112: 0, kz140: 0, kz100: 900, sonstige: 0, kz186: 20, einnahmen: 1500, ausgaben: 920, gewinn: 580 },
        { jahr: '2024', kz111: 12000, kz112: 2500, kz140: 400, kz100: 7500, sonstige: 500, kz186: 0, einnahmen: 14900, ausgaben: 8000, gewinn: -100 }
      ] }),
    aufgabeErledigt: (k, am) => { if (am) erledigt[k] = am; else delete erledigt[k]; return am || null },
    aufgabenMelden: () => [{ schluessel: 'p13b-2026-09', stufe: 'rot', titel: '§ 13b-Voranmeldung 09.2026', text: 'Überfällig seit 12.10.2026.' }],
    p13bAngemeldet: (monat, am) => { p13bAm = am; return am ? { am } : null },
    liste: () => [BESTELLUNG, BESTELLUNG2, SHIRTIGO, SHIRTIGO2, FIXKOSTEN], uebersicht: () => null, bestellOrte: () => [], shirtigoStatus: () => false,
    usbSchluesselStatus: () => ({ ...usb }),
    usbStatus: () => (gesichert ? { letzteSicherung: '2026-10-29T10:10:00Z', laufwerk: 'TESTSTICK', tageSeit: 0, erinnern: false } : { letzteSicherung: null, tageSeit: null, erinnern: false }),
    usbLaufwerke: () => sticks.slice(),
    usbPlan: (lw) => ({ laufwerk: { laufwerk: lw }, archivOk: true, archivFehler: 0, eintraege: 1439, schonGesichert: gesichert, neu: gesichert ? 0 : 1439, bytes: 107e6, frei: 29e9, passt: true }),
    usbSichern: (lw) => { gesichert = true; return { ok: true, neu: 1439, schonDa: 0, kontrolle: { geprueft: 1439 }, kennung: 'AB12-CD34', stand: 'S', laufwerk: { laufwerk: lw } } },
    angabenLaden: () => { const werte = { ...leereAngaben, ...(gespeicherteAngaben || {}) }; return { felder: FELDER, werte, gespeichert: !!gespeicherteAngaben, steuerarten: { klein: 'Kleinunternehmer (§ 19 UStG)', regel: 'Regelbesteuerung' }, steuer: steuerFuer(gespeicherteAngaben || {}), vorschlag: vorschlagFuerLeere(werte), pruefung: pruefungFuer(werte), vorschau: 'RE-2026-0001', verlauf: gespeicherteAngaben ? [{ zeit: '2026-10-29T12:00:00Z', felder: ['iban'] }] : [], archiv: { pfad: 'C:\\\\Test\\\\Vendo-Archiv', belegt: true } } },
    angabenSpeichern: (e) => { const w = { ...e, eigeneNamen: String(e.eigeneNamen || '').split('\\n').filter(Boolean) }; const p = pruefungFuer(w); if (!p.ok) return { ok: false, werte: w, pruefung: p }; gespeicherteAngaben = w; return { ok: true, werte: w, pruefung: p, geaendert: 10 } },
    usbPruefen: () => ({ ok: true, geprueft: 1439, staende: 1, erstellt: '2026-10-29T10:10:00Z' }),
    wartungLauf: (o) => {
      if (o?.erzwingen) wartungOk = true
      return wartungOk ? { neu: true, ok: true, archiv: { ok: true, geprueft: 1439, anzahlFehler: 0, fehler: [] }, siegel: { ok: true, anzahl: 1, nochNichtVersiegelt: 0 } } : { neu: true, ok: false, archiv: { ok: false, geprueft: 1439, anzahlFehler: 1, fehler: ['Datei verändert: 2026/umsatzbeleg/<b>x</b>.pdf'] }, siegel: { ok: true, anzahl: 0 } }
    },
    archivStatus: () => ({
      archiv: { pfad: 'C:\\Archiv', eintraege: 1439 },
      pruefung: { zeit: '2026-10-29T10:00:00Z', tageSeit: 0, faellig: false, ok: wartungOk, archiv: wartungOk ? { ok: true, anzahlFehler: 0, fehler: [] } : { ok: false, anzahlFehler: 1, fehler: ['Datei verändert: 2026/umsatzbeleg/<b>x</b>.pdf'] }, siegel: wartungOk ? { ok: true, anzahl: 1, zuletzt: '2026-10-29T09:00:00Z', nochNichtVersiegelt: 2 } : { ok: true, anzahl: 0 } },
      usb: { letzteSicherung: gesichert ? '2026-10-29T10:10:00Z' : null, tageSeit: gesichert ? 0 : null, laufwerk: 'TESTSTICK', letztesErgebnis: 'ok' },
      wiederherstellungstest: getestet ? { zeit: '2026-10-29T10:20:00Z', ok: true, dateien: 1439, tageSeit: 0, faellig: false } : { faellig: true },
      schluessel: { bestaetigt: usb.bestaetigt, kennung: 'AB12-CD34' }
    }),
    wiederherstellungTesten: (lw) => { getestet = true; return { ok: true, dateien: 1439, erstellt: '2026-10-29T10:10:00Z', laufwerk: { laufwerk: lw }, fehler: [] } },
    usbSchluesselNeu: () => { usb = { ...usb, vorhanden: true, kennung: '<b>AB12</b>-CD34', erstellt: '2026-10-29T10:00:00Z' }; return { schluessel: SCHLUESSEL, kennung: usb.kennung, erstellt: usb.erstellt } },
    usbSchluesselBestaetigen: (e) => {
      if (String(e).toUpperCase().replace(/[\\s-]/g, '') !== SCHLUESSEL.replace(/-/g, '')) throw new Error('Der eingetippte Schlüssel stimmt nicht mit dem Blatt überein.')
      usb = { ...usb, bestaetigt: true, bestaetigtAm: '2026-10-29T10:05:00Z' }
      return { bestaetigt: true }
    }
  }
  const ctx = {
    element: document.getElementById('inhalt'), kopfKnoepfe: document.getElementById('kopf'),
    maskieren: (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]),
    async aufrufen(name, ...args) { log.push([name, ...args]); const f = dienste[name]; if (!f) return null; return f(...args) },
    async bestaetigen(text) { log.push(['bestaetigen', text]); return true },
    melden(meldung) { log.push(['melden', meldung]) }
  }
  window.__test = { log, SCHLUESSEL, bereit: false, fehler: null }
  try { const m = await import(${JSON.stringify(ansicht)}); await m.starten(ctx); window.__test.bereit = true } catch (f) { window.__test.fehler = String(f && f.stack || f) }
</script></body></html>`)

const warten = (win, bedingung, ms = 5000) => win.webContents.executeJavaScript(`new Promise((ok, nein) => { const t0 = Date.now(); (function p() { try { if (${bedingung}) return ok(true) } catch {} if (Date.now() - t0 > ${ms}) return nein(new Error('Zeitüberschreitung: ' + ${JSON.stringify(bedingung)})); setTimeout(p, 20) })() })`)
const js = (win, code) => win.webContents.executeJavaScript(code)
// Layout wie im echten Fenster: Feld nicht gestaucht (Inhalt passt in die Höhe), versteckte Felder wirklich unsichtbar
const layout = (win, sel) => js(win, `(() => { const e = document.querySelector(${JSON.stringify(sel)}); const s = getComputedStyle(e); return { hidden: e.hidden, display: s.display, gestaucht: !e.hidden && e.scrollHeight > e.clientHeight + 1, hoehe: e.clientHeight, inhalt: e.scrollHeight } })()`)

app.whenReady().then(async () => {
  const ergebnis = { schritte: {} }
  try {
    const win = new BrowserWindow({ show: false, webPreferences: { contextIsolation: true } })
    await win.loadFile(seite)
    await warten(win, 'window.__test.bereit || window.__test.fehler')
    const fehler = await js(win, 'window.__test.fehler')
    if (fehler) throw new Error(fehler)
    // Schritt 4.5: Start im Dashboard „Übersicht“, dann Aufgaben bedienen; danach weiter in „Bestellungen“ wie bisher
    const db = "document.querySelector('[data-uebersicht]')"
    await warten(win, `!${db}.hidden && ${db}.querySelector('[data-euer]')`)
    const ohneNbsp = (t) => `${t}.replaceAll(String.fromCharCode(160), ' ').replace(/\\s+/g, ' ').trim()`
    ergebnis.schritte.dashboard = {
      tab: await js(win, "[...document.querySelectorAll('[data-tab]')].map((b) => [b.dataset.tab, b.getAttribute('aria-selected')])"),
      liste: await js(win, "[...document.querySelectorAll('[data-listenteil]')].filter((e) => getComputedStyle(e).display !== 'none' && !e.hidden).length"),
      aufgaben: await js(win, `[...${db}.querySelectorAll('[data-aufgabe]')].map((li) => [li.dataset.aufgabe, li.className, ${ohneNbsp('li.querySelector(".rn-aufgabe-text").innerText')}, [...li.querySelectorAll('button')].map((b) => b.textContent)])`),
      maskiert: await js(win, `!${db}.querySelector('.rn-aufgabe-text b')`),
      euer: await js(win, `[...${db}.querySelectorAll('[data-euer] tbody tr')].map((tr) => [...tr.children].map((c) => ${ohneNbsp('c.textContent')}).join(' | '))`),
      euerKopf: await js(win, `[...${db}.querySelectorAll('[data-euer] thead th')].map((t) => t.textContent)`),
      minus: await js(win, `${db}.querySelector('[data-euer-jahr="2024"] b').className`)
    }
    ergebnis.schritte.dashboard.layout = await layout(win, '[data-uebersicht]')
    await js(win, `${db}.querySelector('[data-aufgabe="euer-2025"] [data-aufgabe-erledigt]').click()`)
    await warten(win, `!${db}.querySelector('[data-aufgabe="euer-2025"]') && ${db}.querySelector('[data-aufgaben-erledigt]')`)
    ergebnis.schritte.dashboard.nachErledigt = await js(win, `${ohneNbsp(`${db}.querySelector('[data-aufgaben-erledigt]').textContent`)}`)
    await js(win, `${db}.querySelector('[data-aufgabe-zurueck="euer-2025"]').click()`)
    await warten(win, `${db}.querySelector('[data-aufgabe="euer-2025"]')`)
    await js(win, `${db}.querySelector('[data-aufgabe="p13b-2026-09"] [data-aufgabe-ziel]').click()`)
    await warten(win, "!document.querySelector('[data-steuer]').hidden")
    ergebnis.schritte.dashboard.nachZiel = await js(win, "[document.querySelector('[data-tab=\"steuer\"]').getAttribute('aria-selected'), document.querySelector('[data-uebersicht]').hidden]")
    ergebnis.schritte.dashboard.aufrufe = await js(win, "window.__test.log.filter((x) => ['aufgabeErledigt'].includes(x[0]))")
    ergebnis.schritte.dashboard.meldung = await js(win, 'window.__test.log.find((x) => x[0] === "melden" && x[1].titel === "Rechnungen: dringende Aufgaben")?.[1] || null')
    await js(win, "document.querySelector('[data-tab=\"bestellungen\"]').click()")
    await warten(win, `${db}.hidden`)
    const panel = "document.querySelector('[data-usb]')"
    ergebnis.schritte.anfangVersteckt = await js(win, `${panel}.hidden`)
    ergebnis.schritte.knopfImWartungsmenue = await js(win, "document.querySelector('[data-usb-einrichten]')?.closest('[data-menue]')?.dataset.menue || 'kein Menü: ' + document.querySelector('[data-usb-einrichten]')?.parentElement?.outerHTML.slice(0, 200)")

    await js(win, "document.querySelector('[data-usb-einrichten]').click()")
    await warten(win, `!${panel}.hidden && ${panel}.querySelector('[data-usb-erzeugen]')`)
    ergebnis.layout = { stile: stile.map((d) => path.relative(vendo, d)) }
    ergebnis.layout.usbEinfuehrung = await layout(win, '[data-usb]')
    ergebnis.layout.statusVersteckt = await layout(win, '[data-archivstatus]')
    // Kleiner goldener Knopf: goldener Hintergrund + Kontrast der Schrift (WCAG-Verhältnis gegen die hellste Verlaufsfarbe)
    ergebnis.layout.goldKnopf = await js(win, `(() => {
      const k = document.querySelector('[data-usb-erzeugen]'); const s = getComputedStyle(k)
      const zahlen = (t) => (t.match(/[0-9]+([.][0-9]+)?/g) || []).slice(0, 3).map(Number) // ohne Backslash: steht in einem Template-String
      const lum = ([r, g, b]) => { const c = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b) }
      const verlauf = s.backgroundImage.includes('gradient')
      const hinten = verlauf ? zahlen(s.backgroundImage.slice(s.backgroundImage.indexOf('rgb'))) : zahlen(s.backgroundColor)
      const [l1, l2] = [lum(zahlen(s.color)), lum(hinten)].sort((a, b) => b - a)
      return { verlauf, kontrast: Math.round(((l1 + 0.05) / (l2 + 0.05)) * 10) / 10 }
    })()`)
    ergebnis.schritte.einfuehrung = await js(win, `${panel}.textContent.includes('Ein Passwort musst du dir nicht ausdenken')`)

    await js(win, `${panel}.querySelector('[data-usb-erzeugen]').click()`)
    await warten(win, `${panel}.querySelector('.rn-usb-schluessel')`)
    ergebnis.schritte.schluesselAngezeigt = await js(win, `${panel}.querySelector('.rn-usb-schluessel').textContent === window.__test.SCHLUESSEL`)
    ergebnis.schritte.kennungMaskiert = await js(win, `!${panel}.querySelector('b') && ${panel}.textContent.includes('<b>AB12</b>-CD34')`)
    ergebnis.layout.usbSchluessel = await layout(win, '[data-usb]')
    ergebnis.schritte.druckKnopf = await js(win, `!!${panel}.querySelector('[data-usb-drucken]')`)
    ergebnis.schritte.warnungStick = await js(win, `${panel}.textContent.includes('nicht beim USB-Stick')`)

    await js(win, `${panel}.querySelector('[data-usb-eingabe]').value = 'FALSCH-FALSCH'; ${panel}.querySelector('[data-usb-bestaetigen]').click()`)
    await warten(win, `${panel}.querySelector('[role=alert]')`)
    ergebnis.schritte.falschAbgelehnt = await js(win, `${panel}.querySelector('[role=alert]').textContent.includes('stimmt nicht')`)
    ergebnis.schritte.eingabeBehalten = await js(win, `${panel}.querySelector('[data-usb-eingabe]').value === 'FALSCH-FALSCH'`)
    ergebnis.schritte.schluesselNochDa = await js(win, `${panel}.querySelector('.rn-usb-schluessel')?.textContent === window.__test.SCHLUESSEL`)

    await js(win, `${panel}.querySelector('[data-usb-eingabe]').value = window.__test.SCHLUESSEL.toLowerCase().replace(/-/g, ' '); ${panel}.querySelector('[data-usb-bestaetigen]').click()`)
    await warten(win, `${panel}.textContent.includes('eingerichtet')`)
    ergebnis.schritte.bestaetigt = await js(win, `${panel}.textContent.includes('✓ Wiederherstellungsschlüssel eingerichtet')`)
    // nur die Plugin-Bereiche prüfen (die Testseite selbst enthält den Dummy-Schlüssel im eigenen Skript)
    ergebnis.schritte.schluesselAusSeiteEntfernt = await js(win, `!['inhalt', 'kopf'].some((id) => document.getElementById(id).outerHTML.includes(window.__test.SCHLUESSEL)) && ![...document.querySelectorAll('input')].some((i) => i.value.toUpperCase().replace(/[^0-9A-Z]/g, '') === window.__test.SCHLUESSEL.replace(/-/g, '')) && !document.querySelector('iframe')`)
    ergebnis.schritte.statusZeile = await js(win, "document.querySelector('[data-status]').textContent")

    // Schritt 1.9: Sicherungsteil
    await warten(win, `${panel}.querySelector('[data-usb-plan]')?.textContent.startsWith('Probelauf')`)
    ergebnis.schritte.probelauf = await js(win, `${panel}.querySelector('[data-usb-plan]').textContent`)
    ergebnis.schritte.stickAuswahl = await js(win, `[...${panel}.querySelectorAll('[data-usb-laufwerk] option')].map((o) => o.textContent)`)
    ergebnis.schritte.knoepfeVorher = await js(win, `[${panel}.querySelector('[data-usb-sichern]').disabled, ${panel}.querySelector('[data-usb-stick-pruefen]').disabled]`)
    await js(win, `${panel}.querySelector('[data-usb-sichern]').click()`)
    await warten(win, "document.querySelector('[data-status]').textContent.includes('USB-Sicherung fertig')")
    ergebnis.schritte.sichernStatus = await js(win, "document.querySelector('[data-status]').textContent")
    await warten(win, `${panel}.querySelector('[data-usb-plan]').textContent.startsWith('Alles schon')`)
    ergebnis.schritte.knoepfeNachher = await js(win, `[${panel}.querySelector('[data-usb-sichern]').disabled, ${panel}.querySelector('[data-usb-stick-pruefen]').disabled]`)
    ergebnis.schritte.letzte = await js(win, `${panel}.querySelector('[data-usb-letzte]').textContent`)
    await js(win, `${panel}.querySelector('[data-usb-stick-pruefen]').click()`)
    await warten(win, "document.querySelector('[data-status]').textContent.includes('Stick geprüft')")
    ergebnis.schritte.pruefStatus = await js(win, "document.querySelector('[data-status]').textContent")
    await js(win, `window.__sticks.length = 0; ${panel}.querySelector('[data-usb-suchen]').click()`)
    await warten(win, `${panel}.querySelector('[data-usb-plan]').textContent.startsWith('Kein USB-Stick')`)
    ergebnis.schritte.ohneStick = await js(win, `[${panel}.querySelector('[data-usb-plan]').textContent, ${panel}.querySelector('[data-usb-sichern]').disabled]`)

    // Schritt 1.10: Archiv-Status
    ergebnis.schritte.meldung = await js(win, 'window.__test.log.find((x) => x[0] === "melden" && x[1].titel === "Belegarchiv prüfen")?.[1] || null')
    const st = "document.querySelector('[data-archivstatus]')"
    await js(win, "document.querySelector('[data-status-oeffnen]').click()")
    await warten(win, `!${st}.hidden && ${st}.querySelectorAll('.rn-st-zeile').length === 7`)
    const zeilen = () => js(win, `[...${st}.querySelectorAll('.rn-st-zeile')].map((z) => z.querySelector('.rn-st-zeichen').textContent + ' ' + z.querySelector('strong').textContent + ': ' + z.querySelector('.leise').textContent)`)
    ergebnis.schritte.statusVorher = await zeilen()
    ergebnis.layout.statusOffen = await layout(win, '[data-archivstatus]')
    ergebnis.layout.usbNebenStatus = await layout(win, '[data-usb]')
    ergebnis.schritte.statusMaskiert = await js(win, `!${st}.querySelector('b')`)
    await js(win, `${st}.querySelector('[data-st-pruefen]').click()`)
    await warten(win, "document.querySelector('[data-status]').textContent.startsWith('Archiv geprüft')")
    ergebnis.schritte.pruefStatus2 = await js(win, "document.querySelector('[data-status]').textContent")
    await warten(win, `${st}.querySelector('.rn-st-zeile .rn-st-ok')`)
    await js(win, `${st}.querySelector('[data-st-test]').click()`)
    await warten(win, "document.querySelector('[data-status]').textContent.startsWith('Kein Stick mit Vendo-Sicherung')")
    ergebnis.schritte.testOhneStick = true
    // zuerst ein fremder Stick ohne Vendo-Sicherung, dann der richtige: getestet werden darf nur der richtige
    await js(win, "window.__sticks.push({ laufwerk: 'D:', name: 'FREMD', dateisystem: 'exFAT', frei: 1e9, vendo: false }, { laufwerk: 'E:', name: 'TESTSTICK', dateisystem: 'FAT32', frei: 29e9, vendo: true })")
    await js(win, `${st}.querySelector('[data-st-test]').click()`)
    await warten(win, "document.querySelector('[data-status]').textContent.startsWith('Wiederherstellungstest bestanden')")
    ergebnis.schritte.testStatus = await js(win, "document.querySelector('[data-status]').textContent")
    await warten(win, `${st}.textContent.includes('bestanden heute')`)
    ergebnis.schritte.statusNachher = await zeilen()
    await js(win, `${st}.querySelector('[data-st-schliessen]').click()`)
    await warten(win, `${st}.hidden`)

    // Schritt 2.1: Tab „Meine Angaben“
    const ang = "document.querySelector('[data-angaben]')"
    const listeSichtbar = () => js(win, "[...document.querySelectorAll('[data-listenteil]')].map((e) => getComputedStyle(e).display !== 'none' && !e.hidden)")
    ergebnis.schritte.listeVorher = await listeSichtbar()
    await js(win, "document.querySelector('[data-tab=\"angaben\"]').click()")
    await warten(win, `!${ang}.hidden && ${ang}.querySelector('[data-ang-form]')`)
    ergebnis.schritte.angTabAktiv = await js(win, "document.querySelector('[data-tab=\"angaben\"]').getAttribute('aria-selected')")
    ergebnis.schritte.listeImAngabenTab = await listeSichtbar()
    ergebnis.schritte.angabenUnterbereiche = await js(win, `[...${ang}.querySelectorAll('[data-angaben-tab]')].map((t) => t.textContent)`)
    ergebnis.schritte.angabenVorschau = await js(win, `(() => {
      const pruefen = (id) => {
        ${ang}.querySelector('[data-angaben-tab="' + id + '"]').click()
        const panel = ${ang}.querySelector('[data-angaben-inhalt="' + id + '"]')
        return { aktiv: !panel.hidden, ausgewaehlt: ${ang}.querySelector('[data-angaben-tab="' + id + '"]').getAttribute('aria-selected'), speicherfelder: panel.querySelectorAll('[data-angabe], [data-ang-form]').length, aktiveEingaben: [...panel.querySelectorAll('input, select, textarea, button')].filter((e) => !e.disabled).length }
      }
      return { persoenlich: pruefen('persoenlich'), menue: pruefen('menue'), export: pruefen('export') }
    })()`)
    // Plan 11.3: nach dem Laden sind die Bereiche echte Formulare bzw. Funktionen
    ergebnis.schritte.angabenGeladen = await js(win, `(async () => {
      const warte = () => new Promise((r) => setTimeout(r, 150))
      const zaehlen = async (id) => { ${ang}.querySelector('[data-angaben-tab="' + id + '"]').click(); await warte(); const panel = ${ang}.querySelector('[data-angaben-inhalt="' + id + '"]'); return { eingaben: [...panel.querySelectorAll('input, select, textarea, button')].filter((e) => !e.disabled).length, text: panel.textContent.slice(0, 600) } }
      const erg = { persoenlich: await zaehlen('persoenlich'), elster: await zaehlen('elster'), menue: await zaehlen('menue'), export: await zaehlen('export') }
      ${ang}.querySelector('[data-menue-tab="steuer"]').click(); await warte()
      erg.steuerTabVersteckt = document.querySelector('[data-tab="steuer"]').hidden
      ${ang}.querySelector('[data-menue-tab="steuer"]').click(); await warte()
      erg.steuerTabWieder = !document.querySelector('[data-tab="steuer"]').hidden
      ${ang}.querySelector('[data-angaben-tab="firmendaten"]').click()
      return erg
    })()`)
    ergebnis.schritte.angabenTastatur = await js(win, `(() => {
      const tab = ${ang}.querySelector('[data-angaben-tab="export"]')
      tab.focus()
      tab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
      const aktiv = ${ang}.querySelector('[data-angaben-tab="firmendaten"]')
      return { ausgewaehlt: aktiv.getAttribute('aria-selected'), fokus: document.activeElement === aktiv }
    })()`)
    ergebnis.schritte.gruppen = await js(win, `[...${ang}.querySelector('[data-angaben-inhalt="firmendaten"]').querySelectorAll('legend')].map((l) => l.textContent)`)
    ergebnis.schritte.felderAnzahl = await js(win, `${ang}.querySelector('[data-angaben-inhalt="firmendaten"]').querySelectorAll('[data-angabe]').length`)
    ergebnis.schritte.firmendatenFelder = await js(win, `(() => {
      const feld = (name) => ${ang}.querySelector('[data-angabe="' + name + '"]')
      const optionen = (name) => [...feld(name).options].map((o) => [o.value, o.textContent])
      const panel = ${ang}.querySelector('[data-angaben-inhalt="firmendaten"]')
      return {
        taetigkeitLabel: feld('taetigkeit').parentElement.querySelector('span').textContent,
        taetigkeitMaxLength: feld('taetigkeit').maxLength,
        gruendungsdatum: [feld('gruendungsdatum').type, feld('gruendungsdatum').min],
        finanzamtLabel: feld('finanzamt').parentElement.querySelector('span').textContent,
        steuernummerLabel: feld('steuernummer').parentElement.querySelector('span').textContent,
        ustIdVorhanden: !!feld('ustId'),
        rechtsformen: optionen('rechtsform'),
        einkunftsarten: optionen('einkunftsart'),
        versteuerung: optionen('versteuerung'),
        kontenrahmen: optionen('kontenrahmen'),
        mahnwesenEnthalten: panel.textContent.includes('Mahnwesen')
      }
    })()`)
    ergebnis.schritte.fehlendText = await js(win, `${ang}.querySelector('[data-ang-fehlend]')?.textContent || ''`)
    ergebnis.layout.angaben = await layout(win, '[data-angaben]')
    await js(win, `${ang}.querySelector('[data-ang-vorschlag]').click()`)
    // Schritt 2.2: Steuerstatus je Zeitraum – Vorschlag übernehmen, Zeilen bearbeiten
    const sz = `${ang}.querySelector('[data-sz-gruppe]')`
    const szZeilen = () => js(win, `[...${sz}.querySelectorAll('[data-sz-zeile]')].map((tr) => [...tr.querySelectorAll('[data-sz]')].map((e) => e.disabled ? '(aus)' : e.value).join('|'))`)
    ergebnis.layout.steuer = await layout(win, '[data-sz-gruppe]')
    ergebnis.schritte.sz = { vorschlagText: await js(win, `${sz}.querySelector('[data-sz-vorschlagtext]')?.textContent || ''`), zeilenVorher: await szZeilen() }
    await js(win, `${sz}.querySelector('[data-sz-vorschlag]').click()`)
    ergebnis.schritte.sz.nachVorschlag = await szZeilen()
    // Leere Datumsfelder zeigen „seit Beginn“ / „offen (bis heute)“; alle Auswahlfelder gleich breit
    const leerTexte = () => js(win, `[...${sz}.querySelectorAll('.rn-sz-datum')].map((td) => { const l = td.querySelector('.rn-sz-leer'); return getComputedStyle(l).display !== 'none' ? l.textContent : '' })`)
    ergebnis.schritte.sz.leerTexte = await leerTexte()
    ergebnis.schritte.sz.artBreiten = await js(win, `[...${sz}.querySelectorAll('[data-sz="art"]')].map((s) => Math.round(s.getBoundingClientRect().width))`)
    await js(win, `(() => { const i = [...${sz}.querySelectorAll('[data-sz="bis"]')].at(-1); i.value = '2030-12-31'; i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
    ergebnis.schritte.sz.leerNachEingabe = await leerTexte()
    await js(win, `(() => { const i = [...${sz}.querySelectorAll('[data-sz="bis"]')].at(-1); i.value = ''; i.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    ergebnis.schritte.sz.leerNachLeeren = await leerTexte()
    await js(win, `(() => { const s = ${sz}.querySelectorAll('[data-sz="art"]')[2]; s.value = 'regel'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    ergebnis.schritte.sz.artRegel = (await szZeilen())[2]
    await js(win, `(() => { const s = ${sz}.querySelectorAll('[data-sz="art"]')[2]; s.value = 'klein'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    ergebnis.schritte.sz.artKlein = (await szZeilen())[2]
    await js(win, `${sz}.querySelector('[data-sz-neu]').click()`)
    ergebnis.schritte.sz.nachNeu = (await szZeilen()).length
    await js(win, `[...${sz}.querySelectorAll('[data-sz="von"]')].at(-1).value = '2030-01-01'; ${sz}.querySelectorAll('[data-sz-weg]')[1].click()`)
    ergebnis.schritte.sz.nachWeg = await szZeilen()
    await js(win, `${sz}.querySelector('[data-sz-vorschlag]').click()`) // Vorschlag erneut übernehmen setzt alle Zeilen zurück
    ergebnis.schritte.sz.nachVorschlag2 = await szZeilen()
    await js(win, `${sz}.querySelectorAll('[data-sz="satz"]')[1].value = ''`)
    ergebnis.schritte.nachVorschlag = await js(win, `({ firma: ${ang}.querySelector('[data-angabe="firmenname"]').value, namen: ${ang}.querySelector('[data-angabe="eigeneNamen"]').value, iban: ${ang}.querySelector('[data-angabe="iban"]').value })`)
    await js(win, `${ang}.querySelector('[data-angabe="iban"]').value = 'DE00 0000 0000 0000 0000 00'; ${ang}.querySelector('[data-ang-speichern]').click()`)
    await warten(win, `${ang}.querySelector('[data-angabe="iban"]')?.getAttribute('aria-invalid') === 'true'`)
    ergebnis.schritte.ibanFehler = await js(win, `({ text: ${ang}.querySelector('[data-angabe="iban"]').parentElement.querySelector('[role=alert]')?.textContent, behalten: ${ang}.querySelector('[data-angabe="firmenname"]').value, meldung: ${ang}.querySelector('[data-ang-meldung]')?.textContent })`)
    ergebnis.schritte.sz.nachFehler = { zeilen: await szZeilen(), fehler: await js(win, `${ang}.querySelector('[data-sz-fehler]')?.textContent || ''`) }
    ergebnis.schritte.einkunftsartSichtbarkeit = await js(win, `(() => {
      const feld = (name) => ${ang}.querySelector('[data-angabe="' + name + '"]')
      const set = (name, value) => { feld(name).value = value }
      const rechtsform = feld('rechtsform')
      set('gruendungsdatum', '2020-05-04')
      set('taetigkeit', 'Softwareentwicklung')
      set('finanzamt', 'Musterstadt')
      rechtsform.value = 'gmbh'
      rechtsform.dispatchEvent(new Event('change', { bubbles: true }))
      const beiGmbhVerborgen = ${ang}.querySelector('[data-angaben-feld="einkunftsart"]').hidden
      const beiGmbhGeleert = feld('einkunftsart').value === ''
      rechtsform.value = 'einzelunternehmen'
      rechtsform.dispatchEvent(new Event('change', { bubbles: true }))
      set('einkunftsart', 'gewerbe')
      set('versteuerung', 'soll')
      set('kontenrahmen', 'SKR04')
      ${sz}.querySelectorAll('[data-sz="satz"]')[1].value = '19'
      set('iban', 'DE89370400440532013000')
      return { beiGmbhVerborgen, beiGmbhGeleert, beiEinzelunternehmenSichtbar: !${ang}.querySelector('[data-angaben-feld="einkunftsart"]').hidden }
    })()`)
    await js(win, `${ang}.querySelector('[data-ang-speichern]').click()`)
    await warten(win, `${ang}.querySelector('[data-ang-vollstaendig]')`)
    ergebnis.schritte.neueFirmendaten = await js(win, `(() => {
      const feld = (name) => ${ang}.querySelector('[data-angabe="' + name + '"]')
      return {
        gruendungsdatum: feld('gruendungsdatum').value,
        taetigkeit: feld('taetigkeit').value,
        finanzamt: feld('finanzamt').value,
        rechtsform: feld('rechtsform').value,
        einkunftsart: feld('einkunftsart').value,
        versteuerung: feld('versteuerung').value,
        kontenrahmen: feld('kontenrahmen').value
      }
    })()`)
    ergebnis.schritte.sz.gespeichert = { zeilen: await szZeilen(), vorschlagKnopf: await js(win, `!!${ang}.querySelector('[data-sz-vorschlag]')`), abgleich: await js(win, `${ang}.querySelector('[data-sz-abgleich]')?.textContent || ''`), maskiert: await js(win, `!${ang}.querySelector('[data-sz-abgleich] b')`) }
    ergebnis.schritte.gespeichert = await js(win, `({ meldung: ${ang}.querySelector('[data-ang-meldung]')?.textContent, kopf: ${ang}.querySelector('.rn-usb-kopf .leise').textContent, vorschlagKnopf: !!${ang}.querySelector('[data-ang-vorschlag]'), status: document.querySelector('[data-status]').textContent })`)
    await js(win, "document.querySelector('[data-tab=\"bestellungen\"]').click()")
    await warten(win, `${ang}.hidden`)
    ergebnis.schritte.listeNachher = await listeSichtbar()
    ergebnis.schritte.angabenNachher = await js(win, `getComputedStyle(${ang}).display`)
    // Schritt 4.1: Zahlungsdatum in der Bestellkarte und in der Rechnungskarte
    const kpisLesen = () => js(win, "[...document.querySelectorAll('[data-kpis] .rn-kpi')].map((e) => [e.querySelector('.rn-kpi-titel').textContent, e.querySelector('strong').textContent.replaceAll(String.fromCharCode(160), ' ')])")
    const jahrMonatSetzen = (jahr, monat) => js(win, `(() => {
      const j = document.querySelector('[data-f-jahr]'); j.value = ${JSON.stringify(jahr)}; j.dispatchEvent(new Event('change', { bubbles: true }))
      const mo = document.querySelector('[data-f-monat]'); mo.value = ${JSON.stringify(monat)}; mo.dispatchEvent(new Event('change', { bubbles: true }))
    })()`)
    const monatsOptionen = () => js(win, "[...document.querySelector('[data-f-monat]').options].map((o) => o.textContent)")
    const monatsBalkenLesen = () => js(win, "[...document.querySelectorAll('[data-monate] [data-monat]')].map((e) => [e.dataset.monat, [...e.querySelectorAll('[data-monat-zeile]')].map((z) => [z.querySelector('.rn-monat-label').textContent, z.querySelector('b').textContent.replaceAll(String.fromCharCode(160), ' '), z.querySelector('[data-monat-balken]').style.width])])")
    const fixedText = () => js(win, "document.querySelector('[data-fix]').textContent.replaceAll(String.fromCharCode(160), ' ').trim()")
    ergebnis.schritte.zaehlweise = await js(win, `(() => {
      const feld = document.querySelector('[data-zahlungsbasis]')
      return { sichtbar: !feld.hidden, text: feld.textContent.replace(/\\s+/g, ' ').trim(), aktiv: feld.querySelector('[aria-pressed="true"]')?.dataset.zahlungsbasisButton, jahre: [...document.querySelector('[data-f-jahr]').options].map((o) => o.value) }
    })()`)
    ergebnis.schritte.zaehlweise.bestellungenKpisZahlung = await kpisLesen()
    await jahrMonatSetzen('2025', '01')
    ergebnis.schritte.zaehlweise.bestellungenZahlungsfilter = {
      treffer: await js(win, "document.querySelectorAll('[data-liste] [data-bid]').length"),
      monat: (await monatsOptionen()).find((x) => x.startsWith('Januar')),
      fix: await fixedText(),
      balken: await monatsBalkenLesen()
    }
    await jahrMonatSetzen('', '')
    await js(win, "document.querySelector('[data-zahlungsbasis-button=bestellung]').click()")
    await warten(win, "document.querySelector('[data-zahlungsbasis-button=bestellung]').getAttribute('aria-pressed') === 'true'")
    ergebnis.schritte.zaehlweise.bestelldatum = await js(win, `({ aktiv: document.querySelector('[data-zahlungsbasis-button=bestellung]').getAttribute('aria-pressed'), jahre: [...document.querySelector('[data-f-jahr]').options].map((o) => o.value) })`)
    ergebnis.schritte.zaehlweise.bestellungenKpisBestellung = await kpisLesen()
    await jahrMonatSetzen('2024', '12')
    ergebnis.schritte.zaehlweise.bestellungenBestellfilter = {
      treffer: await js(win, "document.querySelectorAll('[data-liste] [data-bid]').length"),
      monat: (await monatsOptionen()).find((x) => x.startsWith('Dezember')),
      fix: await fixedText(),
      balken: await monatsBalkenLesen()
    }
    await jahrMonatSetzen('', '')
    ergebnis.schritte.zaehlweise.bestelldatum.kartenDatum = await js(win, "document.querySelector('[data-bid=\"9001\"] .rn-titel small').textContent.split(' · ')[0]")
    await js(win, "document.querySelector('[data-zahlungsbasis-button=zahlung]').click()")
    await warten(win, "document.querySelector('[data-zahlungsbasis-button=zahlung]').getAttribute('aria-pressed') === 'true'")
    ergebnis.schritte.zaehlweise.zahlungZurueck = await js(win, "[...document.querySelector('[data-f-jahr]').options].map((o) => o.value)")
    ergebnis.schritte.zaehlweise.bestellungenKpisZahlungZurueck = await kpisLesen()
    ergebnis.schritte.zaehlweise.zahlungKartenDatum = await js(win, "document.querySelector('[data-bid=\"9001\"] .rn-titel small').textContent.split(' · ')[0]")
    await js(win, "document.querySelector('[data-bid=\"9001\"] [data-umschalten]').click()")
    await warten(win, "document.querySelector('[data-bid=\"9001\"] .rn-b-docname')")
    ergebnis.schritte.zahlung = { bestellung: await js(win, "document.querySelector('[data-bid=\"9001\"] .rn-b-docname').textContent") }
    ergebnis.schritte.zahlung.pdfKnopf = await js(win, "(() => { const b = document.querySelector('[data-bid=\"9001\"] [data-bestell-beleg]'); return b && [b.textContent, b.dataset.bestellBeleg] })()")
    await js(win, "document.querySelector('[data-bid=\"9001\"] [data-bestell-beleg]').click()")
    await warten(win, "window.__test.log.some((x) => x[0] === 'belegOeffnen' && x[1] === 's9001')")
    ergebnis.schritte.zahlung.pdfAufruf = await js(win, "window.__test.log.find((x) => x[0] === 'belegOeffnen')")
    await js(win, "document.querySelector('[data-bid=\"9001\"] [data-umschalten]').click(); document.querySelector('[data-bid=\"9002\"] [data-umschalten]').click()")
    await warten(win, "document.querySelector('[data-bid=\"9002\"] .rn-b-docname')")
    ergebnis.schritte.zahlung.pdfKnopfOhnePdf = await js(win, "!!document.querySelector('[data-bid=\"9002\"] [data-bestell-beleg]')")
    await js(win, "document.querySelector('[data-tab=\"rechnungen\"]').click()")
    await warten(win, "document.querySelector('[data-id=\"s9001\"] [data-umschalten]')")
    ergebnis.schritte.zaehlweise.rechnungenSichtbar = await js(win, "!document.querySelector('[data-zahlungsbasis]').hidden")
    ergebnis.schritte.zaehlweise.rechnungenKpisZahlung = await kpisLesen()
    await jahrMonatSetzen('2025', '01')
    ergebnis.schritte.zaehlweise.rechnungenZahlungsfilter = {
      treffer: await js(win, "document.querySelectorAll('[data-liste] [data-id]').length"),
      monat: (await monatsOptionen()).find((x) => x.startsWith('Januar')),
      kpis: await kpisLesen(),
      balken: await monatsBalkenLesen()
    }
    await jahrMonatSetzen('', '')
    await js(win, "document.querySelector('[data-zahlungsbasis-button=bestellung]').click()")
    await warten(win, "document.querySelector('[data-zahlungsbasis-button=bestellung]').getAttribute('aria-pressed') === 'true'")
    ergebnis.schritte.zaehlweise.rechnungenKpisBestellung = await kpisLesen()
    await jahrMonatSetzen('2024', '12')
    ergebnis.schritte.zaehlweise.rechnungenBestellfilter = {
      treffer: await js(win, "document.querySelectorAll('[data-liste] [data-id]').length"),
      monat: (await monatsOptionen()).find((x) => x.startsWith('Dezember')),
      kpis: await kpisLesen(),
      balken: await monatsBalkenLesen()
    }
    await jahrMonatSetzen('', '')
    await js(win, "document.querySelector('[data-zahlungsbasis-button=zahlung]').click()")
    await warten(win, "document.querySelector('[data-zahlungsbasis-button=zahlung]').getAttribute('aria-pressed') === 'true'")
    await js(win, "document.querySelector('[data-id=\"s9001\"] [data-umschalten]').click()")
    await warten(win, "document.querySelector('[data-id=\"s9001\"].rn-auf')")
    ergebnis.schritte.zahlung.karte = await js(win, "document.querySelector('[data-id=\"s9001\"]').textContent.replace(/\\s+/g, ' ')")
    await js(win, "document.querySelector('[data-tab=\"bestellungen\"]').click()")
    // Schritt 4.2: Tab „Steuer“ – Umsatz je Jahr
    const stf = "document.querySelector('[data-steuer]')"
    await js(win, "document.querySelector('[data-tab=\"steuer\"]').click()")
    await warten(win, `!${stf}.hidden && ${stf}.querySelector('table')`)
    ergebnis.layout.steuer2 = await layout(win, '[data-steuer]')
    ergebnis.schritte.steuer = {
      aktiv: await js(win, "document.querySelector('[data-tab=\"steuer\"]').getAttribute('aria-selected')"),
      liste: (await listeSichtbar()).filter(Boolean).length,
      kopf: await js(win, `[...${stf}.querySelector('table').querySelectorAll('thead th')].map((t) => t.textContent)`),
      zeilen: await js(win, `[...${stf}.querySelector('table').querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((c) => c.textContent.replaceAll(String.fromCharCode(160), ' ').trim()).join(' | '))`),
      hinweise: await js(win, `[...${stf}.querySelectorAll('.rn-info li')].map((l) => l.textContent.replaceAll(String.fromCharCode(160), ' '))`),
      andere: await js(win, "[document.querySelector('[data-angaben]').hidden, document.querySelector('[data-usb]').hidden]"),
      ampel: await js(win, `({
        stufe: ${stf}.querySelector('[data-ampel-stufe]')?.textContent,
        balken: [...${stf}.querySelectorAll('[data-balken]')].map((b) => { const s = b.querySelector('.rn-balken > span'); return [b.dataset.balken, s.style.width, s.className, b.querySelector('.rn-ampel-text span').textContent] }),
        meldungen: [...${stf}.querySelectorAll('.rn-ampel-meldungen li')].map((l) => [l.className, l.textContent]),
        maskiert: !${stf}.querySelector('.rn-ampel-meldungen b'),
        status: !!${stf}.querySelector('[data-ampel-status]'),
        breite: Math.round(${stf}.querySelector('[data-balken="laufend"] .rn-balken > span').getBoundingClientRect().width / ${stf}.querySelector('[data-balken="laufend"] .rn-balken').getBoundingClientRect().width * 100)
      })`)
    }
    // Schritt 4.4: § 13b-Bereich im Steuer-Tab
    const p13 = "document.querySelector('[data-p13b]')"
    const nbsp = (t) => `${t}.replaceAll(String.fromCharCode(160), ' ').replace(/\\s+/g, ' ').trim()`
    ergebnis.schritte.p13b = {
      monate: await js(win, `[...${p13}.querySelectorAll('[data-p13b-monate] tbody tr')].map((tr) => [tr.className, [...tr.children].map((c) => ${nbsp('c.textContent')}).join(' | ')])`),
      lieferanten: await js(win, `[...${p13}.querySelectorAll('[data-lieferant]')].map((tr) => [tr.dataset.lieferant, ${nbsp('tr.querySelector("th").textContent')}, !tr.querySelector('th b')])`),
      belege: await js(win, `[...${p13}.querySelectorAll('[data-p13b-beleg]')].map((tr) => [tr.querySelector('[data-p13b-aktiv]').checked, tr.querySelector('[data-p13b-monat]').disabled, !!tr.querySelector('[data-p13b-eur]'), ${nbsp('tr.lastElementChild.textContent')}])`)
    }
    await js(win, `${p13}.querySelector('[data-p13b-anmelden="2026-09"]').click()`)
    await warten(win, `${p13}.querySelector('[data-monat="2026-09"]').textContent.includes('✓')`)
    ergebnis.schritte.p13b.nachAnmelden = await js(win, `[${p13}.querySelector('[data-monat="2026-09"]').className, ${nbsp(`${p13}.querySelector('[data-monat="2026-09"]').lastElementChild.textContent`)}]`)
    const zeile = (id) => `${p13}.querySelector('[data-p13b-beleg="${id}"]')`
    await js(win, `(() => { const c = ${zeile('r' + 'a1'.repeat(10))}.querySelector('[data-p13b-aktiv]'); c.checked = false; c.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await js(win, `(() => { const c = ${zeile('r' + 'c3'.repeat(10))}.querySelector('[data-p13b-aktiv]'); c.checked = true; c.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await js(win, `(() => { const c = ${zeile('r' + 'c3'.repeat(10))}.querySelector('[data-p13b-eur]'); c.value = '46,10'; c.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await js(win, `(() => { const s = ${p13}.querySelector('[data-lieferant="Viva Wallet <b>X</b>"] [data-p13b-einstufung]'); s.value = 'steuerpflichtig'; s.dispatchEvent(new Event('change', { bubbles: true })) })()`)
    await warten(win, "window.__test.log.some((x) => x[0] === 'p13bAnbieter')")
    ergebnis.schritte.p13b.aufrufe = await js(win, "window.__test.log.filter((x) => ['p13bSetzen', 'p13bAnbieter', 'p13bAngemeldet'].includes(x[0]))")
    await js(win, "document.querySelector('[data-tab=\"bestellungen\"]').click()")
    await warten(win, `${stf}.hidden`)
    ergebnis.schritte.steuer.danach = (await listeSichtbar()).filter(Boolean).length
    // Schritt 2.3: gespeichert, aber ein Pflichtfeld leer → Vorschlag nur für dieses Feld
    await js(win, "window.__firmennameLeeren(); document.querySelector('[data-tab=\"angaben\"]').click()")
    await warten(win, `!${ang}.hidden && ${ang}.querySelector('[data-ang-vorschlag]')`)
    ergebnis.schritte.vorschlagNachSpeichern = { text: await js(win, `${ang}.querySelector('[data-ang-vorschlagtext]')?.textContent.trim().slice(0, 80)`), iban: await js(win, `${ang}.querySelector('[data-angabe="iban"]').value`) }
    await js(win, `${ang}.querySelector('[data-angabe="iban"]').value = 'DE02120300000000202051'; ${ang}.querySelector('[data-ang-vorschlag]').click()`)
    ergebnis.schritte.vorschlagNachSpeichern.danach = await js(win, `({ firma: ${ang}.querySelector('[data-angabe="firmenname"]').value, iban: ${ang}.querySelector('[data-angabe="iban"]').value })`)
    await js(win, "document.querySelector('[data-tab=\"bestellungen\"]').click()")
    await warten(win, `${ang}.hidden`)

    await js(win, `${panel}.querySelector('[data-usb-schliessen]').click()`)
    await warten(win, `${panel}.hidden`)
    ergebnis.schritte.geschlossen = true
    ergebnis.aufrufe = await js(win, 'window.__test.log.filter((x) => String(x[0]).startsWith("usb") || x[0] === "bestaetigen" || x[0] === "wiederherstellungTesten")')
    // Aufrufe beim Start, bevor der erste Klick (USB-Feld öffnen) etwas abfragt
    ergebnis.startAufrufe = await js(win, 'window.__test.log.slice(0, window.__test.log.findIndex((x) => x[0] === "usbSchluesselStatus")).map((x) => x[0])')
    ergebnis.ok = true
  } catch (f) {
    ergebnis.ok = false
    ergebnis.fehler = String(f && f.message || f)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
  process.stdout.write(`ERGEBNIS ${JSON.stringify(ergebnis)}\n`)
  app.exit(0)
})
