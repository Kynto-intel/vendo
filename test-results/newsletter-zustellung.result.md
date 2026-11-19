# Newsletter-Plugin: Zustellung beobachten, Kampagnen anhalten

**Datum:** 2026-11-17
**Plugin:** `newsletter`
**Gegenstand:** neu `plugins/newsletter/zustellung.js` (Ereignisse je Kampagne zählen, Ampel
bewerten), in `haupt.js` `zustellungLesen`, `zustellungPruefen` (im Zehn-Minuten-Takt nach den
Rückläufern), `kampagneAnhalten`, `kampagneFortsetzen`, das Überspringen angehaltener
Kampagnen in `schritt`, der Zustand `pausiert` in den Änderungssperren und in `kampagneStarten`,
die Spalte `zustellung` in `kampagnenErgebnisse`; in `kampagnen.js` der Zustand `pausiert`; in
`ansicht.js` die Kachel „Zustellung“, der Kasten mit Grund und Rat, die Knöpfe „Anhalten“ und
„Fortsetzen“ und die Spalte in der Ergebnisliste.

**Testbefehl zur Korrektur der Protokoll-Isolierung:**

```
node --test tests/newsletter-zustellung.test.js tests/newsletter-ruecklaeufer.test.js
```

**Fixture:** keine Datei. Kampagnen, Zahlen und Adressen (`.invalid`) sind erfunden und stehen
im Test. Das Versandprotokoll wird je Test in einem frischen Temp-Ordner angelegt; Testmails
werden ebenfalls nur dort protokolliert. nodemailer und Electrons `safeStorage` sind Ersatzteile
im Speicher; es wird nie eine Verbindung aufgebaut.

**Ergebnis: PASS — 39 von 39** (16 Zustellung, einschließlich der Regression für das
Testprotokoll, und 23 Rückläufer). Der vorherige UI-Lauf hatte 7 von 7 Tests bestanden. Der
Gesamtstand von **615 Tests in fünfundzwanzig Dateien** stammt aus dem vollständigen Lauf vom
16. November und wurde hier nicht erneut ausgeführt.

## Die Regeln, um die es hier geht

| Signal | gelb ab | rot ab |
| --- | --- | --- |
| tote Adressen | 2 % | 5 % |
| Ablehnungen wegen Spamverdacht | 1 % | 3 % |
| Beschwerden | 0,1 % | 0,3 % |
| Abmeldungen | 1 % | nie |

- Rot erst ab 50 verschickten Mails und drei Ereignissen derselben Art, sonst höchstens gelb.
- Ein Ereignis gehört zur zuletzt davor gestarteten Kampagne, bis 48 Stunden nach ihrem Ende
  (eine laufende zählt bis jetzt). Abmeldungen sind gesperrte Kontakte ohne Sperrart;
  Rückläufer und Beschwerden zählen nicht doppelt als Abmeldung.
- Bei Rot wird eine laufende Kampagne `pausiert` (von Vendo, mit Grund); bei Gelb nicht.
- Mails einer angehaltenen Kampagne warten, andere Mails gehen weiter; eine angehaltene
  Kampagne wird nicht als fertig abgeschlossen, ist nicht änderbar, nicht löschbar und nicht
  neu startbar, aber abbrechbar.
- Fortsetzen: frische Frist für Wartendes, Verfallenes neu eingereiht, Gesendetes nicht; nach
  einem Fortsetzen einer von Vendo angehaltenen Kampagne hält Vendo sie nicht noch einmal an.
  Von Hand angehalten und fortgesetzt bleibt die automatische Prüfung an.
- Die Ausgaben enthalten keine Adressen; der Rat kommt maskiert ins HTML.

## Einzelne Tests

| Test | Ergebnis |
| --- | --- |
| ohne Auffälligkeiten grün | PASS |
| tote Adressen: ab 2 % gelb, ab 5 % rot, Text und Rat | PASS |
| rot erst ab genug verschickten Mails und Ereignissen | PASS |
| Beschwerden nach Gmail-Richtwerten, Ablehnungen streng | PASS |
| Abmeldungen höchstens gelb | PASS |
| schwerster Grund vorn, jeder Grund mit Rat | PASS |
| Zuordnung über das Zeitfenster, Abmeldungen ohne Sperrart | PASS |
| laufende Kampagne zählt bis jetzt, kaputte Eingaben | PASS |
| haupt.js: bei Rot angehalten, Grund genannt | PASS |
| haupt.js: bei Gelb nichts angehalten | PASS |
| haupt.js: Mails einer angehaltenen Kampagne warten, andere gehen weiter | PASS |
| haupt.js: angehaltene Kampagne weder änderbar noch neu startbar | PASS |
| haupt.js: Fortsetzen ohne doppelte Mails, kein zweites Anhalten | PASS |
| haupt.js: von Hand anhalten und fortsetzen | PASS |
| haupt.js: Abbrechen einer angehaltenen Kampagne | PASS |
| haupt.js: zustellungLesen und Ergebnisliste mit Ampel, ohne Adressen | PASS |

## Fehler und Korrekturen

Beim Prüfen stellte sich heraus, dass Testmails trotz temporärem Testordner ins echte
Protokoll geschrieben werden konnten. `haupt.js` übergibt den Testordner jetzt auch beim
Schreiben; ein Regressionstest prüft den Eintrag im temporären Ordner. Alle 39 gezielten Tests
bestanden. Bei der früheren Implementierung scheiterte außerdem zweimal ein Änderungsskript,
weil ein Suchmuster doppelt vorkam; es brach jeweils ab, bevor es schrieb, und wurde angepasst.

## Nicht geprüft (BLOCKED)

- **Ob eine Mail tatsächlich im Spam-Ordner landet**, kann Vendo grundsätzlich nicht sehen; die
  Ampel wertet nur die Vorzeichen aus. Google Postmaster Tools zeigen Gmails eigene Sicht.
- **Beschwerden** kommen nur an, wenn ein Anbieter Feedback-Berichte an das Postfach schickt;
  Gmail tut das für kleine Absender nicht. Eine Beschwerdequote von 0 heißt deshalb nicht,
  dass sich niemand beschwert hat.
- **Die Grenzwerte** sind verbreitete Richtwerte, nicht an Vendos echtem Versand geeicht.
- **Anzeige in der laufenden App** nicht angesehen; geprüft ist das erzeugte HTML.
