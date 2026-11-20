import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

// Oberflächentest des Rechnungen-Plugins in echtem Electron (verstecktes Fenster, echte ansicht.js, Test-ctx).
// Startet tests/fixtures/buchhaltung/oberflaeche/lauf.cjs. Nur synthetische Antworten, kein Netz, keine echten Daten.

const require = createRequire(import.meta.url)
const electron = require('electron') // in Node: Pfad zur electron.exe

// ELECTRON_RUN_AS_NODE (z. B. von VS Code gesetzt) würde Electron als reines Node starten
const umgebung = { ...process.env }
delete umgebung.ELECTRON_RUN_AS_NODE

function lauf() {
  const r = spawnSync(electron, [path.resolve('tests/fixtures/buchhaltung/oberflaeche/lauf.cjs'), path.resolve('plugins/buchhaltung/ansicht.js')], { encoding: 'utf8', timeout: 90_000, windowsHide: true, env: umgebung })
  const zeile = String(r.stdout).split('\n').find((z) => z.startsWith('ERGEBNIS '))
  assert.ok(zeile, `Electron lieferte kein Ergebnis (Status ${r.status}): ${String(r.stderr).slice(0, 500)}`)
  return JSON.parse(zeile.slice(9))
}

test('USB-Einrichtung in Electron: Schlüssel anzeigen, Tippfehler abweisen, bestätigen, Schlüssel danach aus der Seite entfernt (Schritt 1.8)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const s = e.schritte
  assert.deepEqual([s.anfangVersteckt, s.knopfImWartungsmenue, s.einfuehrung], [true, 'wartung', true])
  assert.deepEqual([s.schluesselAngezeigt, s.kennungMaskiert, s.druckKnopf, s.warnungStick], [true, true, true, true])
  assert.deepEqual([s.falschAbgelehnt, s.eingabeBehalten, s.schluesselNochDa], [true, true, true])
  assert.deepEqual([s.bestaetigt, s.schluesselAusSeiteEntfernt, s.geschlossen], [true, true, true])
  assert.match(s.statusZeile, /bestätigt und verschlüsselt gespeichert/)
  const schl = e.aufrufe.filter((x) => String(x[0]).startsWith('usbSchluessel'))
  assert.deepEqual(schl.map((x) => x[0]), ['usbSchluesselStatus', 'usbSchluesselNeu', 'usbSchluesselStatus', 'usbSchluesselBestaetigen', 'usbSchluesselStatus', 'usbSchluesselBestaetigen', 'usbSchluesselStatus'])
  assert.equal(schl[5][1], 'k7qf2 abcde 12345 fghjk 67890 mnpqr', 'Eingabe wird unverändert an den Hauptprozess gegeben')
  assert.equal(e.aufrufe.filter((x) => x[0] === 'bestaetigen').length, 0, 'Schließen nach Bestätigung ohne Rückfrage')
})

test('USB-Sicherung in Electron: Probelauf, Sichern, Stick prüfen, ohne Stick gesperrt; Erinnerung beim Start abgefragt (Schritt 1.9)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const s = e.schritte
  assert.equal(s.probelauf, 'Probelauf: 1439 von 1439 Dateien (107 MB) würden verschlüsselt auf D: geschrieben. Nichts wird gelöscht.')
  assert.deepEqual(s.stickAuswahl, ['D: TESTSTICK · FAT32 · 29 GB frei'])
  assert.deepEqual(s.knoepfeVorher, [false, true], 'Prüfen erst, wenn etwas gesichert ist')
  assert.equal(s.sichernStatus, 'USB-Sicherung fertig: 1439 neu, 0 schon vorhanden, 1439 Dateien auf dem Stick geprüft ✓ · Kennung AB12-CD34. Stick jetzt auswerfen.')
  assert.deepEqual(s.knoepfeNachher, [false, false])
  assert.match(s.letzte, /^Letzte Sicherung: .* auf „TESTSTICK“$/)
  assert.ok(s.pruefStatus.startsWith('Stick geprüft: alle 1439 Dateien lesbar und unverändert ✓ (1 Sicherungsstände, neuester vom '), s.pruefStatus)
  assert.deepEqual(s.ohneStick, ['Kein USB-Stick gefunden. Bitte einstecken und „Neu suchen“ drücken.', true])
  assert.ok(e.startAufrufe.includes('usbStatus'), `Erinnerung wird beim Start abgefragt: ${e.startAufrufe}`)
  assert.deepEqual(e.aufrufe.filter((x) => x[0] === 'usbSichern'), [['usbSichern', 'D:']])
})

