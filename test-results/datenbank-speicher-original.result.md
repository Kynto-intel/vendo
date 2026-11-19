# Testbericht: PostgreSQL als Original der Plugin-Daten

- **Datum:** 19.11.2026 (Stufe 3: Dateibetrieb entfernt)
- **Bereich:** `src/main/speicher.js` (nur Datenbank: Laden, alte Dateien und Startdaten, Austausch, Journal, Export), Anschluss in `src/main/plugins.js` und `src/main/main.js`
- **Testbefehl:** `node --test tests/src/datenbank/speicher-original.test.js`
- **Testdienst:** eigene Test-Datenbank in Docker (`docker start vendo-test-db`, Port 55432); das Schema `vendo` wird zu Beginn gelöscht
- **Fixture:** keine Dateien im Repository; erfundene Plugin-Daten in einem Temp-Datenordner (`VENDO_DATEN_ORDNER`)
- **Ergebnis:** PASS, 8 von 8

## Geprüft

| Test | Ergebnis |
|---|---|
| Vor dem Laden weder lesen noch speichern, die Datenbank behält ihre Daten | PASS |
| Laden: alte Datei und Startdaten nur ohne Datenbankzeile; übernommene Datei gesichert und weggeräumt, andere bleiben liegen und werden gemeldet | PASS |
| Speichern geht in Datenbank und Austauschdatei, Beobachter einmal benachrichtigt, eigene Änderung nicht als fremde eingelesen | PASS |
| Fremde Änderung der Austauschdatei wird eingelesen und gemeldet, ungültiges JSON nicht | PASS |
| Neustart: Eingang von Luzzy, während Vendo zu war, wird übernommen | PASS |
| Datenbankausfall: Journal, nach Neustart nachgeschrieben, aufgeräumt | PASS |
| `warten`: ohne Datenbank Fehler nach Frist, löst auf, sobald geladen | PASS |
| Export aller Plugin-Daten als JSON-Dateien, Text wie in der Datenbank | PASS |

Frühere Fassung (Übernahme mit Probelauf, Rückweg in Dateien, 9 Tests) ist mit dem Dateibetrieb entfallen.

## Zusätzlich geprüft (von Hand)

- Luzzys Hilfsprogramm `termin.py` (Hermes-Profil, nur Pfadwahl ergänzt, Sicherung daneben): Mit Ordner `daten/austausch`
  wählt es `daten/austausch/kalender.json`, ohne ihn wie bisher `daten/plugins/kalender.json`. Ein Probe-Eintrag in einer
  Temp-Datei (`VENDO_KALENDER`) schreibt gültiges JSON. Nur in einem Temp-Ordner, nicht an echten Daten.

## Übernahme der echten Daten (19.11.2026)

Vendo war beendet. Ein einmaliges Electron-Skript mit Vendos Namen und Datenordner (damit der Windows-Speicher das
Datenbank-Passwort entschlüsselt) rief `speicher.uebernehmen` auf; die Plugins mit `"austausch": true` waren angemeldet.

- Probelauf: 6 Dateien gesichert, geschrieben, verglichen, keine Abweichung, nichts umgeschaltet. **PASS**
- Echt: 6 Dateien gesichert, keine Abweichung, umgeschaltet, alle 6 Originale gelöscht, keine behalten. **PASS**
- Gegenprobe von Hand: SHA-256 des Textes in `vendo.plugin_daten.roh` = SHA-256 der Sicherung, für alle 6 Plugins. **PASS**
- `daten/austausch/` enthält Aufgaben (= Sicherung) und Kalender (leer); Luzzys `termin.py liste` und `aufgabe.py` lesen
  dort (nur lesend geprüft). **PASS**
- In `daten/plugins/` bleibt nur der Ordner des Newsletter-Versandprotokolls (Plan Teil N).

## Nicht geprüft

- Vendo mit `npm start` im Modus `postgres` (Plugins laden aus der Datenbank, Kalender reagiert auf Luzzy): steht aus, beim
  nächsten Start in der App ansehen.
