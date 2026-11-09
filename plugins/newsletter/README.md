# Newsletter-Plugin

Kampagnen und Automationen über das eigene IONOS-Postfach. Diese Datei ist Stand und
Bauplan in einem: oben, was gebaut ist, darunter der Plan für den Rest.

Sie heißt `README.md`, weil Vendos Werkstatt-Prüfung in einem Plugin nur `plugin.json`,
`ansicht.js`, `stil.css`, `haupt.js`, `README.md` und `LIESMICH.md` als Dateinamen
zulässt — eine `PLAN.md` würde als Fehler gemeldet.

## Stand

Letzte Änderung: 2026-11-09

**Gebaut:**

- **Gerüst** (2026-11-09): `plugin.json`, `ansicht.js`, `stil.css`. Sechs Bereiche als
  Reiter: Übersicht, Kontakte, Kampagnen, Automationen, Protokoll, Zugang. Die noch leeren
  Bereiche benennen offen, aus welcher Phase ihr Inhalt kommt. Die Datenstruktur wird beim
  ersten Öffnen angelegt, die Übersicht zählt daraus.
  Bericht: `test-results/newsletter-geruest.result.md`.
- **Zugang zum Postfach** (2026-11-09): `haupt.js` mit Tresor (`safeStorage`),
  Eingabeprüfung, Speichern, Lesen, Löschen und Anmeldeprüfung über `nodemailer`; dazu das
  Formular im Reiter „Zugang" und eine Postfach-Kachel in der Übersicht. Das Passwort wird
  verschlüsselt abgelegt und nie zurückgegeben; ohne verfügbare Verschlüsselung wird es gar
  nicht gespeichert. Zeilenumbrüche in Absendername und Antwortadresse werden abgelehnt,
  damit sich keine Mail-Header einschmuggeln lassen.
  Test: `tests/newsletter-zugang.test.js`, 19 von 19 bestanden.
  Bericht: `test-results/newsletter-zugang.result.md`.
- **Mail bauen, Versand, Protokoll** (2026-11-09): `mailBauen` setzt Absender, Empfänger,
  Betreff, HTML- und Textteil und lehnt Zeilenumbrüche in Kopfzeilen ab; der Textteil wird
  aus dem HTML abgeleitet, wenn keiner mitkommt. Eine Kampagnenmail ohne Abmeldelink im
  Inhalt wird nicht gebaut, mit Abmeldelink bekommt sie den `List-Unsubscribe`-Header als
  `mailto:`. `mailSenden` verschickt eine einzelne Mail und schreibt das Ergebnis ins
  Protokoll (Monatsdateien `daten/plugins/newsletter/protokoll-JJJJ-MM.ndjson`, Adressen
  gekürzt, ohne Mailtext). In der Oberfläche: Testmail mit Textvorschau im Reiter „Zugang"
  (Rückfrage, wenn die Adresse nicht das eigene Postfach ist) und die Protokolltabelle im
  Reiter „Protokoll".
  Test: `tests/newsletter-versand.test.js`, 26 von 26 bestanden.
  Bericht: `test-results/newsletter-versand.result.md`.
- **Aufteilung in Module** (2026-11-09): `haupt.js` verdrahtet nur noch, die Arbeit machen
  `tresor.js`, `zugang.js`, `mail.js`, `smtp.js`, `drossel.js` und `protokoll.js`. Siehe
  „Aufbau" für den Preis dieser Entscheidung.
- **Drossel** (2026-11-09): `drossel.js` mit rollierendem Stundenfenster, einstellbarem
  Budget (Voreinstellung 300, höchstens 500), Mindestabstand aus Budget und Fenster (bei
  300/h sind das 12 s) und Pause nach einem Limit-Fehler des Servers. Der Zustand liegt in
  den Plugin-Daten und übersteht einen Neustart — sonst wäre das Limit nach jedem
  Vendo-Start wieder leer. `mailSenden` fragt die Drossel vor jeder Mail; bei
  `450 … limit exceeded` wird automatisch pausiert. In der Oberfläche: Budget einstellen,
  Verbrauch der letzten Stunde, Pause von Hand beenden, dazu eine Versand-Kachel in der
  Übersicht.
  Test: `tests/newsletter-drossel.test.js`, 15 von 15 bestanden.
  Bericht: `test-results/newsletter-drossel.result.md`.