test('Archiv-Status und wöchentliche Prüfung in Electron: Meldung bei Fehler, Status mit Zeichen, Jetzt prüfen, Wiederherstellung testen (Schritt 1.10)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const s = e.schritte
  assert.equal(s.meldung.titel, 'Belegarchiv prüfen')
  assert.match(s.meldung.text, /^Die wöchentliche Prüfung des Belegarchivs meldet 1 Fehler, z\. B\. Datei verändert/)
  assert.match(s.meldung.anzeige, /Archiv-Status\.$/)
  assert.deepEqual(s.statusVorher.map((z) => z.split(':')[0]), ['⚠ Belegarchiv', '⚠ Zeitstempel (externer Anker)', '✓ USB-Sicherung', '⚠ Wiederherstellungstest', '⚠ Datenbank', '✓ Wiederherstellungsschlüssel', 'ⓘ Verschlüsselung auf diesem PC'])
  assert.ok(s.statusVorher[0].includes('1 Fehler, z. B. Datei verändert: 2026/umsatzbeleg/<b>x</b>.pdf'), 'Fehlertext sichtbar und maskiert')
  assert.equal(s.statusMaskiert, true)
  assert.ok(s.statusVorher[1].includes('Noch kein Siegel'))
  assert.ok(s.statusVorher[3].includes('Noch nie getestet'))
  assert.ok(s.statusVorher[4].includes('nicht verbunden (Keine Datenbank.)') && s.statusVorher[4].includes('Gegenprobe Datenbank = Archiv: noch keine'), 'Datenbank-Zeile im Wartungsbereich (Aufgabe 3)')
  assert.ok(s.statusVorher[6].includes('BitLocker'))
  assert.equal(s.pruefStatus2, 'Archiv geprüft: 1439 Einträge, alles in Ordnung ✓')
  assert.equal(s.testOhneStick, true)
  assert.match(s.testStatus, /^Wiederherstellungstest bestanden: 1439 Dateien aus dem Stand vom .* entschlüsselt und geprüft ✓ · Testordner gelöscht · Prüfbericht im Archiv\.$/)
  assert.deepEqual(s.statusNachher.map((z) => z.slice(0, 1)), ['✓', '✓', '✓', '✓', '⚠', '✓', 'ⓘ']) // Datenbank: im Testfenster keine (⚠)
  assert.ok(s.statusNachher[1].includes('2 Beleg(e) seitdem noch nicht versiegelt'))
  assert.deepEqual(e.aufrufe.filter((x) => x[0] === 'wiederherstellungTesten'), [['wiederherstellungTesten', 'E:']], 'nur der Stick mit Vendo-Sicherung')
})

test('Layout wie in der App (alle Plugin-Stylesheets, niedriges Fenster): Felder werden nicht gestaucht, versteckte Felder sind unsichtbar (Fehlerbild vom 29.10.2026)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const l = e.layout
  assert.ok(l.stile.some((d) => d.includes('kalender')), 'auch die globale Regel aus kalender/stil.css ist geladen')
  for (const [name, x] of Object.entries({ usbEinfuehrung: l.usbEinfuehrung, usbSchluessel: l.usbSchluessel, statusOffen: l.statusOffen, usbNebenStatus: l.usbNebenStatus })) {
    assert.equal(x.gestaucht, false, `${name} gestaucht: Höhe ${x.hoehe}, Inhalt ${x.inhalt}`)
    assert.ok(x.hoehe > 60, `${name} zu niedrig: ${x.hoehe}`)
  }
  assert.deepEqual([l.statusVersteckt.hidden, l.statusVersteckt.display], [true, 'none'], 'verstecktes Archiv-Status-Feld zeigt keine leere Karte')
  assert.equal(l.goldKnopf.verlauf, true, 'kleiner goldener Knopf hat goldenen Hintergrund')
  assert.ok(l.goldKnopf.kontrast >= 4.5, `Kontrast der Knopfschrift zu gering: ${l.goldKnopf.kontrast}`)
  assert.equal(l.statusZweizeilig.ueberlappt, false, `Statuszeile überlappt das USB-Feld (Höhe ${l.statusZweizeilig.hoehe})`)
  assert.ok(l.statusZweizeilig.hoehe > 20, 'zweizeiliger Status behält seine Höhe')
})

