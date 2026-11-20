# Vendo: Umbauplan auf PostgreSQL

**Stand:** 19. November 2026. Teil A ist in einer ersten Stufe gebaut (siehe „Umsetzung“ unter Teil A), Teil B ist vorgezogen und gebaut (siehe „Umsetzung“ unter Teil B); die Übernahme der echten Daten löst Felix in Vendo aus. Teile N und S sind offen.
**Ziel:** Vendos Daten liegen in PostgreSQL statt in JSON-Dateien unter `daten/`. Lokal läuft PostgreSQL in Docker, genauso wie später auf dem Server, damit der Umzug auf den Server nur noch ein Umziehen der Container und ein Einspielen der Sicherung ist.

Dieser Plan ersetzt den früheren, nur auf das Newsletter-Plugin bezogenen Entwurf. Der Newsletter ist darin ein eigener Abschnitt (Teil N).

## 1. Bestandsaufnahme

Gemessen am 16. November 2026. Erfasst sind nur Ablageorte und Größen, keine Inhalte.

| Bereich | Ablage heute | Größe | Zugriff |
|---|---|---|---|
| Plugin-Daten aller Plugins | `daten/plugins/<id>.json`, geschrieben von `src/main/plugins.js` | Newsletter rund 440 KB, alle anderen zusammen unter 10 KB | Oberfläche über `ctx.daten` (asynchron, über IPC); Hintergrundteile über `ctx.datenLaden`/`ctx.datenSpeichern` (synchron) |
| Newsletter-Versandprotokoll | `daten/plugins/newsletter/protokoll-JJJJ-MM.ndjson` | rund 40 KB | `protokoll.js` |
| Vendo-Einstellungen | `daten/einstellungen.json` (`src/main/einstellungen.js`) | wenige KB | Hauptprozess |
| Kleiner Vendo-Zustand | `daten/terminal-befehle.json`, `daten/waechter-stand.json` | je unter 5 KB | Hauptprozess |
| Notbremse beim Plugin-Start | `daten/plugin-start.json` | unter 1 KB | `src/main/plugins.js` |
| Datei-Suchindex | `daten/dateiindex.txt` | rund 13 MB | `src/main/dateisuche.js`, jederzeit neu erzeugbar |
| Austausch mit Hermes und den Bots | Bot-Aufträge und Entwurfsdateien des Newsletters | klein | Dateien, die Hermes und die Bots lesen und schreiben |
| Lokale, nicht versionierte Plugins | eigene Einstellungen in `daten/plugins/<id>.json`, teils eigene Archive aus Dateien | unterschiedlich | wie oben |

Was **nicht** zu Vendo gehört und nicht angefasst wird: Hermes und seine eigene Datenhaltung.

PostgreSQL auf dem jetzigen Rechner: pgAdmin ist installiert, ein Ordner `C:\Program Files\PostgreSQL\18` mit Datenordner ebenfalls, aber die Server-Programme fehlen (in `bin` liegen nur zwei DLLs), es gibt keinen Windows-Dienst, und Port 5432 ist frei. Docker Desktop ist installiert, ein PostgreSQL-Container läuft nicht.

## 2. Was in die Datenbank kommt und was Datei bleibt

**In die Datenbank:**
- die Daten **aller** Plugins (bisher `daten/plugins/<id>.json`),
- beim Newsletter zusätzlich in eigenen Tabellen: Kontakte, Kampagnen, Warteschlange, Protokoll, Rückläufer, Ergebnisse (Teil N),
- Vendos Einstellungen und der kleine Zustand (Terminal-Befehle, Wächter).