- **Warteschlange** (2026-11-09): `warteschlange.js` mit Schlüssel aus Kampagne und
  Empfänger (zweimal einreihen geht nicht), höchstens drei Versuchen mit 10 Minuten
  Wartezeit, 48 Stunden Verfallsfrist je Eintrag und Aufräumen nach einer Woche. Ein Takt in
  `haupt.js` arbeitet sie alle 15 Sekunden ab, so weit die Drossel es zulässt; der Zeitgeber
  startet genau einmal (Schutz im Modul-Scope). In der Oberfläche: Stand und die nächsten
  Einträge im Reiter „Protokoll", dazu „Offene abbrechen".
  Test: `tests/newsletter-warteschlange.test.js`, 19 von 19 bestanden.
- **Shopify-Kontakte** (2026-11-09): `shopify.js` holt die Abonnenten über GraphQL
  (`accepts_marketing:true`, Seitenwechsel, Rückfall wenn die API-Version das
  Zustimmungsfeld nicht kennt) und schreibt Abmeldungen mit
  `customerEmailMarketingConsentUpdate` zurück. Eigener Zugang im Plugin: Shop-Adresse und
  verschlüsselter Token, kein Griff in Hermes' Konfiguration.
  Test: `tests/newsletter-shopify.test.js`, 14 von 14 bestanden.
- **Kontaktverwaltung** (2026-11-09): `kontakte.js` führt den Bestand zusammen (**ein Sync
  hebt keine Sperre auf**), bestimmt den Empfängerkreis (**ohne Zustimmungsdatum ist niemand
  Empfänger**), sperrt, gibt frei, löscht vollständig und liest CSV (Trennzeichen und
  Spaltennamen werden erkannt). In der Oberfläche: Reiter „Kontakte" mit Shopify-Zugang,
  Sync, CSV-Feld, Suche und Liste mit Abmelden, Freigeben und Löschen.
  Test: `tests/newsletter-kontakte.test.js`, 20 von 20 bestanden.
  Berichte zu allen drei: `test-results/newsletter-warteschlange.result.md`,
  `newsletter-shopify.result.md`, `newsletter-kontakte.result.md`.
- **Kampagnen, Bausteine und `ctx.fragen`** (2026-11-09): `bausteine.js` baut das Mail-HTML
  aus geprüften Tabellen-Schnipseln (600 px, Inline-CSS, kein Flexbox, kein `<style>`), alle
  Inhalte maskiert, nur `http(s)`- und `mailto`-Links, Abmeldelink und Impressum immer im
  Fuß. `kampagnen.js` prüft, personalisiert ({{vorname}} und Co.), kennt den Zeitplan und
  verständigt sich mit der KI: Auftrag mit erlaubten Bausteinen, Antwort als JSON, alles
  Erfundene wird verworfen. In `haupt.js`: Kampagnen anlegen, speichern, Vorschau, Testmail,
  Start (Empfänger in die Warteschlange), Planen, Abbrechen, dazu Markenangaben.
  **Vendo-Kern erweitert:** `ctx.fragen(text)` gibt Plugins die Antwort von Luzzy als Text
  zurück — eigene Unterhaltung „Vendo Plugins“, nicht in der Zentrale sichtbar.
  Tests: `tests/newsletter-bausteine.test.js` (15) und `newsletter-kampagnen.test.js` (20),
  dazu alle bestehenden Plugin-Tests als Regressionsprüfung.
  Bericht: `test-results/newsletter-kampagnen.result.md`.

- **Automationen** (2026-11-09): `automationen.js` mit Zustandsmaschine — ein Lauf pro
  Ereignis (Schlüssel aus Automation und Ereignis-ID), Schritte mit eigener Wartezeit,
  Verfallsfenster je Schritt, Abbruch bei Bestellung, Abmeldung oder Abschalten, Prüfung der
  Zustimmung beim Start **und** kurz vor dem Versand. Auslöser in `shopify.js`:
  `abandonedCheckouts` (mit Posten, Summe und Wiederherstellungs-Link) und `orders` für den
  Abbruch. Fällige Schritte gehen in die Warteschlange, also durch die Drossel. Abfrage bei
  Shopify alle zehn Minuten, nicht im 15-Sekunden-Takt. Einschalten verweigert das Plugin,
  solange ein Schritt, das Impressum, der Abmeldeweg oder der Shopify-Zugang fehlt.
  Oberfläche: Reiter „Automationen" mit Schritt-Editor, Vorschau, Testmail und Ein/Aus.
  Tests: `tests/newsletter-automationen.test.js` (21), Shopify erweitert auf 21.
  Bericht: `test-results/newsletter-automationen.result.md`.

