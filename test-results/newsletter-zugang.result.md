# Newsletter-Plugin: Zugang zum Postfach

**Datum:** 2026-11-09
**Gegenstand:** Phase 1, erster Teil — Zugangsdaten für das IONOS-Postfach eintragen,
verschlüsselt ablegen, lesen, löschen und die Anmeldung prüfen. Geprüft wird die Logik in
`plugins/newsletter/haupt.js` ohne Electron und ohne SMTP-Verbindung.

**Testbefehl:**

```
node --test tests/newsletter-zugang.test.js
```

**Fixture:** keine Datei. Der Test baut sich die Umgebung selbst: einen `safeStorage`-Ersatz
mit sichtbarer „Verschlüsselung" und einen Fake-`ctx` mit `datenLaden`, `datenSpeichern` und
`bereitstellen`, wie Vendo ihn an `haupt.js` übergibt. Nur erfundene Adressen
(`beispiel.de`), keine echten Kunden- oder Zugangsdaten.

**Ergebnis: PASS — 19 von 19 Tests**

Abgedeckt:

- **Eingabeprüfung:** vollständige Eingabe wird angenommen, Adresse getrimmt und
  kleingeschrieben, fehlender Server füllt sich mit `smtp.ionos.de`; fehlende und unsinnige
  Adressen, unerlaubte Ports (nur 465 und 587) und unsinnige Servernamen werden abgelehnt;
  der Absendername ist auf 80 Zeichen begrenzt.
- **Header-Einschmuggeln:** Zeilenumbrüche im Absendernamen und in der Antwortadresse werden
  abgelehnt. Ohne das ließe sich über `Versand\r\nBcc: fremd@…` ein eigener Mail-Header
  einschleusen.
- **Tresor:** Verschlüsseln und Entschlüsseln verlustfrei, der abgelegte Wert enthält den
  Klartext nicht; ohne verfügbare Verschlüsselung gibt er `null` zurück statt Klartext;
  kaputte Werte werfen nicht, sondern ergeben `null`.
- **Speichern:** ohne verfügbare Verschlüsselung wird ein Passwort **nicht** gespeichert und
  der Klartext steht nachweislich nirgends in den Daten; eine Eingabe ohne Passwort wird
  angenommen und meldet `passwortGesetzt: false`; Prüffehler lassen den alten Zugang
  unverändert stehen; ein leeres Passwortfeld behält das vorhandene Passwort.
- **Lesen:** `zugangLesen` gibt weder das Passwort noch den verschlüsselten Wert heraus.
- **Löschen:** räumt nur den Zugang weg, Kontakte bleiben stehen.
- **Prüfen ohne Daten:** `zugangTesten` antwortet mit einem Hinweis statt einem Fehler.
- **Log:** die vollständige Adresse steht nie im Log, nur gekürzt (`f***@beispiel.de`).
- **Fehlertexte:** `EAUTH`, `ENOTFOUND`, `ETIMEDOUT` und eine 5xx-Antwort ergeben
  verständliche Sätze.

**Beobachtung**

Im ersten Durchlauf fiel ein Test um (18 von 19): „das Log enthält nie die ganze Adresse"
meldete, es sei gar nichts geloggt worden. Ursache lag im Test, nicht im Plugin — die
Umleitung von `console.log` endete schon nach dem Aufbau des Plugins, der Log-Aufruf passiert
aber erst beim Speichern. Die Umleitung umfasst jetzt jeden Aufruf. Danach 19 von 19.

**Zusätzliche Prüfung: Aufbau des Plugins**

```
node -e "const path=require('path');const w=require('./plugins/werkstatt/haupt.js');const e=w.pruefen('newsletter',{ordnerBasis:path.join(process.cwd(),'plugins')});console.log(JSON.stringify(e,null,2))"
```

Ergebnis: keine Fehler. Gemeldete Rechte, alle erwartbar und gewollt:

- `achtung` — Hintergrundteil (`haupt.js`) läuft mit vollen Rechten auf dem PC.
- `achtung` — nutzt Electron direkt: das ist `safeStorage` für das verschlüsselte Passwort.
- `gefahr` — „Berührt Zugangsdaten oder Hermes-Einstellungen": trifft auf das Wort
  „Passwort" zu. Das Plugin liest keine Hermes-Datei und keine `.env`.

`internet`: leer — es sind keine fest verdrahteten Adressen im Code.

## Nachtrag 2026-11-09: Testadresse

Gemeldet, dass Testmails nicht mehr an das Postfach gehen sollen, sondern an eine private
Adresse — und dass sich das nicht einstellen ließ. Zutreffend: nur die freie Testmail hatte
ein Empfängerfeld (und vergaß die Eingabe beim nächsten Neuzeichnen), während Beispielmail,
Kampagnen-Testmail und Automations-Testmail fest an `zugang.benutzer` gingen.

Neu: `zugang.testAdresse`, geprüft in `zugangPruefen` wie die übrigen Adressen (Form, kein
Zeilenumbruch, getrimmt und kleingeschrieben). Leer heißt weiterhin „an das Postfach".