**Bleibt Datei, mit Begründung:**
- **Notbremse (`plugin-start.json`):** Sie muss greifen, wenn sonst nichts geht, also auch ohne Datenbank.
- **Datei-Suchindex:** ein Zwischenspeicher, der sich jederzeit neu erzeugen lässt; in einer Datenbank nur Ballast für die Sicherung.
- **Austauschdateien mit Hermes und den Bots:** Hermes liest und schreibt Dateien. Daran ändert der Plan nichts, Hermes wird nicht angefasst.
- **Vorlagen, Muster und Icons:** gehören zum Code, nicht zu den Daten.
- **Archive mit Aufbewahrungspflicht** (etwa Belegarchive mit Siegeln, Zeitstempeln oder Hash-Ketten): Diese Nachweise beziehen sich auf die Dateien selbst. Würden sie in eine Datenbank verschoben, wären Siegel und Prüfkette nicht mehr gültig, und die Verfahrensdokumentation müsste neu geschrieben werden. Solche Archive bleiben Dateien; in die Datenbank kommen höchstens die Einstellungen des Plugins (über Teil A) und später, falls gewünscht, ein reiner Suchindex, der aus den Dateien abgeleitet wird und nie maßgeblich ist.

## 3. Grundentscheidungen

1. **Lokal in Docker, nicht als Windows-Installation.** Dieselbe `compose.yml` läuft auf dem PC (Docker Desktop) und auf dem Server. Die halbe Windows-Installation wird nicht repariert. pgAdmin bleibt nutzbar und verbindet sich mit `localhost:5432`.
2. **Vendo selbst kommt nicht in Docker.** Vendo ist eine Desktop-App mit Fenster. In Docker laufen nur Dienste ohne Oberfläche: jetzt die Datenbank, später auf dem Server der Versandkern des Newsletters (Teil S).
3. **Ein gemeinsamer Speicher in Vendo statt Umbau in jedem Plugin.** Alle Plugins speichern schon heute über dieselben zwei Funktionen in `src/main/plugins.js`. Werden diese auf PostgreSQL umgestellt, sind **alle** Plugins auf einmal in der Datenbank, ohne dass ein einziges Plugin geändert werden muss. Die Oberflächen der Plugins merken nichts, weil sie ohnehin asynchron über IPC laden.
4. **Synchron bleiben, wo Plugins synchron lesen.** Die Hintergrundteile (`haupt.js`) lesen synchron, der Newsletter an 143 Stellen. Der gemeinsame Speicher hält die Daten deshalb im Arbeitsspeicher, lädt sie beim Start aus PostgreSQL und schreibt jede Änderung in einer Transaktion zurück. Wer sicher sein muss, dass gespeichert ist, wartet ausdrücklich darauf (`festschreiben`). Bei den gemessenen Größen ist das unproblematisch.
5. **Ein Schreiber je Datenbereich.** Heute ist das Vendos Hauptprozess, auf dem Server später für den Newsletter dessen Versanddienst. Oberflächen und Bots schreiben nie direkt in die Datenbank.
6. **Eigene Schemata.** `vendo` für den Kern und die gemeinsamen Plugin-Daten, `newsletter` für die Newsletter-Tabellen. Jedes lokale Plugin, das eigene Tabellen braucht, bekommt später ein eigenes Schema.
7. **Geheimnisse bleiben verschlüsselt.** Passwörter und Tokens liegen weiter mit Windows-DPAPI verschlüsselt vor, in der Datenbank steht nur der verschlüsselte Text. Auf dem Server ersetzen Docker-Secrets DPAPI (Teil S).
8. **Ohne Datenbank kein stilles Weiterarbeiten.** Ist PostgreSQL nicht erreichbar, startet Vendo trotzdem, zeigt den Fehler deutlich an, und Plugins laden keine veralteten Daten. Der Newsletter verschickt dann nichts. Die Notbremse funktioniert weiter.
9. **Jederzeit zurück.** Bis zum Abschluss bleiben die JSON-Dateien als Rückfall erhalten. Eine Einstellung wählt den Speicher (`json` oder `postgres`), und ein Export schreibt die Datenbank wieder als JSON-Dateien.

## 4. Was Felix vorher entscheiden muss

- **Projektregel ändern:** `AGENTS.md` und `plugins/AGENTS.md` sagen, Plugin-Daten gehören in `daten/plugins/<id>.json`. Künftig gilt: Plugin-Daten liegen im gemeinsamen Speicher (PostgreSQL), die JSON-Datei nur noch als Rückfall und Export. Die Regeln werden nur mit ausdrücklicher Zustimmung geändert.
- **Neue Abhängigkeit `pg`** (node-postgres): der übliche, reine JavaScript-Treiber ohne native Teile.
- **PostgreSQL-Version:** Vorschlag `postgres:18` als festes Image, nur an `127.0.0.1` gebunden, nie aus dem Netz erreichbar.
- **Halbe Windows-Installation:** deinstallieren (empfohlen) oder liegen lassen; sie stört nicht, solange sie nicht startet.
- **Verhalten ohne Datenbank:** Vorschlag wie in Grundentscheidung 8 (starten, Fehler zeigen, nichts Veraltetes laden, nichts versenden).

