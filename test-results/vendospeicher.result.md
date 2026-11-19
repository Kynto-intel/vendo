# Testbericht: Vendo-Einstellungen in PostgreSQL (A5)

- **Datum:** 19.11.2026
- **Bereich:** `src/main/vendospeicher.js`, Migration 3 (`vendo.einstellungen`) in `src/main/datenbank.js`, Anschluss in `einstellungen.js`, `terminal.js`, `waechter.js`, `main.js`
- **Testbefehl:** `node --test tests/src/datenbank/vendospeicher.test.js`
- **Testdienst:** eigene Test-Datenbank in Docker (`docker start vendo-test-db`, Port 55432); das Schema `vendo` wird zu Beginn gelöscht
- **Fixture:** keine Dateien im Repository; erfundene Einstellungen in einem Temp-Datenordner (`VENDO_DATEN_ORDNER`)
- **Ergebnis:** PASS, 4 von 4

## Geprüft

| Test | Ergebnis |
|---|---|
| Vor der Datenbank: alte Dateien werden gelesen, Änderungen landen in der Startkopie | PASS |
| Laden: leere Datenbank bekommt alle Werte, alte Dateien werden gesichert und weggeräumt | PASS |
| Neustart: Datenbank gewinnt gegen veraltete Startkopie, eine Änderung vor dem Verbinden gewinnt gegen die Datenbank | PASS |
| Alte Datei liegt noch, obwohl die Startkopie den Wert hat: wird nach dem Laden gesichert und weggeräumt | PASS (Fehler beim echten Lauf gefunden, behoben, Test ergänzt) |

## Übernahme der echten Werte (19.11.2026)

Vendo war beendet; einmaliges Electron-Skript mit Vendos Namen und Datenordner. Einstellungen, Terminal-Befehle und
Wächter-Stand stehen in `vendo.einstellungen`; die alten Dateien liegen in `daten/datei-sicherungen/vendo-dateien-*`.
Startkopie und alte Einstellungsdatei waren vorher byte-gleich. Plugin-Daten laden im selben Lauf (6 Plugins, keine alten
Dateien übrig). **PASS**

## Nicht geprüft

- Vendo mit `npm start` (Einstellungen aus der Datenbank, Änderung in den Einstellungen landet dort): beim nächsten Start ansehen.
