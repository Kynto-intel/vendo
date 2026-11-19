# Newsletter-Plugin: Ergebnisse je Mail (Phase 5, Schritte 1 bis 3)

**Datum:** 2026-11-16 (zuletzt ausgeführt; Schritte 1 bis 3 vom 2026-11-13, eigener Kurzname je Automationsschritt vom 2026-11-16)
**Plugin:** `newsletter`
**Gegenstand:** `plugins/newsletter/ergebnisse.js` (Zuordnung von Bestellungen zu Mails,
Kurznamen, Abmeldungen nach Versand, Abruf-Fenster), `shopify.ergebnisBestellungenHolen`
und die Verdrahtung in `haupt.js` (Kurzname beim Kampagnenstart, Kurzname je
Automationsschritt, täglicher Abruf, `ergebnisseHolen`, `ergebnisseLesen`). Seit Schritt 2
außerdem `gesendetJeKampagne`, `kampagnenZeilen` und `kampagnenErgebnisse` für die
Ergebnisliste im Reiter „Kampagnen“. Seit Schritt 3 `autoSchluesselLesen`,
`gesendetJeAutomationsschritt`, `serienEnden`, `automationenZeilen` und
`automationenErgebnisse` für den Reiter „Automationen“; der Warteschlangen-Schlüssel einer
Automationsmail trägt jetzt die Automation (`auto:<automation>:<lauf>:<schritt>`).

**Testbefehl:**

```
node --test tests/newsletter-ergebnisse.test.js
```

**Fixture:** keine Datei. Bestellungen, Beträge, IDs und Adressen sind erfunden und stehen
im Test (`gid://shopify/Order/1`, `@beispiel.de`). Shopify ist ein fetch-Ersatz (`abrufen`),
Electrons `safeStorage` ein Ersatz im Speicher, der vor dem Laden von `haupt.js` in den
Modul-Cache gelegt wird. Es wird nie eine Verbindung aufgebaut und nichts versendet.

**Ergebnis: PASS — 31 von 31 Tests.**

Gesamtstand des Plugins, jede Testdatei einzeln mit ihrem Pfad gestartet:
**573 Tests in dreiundzwanzig Dateien, alle bestanden** (`node --test tests/newsletter-*.test.js`, die Dateien sind dabei einzeln benannt).

## Die Regeln, um die es hier geht

- **Zuordnung:** Eine Bestellung gehört zu der Vendo-Mail, über die jemand **zuletzt** kam
  (`lastVisit`), sonst zu der, über die er zuerst kam (`firstVisit`). Nur `utm_source=vendo`
  zählt; ein Besuch über Google oder Instagram mit gleichem Kampagnennamen nicht.
- **Keine Kundenfelder:** Abfrage und Speicher kennen nur Bestell-ID, Kurzname, Betrag,
  Währung und Zeitpunkt. Der Test prüft, dass in Speicher und `ergebnisseLesen` kein `@`
  steht und dass die Abfrage weder `customer` noch `email` enthält.
- **Nichts doppelt, nichts Falsches:** Der Abruf überlappt drei Tage; doppelte IDs zählen
  einmal. Bestellungen, die Shopify noch auswertet, kommen beim nächsten Abruf. Stornierte
  fallen heraus, auch wenn sie schon gezählt waren. Nach zwei Jahren fallen Bestellungen aus
  dem Speicher (5-MB-Grenze der Plugin-Daten).
- **Ein Kurzname gehört genau einer Mail:** Er wird beim Kampagnenstart festgelegt und als
  `utm` an der Kampagne gespeichert. Eine gleichnamige neue Kampagne bekommt `herbst-2`. Ein
  einmal vergebener Kurzname wechselt nie die Mail; eine Umbenennung bekommt einen neuen
  Eintrag, und `jeZiel` fasst beide zusammen.
- **Automationen:** Sobald ein Schritt in die Warteschlange geht, merkt sich Vendo
  `<name>-schritt-<n>` für diesen Schritt; die Mail trägt genau diesen Kurznamen. Hat der
  Schritt schon einen Kurznamen, bleibt es dabei (`kurznameFinden`). Gehört der Name schon
  einer anderen Automation (gelöscht und neu angelegt), bekommt die neue einen eigenen,
  etwa `willkommen-schritt-1-2`; vorher wären ihre Bestellungen still der alten zugeordnet
  worden.
- **Abmeldungen nach Versand:** gezählt in den 48 Stunden nach Ende des Versands, für die
  zuletzt davor gestartete Kampagne. Nur Zahlen.
- **Ergebnisliste (Schritt 2):** eine Zeile je verschickter Kampagne, die neueste oben.
  Empfänger sind die erfolgreich verschickten Kampagnenmails laut Protokoll; Testmails,
  Freigabe-Proben und Fehlversuche zählen nicht. „Umsatz je 100 Empfänger“ bleibt leer statt
  0, solange keine Mail raus ist. Entwürfe erscheinen nicht. Kein `@` in der Liste.
- **Automationen (Schritt 3):** je Schritt gesendet (Protokoll), Bestellungen, Umsatz und
  Umsatz je 100 Empfänger; je Automation, wie die Serien endeten: laufen, Kauf, Abmeldung,
  zu spät, durchgelaufen, anders beendet. Weil Läufe 30 Tage nach ihrem Ende aufgeräumt
  werden, gelten die Enden für etwa die letzten 30 Tage; das steht so in der Oberfläche.
  Das Protokoll kann ältere Mails im früheren Schlüsselformat `auto:<lauf>:<schritt>` nur
  zuordnen, solange der Lauf noch existiert.