test('Tab „Meine Angaben“ in Electron: Liste ausgeblendet, Gruppen aus dem Schema, Vorschlag, Fehler am Feld, Speichern, zurück zur Liste (Schritt 2.1)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const s = e.schritte
  const sichtbar = s.listeVorher.filter(Boolean).length
  assert.ok(sichtbar >= 4, `Liste vorher sichtbar (${sichtbar})`)
  assert.equal(s.angTabAktiv, 'true')
  assert.deepEqual(s.listeImAngabenTab.filter(Boolean), [], 'im Angaben-Tab ist nichts von Liste und Filtern zu sehen')
  assert.deepEqual(s.angabenUnterbereiche, ['Firmendaten', 'Persönliche Angaben', 'ELSTER-Übersicht', 'Verfahrensdokumentation', 'Datenschutz', 'Bereiche im Menü', 'Export'])
  // Plan 11.3 (M.1/M.2/M.3/M.5): nach dem Laden echte Eingaben statt Vorschau, Menü-Schalter blendet Tabs aus
  const g = s.angabenGeladen
  assert.equal(g.persoenlich.eingaben, 4, 'drei Felder und Speichern') // Vorname, Religion, Art, Speichern
  assert.match(g.persoenlich.text, /nur verschlüsselt/)
  assert.match(g.elster.text, /Anlage G/)
  assert.match(g.elster.text, /Kz 111/)
  assert.equal(g.menue.eingaben, 3, 'nur Bestellungen, Rechnungen, Steuer schaltbar')
  assert.doesNotMatch(g.export.text, /DATEV|Ablage|Nur Vorschau/)
  assert.match(g.export.text, /Prüfwert/)
  assert.equal(g.steuerTabVersteckt, true)
  assert.equal(g.steuerTabWieder, true)
  for (const [bereich, vorschau] of Object.entries(s.angabenVorschau)) {
    assert.deepEqual(vorschau, { aktiv: true, ausgewaehlt: 'true', speicherfelder: 0, aktiveEingaben: 0 }, `${bereich} lädt seine Daten erst nach dem Öffnen (direkt beim Klick noch ohne Eingaben)`)
  }
  assert.deepEqual(s.angabenTastatur, { ausgewaehlt: 'true', fokus: true }, 'Unterbereiche lassen sich mit der Tastatur wechseln')
  assert.deepEqual(s.gruppen, ['Unternehmen', 'Anschrift', 'Steuern', 'Steuerstatus je Zeitraum', 'Bankverbindung', 'Rechnungen und Angebote', 'Belegerkennung', 'Belegarchiv'])
  assert.equal(s.felderAnzahl, 29)
  assert.deepEqual(s.firmendatenFelder, {
    taetigkeitLabel: 'Art des Betriebs (Anlage EÜR) bzw. Gegenstand des Unternehmens',
    taetigkeitMaxLength: 100,
    gruendungsdatum: ['date', '0001-01-01'],
    finanzamtLabel: 'Finanzamt',
    steuernummerLabel: 'Steuernummer (wie auf dem Bescheid)',
    ustIdVorhanden: true,
    rechtsformen: [['einzelunternehmen', 'Einzelunternehmen'], ['gmbh', 'GmbH'], ['ug', 'UG (haftungsbeschränkt)']],
    einkunftsarten: [['', 'Bitte wählen'], ['selbstaendig', 'Selbständige Arbeit (freier Beruf, z. B. Entwickler, Berater)'], ['gewerbe', 'Gewerbebetrieb']],
    versteuerung: [['ist', 'Ist (nach vereinnahmten Entgelten)'], ['soll', 'Soll (nach vereinbarten Entgelten)']],
    kontenrahmen: [['SKR03', 'SKR03'], ['SKR04', 'SKR04']],
    mahnwesenEnthalten: false
  })
  assert.deepEqual(s.einkunftsartSichtbarkeit, { beiGmbhVerborgen: true, beiGmbhGeleert: true, beiEinzelunternehmenSichtbar: true })
  assert.deepEqual(s.neueFirmendaten, {
    gruendungsdatum: '2020-05-04',
    taetigkeit: 'Softwareentwicklung',
    finanzamt: 'Musterstadt',
    rechtsform: 'einzelunternehmen',
    einkunftsart: 'gewerbe',
    versteuerung: 'soll',
    kontenrahmen: 'SKR04'
  })
  assert.match(s.fehlendText, /^Es fehlen noch Pflichtangaben: Firmen- bzw\. Shopname, .*Steuernummer oder USt-IdNr\.\/W-IdNr\., Steuerstatus je Zeitraum\. Solange erzeugt Vendo für neue Shopify-Bestellungen keine Umsatzbelege/)
  assert.deepEqual(s.nachVorschlag, { firma: 'Synthetik-Shop', namen: 'Synthetik\nMuster', iban: 'DE89370400440532013000' })
  assert.deepEqual(s.ibanFehler, { text: 'Die IBAN ist ungültig (Prüfsumme oder Länge stimmt nicht).', behalten: 'Synthetik-Shop', meldung: 'Nicht gespeichert – bitte die markierten Felder korrigieren.' })
  assert.equal(s.gespeichert.meldung, 'Gespeichert (10 Änderungen).')
  assert.match(s.gespeichert.kopf, /^zuletzt gespeichert /)
  assert.equal(s.gespeichert.vorschlagKnopf, false, 'nach dem Speichern kein Vorschlag mehr')
  assert.equal(s.gespeichert.status, 'Meine Angaben: Gespeichert (10 Änderungen).')
  assert.deepEqual(s.listeNachher, s.listeVorher, 'zurück im Bestellungen-Tab ist alles wie vorher')
  assert.equal(s.angabenNachher, 'none')
  assert.deepEqual(s.vorschlagNachSpeichern, { text: 'Für noch leere Felder hat Vendo Angaben aus der bisherigen festen Einstellung ge', iban: 'DE89370400440532013000', danach: { firma: 'Synthetik-Shop', iban: 'DE02120300000000202051' } }, 'Schritt 2.3: Vorschlag auch nach dem Speichern, nur für leere Felder – eigene Eingaben bleiben')
  assert.equal(e.layout.angaben.gestaucht, false, `Angaben-Feld gestaucht: ${e.layout.angaben.hoehe}/${e.layout.angaben.inhalt}`)
})

