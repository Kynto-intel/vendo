# Newsletter-Plugin: Auslöser der Rückgewinnung

**Datum:** 2026-11-13
**Plugin:** `newsletter`
**Gegenstand:** Der Auslöser für die Automation „Rückgewinnung“: `shopify.kaeuferHolen`
(Kunden mit Zustimmung und mindestens einer Bestellung, mit ihrer letzten Bestellung),
`automationen.rueckKandidaten` und das Zeitfenster (`rueckFenster`, `rueckFensterFehler`),
Schritt 4 in `ausloeserPruefen` (`haupt.js`) sowie Speichern, Lesen und Einschalten mit
Fenster.

**Testbefehl:**

```
node --test tests/newsletter-rueckgewinnung.test.js
```

**Fixture:** keine Datei. Alle Kunden, Adressen und Bestell-IDs stehen erfunden im Test
(`@beispiel.de`, `gid://shopify/Order/101` …). Shopify ist ein fetch-Ersatz (`abrufen`),
Electrons `safeStorage` ein Ersatz im Speicher, der vor dem Laden von `haupt.js` in den
Modul-Cache gelegt wird. Es wird nie eine Verbindung aufgebaut und nichts versendet.

**Ergebnis: PASS — 18 von 18 Tests.**

Gesamtstand des Plugins, jede Testdatei einzeln mit ihrem Pfad gestartet:
**526 Tests in zwanzig Dateien, alle bestanden.**

## Die Regeln, um die es hier geht

- **Wer dran ist:** Käufer mit Marketing-Zustimmung, deren **letzte** Bestellung mindestens
  `abTage` und höchstens `bisTage` zurückliegt. Voreinstellung 120 bis 365 Tage, im Editor
  einstellbar (ab mindestens 30, bis höchstens 1825, bis größer als ab). Ein unbrauchbares
  Fenster wird gespeichert, aber gemeldet und sperrt das Einschalten.
- **Kein Datumsfilter bei Shopify.** `order_date` meint dort irgendeine Bestellung, nicht die
  letzte. Gefiltert wird nur auf `accepts_marketing:true AND orders_count:>0`, das Fenster
  prüft das Modul selbst.
- **Einmal je letzter Bestellung.** Vendo merkt sich in `rueckgewinnung.gemerkt`, wer zu
  welcher letzten Bestellung schon dran war. Das überdauert das Aufräumen alter Läufe nach
  30 Tagen. Kauft jemand wieder und bleibt erneut weg, ist es ein neuer Anlass.
- **Nur, wer senden darf, wird gemerkt.** Gesperrte, Kontakte ohne Zustimmung und Adressen,
  die nicht in der Kontaktliste stehen, starten keine Serie und werden auch nicht gemerkt.
- **Höchstens 100 neue Serien am Tag**, die mit der jüngsten Bestellung zuerst. Das Postfach
  teilt sich die Reputation mit dem Kundenservice.
- **Shopify höchstens einmal am Tag** nach Käufern fragen. Frisch eingeschaltet wird beim
  nächsten Takt geprüft, nicht erst am nächsten Tag.
- **Einschalten nur mit Shopify-Zugang.**
- Eine Bestellung bricht die Serie ab. Das war schon vorhanden (`abbruchBei`), hier nicht neu
  geprüft, aber vom Automationen-Test abgedeckt.

## Einzelne Tests

| Test | Ergebnis |
| --- | --- |
| neue Rückgewinnung bringt das Fenster 120 bis 365 Tage mit | PASS |
| ältere Rückgewinnungen ohne Fenster bekommen die Voreinstellung | PASS |
| Beschreibung sagt nicht mehr, der Auslöser fehle | PASS |
| unbrauchbares Fenster sperrt das Einschalten | PASS |
| nur wer mit der letzten Bestellung im Fenster liegt, ist dran | PASS |
| wer zu seiner letzten Bestellung schon dran war, kommt nicht noch einmal | PASS |
| höchstens 100 neue Serien je Lauf, doppelte Adressen nur einmal | PASS |
| kaputte Einträge fallen heraus, statt abzustürzen | PASS |
| Abfrage fragt nur Kunden mit Zustimmung und Bestellung | PASS |
| kaeuferHolen blättert und nimmt nur Kunden mit letzter Bestellung | PASS |
| kaeuferHolen gibt Fehler von Shopify verständlich weiter | PASS |
| kaeuferAus verwirft Kunden ohne Adresse oder mit kaputtem Datum | PASS |
| haupt.js startet eine Serie nur für die eine Person, die passt | PASS |
| haupt.js fragt Shopify höchstens einmal am Tag nach Käufern | PASS |
| nach dem Aufräumen der Läufe kein zweites Mal dieselbe Person | PASS |
| Zeitfenster aus dem Editor wird gespeichert und gilt | PASS |
| ohne Shopify-Zugang lässt sich die Rückgewinnung nicht einschalten | PASS |
| erneutes Einschalten prüft beim nächsten Takt | PASS |

## Fehler und Korrekturen

Keine Fehlschläge. Für den Test bekamen die drei Shopify-Aufrufe in `ausloeserPruefen` den
Test-Einstieg `ctx.abrufen` (wie schon `rennerSichern`). In Vendo ist er leer, dann nimmt
`shopify.js` wie bisher `fetch`.

## Nicht geprüft (BLOCKED)

- **Gegen den echten Shop:** dass `lastOrder` und der Filter `orders_count:>0` mit dem
  vorhandenen Token durchgehen. Laut Shopify-Doku (Admin GraphQL 2025-07) gibt es beides, und
  der Token hat `read_orders`. Nachweis erst beim ersten Lauf in Vendo, dann steht im Editor
  „Zuletzt geprüft“ oder im Terminal eine Warnung.
- **Die Oberfläche** (zwei Felder für das Fenster im Editor) wurde nicht in Vendo geöffnet.
  Geprüft sind nur das Laden des Moduls und das Speichern über `automationSpeichern`.