**Entschieden am 16. November 2026 (Felix):** allen fünf Punkten zugestimmt: Projektregel ändern, Abhängigkeit `pg`, `postgres:18` in Docker nur auf `127.0.0.1`, die halbe Windows-Installation deinstallieren, Verhalten ohne Datenbank wie vorgeschlagen. Die Projektregeln in `AGENTS.md` und `plugins/AGENTS.md` werden mit A4 angepasst, wenn der gemeinsame Speicher tatsächlich in Betrieb geht, damit sie nie etwas beschreiben, das noch nicht gebaut ist. Die Windows-Installation deinstalliert Felix selbst (Windows-Einstellungen → Apps).

## 5. Phasen

Jede Phase endet mit grünen Tests, einem Bericht und einem eigenen Commit. Tests für `src/` liegen unter `tests/src/<bereich>/`, Plugin-Tests unter `tests/`, jeweils mit synthetischen Daten. Eine Test-Datenbank in Docker ist ein vollständig lokaler Testdienst: getrennt von der echten Datenbank, auf eigenem Port, nur mit erfundenen Daten. Echte Dienste werden im Test nicht angesprochen.

Bis zur Übernahme in A4 arbeitet Vendo unverändert mit den JSON-Dateien weiter. Kampagnen, Automationen und alle Plugins laufen während des Umbaus normal.

### Teil A: Gemeinsame Grundlage (betrifft alle Plugins)

**A0 Entscheidungen festhalten.** Die Punkte aus Abschnitt 4 entscheiden und hier eintragen; die Projektregeln anpassen.
*Fertig, wenn* alles dokumentiert ist.

**A1 PostgreSQL in Docker.**
- `docker/vendo-db/compose.yml`: Dienst `postgres` (festes Image), Volume für die Daten, Healthcheck, Port `127.0.0.1:5432`, Neustart mit Docker.
- `docker/vendo-db/.env.example` mit Platzhaltern; die echte `.env` steht in `.gitignore`. Eine Datenbank `vendo`, ein Benutzer `vendo_app` mit Rechten nur auf die eigenen Schemata.
- Sicherung: Skript für `pg_dump` in einen ignorierten Ordner, etwa 14 tägliche Stände, Wiederherstellung einmal geprobt.
- *Fertig, wenn* `docker compose up -d` die Datenbank startet, pgAdmin sie sieht und eine Sicherung wiederhergestellt wurde.

**A2 Verbindung in Vendo.**
- In Vendos Einstellungen ein Abschnitt „Datenbank“: Server, Port, Datenbank, Benutzer, Passwort, „Verbindung prüfen“. Das Passwort wird im Hauptprozess mit `safeStorage` verschlüsselt und nie an die Oberfläche zurückgegeben.
- Ein Modul `src/main/datenbank.js` hält die Verbindung (Pool), führt Migrationen aus (`src/main/datenbank/001_start.sql` usw., festgehalten in `vendo.schema_version`) und meldet den Zustand.
- *Fertig, wenn* „Verbindung prüfen“ mit der Docker-Datenbank „verbunden“ meldet und eine falsche Angabe einen verständlichen Fehler gibt.

**A3 Gemeinsamer Speicher, zuerst noch mit JSON.**
- `src/main/speicher.js` mit zwei Umsetzungen hinter derselben Schnittstelle: JSON (heutiges Verhalten) und PostgreSQL. Schnittstelle: `laden(id)` synchron aus dem Zwischenspeicher, `speichern(id, daten)`, `festschreiben(id)` wartet, bis geschrieben ist.
- `datenLaden` und `datenSpeichern` in `src/main/plugins.js` laufen über diese Schnittstelle; `ctx` bekommt zusätzlich `ctx.festschreiben()`.
- Tabelle `vendo.plugin_daten (plugin_id, daten jsonb, geaendert_am)`. Die 5-MB-Grenze bleibt für dieses Format bestehen.
- Zuerst nur mit JSON dahinter: **kein Verhalten ändert sich**, alle bestehenden Tests bleiben grün. Dann die PostgreSQL-Seite, mit denselben Tests gegen beide Speicher.
- *Fertig, wenn* alle Plugin-Tests mit beiden Speichern grün sind und ein Ausfall der Datenbank sich wie in Grundentscheidung 8 verhält.