test('Steuerstatus je Zeitraum in Electron: Vorschlag aus den Bestellungen, Zeilen bearbeiten, Fehler am Bereich, Speichern, Abgleich maskiert (Schritt 2.2)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const s = e.schritte.sz
  assert.equal(s.vorschlagText.startsWith('Aus den Shopify-Bestellungen: 12 Bestellungen mit Umsatzsteuer vom 03.04.2024 bis 28.05.2024 (19 %, zusammen 45,60'), true, s.vorschlagText)
  assert.deepEqual(s.zeilenVorher, [], 'vor dem Übernehmen keine Zeilen')
  assert.deepEqual(s.nachVorschlag, ['|2024-04-02|klein|(aus)', '2024-04-03|2024-05-28|regel|19', '2024-05-29||klein|(aus)'])
  assert.deepEqual(s.leerTexte, ['seit Beginn', '', '', '', '', 'bis heute'], 'nur leere Datumsfelder zeigen den Text statt tt.mm.jjjj')
  assert.deepEqual(s.leerNachEingabe, ['seit Beginn', '', '', '', '', ''], 'nach Eingabe eines Datums verschwindet der Text')
  assert.deepEqual(s.leerNachLeeren, s.leerTexte, 'nach dem Leeren erscheint er wieder')
  assert.equal(new Set(s.artBreiten).size, 1, `Auswahlfelder unterschiedlich breit: ${s.artBreiten}`)
  assert.equal(s.artRegel, '2024-05-29||regel|19', 'Regelbesteuerung schaltet den Satz frei (Vorgabe 19)')
  assert.equal(s.artKlein, '2024-05-29||klein|(aus)')
  assert.equal(s.nachNeu, 4)
  assert.deepEqual(s.nachWeg, ['|2024-04-02|klein|(aus)', '2024-05-29||klein|(aus)', '2030-01-01||klein|(aus)'], 'Entfernen nimmt genau die angeklickte Zeile weg, Eingaben der anderen bleiben')
  assert.deepEqual(s.nachVorschlag2, s.nachVorschlag, 'Vorschlag erneut übernehmen ersetzt alle Zeilen')
  assert.deepEqual(s.nachFehler, { zeilen: ['|2024-04-02|klein|(aus)', '2024-04-03|2024-05-28|regel|', '2024-05-29||klein|(aus)'], fehler: 'Zeile 2: Bitte den Steuersatz in Prozent angeben, z. B. 19.' }, 'nach dem Fehler bleiben die Zeilen erhalten')
  assert.deepEqual(s.gespeichert.zeilen, s.nachVorschlag)
  assert.equal(s.gespeichert.vorschlagKnopf, false, 'nach dem Speichern kein Vorschlag mehr')
  assert.equal(s.gespeichert.abgleich, '1 Bestellung(en) mit Umsatzsteuer laut Shopify, obwohl hier Kleinunternehmer gilt: #<b>9</b> (01.08.2024)')
  assert.equal(s.gespeichert.maskiert, true)
  assert.equal(e.layout.steuer.gestaucht, false, `Steuer-Bereich gestaucht: ${e.layout.steuer.hoehe}/${e.layout.steuer.inhalt}`)
})

