# Testbericht: Plugin-Lader mit Datenbank-Speicher

- **Datum:** 19.11.2026
- **Bereich:** `src/main/plugins.js` (`alleLaden`, `datenLaden`, `datenSpeichern`, Notbremse-Datei)
- **Testbefehl:** `node --test tests/src/plugins/plugins-laden.test.js`
- **Fixture:** keine; Datenordner und Notbremse-Datei in einem Temp-Ordner (`VENDO_DATEN_ORDNER`), keine Datenbank
- **Ergebnis:** PASS, 2 von 2

## Anlass

Nach dem Entfernen des Dateibetriebs brach Vendo beim Start mit „Cannot access 'start' before initialization“ in
`alleLaden` ab (neue Variable `start` für die Startdaten überdeckte die Notbremse-Variable); keine Plugins wurden geladen.
Behoben (Variable `startDatei`). Kein Test hatte `alleLaden` aufgerufen; das deckt dieser Test jetzt ab.

## Geprüft

| Test | Ergebnis |
|---|---|
| `alleLaden` listet die versionierten Plugins, Notbremse-Datei liegt im Datenordner, Austausch für Kalender und Aufgaben angemeldet | PASS |
| Vor dem Laden der Daten: Lesen und Speichern abgelehnt, unbekanntes Plugin abgelehnt | PASS |

## Nicht geprüft

- Start der App mit `npm start`: macht Felix.