**A4 Übernahme der Plugin-Daten.**
- Befehl (oder Knopf in den Einstellungen) „Daten übernehmen“: liest alle `daten/plugins/*.json`, schreibt sie in einer Transaktion nach `vendo.plugin_daten`, vergleicht danach Inhalt für Inhalt und meldet Abweichungen. Erst Probelauf, dann echt.
- Vorher werden alle JSON-Dateien gesichert; sie bleiben unverändert liegen.
- Umschalten mit `speicher: postgres`. Das gilt für alle Plugins zugleich, auch für lokale, nicht versionierte, ohne dass der gemeinsame Code sie kennen muss.
- *Fertig, wenn* der Vergleich übereinstimmt und jedes Plugin dieselben Daten zeigt wie vorher.

**A5 Vendos eigene Einstellungen und kleiner Zustand.**
- `einstellungen.json`, `terminal-befehle.json` und `waechter-stand.json` nach `vendo.einstellungen (schluessel, wert jsonb)`. Wenig Nutzen, aber danach liegt alles an einem Ort und in einer Sicherung.
- Notbremse und Datei-Suchindex bleiben Dateien (Abschnitt 2).
- *Fertig, wenn* Vendo nach einem Neustart mit denselben Einstellungen läuft.

Nach Teil A liegen alle Plugin-Daten in PostgreSQL, der Newsletter noch als ein `jsonb`-Feld.

**Umsetzung, Stufe 1 (18. November 2026):**
- A1: `docker/vendo-db/compose.yml` (`postgres:18`, nur `127.0.0.1:5432`, Healthcheck). Vendo startet Docker Desktop und den Container selbst (`src/main/datenbank.js`); die Passwörter erzeugt Vendo und speichert sie nur mit `safeStorage` verschlüsselt in `daten/datenbank.json`. Für die Ersteinrichtung gehen sie als Umgebungsvariable an Docker, nie als Klartextdatei. Der App-Benutzer `vendo_app` darf nur eigene Schemata anlegen. Sicherung: `node scripts/datenbank-sicherung.js` (14 Stände, `--pruefen` spielt in eine Wegwerf-Datenbank zurück, einmal geprobt).
- A2: Verbindung, Migrationen je Bereich (`vendo.schema_version`), Zustand über `datenbank:zustand`. Eine Einstellungsseite gibt es noch nicht; sie ist ohne eingetippte Zugangsdaten auch nicht nötig.
- A3/A4 in abgewandelter Form: Die JSON-Dateien bleiben vorerst **führend**, PostgreSQL ist ein laufender **Spiegel** (`src/main/speicher.js`): jede Speicherung geht gebündelt nach `vendo.plugin_daten`, beim Verbinden gleicht Vendo alle Dateien Inhalt für Inhalt ab. Abweichung von Grundentscheidung 8: Ohne Datenbank arbeitet Vendo mit den Dateien weiter, weil diese nie älter sind als die Datenbank. Umschalten auf PostgreSQL als führende Quelle (Lesen aus der Datenbank) folgt in Teil B nach einigen Wochen ohne Abweichung.
- Plugins bekommen `ctx.datenbank` (Abfragen, Transaktionen, eigene Migrationen) und `ctx.festschreiben()`. Erstes Plugin mit eigenen Tabellen: `buchhaltung` (Schema `buchhaltung`, abgeleiteter Index aus dem Belegarchiv; Archiv bleibt Datei).
- Offen: A5 (Vendo-Einstellungen), Lesen aus der Datenbank, Anpassung der Projektregeln über Plugin-Daten (erst mit Teil B), Teil N.

### Teil N: Newsletter in eigenen Tabellen