test('Zahlungsdatum in Electron: Bestellkarte zeigt „bezahlt“, Rechnungskarte „Bezahlt am“, Erstattung und Hinweise zu Überweisung und Jahreswechsel (Schritt 4.1)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const z = e.schritte.zahlung
  assert.deepEqual([e.schritte.zaehlweise.sichtbar, e.schritte.zaehlweise.text, e.schritte.zaehlweise.aktiv], [true, 'Zählung: nach Zahlungstag nach Bestelldatum', 'zahlung'])
  assert.ok(e.schritte.zaehlweise.jahre.includes('2025'), 'Zahlungsjahr erscheint in der Jahresauswahl')
  assert.equal(e.schritte.zaehlweise.jahre.includes('2024'), false)
  assert.deepEqual([e.schritte.zaehlweise.bestelldatum.aktiv, e.schritte.zaehlweise.bestelldatum.jahre.includes('2025'), e.schritte.zaehlweise.bestelldatum.jahre.includes('2024')], ['true', false, true], 'Jahresauswahl folgt den Jahren der Shopify-Bestellungen')
  assert.equal(e.schritte.zaehlweise.bestelldatum.kartenDatum, '31.12.2024', 'Bestellkarte zeigt das aktive Bestelldatum')
  assert.ok(e.schritte.zaehlweise.zahlungZurueck.includes('2025'))
  assert.equal(e.schritte.zaehlweise.zahlungZurueck.includes('2024'), false, 'zurück zum Zahlungsmodus zeigt wieder das Zahlungsjahr')
  assert.equal(e.schritte.zaehlweise.zahlungKartenDatum, '02.01.2025', 'Bestellkarte zeigt nach dem Zurückschalten den Zahlungstag')
  assert.equal(e.schritte.zaehlweise.rechnungenSichtbar, true, 'Umschalter bleibt auch im Rechnungen-Tab sichtbar')
  assert.deepEqual(e.schritte.zaehlweise.bestellungenKpisZahlung, [['Umsatz', '30,00 €'], ['Produktionskosten', '12,00 €'], ['Gewinn', '18,00 €'], ['Ø je Bestellung', '9,00 €']])
  assert.deepEqual(e.schritte.zaehlweise.bestellungenKpisBestellung, e.schritte.zaehlweise.bestellungenKpisZahlung, 'Gesamtkpis in Bestellungen bleiben bei allen Jahren unverändert')
  assert.deepEqual(e.schritte.zaehlweise.bestellungenKpisZahlungZurueck, e.schritte.zaehlweise.bestellungenKpisZahlung, 'Zurückschalten stellt die Zahlungs-KPIs wieder her')
  assert.deepEqual(e.schritte.zaehlweise.bestellungenZahlungsfilter, {
    treffer: 1, monat: 'Januar · 1', fix: 'Fixkosten ohne Bestellbezug (z. B. Shopify-Abo): 3,00 € → Gewinn danach: 7,00 €',
    balken: [
      ['2025-03', [['Umsatz', '12,00 €', '66.7%'], ['Kosten', '4,00 €', '22.2%'], ['Gewinn', '8,00 €', '44.4%']]],
      ['2025-01', [['Umsatz', '18,00 €', '100%'], ['Kosten', '8,00 €', '44.4%'], ['Gewinn', '10,00 €', '55.6%']]]
    ]
  })
  assert.deepEqual(e.schritte.zaehlweise.bestellungenBestellfilter, {
    treffer: 1, monat: 'Dezember · 1', fix: 'Fixkosten ohne Bestellbezug (z. B. Shopify-Abo): 3,00 € → Gewinn danach: 7,00 €',
    balken: [
      ['2024-12', [['Umsatz', '18,00 €', '100%'], ['Kosten', '8,00 €', '44.4%'], ['Gewinn', '10,00 €', '55.6%']]],
      ['2024-11', [['Umsatz', '12,00 €', '66.7%'], ['Kosten', '4,00 €', '22.2%'], ['Gewinn', '8,00 €', '44.4%']]]
    ]
  })
  assert.deepEqual(e.schritte.zaehlweise.rechnungenKpisBestellung, e.schritte.zaehlweise.rechnungenKpisZahlung, 'Gesamtkpis in Rechnungen bleiben bei allen Jahren unverändert')
  assert.deepEqual(e.schritte.zaehlweise.rechnungenZahlungsfilter, {
    treffer: 3, monat: 'Januar · 3', kpis: [['Einnahmen', '18,00 €'], ['Ausgaben', '11,00 €'], ['davon Versand', '0,00 €'], ['Gewinn', '7,00 €']],
    balken: [
      ['2025-03', [['Umsatz', '12,00 €', '66.7%'], ['Kosten', '4,00 €', '22.2%'], ['Gewinn', '8,00 €', '44.4%']]],
      ['2025-01', [['Umsatz', '18,00 €', '100%'], ['Kosten', '11,00 €', '61.1%'], ['Gewinn', '7,00 €', '38.9%']]]
    ]
  })
  assert.deepEqual(e.schritte.zaehlweise.bestellungenBestellfilter.balken, [
    ['2024-12', [['Umsatz', '18,00 €', '100%'], ['Kosten', '8,00 €', '44.4%'], ['Gewinn', '10,00 €', '55.6%']]],
    ['2024-11', [['Umsatz', '12,00 €', '66.7%'], ['Kosten', '4,00 €', '22.2%'], ['Gewinn', '8,00 €', '44.4%']]]
  ])
  assert.deepEqual(e.schritte.zaehlweise.rechnungenBestellfilter, {
    treffer: 3, monat: 'Dezember · 3', kpis: [['Einnahmen', '18,00 €'], ['Ausgaben', '11,00 €'], ['davon Versand', '0,00 €'], ['Gewinn', '7,00 €']],
    balken: [
      ['2024-12', [['Umsatz', '18,00 €', '100%'], ['Kosten', '11,00 €', '61.1%'], ['Gewinn', '7,00 €', '38.9%']]],
      ['2024-11', [['Umsatz', '12,00 €', '66.7%'], ['Kosten', '4,00 €', '22.2%'], ['Gewinn', '8,00 €', '44.4%']]]
    ]
  })
  assert.equal(z.bestellung, 'Synthetik-Shop #9001 · 31.12.2024 · bezahlt 02.01.2025')
  assert.deepEqual(z.pdfKnopf, ['Beleg-PDF öffnen', 's9001'])
  assert.deepEqual(z.pdfAufruf, ['belegOeffnen', 's9001'])
  assert.equal(z.pdfKnopfOhnePdf, false, 'ohne archivierte PDF wird kein Öffnen-Knopf angezeigt')
  for (const teil of ['Bezahlt am02.01.2025', 'Erstattet2,00 € am 10.01.2025', 'ZahlungBank Deposit · bezahlt', 'Überweisung: Als Zahlungsdatum gilt der Tag, an dem die Bestellung in Shopify als bezahlt markiert wurde.', 'Bestellt 31.12.2024, bezahlt 02.01.2025 – für Steuer und Grenzwerte zählt das Zahlungsjahr.']) {
    assert.ok(z.karte.includes(teil), `fehlt: ${teil}\n${z.karte}`)
  }
  assert.equal(z.karte.includes('Zahlungsdatum noch unbekannt'), false)
})

