# Newsletter-Plugin: UTM-Parameter an Shop-Links

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-13
**Gegenstand:** `plugins/newsletter/html-mail.js` (`utmName`, `utmAnhaengen`) und
`plugins/newsletter/haupt.js` (`mailBauenAus` mit Option `utm`, eingebunden in Versand aus
der Warteschlange, Kampagnen-Vorschau, Live-Vorschau des Editors, Kampagnen-Testmail,
Freigabe-Testmail und alle Automationsmails).
Außerhalb von Vendo: die Anweisung „UTM von Hand anhängen“ in den Skills
`vendo-newsletter` und `donnerwolf-email-flow` und im Systemprompt der Newsletter-Texterin
ersetzt durch „das macht Vendo“; vorher gesichert als
`*.vor-utm-automatisch-20261112.bak`.

**Testbefehle:**

```
node --test tests/newsletter-utm.test.js
node --test tests/newsletter-*.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei; erfundene Daten (`beispielshop.de`), kein Netz.

**Ergebnis: PASS** — 5 von 5 in `tests/newsletter-utm.test.js`, 512 von 512 im
Regressionslauf (508 Newsletter-Tests in neunzehn Dateien plus 4 Werkstatt-Tests).
`git diff --check` ohne Befund.

## Warum

Vendo-Mails sind eigenes HTML, und Vendo misst selbst keine Klicks. Felix hat im September
an einem Shopify-Email-Newsletter aus eigenem HTML nachgewiesen, dass Shopify Analytics
solche Besuche ohne UTM-Parameter keiner Mail zuordnet (2,2 % Klicks, 0 Sitzungen). Ohne
Parameter wäre die Wirkung von Vendo-Mails also unsichtbar.

## Was jetzt gilt

- Beim Bauen jeder Kampagnen- und Automationsmail hängt Vendo an jeden Link in den eigenen
  Shop (öffentliche Adresse mit und ohne `www`, myshopify-Adresse)
  `utm_source=vendo&utm_medium=email&utm_campaign=<Kurzname>` an.
- Kurzname aus dem Kampagnennamen („Bestseller November“ → `bestseller-november`, Umlaute
  ausgeschrieben), bei Automationen aus Name und Schritt (`warenkorb-schritt-1`).
- Unberührt bleiben: fremde Adressen, `mailto:`, Platzhalter wie `{{warenkorbLink}}` (die
  UTM-Parameter kommen vor dem Einsetzen der Platzhalter, der Wiederherstellungslink des
  Warenkorbs bleibt also, wie Shopify ihn liefert), Links mit schon gesetztem `utm_source`,
  Bilder, der Fuß (Impressum, Pflichtlinks, Social-Icons, Abmeldelink), Vorlagen und die
  Beispielmail.
- Ein Anker (`#…`) bleibt am Ende, vorhandene Parameter bleiben erhalten.
- Vendos Linkprüfungen (fremde Adressen, doppelte Produkte, Erreichbarkeit) kommen mit den
  Parametern klar; einzeln nachgeprüft.

## Nicht geprüft

- Ein echter Versand und die Zuordnung in Shopify Analytics: braucht eine erste echte
  Kampagne. Prüfen in Shopify Analytics unter Sitzungen nach `utm_source` = `vendo`.