- **Shopify nur, wenn nötig:** Solange keine Mail mit Kurzname raus ist, wird gar nicht
  gefragt; danach einmal am Tag.

## Einzelne Tests

| Test | Ergebnis |
| --- | --- |
| letzter Besuch vor erstem, fremde Quellen gar nicht | PASS |
| nur Vendo-Bestellungen, ohne Kundenfelder, jede einmal | PASS |
| noch nicht ausgewertete kommen später, Stornos fallen heraus | PASS |
| sehr alte Bestellungen fallen nach zwei Jahren heraus | PASS |
| gleichnamige neue Kampagne bekommt eigenen Kurznamen (Modul) | PASS |
| ein Kurzname wechselt nie die Mail | PASS |
| jeZiel fasst Kurznamen derselben Mail zusammen | PASS |
| Beträge auf Cent gerundet, verschiedene Währungen fallen auf | PASS |
| Abmeldungen 48 Stunden nach Versand, zuletzt gestartete Kampagne | PASS |
| Abruf-Fenster: ohne Mail nichts, danach drei Tage überlappend | PASS |
| Abfrage ohne Kundenfeld | PASS |
| ergebnisBestellungenHolen blättert, filtert, liest UTM | PASS |
| Storno und „noch nicht ausgewertet“ werden übernommen | PASS |
| Fehler von Shopify werden weitergegeben | PASS |
| haupt.js: Kampagne bekommt beim Start ihren Kurznamen | PASS |
| haupt.js: zweite gleichnamige Kampagne bekommt `herbst-2` | PASS |
| haupt.js: ergebnisseHolen ordnet zu, ergebnisseLesen rechnet, nichts doppelt | PASS |
| haupt.js: ohne verschickte Mail keine Anfrage an Shopify | PASS |
| haupt.js: Automationsschritt merkt sich seinen Kurznamen, Mail trägt ihn | PASS |
| gesendetJeKampagne zählt nur erfolgreich verschickte Kampagnenmails | PASS |
| kampagnenZeilen: nur verschickte, neueste oben, Umsatz je 100 Empfänger | PASS |
| haupt.js: kampagnenErgebnisse mit Empfängern aus dem Protokoll und Umsatz aus Shopify | PASS |
| haupt.js: ergebnisseHolen sagt in einem Satz, was herauskam | PASS |
| autoSchluesselLesen versteht neues und altes Format | PASS |
| gesendetJeAutomationsschritt zählt nur erfolgreiche Automationsmails | PASS |
| serienEnden ordnet die Abbruchgründe ein | PASS |
| automationenZeilen: je Schritt gesendet, Umsatz, je 100 Empfänger | PASS |
| haupt.js: automationenErgebnisse mit Protokoll, Umsatz je Schritt, Enden | PASS |
| haupt.js: neu angelegte gleichnamige Automation bekommt eigenen Kurznamen (`-2`) | PASS |
| haupt.js: ein Schritt behält seinen Kurznamen bei jedem weiteren Versand | PASS |
| kurznameFinden nimmt den zuletzt vergebenen Namen einer Mail und nur ihren | PASS |

## Fehler und Korrekturen

2026-11-16: Keine Fehlschläge. Die drei neuen Tests decken einen Fehler ab, den das Review
(`docs/newsletter-review.md`, M2) gefunden hat; sie sind zusammen mit der Korrektur
entstanden.

Schritt 3: Keine Fehlschläge.

Schritt 2: Ein Testlauf scheiterte am Laden der Testdatei (ein beim Einfügen entstandener
Zeilenumbruch in `'
'`); behoben, danach 23 von 23. Das Testgerüst liest das Protokoll seither
aus einem frischen Temp-Ordner (`ctx.protokollOrdner`), nie aus `daten/`.

Schritt 1: Keine Fehlschläge. Ein zunächst geschriebener Testteil zur Umbenennung nach dem Start prüfte
nichts Echtes und wurde entfernt; der Titel des Tests sagt jetzt nur, was er prüft.

## Nicht geprüft (BLOCKED)

- **Gegen den echten Shop:** dass Shopify `customerJourneySummary` mit dem vorhandenen Token
  liefert und wie viele Bestellungen tatsächlich eine Vendo-Zuordnung tragen (Cookie-Banner).
  Laut Shopify-Doku (Admin GraphQL 2025-07) reicht `read_orders`. Nachweis erst nach der
  ersten echten Kampagne: `ergebnisseLesen` zeigt dann Bestellungen oder im Terminal steht
  eine Warnung.
- **Dass die versendete Kampagnenmail den festgelegten Kurznamen trägt**, ist nur indirekt
  geprüft: `inhaltVon` nimmt `kampagne.utm`, ein Versand läuft im Test nicht.
- **Die Tabelle in Vendo** (Reiter „Kampagnen“, Abschnitt „Ergebnisse“, Knopf „Jetzt holen“)
  wurde nicht in der laufenden App angesehen. Geprüft sind das Laden des Moduls und die
  Daten, die sie bekommt.
- **Der Ergebnisblock in den Automationskarten** wurde ebenfalls nicht in der laufenden App
  angesehen.
- Die Übersicht zeigt noch nichts davon (Schritt 4).