test('Tab „Steuer“ in Electron: Umsatz je Jahr als Tabelle, Hinweise zu USt/geschätzt/sonstige, Liste ausgeblendet, zurück zur Liste (Schritt 4.2)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const s = e.schritte.steuer
  assert.deepEqual([s.aktiv, s.liste, s.andere[0]], ['true', 0, true], 'Liste und „Meine Angaben“ sind verborgen (das USB-Feld steht im Testablauf hier noch offen)')
  assert.deepEqual(s.kopf, ['Jahr', 'Umsatz', 'Erstattungen', 'USt (Regelbest.)', 'Bestellungen', 'nach Bestelldatum'])
  assert.deepEqual(s.zeilen, ['2024 | 15.000,00 € | −200,00 € | 400,00 € | 150 | 15.000,00 €', '2023 | 3.000,00 € | – | – | 40 | 2.980,00 €'])
  assert.deepEqual(s.hinweise, [
    '2024: In der Regelbesteuerung zählt nur der Nettobetrag; die enthaltene Umsatzsteuer (400,00 €) steht getrennt.',
    '2023: Bei 2 Bestellung(en) ist das Zahlungsdatum noch unbekannt – dort zählt vorläufig das Bestelldatum. „Synchronisieren“ holt es nach.',
    '2023: 1 weitere Einnahme(n) aus eingelesenen Belegen zählen nach Rechnungsdatum.'
  ])
  assert.ok(s.danach >= 4, 'Liste wieder sichtbar')
  assert.equal(e.layout.steuer2.gestaucht, false, `Steuer-Bereich gestaucht: ${e.layout.steuer2.hoehe}/${e.layout.steuer2.inhalt}`)
})