Der Newsletter ist der einzige Bereich mit nennenswerter Menge und mit Abläufen, die von echten Tabellen profitieren (Warteschlange, Protokoll, Auswertungen). Er wechselt deshalb nach Teil A vom `jsonb`-Feld auf ein eigenes Schema `newsletter`.

Gemessen: `haupt.js` liest an 143 Stellen mit `datenLesen()` und schreibt an 85 Stellen (`feldSpeichern` 30, `ctx.datenSpeichern` 55); von 84 Funktionen für die Oberfläche sind 11 asynchron. Die Oberfläche liest teilweise direkt die Plugin-Daten.

**N1 Speicherzugriff bündeln.**
- Ein Modul `plugins/newsletter/speicher.js`, über das `datenLesen`, `feldSpeichern` und `ctx.datenSpeichern` laufen. Dahinter zunächst weiter der gemeinsame Speicher aus Teil A: kein Verhalten ändert sich.
- An den Stellen, an denen ein Absturz Folgen hätte, `await ctx.festschreiben()`: vor dem SMTP-Aufruf (`sendet`), nach `gesendet`, beim Sperren (Abmeldung, Rückläufer), beim Kampagnenstart.
- Die Oberfläche liest nicht mehr direkt die Plugin-Daten, sondern über eine Funktion `uebersichtLesen`.
- *Fertig, wenn* nur noch `speicher.js` die Daten direkt anfasst und alle Tests grün sind.

*Umsetzung N1 (20. November 2026):* gebaut im eigenen Repository `vendo-newsletter` (Pfade dort ohne `plugins/newsletter/`): `speicher.js` mit `lesen`, `speichern`, `feldSpeichern`, `festschreiben`; die Oberfläche fragt `uebersichtLesen` statt die Plugin-Daten zu laden. Festgeschrieben wird vor und nach dem SMTP-Aufruf, beim Sperren und vor dem Markieren von Abmelde- und Rückläufer-Mails. Kampagnenstart und Fortsetzen stoßen das Schreiben nur an, weil dabei noch nichts nach außen geht. Mitbehoben: Rückläufer wurden erst nach dem Markieren im Postfach gespeichert; ein Absturz dazwischen verlor die Sperren, und Änderungen während des Markierens wurden überschrieben. Tests: `tests/newsletter-speicher.test.js`.

*Umsetzung N2 und N3 (20. November 2026):* im Repository `vendo-newsletter`. Abweichend von der Tabelle oben trägt jede Listentabelle das vollständige Objekt als `jsonb` (`daten`) und daneben die Such- und Indexspalten; so geht kein Feld verloren, und neue Felder brauchen keine Migration. `einstellungen` hält alles, was keine Liste ist. Der Tabellen-Speicher (`speicher-tabellen.js`) liest beim Start alles in einen Zwischenspeicher, schreibt nur geänderte Zeilen, je Durchgang eine Transaktion, und bei Ausfall ein Journal (`daten/plugins/newsletter/tabellen-journal.json`), das beim nächsten Start vor den Tabellen gilt. Je Schema gibt es nur eine Instanz, weil Vendo den Aufbau von `haupt.js` beim Neuladen der Plugin-Liste wiederholt. `SELECT … FOR UPDATE SKIP LOCKED` ist zurückgestellt: Mit Vendo als einzigem Schreiber verteilt der Zwischenspeicher die Warteschlange; nötig wird es erst bei mehreren Versendern (Teil S). Aktiv wird der Tabellen-Speicher erst mit der Markierung `_speicher: { modus: 'tabellen' }` in den Plugin-Daten, die N4 setzt. Die bisherigen Verhaltenstests laufen gegen den Plugin-Speicher; gegen die Tabellen laufen eigene Tests für Hin- und Rückweg, Änderungen, Ausfall, Abbruch, Neustart, Protokoll und den Hintergrundteil (Versand, Sperre, Übersicht). Tests: `tests/newsletter-db.test.js`, `tests/newsletter-speicher-tabellen.test.js`; bei GitHub zusätzlich gegen PostgreSQL 18 unter Linux.

**N2 Schema und Migrationen.** SQL-Dateien `plugins/newsletter/db/001_start.sql` usw., ausgeführt über den Migrationslauf aus A2.