**Nachgebessert nach Rückmeldung:** Zuerst lag das Feld oben im Zugangsformular, getrennt von
dem „An"-Feld, in das man die Adresse ohnehin tippt — zwei Stellen für dieselbe Sache. Jetzt
merkt sich das **„An"-Feld der Testmail** die Adresse selbst (`testAdresseMerken`, aufgerufen
beim Absenden, also auch bei einem fehlgeschlagenen Versand). Das eigene Postfach oder ein
leeres Feld setzen zurück. Weil das Zugangsformular das Feld nicht mehr mitschickt, behält
`zugangSpeichern` die gemerkte Adresse, statt sie auf leer zu setzen — sonst hätte ein
Speichern der Zugangsdaten sie stillschweigend gelöscht.
`zugangLesen` gibt zusätzlich `testAdresseWirksam` zurück, damit die Oberfläche zeigen kann,
wohin es tatsächlich geht. Alle vier Testwege gehen über `testAdresseVon(daten)`, auch die
Beispielkontakte in den Vorschauen. Die Rückfrage „das ist nicht dein eigenes Postfach"
kommt nur noch, wenn die Adresse weder Postfach noch Testadresse ist.

Neue Tests (10): Testadresse wird angenommen und geputzt, leer ist erlaubt, unsinnige Adresse
und Zeilenumbruch werden abgelehnt, `testAdresseWirksam` fällt ohne eigene Adresse auf das
Postfach zurück, die Testadresse übersteht ein Speichern ohne neues Passwort, das
Zugangsformular löscht sie nicht, `testAdresseMerken` übernimmt aus dem „An"-Feld, das
Postfach selbst und ein leeres Feld setzen zurück, und eine unsinnige Adresse wird abgelehnt,
ohne die gespeicherte zu verlieren.

Stand: 29 Tests in dieser Datei, **195 im Plugin**.

**Nicht geprüft (BLOCKED in dieser Umgebung)**

- **Echte Anmeldung am Postfach.** `zugangTesten` baut eine SMTP-Verbindung zu IONOS auf;
  das braucht gültige Zugangsdaten und geht nur in der laufenden App. Der Weg dorthin ist
  getestet, der Verbindungsaufbau selbst nicht.
- **Verschlüsselung durch Windows.** `safeStorage` gibt es nur im Electron-Hauptprozess. Im
  Test läuft ein Ersatz; dass DPAPI auf diesem Rechner funktioniert, muss die App zeigen.
- **Die Oberfläche.** Das Formular, die Reiter und die Rückmeldungen wurden in Vendo noch
  nicht geöffnet.

## Nachtrag 2026-11-11: Name in Testmails, Feld-Markierungen raus

**Anlass:** In Testmails stand „Hey Vorname“, weil sich für Testmails kein Name eintragen
ließ. So war nicht zu sehen, ob `{{vorname}}` bei echten Kunden funktioniert. Außerdem standen
die Feld-Markierungen aus Vorlagen (`data-feld`, `data-feld-hinweis` mit dem Hinweistext für
die KI) im HTML der verschickten Mail.

**Geändert:** `zugang.js` prüft `testVorname` und `testNachname` (höchstens 60 Zeichen,
einzeilig, keine `{ } < >`). `haupt.js` hat `testNameMerken`, `zugangLesen` nennt den Namen,
`zugangSpeichern` lässt ihn stehen, und alle Testmails und Vorschauen ohne echten Empfänger
nutzen ihn (`testKontakt`), auch die Testmail zur Freigabe. Ohne Namen bleibt es bei
„Vorname“, damit eine fehlende Ersetzung sichtbar ist. `html-mail.js` entfernt in
`mailAusHtml` beide Attribute aus jeder Mail; im Editor und in der Vorlage bleiben sie.
Neuer Block „Name in Testmails“ im Reiter „Zugang“.

**Testbefehl:**

```
node --test tests/newsletter-zugang.test.js tests/newsletter-html.test.js
```

Dazu der Regressionslauf über alle dreizehn Newsletter-Testdateien (Befehl wie in
`test-results/newsletter-bots.result.md`).

**Fixture:** keine Datei; erfundene Daten im Speicher (`info@beispiel.de`, „Erika Muster“).

**Ergebnis: PASS — 32 von 32 (Zugang) und 36 von 36 (HTML), 306 von 306 im
Regressionslauf.** Neu: Namensprüfung, Merken und Stehenbleiben beim Speichern,
Vorschau mit „Hey Erika,“ statt „Hey Vorname,“ und ohne Markierungen, `mailAusHtml` ohne
`data-feld`-Attribute (Text mit dem Wort „data-feld“ bleibt Text).

**In der echten App** (Testmodus, nur lesend, Bildschirmfoto im Scratchpad): der Block
„Name in Testmails“ erscheint im Reiter „Zugang“ über der Testmail, mit Vorname, Nachname
und „Namen merken“; keine Fehler in der Konsole. Ein Name wurde dabei nicht gespeichert.

**Nicht geprüft:** eine echte Testmail mit eingetragenem Namen. Das macht Felix selbst.
