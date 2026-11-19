# Newsletter-Plugin: Versandzustand der Warteschlange

**Datum:** 2026-11-16
**Plugin:** `newsletter`
**Gegenstand:** `plugins/newsletter/warteschlange.js` (`versandBeginnen`,
`versandZuruecknehmen`, `haengendeMarkieren`, `stand`, `aufraeumen`) und der Versandschritt
in `plugins/newsletter/haupt.js` (`schritt`, über `warteschlangeSchritt` aufrufbar), dazu
`kampagnenPflegen`. Anlass: Review-Befund S2 in `docs/newsletter-review.md`. Ein Eintrag
wurde erst nach der Rückkehr von `sendMail` als gesendet gespeichert; ein Absturz dazwischen
ließ ihn nach dem Neustart erneut rausgehen.

**Testbefehl:**

```
node --test tests/newsletter-versandzustand.test.js
```

**Fixture:** keine Datei. Adressen unter `beispiel.invalid`, ein erfundenes Testpasswort.
`nodemailer` und Electrons `safeStorage` werden vor dem Laden von `haupt.js` durch Ersatzteile
im Modul-Cache vertreten; der Ersatz für `sendMail` merkt sich nur die Empfängeradresse. Es
wird nie eine Verbindung aufgebaut und nichts versendet. Das Versandprotokoll liegt in einem
frischen Temp-Ordner, nie in `daten/`.

**Ergebnis: PASS — 12 von 12 Tests.**

## Die Regeln, um die es hier geht

- Vor dem SMTP-Aufruf steht der Eintrag gespeichert auf `sendet` (mit `sendetSeit`). Ein
  Eintrag auf `sendet` wird von `naechster` nicht genommen und nicht erneut eingereiht.
- Erfolg macht ihn `gesendet`, ein Serverfehler wieder `offen` mit einem Versuch mehr (wie
  bisher), Drosselung wieder `offen` ohne Versuch.
- Steht ein Eintrag länger als 15 Minuten (`HAENGT`, weit über der SMTP-Frist von dreimal 60
  Sekunden) auf `sendet`, war der Versand unterbrochen: er wird `unklar`, nicht wiederholt
  und bei den Fehlern gezeigt. Ein Eintrag ohne Zeitpunkt gilt sofort als hängend.
- Eine laufende Kampagne gilt nicht als fertig, solange eine ihrer Mails auf `sendet` steht.
- `unklar` wird wie andere Erledigte nach einer Woche weggeräumt; `sendet` nie.

## Einzelne Tests

| Test | Ergebnis |
| --- | --- |
| versandBeginnen setzt nur einen offenen Eintrag auf sendet, mit Zeitpunkt | PASS |
| sendet ist nicht mehr dran und wird nicht doppelt eingereiht | PASS |
| versandZuruecknehmen: wieder offen, ohne Versuch | PASS |
| Erfolg und Fehlschlag lösen sendet auf | PASS |
| haengendeMarkieren: erst nach der Frist unklar, nie wieder dran | PASS |
| stand zählt sendet und unklar, aufraeumen behält Laufendes | PASS |
| haupt.js: Eintrag steht auf sendet, während der Server die Mail annimmt | PASS |
| haupt.js: nach Absturz mitten im Versand kein zweiter Versand, sondern unklar | PASS |
| haupt.js: ein gerade laufender Versand wird vom nächsten Takt nicht angefasst | PASS |
| haupt.js: gedrosselt wieder offen, ohne Versuch und ohne SMTP | PASS |
| haupt.js: Serverfehler zählt als Fehlversuch, Eintrag wieder offen | PASS |
| haupt.js: laufende Kampagne nicht fertig, solange die letzte Mail unterwegs ist | PASS |

## Fehler und Korrekturen

Ein erster Lauf hatte 11 von 12: Der Test für das Aufräumen von `unklar` setzte die Uhr nicht
über die 15-Minuten-Frist, der Eintrag stand deshalb noch auf `sendet`. Der Fehler lag im
Test, nicht im Modul; nach der Korrektur 12 von 12.

## Nicht geprüft (BLOCKED)

- **Ein echter Absturz in der App** zwischen Annahme durch IONOS und Speichern. Nachgestellt
  wird er mit einem Eintrag auf `sendet` und altem Zeitpunkt.
- **Die Anzeige** („unklar“ in der Kachel „Warteschlange“ und im Reiter „Protokoll“) wurde
  nicht in der laufenden App angesehen. Ein Start von Vendo hätte den echten Versandtakt mit
  den echten Plugin-Daten angestoßen.
- **Ob ein SMTP-Fehler nach dem Senden der Daten** (etwa ein Abbruch nach `DATA`) bedeutet,
  dass die Mail doch angekommen ist: Solche Fehler zählen weiter als normaler Fehlversuch.