| Tabelle | Inhalt | Schlüssel, Indizes |
|---|---|---|
| `kontakte` | Adresse, Name, Quelle, Shopify-ID, Zustand, Zustimmung und Nachweis, Sperre mit Art und Grund, Rückläufer-Zähler | Adresse (klein) eindeutig; Index auf Sperre |
| `kampagnen` | Name, Betreff, Vorschautext, Zustand, Zeiten, UTM-Kurzname, Freigabe, Anhalte-Grund; Inhalt als `jsonb` | ID |
| `vorlagen` | Name, Inhalt als `jsonb` | ID |
| `automationen` | Art, Name, aktiv, Einstellungen, Schritte als `jsonb` | ID |
| `laeufe` | Automation, Adresse, Schritt, Zustand, Fristen, Daten als `jsonb` | ID; Schlüssel des Laufs eindeutig |
| `warteschlange` | Schlüssel, Kampagne, Adresse, Art, Zustand, Versuche, Fristen, `sendet_seit` | ID; Schlüssel eindeutig; Index auf (Zustand, fällig ab) |
| `protokoll` | Zeit, Adresse gekürzt, Betreff, Art, Kampagne, ok, Fehler | Index auf Zeit und Kampagne |
| `ruecklaeufer` | Zeit, Adresse, Art, Status, Grund, Quelle | Index auf Zeit und Adresse |
| `ergebnis_namen` | Kurzname, Ziel, seit | Kurzname |
| `ergebnis_bestellungen` | Shopify-ID, Kurzname, Betrag, Währung, Zeit | Shopify-ID |
| `einstellungen` | Schlüssel und `jsonb`: Zugang, Shopify, Marke, Drossel, Abmeldungen, Rückläufer, Bot-Stände | Schlüssel |

*Fertig, wenn* eine leere Test-Datenbank alle Migrationen durchläuft und ein zweiter Lauf nichts doppelt anlegt.

**N3 Newsletter-Speicher auf Tabellen.**
- `speicher.js` liest beim Start aus den Tabellen in den Zwischenspeicher und schreibt nur geänderte Zeilen zurück, je Änderung eine Transaktion.
- Die Warteschlange holt den nächsten Eintrag mit `SELECT … FOR UPDATE SKIP LOCKED` und setzt `sendet` in derselben Transaktion.
- Das Protokoll wird direkt in die Tabelle geschrieben statt in Monatsdateien; Auswertungen wie „gesendet je Kampagne“ und die Zustellungs-Ampel werden SQL-Abfragen.
- Dieselben Verhaltenstests laufen gegen beide Speicher; dazu Tests für Transaktionen, Abbruch mitten im Schreiben, Neustart und nicht erreichbare Datenbank.
- *Fertig, wenn* alle Newsletter-Tests mit beiden Speichern grün sind.

**N4 Übernahme in die Tabellen.** Wie A4, aber aus dem `jsonb`-Feld und den Protokolldateien in die Tabellen, mit Zählabgleich (Kontakte, Sperren, Kampagnen, Warteschlange, Protokollzeilen, Bestellungen). An einem Tag ohne laufende Kampagne.
*Fertig, wenn* die Zählung stimmt, alle Reiter dieselben Zahlen zeigen und eine Testmail durchläuft.

Danach gilt für den Newsletter die 5-MB-Grenze nicht mehr. Die Grenze von 10.000 Kontakten beim Shopify-Abgleich kann bei Bedarf fallen, braucht dann aber Seitensteuerung in der Kontaktliste (Review M4).

### Teil R: Lokale Plugins mit eigenem Archiv

Lokale, nicht versionierte Plugins sind über Teil A automatisch dabei, soweit sie `ctx.datenLaden`/`ctx.datenSpeichern` nutzen: Ihre Einstellungen landen in `vendo.plugin_daten`. Der gemeinsame Code setzt dabei kein bestimmtes lokales Plugin voraus.

Archive aus Dateien mit Aufbewahrungspflicht, Siegeln oder Zeitstempeln bleiben Dateien (Abschnitt 2). Ob ein solches Plugin zusätzlich einen Suchindex in der Datenbank bekommt, wird je Plugin entschieden; der Plan dazu liegt beim Plugin selbst und nicht in diesem öffentlichen Dokument.

