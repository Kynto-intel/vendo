# Testbericht: Datenbank und Spiegel der Plugin-Daten

- **Datum:** 18.11.2026
- **Bereich:** `src/main/datenbank.js`, `src/main/speicher.js`, Anschluss in `src/main/plugins.js` und `src/main/main.js` (PostgreSQL-Plan Teil A, Stufe 1)
- **Testbefehl:** `node --test tests/src/datenbank/datenbank-speicher.test.js`
- **Testdienst:** eigene, leere Test-Datenbank in Docker, getrennt von der echten:
  `docker run -d --name vendo-test-db -e POSTGRES_PASSWORD=nurtest -e POSTGRES_DB=vendo_test -p 127.0.0.1:55432:5432 postgres:18`
- **Fixture:** keine Dateien; erfundene Plugin-Daten, die im Test in einem Temp-Ordner entstehen
- **Ergebnis:** PASS, 7 von 7

## Geprüft

| Test | Ergebnis |
|---|---|
| Start verbindet, legt `vendo.plugin_daten` an, ruft `beiBereit` auf | PASS |
| Migrationen laufen je Bereich genau einmal | PASS |
| Fehlerhafte Migration wird vollständig zurückgerollt (kein halbes Schema, keine Versionszeile) | PASS |
| Spiegel schreibt; genau derselbe Text wird nicht erneut geschrieben; seit 19.11.2026 (Migration 2, Spalte `roh`) wird anderer Text mit gleichem Inhalt genau übernommen | PASS |
| Abgleich übernimmt alle gültigen JSON-Dateien, überspringt kaputte und falsch benannte, schreibt eine an der Datei vorbei geänderte Zeile zurück | PASS |
| Ohne Datenbank bleiben Stände offen und werden nach dem Wiederverbinden geschrieben | PASS |
| `fuerPlugin` gibt nur Zustand, Abfragen, Transaktionen, eigene Migrationen weiter | PASS |

## Gesamtlauf

`node --test $(ls tests/*.test.js) tests/src/datenbank/datenbank-speicher.test.js`: 818 von 818 bestanden. Zuvor waren
22 Tests in `tests/buchhaltung-main.test.js` und `tests/buchhaltung-eingang.test.js` rot, weil deren Test-Gerüst das neue
Modul `datenbank-index` nicht kannte; es wurde dort eingetragen.

## In der App geprüft

`npm start` am 18.11.2026: Vendo startete den Container `vendo-db-postgres-1` selbst (healthy, nur `127.0.0.1:5432`),
legte den App-Benutzer `vendo_app` ohne Verwalterrechte an und spiegelte die Daten aller 6 Plugins nach
`vendo.plugin_daten`. Keine Fehlermeldung im Startprotokoll. `node scripts/datenbank-sicherung.js --pruefen`: Sicherung
angelegt und in eine Wegwerf-Datenbank zurückgespielt (7 Tabellen), danach gelöscht.

## Nicht geprüft

- Start ohne laufendes Docker Desktop (Docker lief schon): der Weg „Docker Desktop starten und bis 3 Minuten warten“ ist
  ungetestet.
- `safeStorage` nur in der echten App, nicht im automatischen Test (Tests verbinden über `VENDO_DB_URL`).

## Nachtrag 19.11.2026

Test „Spiegel“ angepasst: Die Datenbank hält jetzt zusätzlich den genauen Text (`roh`), damit sie Original sein kann. Ein
Stand mit anderer Schlüsselreihenfolge wird deshalb geschrieben (1 statt 0); derselbe Text weiterhin nicht. Erneuter Lauf:
`node --test tests/src/datenbank/datenbank-speicher.test.js`: PASS, 7 von 7. Siehe auch `datenbank-speicher-original.result.md`.
