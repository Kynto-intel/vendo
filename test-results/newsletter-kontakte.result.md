# Newsletter-Plugin: Kontakte

**Datum:** 2026-11-09
**Gegenstand:** Phase 2 — `plugins/newsletter/kontakte.js`: Bestand führen, Shopify-Daten
einarbeiten, Empfängerkreis bestimmen, Sperren, Freigeben, Löschen und CSV-Import.

**Testbefehl:**

```
node --test tests/newsletter-kontakte.test.js
```

**Fixture:** keine Datei. Der Test baut seine Listen selbst, nur erfundene Adressen
(`beispiel.de`). Keine Verbindung nach außen.

**Ergebnis: PASS — 20 von 20 Tests**

Die zwei Regeln, um die es hier vor allem geht, sind beide belegt:

- **Ein Sync hebt keine Sperre auf.** Wer abgemeldet ist, bleibt gesperrt, auch wenn Shopify
  ihn weiter als Abonnenten führt. Der Sync übernimmt für gesperrte Kontakte nur die
  Shopify-Kundennummer — die braucht es, um die Abmeldung später dorthin zurückzuschreiben.
- **Ohne Zustimmungsdatum ist niemand Empfänger.** Eine importierte Adresse ohne Nachweis
  landet in der Liste, zählt aber nicht zum Empfängerkreis. Auch eine vorhandene Zustimmung
  wird nicht durch ein späteres Datum überschrieben: der erste Nachweis bleibt stehen.

Weiter abgedeckt:

- **Zusammenführen:** neue Kontakte anlegen, bestehende nach Adresse (Groß-/Kleinschreibung
  egal) aktualisieren statt doppelt anzulegen, unbrauchbare Adressen überspringen und zählen.
- **Empfängerkreis und Zählwerk:** gesamt, Empfänger, gesperrt, ohne Nachweis, Herkunft
  (Shopify oder Import).
- **Sperren** behält die Adresse in der Liste, damit ein späterer Import sie nicht wieder
  einsammelt. **Freigeben** macht das rückgängig. **Löschen** entfernt sie vollständig — für
  eine Löschanfrage. Unbekannte Adressen werden gemeldet statt still ignoriert.
- **CSV-Import:** Semikolon, Komma und Tabulator werden erkannt; deutsche und englische
  Spaltennamen (`email`/`e-mail`, `vorname`/`first name`, `zustimmungam`/`consent`);
  Anführungszeichen mit Trennzeichen im Feld (`"Beispiel; von"`); fehlende `email`-Spalte
  wird abgelehnt; ungültige Zeilen werden mit Zeilennummer gemeldet und der Rest läuft
  weiter; fehlendes Zustimmungsdatum erzeugt einen Hinweis statt eines stillen Imports;
  leere Eingaben werden abgefangen.

## Nachtrag 2026-11-09: Zustimmungs-Zustand (24 von 24 Tests)

Nach dem ersten echten Sync (820 Abonnenten aus dem Shop) kam die Frage auf, ob die Liste
wirklich nur Abonnenten enthält. Der Filter `accepts_marketing:true` in der Abfrage sprach
dafür, und alle 820 hatten ein Zustimmungsdatum aus Shopifys Marketing-Zeitpunkt. **Sicher
beantworten ließ sich die Frage aber nicht**, denn der Zustand der Adresse
(`marketingState`) wurde abgefragt und wieder weggeworfen. Shopify unterscheidet dort:

- `SUBSCRIBED` — hat zugestimmt
- `PENDING` — hat sich angemeldet, die Bestätigungsmail aber nicht angeklickt (Double-Opt-In)

Ob `accepts_marketing:true` auch `PENDING` mitliefert, ist in der Shopify-Doku nicht
eindeutig. Bei einem Zustimmungsnachweis ist das die falsche Stelle für eine Lücke, deshalb:

- `shopify.js` speichert den Zustand mit und schreibt ihn in den Nachweistext.
- `kontakte.js`: **Empfänger ist nur, wessen Zustand `SUBSCRIBED` ist** (oder wer gar keinen
  Zustand hat — CSV-Import, ältere API-Version; dort entscheidet weiter das
  Zustimmungsdatum). `stand()` weist `offeneBestaetigung`, `andererZustand` und `ohneZustand`
  getrennt aus.
- Der Zustand aus Shopify **überschreibt** den gespeicherten: wer beim nächsten Sync auf
  `PENDING` steht, fällt sofort aus dem Empfängerkreis.
- Oberfläche: Kachel „Bestätigung offen", Spalte „Zustand" (grün bei `SUBSCRIBED`), und der
  Sync-Text nennt die Zahlen.
- Der Sync-Fehler geht jetzt auch ins Log (`console.warn` mit Shop-Adresse), nicht nur in die
  Oberfläche — vorher war die Ursache eines fehlgeschlagenen Syncs im Terminal nicht zu sehen.

Neue Tests: nur `SUBSCRIBED` ist Empfänger, Schreibweise egal, Zustand wird überschrieben,
CSV ohne Zustand bleibt gültig, und `kontaktAus` speichert den Zustand (auch `null` bei der
schlanken Abfrage). Stand: 24 Tests in dieser Datei, 22 in `newsletter-shopify.test.js`,
**181 im Plugin**.

**Offen:** Wie viele der 820 auf `PENDING` stehen, zeigt erst der nächste Sync in der App —
die bereits gespeicherten Kontakte tragen den Zustand noch nicht. Gegenprobe: in Shopify
unter Kunden auf E-Mail-Abonnenten filtern und die Zahl mit der Empfängerzahl in Vendo
vergleichen.

**Nicht geprüft (BLOCKED in dieser Umgebung)**

- **Das Zusammenspiel mit dem echten Shop.** Dass ein Sync gegen den echten Shopify-Bestand
  die erwarteten Zahlen liefert, zeigt erst der erste Lauf.
- **Die Oberfläche.** Kontaktliste, Suche, CSV-Feld und die Knöpfe zum Abmelden und Löschen
  wurden in Vendo noch nicht geöffnet.
- **Abmeldungen, die per Mail eintreffen.** Der `List-Unsubscribe`-Header verweist auf eine
  `mailto:`-Adresse; die eingehenden Mails liest das Plugin noch nicht aus. Das braucht einen
  IMAP-Zugriff und damit eine weitere Abhängigkeit — bewusst offen gelassen, bis das
  entschieden ist. Bis dahin werden Abmeldungen von Hand über die Liste gesperrt.
- **Double-Opt-In** für Anmeldungen außerhalb von Shopify ist noch nicht gebaut. Importierte
  Adressen tragen das Zustimmungsdatum aus der Datei als Nachweis.