Die Buchhaltung bleibt im eigenen Plugin, das seit dem 17. November 2026 `buchhaltung` heißt (vorher das lokale `rechnungen`) und seit dem 18. November im Repository liegt. Der Versuch mit „haben“ als eigener Buchhaltung ist am selben Tag eingestellt und am 19. November 2026 vollständig entfernt worden.

### Teil B: Betrieb

- Tägliche Sicherung der Datenbank läuft, eine Wiederherstellung ist einmal geprobt.
- Datei-Archive werden weiter wie bisher gesichert; die Datenbanksicherung ersetzt sie nicht.
- Nach zwei bis vier Wochen ohne Probleme: JSON-Speicher entfernen (der Export bleibt), Plugin-READMEs, Review und Projektregeln nachziehen.
- *Fertig, wenn* nur noch PostgreSQL im Einsatz ist und Sicherung und Wiederherstellung belegt sind.

**Umsetzung, Stufe 2 (19. November 2026, vorgezogen):**
- Betriebsart über `daten/speicher.json` (`modus: postgres`); fehlt sie, gilt wie bisher die Datei (Spiegel). `src/main/speicher.js` hält im Modus `postgres` alle Plugin-Daten im Arbeitsspeicher, lädt sie beim Verbinden aus `vendo.plugin_daten` und schreibt jede Änderung gebündelt in einer Transaktion zurück. Migration 2: Spalte `roh` (genauer Text, Reihenfolge der Schlüssel bleibt) und Tabelle `vendo.austausch`.
- Ohne geladene Daten wird weder gelesen noch gespeichert: Oberflächen warten (höchstens 5 Minuten), Hintergrundteile (`haupt.js`) starten erst nach dem Laden, ein Ausfall meldet einen Fehler statt eines leeren Stands. Was die Datenbank nicht annimmt, landet im Journal `daten/speicher-offen/` (auch beim Beenden) und wird beim nächsten Laden nachgeschrieben.
- Hermes/Luzzy: Das Hermes-Plugin `vendo-planer` (Profil-Skript `termin.py`, auch für Aufgaben) schrieb Kalender und Aufgaben direkt in die Dateien. Jetzt: Plugins mit `"austausch": true` bekommen `daten/austausch/<id>.json`; Vendo schreibt dort jeden Stand hin, erkennt fremde Änderungen am Prüfwert (auch beim Start) und liest sie ein. In `termin.py` wurde nur die Pfadwahl ergänzt (Sicherung daneben, `.vor-vendo-austausch.bak`): Gibt es `daten/austausch`, nimmt es die Datei dort. Hermes selbst ist unverändert.
- Übernahme in Vendo unter System → Datenbank: Probelauf (Sicherung nach `daten/datei-sicherungen/plugin-daten-<Zeit>-probelauf/`, Schreiben, Vergleich Text für Text, Bericht), danach „Übernehmen“: dasselbe, Umschalten ohne Lücke, Austauschdateien anlegen, Originale nur löschen, wenn sie gesichert und gleich sind. „Zurück zu Dateien“ schreibt alles wieder als Dateien.
- Übernahme der echten Daten am 19. November 2026 (6 Plugins, Vergleich ohne Abweichung).

