# Testbericht: Newsletter, Shopify-Zugang aus den Hermes-Einstellungen

- **Datum:** 18.11.2026
- **Plugin:** `newsletter` (`shopify.js` → `hermesZugang`, `haupt.js` → `shopifyZugang`, `shopifyVorhanden`)
- **Testbefehle:**
  - `node --test tests/newsletter-hermes-zugang.test.js`: 1/1 PASS
  - `node --test $(ls tests/newsletter-*.test.js)`: 615/615 PASS
  - Gesamtlauf `node --test $(ls tests/*.test.js) tests/src/datenbank/datenbank-speicher.test.js`: 832 Tests, 822 PASS,
    0 FAIL, 10 übersprungen (die Datenbank-Tests, weil die Test-Datenbank `vendo-test-db` angehalten war; von dieser
    Änderung nicht berührt)
- **Fixture:** erfundener Token und Shop in einem Temp-Ordner
- **Ergebnis:** PASS

## Nachtrag: Eingabe im Reiter „Kontakte“ entfernt

Shop-Adresse, Token-Feld, „Zugang speichern“ und „Zugang löschen“ samt den Diensten `shopifySpeichern` und
`shopifyLoeschen` entfernt; `shopifyLesen` meldet Shop und Token aus Hermes. `node --test $(ls tests/newsletter-*.test.js)`:
616/616 PASS. Sichtprüfung in der App: nicht ausgeführt (Vendo muss dafür neu gestartet werden).

## Beobachtung und Korrektur

Nach der Umstellung waren drei Newsletter-Tests rot: Sie fanden den echten Token in den Hermes-Einstellungen dieses
Rechners, weil die Tests den Hermes-Ordner nicht umlenkten. Ein Test („Kontakte abgleichen ohne Shopify-Zugang“) hat
dabei vermutlich einmal lesend bei Shopify angefragt. Korrektur: Alle Newsletter-Tests, die das Plugin laden, setzen
jetzt `VENDO_TEST_HERMES_HOME` auf einen leeren Temp-Ordner; danach 615/615.
