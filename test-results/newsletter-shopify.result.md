# Newsletter-Plugin: Shopify

**Datum:** 2026-11-09
**Gegenstand:** Phase 2 — `plugins/newsletter/shopify.js`: Abonnenten über die GraphQL
Admin API holen (mit Seitenwechsel), Abmeldungen zurückschreiben, Zugangsdaten prüfen,
Fehler verständlich melden.

**Testbefehl:**

```
node --test tests/newsletter-shopify.test.js
```

**Fixture:** `tests/fixtures/newsletter/shopify-kunden.json` — erfundene Antworten, wie
Shopify sie liefert: zwei Seiten mit Cursor, ein Kunde ohne Adresse, ein Feldfehler, eine
schlanke Seite, eine erfolgreiche und eine abgelehnte Abmeldung. Keine echten Kundendaten.
Es wird **nie** eine Verbindung zu Shopify aufgebaut: `holen` ist ein fetch-Ersatz, der die
Fixture ausliefert und mitschreibt, was angefragt wurde.

**Ergebnis: PASS — 14 von 14 Tests**

Abgedeckt:

- **Zugang prüfen:** `https://MeinShop.myshopify.com/admin` wird zu `meinshop.myshopify.com`
  geputzt; eine eigene Domain (`meinshop.de`) und ein Token, der nicht wie ein
  Shopify-Token aussieht, werden abgelehnt; ein leeres Tokenfeld ist erlaubt (dann bleibt
  der gespeicherte).
- **Nur Abonnenten:** die Abfrage enthält `accepts_marketing:true`, der Token geht im
  Header `X-Shopify-Access-Token`, die URL zeigt auf die GraphQL-Endstelle der API-Version.
- **Seitenwechsel:** zwei Seiten werden geholt, die zweite mit dem Cursor der ersten; ein
  Kunde ohne E-Mail-Adresse fällt heraus.
- **Zustimmungsnachweis:** genommen wird der Zeitpunkt der Marketing-Zustimmung, und wenn
  Shopify keinen liefert, das Anlegedatum — mit entsprechend unterschiedlichem Nachweistext.
- **Rückfall bei Feldfehlern:** Kennt die API-Version `defaultEmailAddress` nicht, wird die
  Abfrage einmal ohne dieses Feld wiederholt (nachgewiesen an den mitgeschriebenen
  Anfragen). Andere GraphQL-Fehler wie `Throttled` werden weitergegeben, nicht umgedeutet.
- **Fehler verständlich:** 401/403 nennt Token und die nötigen Scopes, 429 sagt „bremst
  gerade", ein Netzfehler sagt „nicht erreichbar".
- **Abmeldung zurückschreiben:** `customerEmailMarketingConsentUpdate` mit
  `marketingState: 'UNSUBSCRIBED'` und einem ISO-Zeitstempel; die Begründung von Shopify
  (`userErrors`) wird weitergegeben; ohne Kundennummer wird gar nicht angefragt.

**Hinweise zur Umsetzung**

- Benötigte Scopes: `read_customers` zum Holen, `write_customers` zum Zurückschreiben.
  Beides muss am Token hängen, sonst kommt 401/403.
- `marketingState` nimmt laut Shopify-Doku nur `SUBSCRIBED`, `UNSUBSCRIBED` und `PENDING` an;
  `NOT_SUBSCRIBED` lässt sich über diese Mutation nicht setzen.
- Der Zugang liegt im Plugin (Shop-Adresse und verschlüsselter Token), es wird nichts aus
  Hermes' Konfiguration gelesen.

**Nicht geprüft (BLOCKED in dieser Umgebung)**

- **Die echte API.** Ob die Feldnamen in der verwendeten API-Version so heißen und ob der
  Token die Scopes hat, zeigt erst der erste Lauf gegen den echten Shop. Der Rückfall auf die
  schlanke Abfrage ist dafür eingebaut.
- **Geschützte Kundendaten:** Für Kundendaten verlangt Shopify eine Freigabe in der
  App-Konfiguration. Ob die für diesen Token vorliegt, lässt sich hier nicht feststellen.
- **Große Listen:** Die Begrenzung auf 40 Seiten (10.000 Kontakte je Lauf) ist eingebaut und
  wird gemeldet, aber nicht an echten Daten erprobt.