test('Kleinunternehmer-Ampel in Electron: Stufe, vier Balken mit Breite und Farbe, Meldungen maskiert, Warnung zum Steuerstatus (Schritt 4.3)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const a = e.schritte.steuer.ampel
  assert.equal(a.stufe, 'Umstellung vorbereiten')
  assert.deepEqual(a.balken, [
    ['laufend', '26%', 'rn-balken-gruen', 'Umsatz 2026 bis heute'],
    ['folgejahr', '100%', 'rn-balken-orange', 'Umsatz 2026 für die Grenze ab 2027'],
    ['vorjahr', '14.2%', 'rn-balken-gruen', 'Umsatz 2025 (Vorjahr)'],
    ['eu', '80%', 'rn-balken-gelb', 'Lieferungen in andere EU-Länder 2026 (AT, NL)']
  ])
  assert.deepEqual(a.meldungen, [['rn-meldung-orange', 'Umsatz 2026 über 25.000 €: Ab 01.01.2027 gilt die Regelbesteuerung – Umstellung vorbereiten.'], ['rn-meldung-gelb', 'EU-Fernverkäufe 2026 <b>8.000,00 €</b> – nahe an 10.000 €.']])
  assert.deepEqual([a.maskiert, a.status, a.breite], [true, true, 26], 'Text bleibt Text, Steuerstatus-Warnung sichtbar, Balken wirklich 26 % breit')
})