**Umsetzung, Stufe 3 (19. November 2026, auf Felix' Wunsch ohne Wartezeit):**
- Der Dateibetrieb ist entfernt: `speicher.js` kennt nur noch die Datenbank. Übernahme-Knopf, Rückweg und Spiegel-Abgleich sind weg; System → Datenbank zeigt den Zustand und exportiert alle Plugin-Daten als JSON-Dateien. Taucht eine alte `daten/plugins/<id>.json` auf (zurückgespielte Sicherung) oder bringt ein neues Plugin Startdaten mit, gilt sie nur, wenn die Datenbank für das Plugin nichts hat; danach wandert sie nach `daten/datei-sicherungen/`.
- A5 gebaut: `vendo.einstellungen` (Migration 3) für Einstellungen, Terminal-Befehle und Wächter-Stand (`src/main/vendospeicher.js`). Weil Vendo Einstellungen vor Docker braucht, gibt es eine Startkopie `daten/startkopie.json`; nach dem Verbinden gilt die Datenbank, nur vorher gemachte Änderungen werden nachgeschrieben. Die alten Dateien werden einmal übernommen und gesichert.
- Offen: Teil N (Newsletter-Tabellen, eigene Sitzung, Übernahme an einem Tag ohne laufende Kampagne) und Teil S (Server).

### Teil S (später): Umzug auf den Server

- Auf dem Server dieselbe `compose.yml`, ergänzt um einen Dienst `newsletter-dienst`: Node ohne Electron, mit Takt, Warteschlange, SMTP, IMAP und Shopify. Der Newsletter-Kern ist dafür heute schon frei von Electron bis auf `tresor.js`.
- DPAPI gibt es auf dem Server nicht: Geheimnisse kommen dort aus Docker-Secrets und werden einmal neu eingegeben, nicht kopiert.
- Vendo auf dem PC wird für den Newsletter zum Steuerpult und spricht mit dem Dienst über eine kleine, abgesicherte Schnittstelle, nur über ein privates Netz (etwa WireGuard oder Tailscale). Die Datenbank ist **nie** direkt aus dem Internet erreichbar.
- Ob weitere Plugins oder Vendo-Teile auf den Server ziehen, ist eine eigene Entscheidung; die Daten liegen dann schon in derselben Datenbank.
- Datenumzug: `pg_dump` auf dem PC, `pg_restore` auf dem Server; das Schema ist dasselbe.
- Erst danach werden Öffnungs-/Klickmessung, One-Click-Abmeldung und ein Anmeldeformular möglich (Review S6), jedes als eigene Entscheidung.

## 6. Risiken und wie der Plan sie abfängt

| Risiko | Abfangen |
|---|---|
| Daten gehen bei der Übernahme verloren | Probelauf, eine Transaktion, Inhalts- bzw. Zählabgleich, JSON bleibt als Rückfall |
| Datenbank nicht erreichbar (Docker nicht gestartet) | Docker startet mit Windows; Vendo zeigt den Fehler, lädt nichts Veraltetes, der Newsletter versendet nichts; Notbremse bleibt Datei |
| Versand läuft weiter, obwohl nicht gespeichert werden kann | `sendet` wird vor dem SMTP-Aufruf festgeschrieben; ohne Datenbank kein Versand |
| Zwei Schreiber gleichzeitig | Ein Schreiber je Datenbereich |
| Großer Umbau bricht Bestehendes | A3 und N1 ändern kein Verhalten; dieselben Tests gegen beide Speicher |
| Archiv-Nachweise werden ungültig | Archive mit Siegeln oder Zeitstempeln bleiben Dateien |
| Geheimnisse in der Datenbank | Nur verschlüsselt (DPAPI), auf dem Server Docker-Secrets |
| Hermes wird beeinträchtigt | Hermes und die Austauschdateien bleiben unberührt |

## 7. Grober Umfang und Reihenfolge

| Teil | Umfang | Ergebnis |
|---|---|---|
| A0 Entscheidungen | klein | Regeln klar |
| A1 Docker | klein | Datenbank läuft, Sicherung geprobt |
| A2 Verbindung | klein bis mittel | Vendo kennt die Datenbank |
| A3 Gemeinsamer Speicher | mittel | ein Speicher für alle Plugins, mit beiden Umsetzungen getestet |
| A4 Übernahme | klein bis mittel | **alle Plugin-Daten in PostgreSQL** |
| A5 Vendo-Einstellungen | klein | alles an einem Ort |
| N1 bis N4 Newsletter-Tabellen | groß | Newsletter sauber relational, Warteschlange und Protokoll in SQL |
| R lokale Archiv-Plugins | je Plugin | Einstellungen schon über A; Archive bleiben Dateien |
| B Betrieb | klein | JSON-Rückfall entfernt |
| S Server | groß, eigener Plan | Versandkern im Container |

Die Teile laufen in dieser Reihenfolge, jeder Schritt ist für sich nützlich und einzeln rückgängig zu machen. Schon nach A4 liegt alles in PostgreSQL; Teil N macht den Newsletter danach sauber und schnell.