- **Erster Lauf in der echten App** (2026-11-09): Das Plugin wird geladen, der Zeitgeber
  startet **genau einmal** pro Start, alle sechs Reiter zeichnen mit Inhalt und Formularen,
  und in der Oberfläche trat **kein einziger Fehler** auf (kein `console.error`, kein
  `window.onerror`, keine unbehandelte Promise). **`ctx.fragen` funktioniert gegen das echte
  Hermes**: Antwort nach 6,0 Sekunden. Geprüft über Vendos Oberflächen-Testmodus mit
  `werkstatt/newsletter-pruef.mjs`.
  Dabei behoben: die Log-Ausgaben sind jetzt ASCII (die PowerShell zeigte `l├ñuft`).
  Bericht: `test-results/newsletter-app.result.md`.
- **Zustimmungs-Zustand von Shopify** (2026-11-09): Beim ersten echten Sync (820 Abonnenten)
  fiel auf, dass der Zustand der Adresse (`marketingState`) abgefragt, aber nicht gespeichert
  wurde. Damit war nicht nachprüfbar, ob `accepts_marketing:true` auch Adressen mit
  **offener Double-Opt-In-Bestätigung** (`PENDING`) mitliefert. Jetzt wird der Zustand
  gespeichert, überschrieben vom jeweils neuesten Sync, und **nur `SUBSCRIBED` zählt als
  Empfänger**. CSV-Importe tragen keinen Zustand und bleiben am Zustimmungsdatum gemessen.
  In der Oberfläche: Kachel „Bestätigung offen", Spalte „Zustand" in der Liste, und der
  Sync nennt die Zahlen im Klartext. Der Sync-Fehler wird außerdem ins Log geschrieben, nicht
  nur in die Oberfläche.
  Tests: `newsletter-kontakte.test.js` auf 24, `newsletter-shopify.test.js` auf 22 —
  **181 insgesamt**.
- **Logo im Kopf** (2026-11-09): Gemeldet, dass das Logo in der Testmail fehlt. Zwei Dinge
  dahinter. Erstens kein Fehler: die freie Testmail im Reiter „Zugang" schickt genau das, was
  im Feld steht — ohne Kopf, Fuß und Logo. Dafür gibt es jetzt den Knopf **„Beispielmail mit
  Logo an mich"** bei den Markenangaben, der eine Mail aus der Startvorlage mit Kopf, Logo
  und Fuß verschickt. Zweitens ein echter Fehler: der Editor speichert leere Bausteinfelder
  als leeren String, und `logo: ''` im Kopf-Baustein hat das Logo aus den Markenangaben
  verschluckt (`??` greift bei leerem String nicht). `bausteineSaeubern` lässt leere Felder
  jetzt weg, und `mailAus` fällt mit `||` auf die Marke zurück. Gegenprobe mit den echten
  Markenangaben: das Logo steht im HTML.
  Tests: `newsletter-bausteine.test.js` auf 18, `newsletter-kampagnen.test.js` auf 21 —
  **185 insgesamt**.
- **Testadresse** (2026-11-09): Testmails gingen fest an das Postfach — bei der Beispielmail,
  der Kampagnen-Testmail und der Automations-Testmail gab es dafür gar kein Feld, und das
  „An“-Feld der freien Testmail vergaß die Eingabe beim nächsten Neuzeichnen. Jetzt **merkt
  sich das „An“-Feld die Adresse** (`testAdresseMerken`, gespeichert als
  `zugang.testAdresse`), und alle vier Testwege nutzen sie. Die eigene Postfach-Adresse oder
  ein leeres Feld setzen auf das Postfach zurück. Geprüft wird wie bei den anderen Adressen
  (Form, kein Zeilenumbruch). Das Zugangsformular schickt das Feld nicht mit und löscht die
  gemerkte Adresse deshalb auch nicht. Die Rückfrage „nicht dein eigenes Postfach" kommt nur
  noch bei einer dritten Adresse.
  Zuerst stand das Feld oben im Zugangsformular — auf Rückmeldung dorthin verschoben, wo man
  die Adresse ohnehin eintippt.
  Tests: `newsletter-zugang.test.js` auf 29 — **195 insgesamt**.

**Gesamtstand der Tests: 176 in neun Dateien, alle bestanden, plus der App-Lauf.**

**Als Nächstes** — der Bauplan ist abgearbeitet. Was bleibt, braucht echte Zugangsdaten:

1. **Postfach eintragen** (Reiter „Zugang") → „Anmeldung prüfen" → Testmail an dich selbst.
   Damit sind DPAPI, IONOS-Anmeldung und der Versandweg belegt oder eben nicht.
2. **Marke füllen**: Impressum und Abmeldeadresse. Ohne beides lässt sich keine Kampagne
   starten und keine Automation einschalten.
3. **Shopify-Token** (Reiter „Kontakte") mit `read_customers`, `write_customers`,
   `read_orders` und der Freigabe für geschützte Kundendaten → „Kontakte jetzt holen".
4. **Eine Kampagne von Luzzy entwerfen lassen**, Vorschau ansehen, Testmail schicken und in
   Outlook, Gmail und auf dem Handy anschauen. Erst das belegt die Bausteine.
5. **SPF, DKIM und DMARC** für die Domain prüfen, bevor die erste echte Kampagne rausgeht.
6. **Offene Punkte** aus „Offene Entscheidungen", vor allem IMAP für Abmeldungen per Mail
   und Double-Opt-In. **Rückgewinnung** hat noch keinen Auslöser (siehe Phase 4).

**Noch nicht geprüft:** Das Plugin wurde in Vendo noch nicht geöffnet — dass der Bereich
erscheint, die Reiter umschalten und das Formular speichert, steht aus. Weil `haupt.js` neu
dazugekommen ist, muss Vendo einmal neu starten, sonst zeigt der Reiter „Zugang" nur den
Hinweis, dass der Hintergrundteil fehlt. Ebenfalls offen: die echte Anmeldung bei IONOS und
dass Windows auf diesem Rechner verschlüsseln kann.

## Ziel

E-Mail-Kampagnen und Automationen über ein IONOS-Postfach: Kontakte aus Shopify,
Kampagnen aus geprüften Bausteinen, Texte von der KI, Versand mit Drossel. Kein
Kontaktlimit, keine Abo-Kosten pro Empfänger.

**Nicht Teil des Ziels:** Öffnungs- und Klick-Tracking. Das braucht einen erreichbaren
HTTP-Endpunkt und kommt erst mit einem Serverbetrieb in Frage (siehe „Später: Server").
Erfolgsmessung läuft vorerst über UTM-Parameter und Shopify-Umsatz.

## Feste Grenzen

- **Hermes wird nicht verändert.** Das Plugin spricht selbst per SMTP mit IONOS und nutzt
  das Hermes-Plugin `ionos-mail` nicht. Beide senden unabhängig voneinander über dasselbe
  Postfach; SMTP ist zustandslos, es gibt keinen Konflikt.
- **Ein Postfach, zwei Zugänge im Code.** Das Plugin hat seinen eigenen Satz Zugangsdaten
  in Vendos Speicher. Es liest keine Hermes-Konfiguration.
- **Das Stundenlimit ist gemeinsam.** Es hängt am Postfach, nicht am Programm. Der Versand
  muss deshalb Luft für den Kundenservice lassen.
- **Zugangsdaten nie im Klartext.** Postfach-Passwort nur über Electron `safeStorage`
  (Windows-DPAPI). Ohne verfügbare Verschlüsselung wird nichts gespeichert.
- **Keine echten Kundendaten in Tests.** Fixtures sind synthetisch.

## Aufbau

```
plugins/newsletter/
  plugin.json        Beschreibung für Vendo
  ansicht.js         Oberfläche: Reiter und Bereiche
  stil.css           eigene Styles (Pflicht)
  haupt.js           verdrahtet nur: hält die Daten, treibt die Warteschlange an
  tresor.js          Passwort und Shopify-Token verschlüsselt ablegen (Windows-DPAPI)
  zugang.js          Zugangsdaten prüfen, Adressen kürzen
  mail.js            eine Mail aufbauen, Textteil ableiten
  smtp.js            Verbindung zu IONOS: anmelden, verschicken, Fehlertexte
  drossel.js         Stundenbudget, Mindestabstand, Pause bei Limit-Fehler
  warteschlange.js   Einträge, Idempotenz, Versuche, Verfall
  shopify.js         Abonnenten holen, Abmeldungen zurückschreiben
  kontakte.js        Bestand führen, zusammenführen, CSV lesen
  bausteine.js       HTML-Schnipsel und Zusammenbau der Mail
  kampagnen.js       prüfen, personalisieren, Zeitplan, KI-Auftrag und -Antwort
  automationen.js    Zustandsmaschine: Läufe, Schritte, Verfall, Abbruch
  protokoll.js       eine Zeile je Mail in Monatsdateien
  README.md          diese Datei
```

**Entschieden am 2026-11-09:** eigene Moduldateien statt einer großen `haupt.js` — eine
Datei pro Aufgabe, damit beim Bearbeiten klar ist, wo etwas steht. Vorher war alles in
`haupt.js`; das wurde zu unübersichtlich. **Keine Unterordner**, die lehnt die Prüfung
ebenfalls ab, und sie bringen bei dieser Dateizahl nichts.

**Preis dieser Entscheidung, bewusst in Kauf genommen:** Vendos Werkstatt-Prüfung kennt nur
`plugin.json`, `ansicht.js`, `stil.css`, `haupt.js`, `README.md` und `LIESMICH.md`. Sie
meldet für jede weitere Datei „gehört nicht in ein Plugin" und damit `stufe: fehler`. Das
betrifft nur dieses handgebaute Plugin (wie auch andere handgebaute hier) — Vendo selbst
lädt es unabhängig von der Prüfung.

**Wichtiger Nebeneffekt:** Die Prüfung erkennt Rechte nur aus `ansicht.js` und `haupt.js`
(`const code = ansicht + haupt` in `plugins/werkstatt/haupt.js`). Seit der Aufteilung sieht
sie `safeStorage` in `tresor.js` und das Dateischreiben in `protokoll.js` **nicht mehr** und
meldet beide Rechte nicht. Deshalb wäre es falsch, einfach die Liste der erlaubten Dateien
zu erweitern: ohne mitgezogene Mustererkennung würden von Luzzy gebaute Plugins ungeprüfte
Dateien mitbringen können. Hier ersetzen `node --check` auf jeder Datei und die Tests unter
`tests/newsletter-*.test.js` die verlorene Prüftiefe.

Die Bausteine für das Mail-HTML kommen später in eine eigene `bausteine.js`, nicht in einen
Unterordner.

**Abhängigkeit:** `nodemailer` (am 2026-11-09 zu `package.json` hinzugefügt). Begründung:
UTF-8-Betreffs, quoted-printable, Header-Kodierung und Anhänge selbst zu bauen ist eine
zuverlässige Fehlerquelle. `nodemailer` wird erst beim Aufruf geladen, nicht beim Start des
Plugins.

**Zwei Regeln, unabhängig von der Dateifrage:**

1. Der Versandteil weiß nichts über Kampagnen, Shopify oder Hermes. Nur „diese Mail,
   dieser Empfänger". So lässt sich IONOS später gegen einen Versanddienst tauschen, ohne
   den Rest anzufassen.
2. Der Hintergrundteil kommt ohne Electron-APIs aus. `safeStorage` wird nur über eine
   schmale Zwischenschicht angesprochen, die im Serverbetrieb anders arbeiten kann. Sonst
   muss beim Umzug der halbe Versandteil neu geschrieben werden.

**Fallstrick:** Vendo ruft die Aufbaufunktion von `haupt.js` bei jedem Laden der
Plugin-Liste erneut auf (`alleLaden()` in `src/main/plugins.js`), das Modul selbst bleibt
dabei im Cache. Ein `setInterval` ohne Schutz im Modul-Scope würde sich dadurch
vervielfachen und Mails doppelt senden. Zeitgeber genau einmal starten.

## Datenablage

Vendos Plugin-Speicher (`daten/plugins/newsletter.json`) hält die Stammdaten:

```
{
  "zugang":       { "benutzer", "passwortVerschluesselt", "absenderName", "antwortAn" },
  "kontakte":     [ { "email", "vorname", "nachname", "quelle", "zustimmungAm", "gesperrt", "shopifyId" } ],
  "vorlagen":     [ { "id", "name", "bausteine" } ],
  "kampagnen":    [ { "id", "name", "betreff", "vorschau", "bausteine", "zielgruppe", "geplantAm", "zustand" } ],
  "automationen": [ { "id", "name", "ausloeser", "schritte", "aktiv", "nurMitZustimmung" } ],
  "laeufe":       [ { "id", "kampagneId", "begonnenAm", "gesendet", "fehler", "zustand" } ]
}
```

**Wichtig:** Vendo lehnt Plugin-Daten über 5 MB ab. Das Versandprotokoll gehört deshalb
nicht in diese Datei, sondern als eine Zeile pro Mail in Monatsdateien unter
`daten/plugins/newsletter/protokoll-JJJJ-MM.ndjson`. Der Ordner liegt in `daten/` und ist
damit in der Sicherung und nicht in Git. In der JSON bleiben nur Zusammenfassungen.

## Phase 1: Fundament und Versand

Ziel: Eine Mail, die du selbst schreibst, geht an eine Handvoll Adressen raus.

- Plugin-Gerüst (`plugin.json`, Ansicht mit Reitern, `stil.css`) — **steht**.
- Zugangsdaten und Zugangsmaske: Anmeldeprüfung mit klarer Rückmeldung. Passwort über
  `safeStorage`, nie angezeigt, nie im Log — **steht**.
- Versand: Verbindung zu `smtp.ionos.de`, Port 465 (SSL/TLS) mit 587 (STARTTLS) als
  Rückfalloption. UTF-8-Betreff, HTML- und Textteil, `List-Unsubscribe`-Header — **steht**.
- Testversand an eine eigene Adresse, bevor eine Kampagne an die Liste darf — **steht**.
- Protokoll: Zeitpunkt, Empfänger gekürzt, Betreff, Ergebnis. Kein Mailtext — **steht**.
- Drossel: Stundenbudget mit Voreinstellung 300/h (Reserve für den Kundenservice), Pause
  und Wiederaufnahme bei `450 Mail send limit exceeded` — **steht**.
- Queue mit Idempotenzschlüssel je Kampagne und Empfänger: ein Eintrag wird höchstens
  einmal versendet, auch wenn Vendo zwischendurch neu startet — **steht**.

**Fertig, wenn:** Testversand kommt an, die Drossel hält das Budget ein, und ein Neustart
mitten im Versand führt nicht zu doppelten Mails. **Der Code steht, der Nachweis in der
laufenden App fehlt** — siehe „Stand".

## Phase 2: Kontakte aus Shopify

Ziel: Die Abonnentenliste pflegt sich selbst.

- GraphQL gegen die Admin-API (Token ist in Vendo vorhanden), Scope `read_customers`:

```graphql
query($cursor: String) {
  customers(first: 250, after: $cursor, query: "accepts_marketing:true") {
    pageInfo { hasNextPage endCursor }
    nodes { id email firstName lastName createdAt }
  }
}
```

  Das Feld für den Zustimmungsstatus beim Bauen gegen das aktuelle Schema prüfen:
  `emailMarketingConsent` ist als veraltet markiert. Der Filter `accepts_marketing:true`
  im `query`-Argument ist der verlässliche Weg.
- Zustimmung und Zeitpunkt pro Kontakt mitspeichern — das ist der Nachweis, wenn jemand
  fragt — **steht**.
- Abmeldung in beide Richtungen: lokal sperren **und** bei Shopify auf „nicht abonniert"
  setzen, sonst holt der nächste Sync die Person wieder herein — **steht**.
- CSV-Import für Adressen, die nicht aus dem Shop kommen, mit Hinweis bei fehlendem
  Zustimmungsdatum — **steht**.
- **Offen: Abmeldungen per Mail auslesen.** Der `List-Unsubscribe`-Header verweist auf eine
  `mailto:`-Adresse; die eingehenden Mails liest das Plugin noch nicht. Dafür braucht es
  einen IMAP-Zugriff und damit eine weitere Abhängigkeit — siehe „Offene Entscheidungen".
  Geplanter Weg: eine Filterregel bei IONOS sortiert sie in einen eigenen Ordner, den nur
  das Plugin liest, damit Vendos Wächter sie nicht als neue Kundenmails meldet.
- **Offen: Double-Opt-In** für Anmeldungen außerhalb von Shopify.

**Fertig, wenn:** Der Sync läuft ohne Doppelte und eine Abmeldung wirkt sofort und übersteht
den nächsten Sync.

## Phase 3: Kampagnen und KI

Ziel: Eine Kampagne entsteht in wenigen Minuten, ohne HTML von Hand.

- **Bausteine statt freies HTML** — **steht**. Kopf mit Logo, Titel, Textblock, Bild,
  Produktblock, Knopf, Trenner, Fuß mit Abmeldelink: feste Tabellen-Schnipsel mit
  Inline-CSS, 600 px, kein Flexbox, kein Grid, kein `<style>`-Block. Die KI bestimmt
  Reihenfolge und Inhalt, sie erfindet kein Markup.
  **Noch nicht in echten Mailprogrammen angesehen** — gebaut nach den bekannten Regeln für
  Outlook, aber der Nachweis fehlt, bis eine Testmail durch Outlook, Gmail und ein Handy
  gegangen ist.
- Vorlage = gespeicherte Bausteinfolge mit Platzhaltern. Noch offen: Vorlagen getrennt von
  Kampagnen speichern und wiederverwenden.
- Freies HTML gibt es als Testmail im Reiter „Zugang“ (mit Textteil-Vorschau). Ein Rohmodus
  für Kampagnen ist nicht gebaut: dort wären Abmeldelink und Impressum nicht erzwingbar.
- **Kernerweiterung in Vendo** (nicht Hermes): `ctx.fragen(text)` gibt Plugins die Antwort
  von Luzzy als Text zurück — **steht**. Eigene Unterhaltung „Vendo Plugins“ (Kanal `frage`
  in `src/main/hermes.js`), deren Ereignisse nicht an die Oberfläche gehen, damit weder das
  Gespräch noch der Crew-Tab mit Entwürfen volläuft. Immer nur eine Anfrage gleichzeitig,
  Zeitgrenze drei Minuten. Dokumentiert in `plugins/README.md`.
- Personalisierung: Vorname und Name — **steht**. Produktempfehlungen aus der Bestellhistorie: offen.
- Geplanter Versand mit Nachholen beim Start — **steht**: war Vendo zur geplanten Zeit aus,
  wird der Versand beim nächsten Start nachgeholt, solange der Zeitpunkt nicht länger als
  24 Stunden her ist. Danach wird die Kampagne wieder ein Entwurf, statt verspätet rauszugehen.

**Fertig, wenn:** Eine KI-erzeugte Kampagne sieht in Outlook, Gmail und auf dem Handy sauber
aus und der geplante Versand übersteht einen Neustart. **Der Code steht, beide Nachweise
fehlen** — sie brauchen die laufende App und echte Testmails.

## Phase 4: Automationen

Ziel: Willkommensserie und Warenkorbabbruch laufen ohne Zutun.

- Zustandsmaschine je Kontakt und Automation: Auslöser, Wartezeit, Schritt, Abbruchgrund.
  Abbruch, wenn der Zweck erfüllt ist (Bestellung eingegangen) oder der Kontakt sich
  abmeldet — **steht**.
- Verfallsfenster je Schritt: eine Warenkorb-Mail nach 48 Stunden nicht mehr senden —
  **steht**.
- Abgebrochene Warenkörbe über GraphQL, Scope `read_orders` — **steht** (ohne
  `variantTitle`, das ist nicht nötig):

```graphql
query($cursor: String, $filter: String!) {
  abandonedCheckouts(first: 50, after: $cursor, query: $filter) {
    pageInfo { hasNextPage endCursor }
    nodes {
      id createdAt abandonedCheckoutUrl
      totalPriceSet { shopMoney { amount currencyCode } }
      customer { id email firstName }
      lineItems(first: 20) { nodes { title quantity variantTitle } }
    }
  }
}
```

  `$filter` ist ein `created_at:>…`-Ausdruck. `abandonedCheckoutUrl` stellt den Warenkorb
  beim Kunden wieder her — damit wird die Mail erst nützlich. Beim Bauen prüfen, ob der
  Zugriff auf geschützte Kundendaten für die eigene App freigeschaltet ist.
- REST nicht verwenden: die REST-Admin-API ist seit Oktober 2024 Legacy. Abandoned Checkout
  war von der Checkout-Abschaltung im April 2025 ausgenommen, aber auf einem auslaufenden
  Weg wird nichts Neues gebaut.
- **Voreinstellung: nur an Kontakte mit Marketing-Zustimmung** — **steht**, geprüft beim
  Start eines Laufs und erneut kurz vor dem Versand. Eine Warenkorb-Mail ist Werbung, und
  ein abgebrochener Warenkorb ist kein Kauf, greift also nicht unter die
  Bestandskunden-Ausnahme in § 7 Abs. 3 UWG. Pro Automation umschaltbar, aber nicht
  stillschweigend.

**Bekannte Lücken:**

- **Gast-Checkouts** (ohne Kundenkonto) werden übersprungen, weil die Abfrage die Adresse
  nur über `customer.email` bekommt. Ob Shopify sie anders liefert, ist am echten Shop zu
  prüfen — sonst fehlt ein Teil der Abbrecher.
- **Gastbestellungen** brechen eine laufende Serie nicht ab, aus demselben Grund.
- **Rückgewinnung** ist als Art angelegt, hat aber keinen Auslöser: eine Abfrage „hat lange
  nichts gekauft" gibt es noch nicht. Die Automation lässt sich einschalten, wird aber von
  nichts in Gang gesetzt.

**Fertig, wenn:** Ein Testabbruch löst die Mail aus, eine Bestellung bricht die Serie ab,
und ein Neustart erzeugt keinen zweiten Versand. **Der Code steht, alle drei Nachweise
brauchen den echten Shop und die laufende App.**

## Pflichten, die mitgebaut werden

Kein Rechtsrat, aber ohne diese Punkte sollte nichts rausgehen:

- Double-Opt-In für Anmeldungen außerhalb von Shopify, mit Protokoll (Zeitpunkt, IP wenn
  verfügbar, Bestätigungszeitpunkt).
- Abmeldelink in jeder Mail, sichtbar, ein Klick ohne Rückfrage.
- Impressum und Anbieterangaben im Fuß jeder Mail.
- Löschfunktion: Kontakt vollständig entfernen, nicht nur sperren.

## Zustellbarkeit

Vor dem ersten echten Versand prüfen: SPF, DKIM und DMARC für die Domain. Ohne das landet
auch eine technisch perfekte Mail im Spam. Der Newsletter sendet von derselben Adresse wie
der Kundenservice und teilt sich dessen Reputation — Beschwerden treffen also beides. Wenn
das spürbar wird, ist eine eigene Subdomain über einen Versanddienst der Ausweg.

## Tests

Nach `AGENTS.md` bekommt jeder Bereich einen Test unter `tests/` und einen Bericht unter
`test-results/`. Bei Versandcode nicht verhandelbar: ein Fehler schickt echte Mails an echte
Kunden. Geplant:

- `tests/newsletter-versand.test.js` — MIME-Aufbau, Header, Fehlerbehandlung; SMTP gestubbt,
  **nie** ein echter Versand im Test.
- `tests/newsletter-drossel.test.js` — Budget, Reserve, Pause bei Limit-Fehler.
- `tests/newsletter-queue.test.js` — Idempotenz, Neustart mitten im Versand.
- `tests/newsletter-shopify.test.js` — Abfragen und Zuordnung gegen Fixtures in
  `tests/fixtures/newsletter/`, synthetisch.
- `tests/newsletter-automationen.test.js` — Zustandsübergänge, Verfallsfenster, Abbruch.
- `tests/newsletter-bausteine.test.js` — erzeugtes HTML enthält Abmeldelink und Impressum.

Tests mit konkretem Dateipfad starten, nicht per `node --test` über das ganze Projekt.

## Offene Entscheidungen

- **IMAP für Abmeldungen per Mail.** Damit eine Abmeldung über den
  `List-Unsubscribe`-Header von selbst wirkt, müsste das Plugin einen Mailordner lesen. Das
  wäre eine zweite Abhängigkeit (etwa `imapflow`) neben `nodemailer`. Solange die
  Entscheidung offen ist, werden Abmeldungen von Hand über die Kontaktliste gesperrt — die
  Mails landen ja im Postfach und sind dort sichtbar.
- **Geschützte Kundendaten bei Shopify.** Für Kundendaten verlangt Shopify eine Freigabe in
  der App-Konfiguration. Ob sie für den verwendeten Token vorliegt, zeigt der erste Sync.
- **Absenderadresse:** IONOS lehnt seit Januar 2024 Absender ab, die nicht zum angemeldeten
  Konto passen (`Sender address is not allowed`). Ob eine Alias-Adresse derselben Domain
  durchgeht, ist nicht offiziell dokumentiert — mit einem Testversand klären. Rückfall:
  Postfachadresse als Absender mit Anzeigename plus `Reply-To`.
- **Stundenbudget:** 300/h ist ein Startwert. Nach dem ersten großen Versand anpassen.
- **Geschützte Kundendaten bei Shopify:** Freischaltung für abgebrochene Warenkörbe prüfen.

## Später: Server

Wenn Vendo und Hermes auf einen Server ziehen, soll der Versandkern headless weiterlaufen
und die Vendo-Oberfläche nur noch Steuerpult sein. Dafür sorgen die zwei Regeln im Abschnitt
„Aufbau": kein Electron-API im Kern, Zugangsdaten hinter einer Zwischenschicht. Erst dann
werden Öffnungs- und Klick-Tracking und ein Anmeldeformular auf der Website sinnvoll, weil
es dann einen erreichbaren Endpunkt gibt.

## Quellen

- IONOS, Beschränkungen beim Versand von Massenmails (Stundenlimits nach Alter des
  Postfachs): <https://www.ionos.de/hilfe/e-mail/allgemeine-themen/welche-beschraenkungen-gibt-es-beim-versand-von-massenmails/>
- IONOS, Serverdaten für IMAP, POP3 und SMTP (deutsche Postfächer: `smtp.ionos.de` Port 465
  SSL/TLS, alternativ 587; `imap.ionos.de` Port 993):
  <https://www.ionos.de/hilfe/e-mail/allgemeine-themen/serverinformationen-fuer-imap-pop3-und-smtp/>
- Shopify, `abandonedCheckouts` (GraphQL Admin):
  <https://shopify.dev/docs/api/admin-graphql/latest/queries/abandonedCheckouts>
- Shopify, `Customer` (GraphQL Admin):
  <https://shopify.dev/docs/api/admin-graphql/latest/objects/Customer>
- Shopify, Abschaltung der Checkout-APIs zum 1. April 2025 (Abandoned Checkout ausgenommen):
  <https://shopify.dev/changelog/checkout-apis-will-be-shut-down-april-1-2025>