test('§ 13b in Electron: Monate mit Kennzahlen und Fälligkeit, überfällig, anmelden, Einstufung, Beleg-Kennzeichen und Euro-Betrag (Schritt 4.4)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const p = e.schritte.p13b
  assert.deepEqual(p.monate, [
    ['rn-meldung-rot', '09.2026 | 2 (1 steuerfrei) | 100,00 € | 19,00 € | – | – | 12.10.2026 · überfällig | als angemeldet markieren'],
    ['', '08.2026 | 1 | – | – | 50,00 € | 9,50 € | 10.09.2026 | ✓ 08.09.2026 ✕'],
    ['', '1 Beleg(e) in Fremdwährung: bitte unten den Euro-Betrag eintragen.']
  ])
  assert.deepEqual(p.lieferanten, [
    ['Meta Platforms Ireland Limited', 'Meta Platforms Ireland Limited', true],
    ['Viva Wallet <b>X</b>', 'Viva Wallet <b>X</b> vermutlich steuerfrei – prüfen', true]
  ], 'Lieferantenname bleibt Text')
  assert.deepEqual(p.belege, [[true, false, false, '19,00 €'], [true, false, false, 'steuerfrei'], [false, true, true, '–']], 'Häkchen, Monat nur bei § 13b, Euro-Feld nur bei Fremdwährung')
  assert.deepEqual(p.nachAnmelden, ['', '✓ 29.10.2026 ✕'], 'nach dem Markieren nicht mehr überfällig, Datum = heute')
  assert.deepEqual(p.aufrufe, [
    ['p13bAngemeldet', '2026-09', '2026-10-29'],
    ['p13bSetzen', 'r' + 'a1'.repeat(10), { aktiv: false, monat: null, betragEur: null }],
    ['p13bSetzen', 'r' + 'c3'.repeat(10), { aktiv: true, monat: null, betragEur: null }],
    ['p13bSetzen', 'r' + 'c3'.repeat(10), { aktiv: null, monat: null, betragEur: '46,10' }],
    ['p13bAnbieter', 'Viva Wallet <b>X</b>', { einstufung: 'steuerpflichtig', herkunft: null }]
  ], 'erkannt + abgewählt = aus; nicht erkannt + angehakt = an; Rest automatisch')
})

test('Dashboard „Übersicht“ in Electron: Start-Tab, Aufgaben mit Stufe und Sprungziel, Erledigt/Rückgängig, EÜR-Tabelle, Benachrichtigung (Schritt 4.5)', () => {
  const e = lauf()
  assert.equal(e.ok, true, e.fehler)
  const d = e.schritte.dashboard
  assert.deepEqual(d.tab, [['uebersicht', 'true'], ['bestellungen', 'false'], ['rechnungen', 'false'], ['angaben', 'false'], ['steuer', 'false']], 'Übersicht ist der erste und aktive Tab')
  assert.equal(d.liste, 0, 'Liste und Filter im Dashboard ausgeblendet')
  assert.deepEqual(d.aufgaben, [
    ['p13b-2026-09', 'rn-aufgabe rn-aufgabe-rot', '§ 13b-Voranmeldung 09.2026 · bis 12.10.2026 Überfällig seit 12.10.2026 – <b>19,00</b> € Steuer.', ['Öffnen']],
    ['angaben', 'rn-aufgabe rn-aufgabe-gelb', 'Pflichtangaben fehlen Ohne Pflichtangaben erzeugt Vendo keine neuen Umsatzbelege.', ['Öffnen']],
    ['usb', 'rn-aufgabe rn-aufgabe-gelb', 'USB-Sicherung fällig Letzte Sicherung vor 9 Tagen.', ['Öffnen']],
    ['euer-2025', 'rn-aufgabe rn-aufgabe-info', 'Steuererklärung 2025 mit Anlage EÜR · bis 31.07.2026 Abgabe ohne Steuerberater bis 31.07.2026.', ['Erledigt']]
  ])
  assert.equal(d.maskiert, true, 'Aufgabentext bleibt Text')
  assert.deepEqual(d.euerKopf, ['Jahr', 'Kz 111', 'Kz 112', 'Kz 140', 'Kz 100', 'übrige', 'Kz 186', 'Gewinn'])
  assert.deepEqual(d.euer, ['2026 | 1.500,00 € | – | – | 900,00 € | – | 20,00 € | 580,00 €', '2024 | 12.000,00 € | 2.500,00 € | 400,00 € | 7.500,00 € | 500,00 € | – | -100,00 €'])
  assert.equal(d.minus, 'rn-minus')
  assert.equal(d.nachErledigt, 'Erledigt: Steuererklärung 2025 am 29.10.2026 ↺')
  assert.deepEqual(d.aufrufe, [['aufgabeErledigt', 'euer-2025', '2026-10-29'], ['aufgabeErledigt', 'euer-2025', null]])
  assert.deepEqual(d.nachZiel, ['true', true], '„Öffnen“ springt in den Steuer-Tab')
  assert.equal(d.meldung?.titel, 'Rechnungen: dringende Aufgaben')
  assert.match(d.meldung.anzeige, /Details: Rechnungen → Übersicht\.$/)
  assert.equal(d.layout.gestaucht, false, `Dashboard gestaucht: ${d.layout.hoehe}/${d.layout.inhalt}`)
})
