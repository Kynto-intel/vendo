# Newsletter-Plugin: Automationen

**Datum:** 2026-11-09
**Gegenstand:** Phase 4 — die Zustandsmaschine (`automationen.js`), die Shopify-Auslöser
(abgebrochene Warenkörbe und Bestellungen in `shopify.js`), die Verdrahtung im Takt und die
Oberfläche im Reiter „Automationen".

**Testbefehle:**

```
node --test tests/newsletter-automationen.test.js
```

```
node --test tests/newsletter-shopify.test.js
```

**Fixture:** `tests/fixtures/newsletter/shopify-kunden.json`, erweitert um abgebrochene
Warenkörbe (einer mit Kundenkonto und Posten, einer als Gast ohne Adresse), eine schlanke
Antwort ohne Posten, einen Feldfehler und Bestellungen (eine mit, eine ohne Kundenkonto).
Alles erfunden. Der Automationen-Test braucht keine Fixture: er stellt die Uhr selbst. Es
wird nie eine Verbindung aufgebaut und nichts versendet.

**Ergebnis: PASS — 21 von 21 (Automationen), 21 von 21 (Shopify)**

Gesamtstand des Plugins: **176 Tests in neun Dateien, alle bestanden.**

## Die Regeln, um die es hier geht

- **Ein Lauf pro Ereignis.** Der Schlüssel aus Automation und Ereignis-ID verhindert, dass
  derselbe Warenkorb zweimal eine Serie startet — und der Auslöser liefert ihn bei jedem
  Abruf erneut, alle zehn Minuten. Ein *anderer* Warenkorb derselben Person startet dagegen
  eine eigene Serie. Ohne Ereignis-ID (Willkommen) zählt die Adresse als Schlüssel.
- **Nichts geht zu spät raus.** Jeder Schritt hat ein Verfallsfenster; was darüber liegt,
  wird als abgebrochen vermerkt statt verspätet gesendet. Voreinstellung: 48 Stunden beim
  Warenkorb, 14 Tage beim Willkommen.
- **Keine Werbung ohne Zustimmung.** `darfSenden` prüft Sperre und Zustimmung, und zwar an
  zwei Stellen: beim Starten eines Laufs und erneut, kurz bevor die Mail in die Warteschlange
  geht. Wer sich zwischendurch abmeldet, bekommt die zweite Mail nicht mehr. Die Prüfung
  liegt im Modul, nicht in der Oberfläche, damit sie nicht umgangen werden kann.
- **Eine Bestellung beendet die Serie**, bei der das vorgesehen ist (Warenkorb,
  Rückgewinnung) — nicht aber die Willkommensserie, die bleibt laufen.
- **Einschalten geht nur sendefertig.** Fehlt in einem Schritt Betreff oder Inhalt, fehlt das
  Impressum, der Abmeldeweg oder (beim Warenkorb) der Shopify-Zugang, verweigert das Plugin
  das Einschalten mit Begründung. Eine neue Automation ist deshalb bewusst **aus**.
- **Abschalten beendet laufende Serien**, sonst käme die zweite Mail Tage später aus einer
  Automation, die niemand mehr für aktiv hält.

Weiter abgedeckt: Schrittfolge mit eigener Wartezeit je Schritt, Abschluss nach dem letzten
Schritt, Abbruch nur für die genannte Adresse und Automation, kein doppelter Abbruch,
Aufräumen erledigter Läufe nach 30 Tagen, Zählwerk je Automation, und dass kaputte Listen
(`null`, String, Müll-Einträge) nicht zum Absturz führen.

## Shopify-Auslöser

- **Warenkörbe:** `abandonedCheckouts` mit Zeitfilter; übernommen werden Posten, Summe und
  vor allem `abandonedCheckoutUrl` — der Link, der den Warenkorb beim Kunden wiederherstellt.
  Ein Warenkorb **ohne Kundenkonto fällt heraus**: ohne Adresse könnten wir niemanden
  anschreiben. Kennt die API-Version `lineItems` nicht, läuft es ohne Posten weiter (mit Link).
- **Bestellungen:** `orders` mit Zeitfilter, daraus die Adressen. Gastbestellungen ohne
  Kundenkonto fehlen dabei — deren Serien brechen also nicht ab. Das ist eine bekannte Lücke,
  siehe unten.
- Der Zeitfilter wird so gebaut, wie Shopify ihn erwartet: `created_at:>'…ISO…'`.
- Abgefragt wird **alle zehn Minuten**, nicht im 15-Sekunden-Takt der Warteschlange — das
  bleibt weit unter den Abfragegrenzen.

## Zusammenspiel mit Drossel und Warteschlange

Eine fällige Automationsmail wird **nicht direkt gesendet**, sondern in die Warteschlange
gelegt. Damit gilt für sie dasselbe wie für Kampagnen: Stundenbudget, Mindestabstand, Pause
bei Limit-Fehlern, höchstens drei Versuche. Der Schlüssel `auto:<lauf>:<schritt>` verhindert,
dass ein Schritt doppelt eingereiht wird.

**Integrationscheck** mit einem Fake-`ctx`: 47 bereitgestellte Funktionen. Eine
Warenkorb-Automation anlegen, Einschalten wird mit „Schritt 1: der Inhalt fehlt" verweigert,
nach dem Befüllen erzeugt die Vorschau eine Mail, in der `{{warenkorb}}` zur Postenliste und
`{{warenkorbLink}}` zum echten Link geworden ist.

## Nicht geprüft (BLOCKED in dieser Umgebung)

- **Die echten Shopify-Felder.** Ob `abandonedCheckouts` in der verwendeten API-Version so
  heißt, ob `customer.email` dort gefüllt ist und ob der Token die nötigen Rechte samt
  Freigabe für geschützte Kundendaten hat, zeigt erst der erste Lauf gegen den echten Shop.
- **Gast-Checkouts.** Warenkörbe ohne Kundenkonto werden übersprungen. Ob Shopify für diese
  Fälle die Adresse an anderer Stelle liefert (in REST gab es ein eigenes `email`-Feld), ist
  offen und sollte am echten Shop geprüft werden — sonst fehlt ein Teil der Abbrecher.
- **Gastbestellungen** brechen Serien nicht ab, weil die Bestellabfrage nur
  `customer.email` liest. Wer als Gast bestellt, könnte also noch eine Warenkorb-Mail
  bekommen. Mit Zustimmungspflicht ist der Fall selten, aber er ist da.
- **Der zeitliche Ablauf über Stunden und Tage.** Wartezeiten, Verfall und Abbruch sind mit
  gestellter Uhr geprüft, nicht an echten Läufen.
- **Die Oberfläche** (Reiter „Automationen", Schritt-Editor, Vorschau, Ein/Aus) wurde in
  Vendo noch nicht geöffnet.
- **Rückgewinnung** ist als Art angelegt, hat aber **keinen Auslöser**: es gibt noch keine
  Abfrage „hat lange nichts gekauft". Die Automation lässt sich anlegen und einschalten, wird
  aber von nichts in Gang gesetzt. Das steht so in der README.
