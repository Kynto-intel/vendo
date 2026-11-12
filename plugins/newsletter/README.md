# Newsletter-Plugin

Kampagnen und Automationen über das eigene IONOS-Postfach. Diese Datei ist Stand und
Bauplan in einem: oben, was gebaut ist, darunter der Plan für den Rest.

Sie heißt `README.md`, weil Vendos Werkstatt-Prüfung in einem Plugin nur `plugin.json`,
`ansicht.js`, `stil.css`, `haupt.js`, `README.md` und `LIESMICH.md` als Dateinamen
zulässt — eine `PLAN.md` würde als Fehler gemeldet.

## Stand

Letzte Änderung: 2026-11-11

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
- **Abmeldungen per Mail** (2026-11-09): `imap.js` liest eingehende Abmeldungen aus einem
  Postfach-Ordner und sperrt die Adressen — lokal und bei Shopify, über denselben Weg wie die
  Kontaktliste. Nur ungelesene Mails, höchstens 200 pro Lauf, alle zehn Minuten im selben
  Rhythmus wie die Shopify-Auslöser. **Die INBOX bleibt in Ruhe**: geöffnet wird nur der
  eingestellte Ordner (Voreinstellung `Abmeldungen`), und wer doch `INBOX` einträgt, bekommt
  eine Warnung — dort zählt dann nur, was im Betreff nach einer Abmeldung aussieht.
  **Nichts wird gelöscht oder verschoben**, Verarbeitetes bekommt nur das Gelesen-Zeichen.
  Oberfläche: Block „Abmeldungen per Mail" im Reiter „Kontakte" mit Schalter, Ordner,
  Server, „Verbindung prüfen" und „Jetzt einlesen".
  Neue Abhängigkeit: `imapflow` (MIT, vor der Installation geprüft).
  **Einzurichten:** eine Filterregel bei IONOS, die Mails an die Abmeldeadresse in den
  Ordner legt.
  Tests: `tests/newsletter-imap.test.js` (17) — **212 insgesamt**.
  Bericht: `test-results/newsletter-imap.result.md`.
- **Abmeldungen bei Shopify übernehmen** (2026-11-09): Beim Nachdenken über einen
  Ein-Klick-Abmeldelink aufgefallen — wer sich **bei Shopify** abmeldet (im Shop-Konto, über
  eine Shopify-Mail oder eine andere App), blieb hier Empfänger. Der Sync holt nur
  Abonnenten; wer fehlt, wird jetzt lokal gesperrt (`abgemeldeteUebernehmen`). Nur bei einem
  **vollständigen** Abruf, sonst würde ein abgebrochener Durchgang halbe Listen sperren.
  Importierte Adressen und schon Gesperrte bleiben unberührt.
  Tests: `newsletter-kontakte.test.js` auf 28 — **216 insgesamt**.
- **Vorlagen** (2026-11-09): eigener Reiter „Vorlagen" mit Liste, Baustein-Editor, Vorschau
  und Testmail. Eine Vorlage ist eine gespeicherte Bausteinfolge mit Beispieltexten und
  Platzhaltern; **Anwenden kopiert** sie in eine Kampagne oder einen einzelnen
  Automationsschritt, die Vorlage selbst bleibt unverändert. Umgekehrt lässt sich aus einer
  Kampagne oder einem Schritt eine Vorlage sichern. Luzzy entwirft Vorlagen über `ctx.fragen`
  — mit einem eigenen Auftrag, der auf Form statt auf fertige Werbetexte zielt. Dadurch
  müssen nicht alle Mails gleich aussehen.
  Tests: `tests/newsletter-vorlagen.test.js` (15) — **231 insgesamt**.
- **HTML-Modus und mitlaufende Vorschau** (2026-11-10): Der Kampagnen-Editor besteht jetzt
  aus zwei Flächen: links **Code** mit Zeilennummern über die volle Höhe, rechts die Karte
  **E-Mail-Details** (An, Betreff, Vorschautext, Name, Von) und darunter die **Vorschau, die
  beim Tippen mitläuft** (Umschalter Rechner/Handy, Textteil ausklappbar). Zwei Wege zum
  Inhalt — **Bausteine** wie bisher oder **eigenes HTML**. Die Kampagnenliste füllt die
  Fläche, solange keine Kampagne offen ist; in der Kampagne führt „← Kampagnen" zurück.
  **Der Vorlagen-Reiter ist genauso gebaut** (Code links, Vorlagen-Details und Vorschau
  rechts) und kennt denselben HTML-Modus. Beim Anwenden wandert der Weg zum Inhalt mit: eine
  HTML-Vorlage stellt die Kampagne auf HTML um, eine Bausteine-Vorlage zurück. Für
  **Automationsschritte wird eine HTML-Vorlage abgelehnt** — die bauen aus Bausteinen.
  `html-mail.js` säubert das eingetippte HTML (Skripte, Rahmen, eingebettete Objekte,
  Formulare, `on…`-Attribute und alle Adressen außer `http(s)`, `mailto`, `tel`, `cid` und
  eingebetteten Bildern) und sagt in der Vorschau an, was es entfernt hat. Outlooks
  Bedingungskommentare bleiben stehen. Zwei Rahmen-Arten: in Vendos 600-px-Fläche legen
  (Voreinstellung) oder ein fremdes Dokument so lassen, wie es ist. **Der Fuß mit
  Abmeldelink und Impressum kommt in beiden Fällen dazu** — sonst baut `mail.js` keine
  Kampagnenmail. Platzhalter wirken auch im HTML und werden dabei maskiert. Dazu zwei
  Startpunkte („Bausteine übernehmen", „Beispiel einfügen"), Einrücken mit der
  Tabulatortaste und **Speichern von selbst** nach 1,2 Sekunden Tippruhe sowie beim
  Reiterwechsel. Der Modus hängt an der Kampagne; alte Kampagnen bleiben Bausteine.
  **Mail-Gerüst mitgehend gemacht** (aufgefallen in der Handy-Vorschau): die 600-px-Fläche
  stand als `width="600"` mit **prozentualer** Höchstbreite, die eine Tabelle in einer
  Tabellenzelle nicht ausrechnet — die Mail blieb in einem 390-px-Fenster 628 px breit und
  wurde abgeschnitten, auf jedem Telefon. Jetzt `width="100%"` mit `max-width:600px`, dazu
  eine feste Tabelle im Bedingungskommentar für Outlook. Nachgemessen bei 320, 390 und
  742 px: kein seitlicher Überlauf mehr.
  Nebenbei behoben: der Kampagnenname wurde beim Speichern nie mitgeschickt
  (`form.name` ist die Eigenschaft des Formulars, nicht das gleichnamige Feld). Und die
  Vorschau blieb weiß, weil ein `<iframe sandbox="">` mit leerem `srcdoc` ein später
  zugewiesenes `srcdoc` nicht nachlädt — der Rahmen wird jetzt ersetzt statt beschrieben.
  Bericht: `test-results/newsletter-html.result.md`.
- **Nur noch HTML, überall** (2026-11-11): Auf Wunsch ist der Baustein-Editor aus Kampagnen,
  Vorlagen **und Automationsschritten** verschwunden — kein Umschalter, keine Karten, kein
  zweiter Weg. Jede Mail ist ein Code-Feld mit Vorschau. Was bleibt und warum:
  - `bausteine.js` bleibt als **Werkzeug dahinter**: es baut das Mail-Gerüst, den Fuß mit
    Abmeldelink und Impressum, die Startmail, die neue Kampagnen und Vorlagen schon im
    Feld haben, und macht aus Luzzys Entwurf HTML.
  - **Luzzy schreibt weiter kein Markup.** Sie liefert geprüfte Bausteine als JSON, Vendo
    wandelt sie in Tabellen-HTML und legt es ins Code-Feld (das bisherige wird ersetzt —
    die Meldung sagt es). So bleibt der Schutz aus `bausteine.js`, ohne dass jemand
    Bausteine bedienen muss.
  - **Nichts geht verloren.** Gespeicherte Kampagnen, Vorlagen und Schritte, die noch kein
    `html` haben, werden beim Öffnen, Prüfen und Versenden aus ihren Bausteinen gebaut
    (`htmlVon`). Gelöscht wird nichts; beim nächsten Speichern steht das HTML im Feld.
  - Vorlagen gelten jetzt auch für Automationsschritte ohne Einschränkung.
  Tests angepasst: `newsletter-html.test.js` (35), `newsletter-kampagnen.test.js` (23),
  `newsletter-vorlagen.test.js` (17) — **270 insgesamt**.

- **Bots bereiten vor, Felix gibt frei** (2026-11-11): Bisher konnte kein Hermes-Bot das
  Plugin nutzen. Jetzt hat die Newsletter-Texterin (Profil `vala-newsletter-texterin-bot`)
  ein eigenes Werkzeug — und nur sie. Die Regeln stehen fest in `bots.js`:
  - **Ein Bot darf (Stand 2026-11-11, abends):** alles im Plugin außer versenden —
    Überblick und **Auswertung** (Versand, Fehler, Warteschlange, Stundenbudget,
    Kontaktentwicklung je Monat, Läufe je Automation; Öffnungen und Klicks misst Vendo
    nicht und sagt das), Kampagnen-Entwürfe anlegen, ändern, kopieren, löschen, Vorlagen
    anlegen, ändern, aus Kampagnen machen, löschen, **Automationen anlegen und komplett
    bauen** (Schritte, Wartezeiten, Texte) und löschen, solange sie aus sind, die Marke
    pflegen (Name, Logo, Farben), Kontakte bei Shopify abgleichen, Kampagnen **zur
    Freigabe** geben und Automationsschritte als Probe an Felix schicken.
  - **Nur Felix:** an Empfänger senden, planen, starten, eine Automation einschalten,
    Impressum und Abmeldeadresse, Postfach, Stundenbudget, einzelne Kontakte (der Bot
    sieht nur Zahlen). Für nichts davon gibt es eine Aktion; unbekannte Aktionen und
    Felder werden abgelehnt.
  - **Sperre gegen erfundene Platzhalter:** Vendo ersetzt nur `{{vorname}}`,
    `{{nachname}}`, `{{name}}`, `{{email}}` (beim Warenkorb dazu `{{warenkorb}}`,
    `{{warenkorbLink}}`, `{{summe}}`). Alles andere in `{{ }}` und Bilder ohne
    https-Adresse sperren Freigabe, Planen, Senden und das Einschalten einer Automation —
    für Bots wie für Felix. Anlass: Valas erster Entwurf hatte 15 erfundene Platzhalter
    wie `{{headline}}`, auch in Betreff und Vorschautext. Ein Kampagnen-Entwurf vom Bot
    braucht außerdem echten Betreff und Vorschautext.
  - **Sofort sichtbar:** Vendo fragt alle drei Sekunden, ob ein Bot etwas geändert hat, und
    zeigt es ohne Klick. Bearbeitet Felix gerade genau das Geänderte, erscheint stattdessen
    ein Hinweis mit „Neu laden“ — sein Code-Feld wird nicht unter ihm neu aufgebaut.
  - **Bilder von Shopify in der Vorschau:** Vendos Sicherheitsregel
    (`src/renderer/index.html`) erlaubt jetzt Bilder von `https://cdn.shopify.com`;
    andere Adressen bleiben gesperrt. Vorher zeigte die Vorschau gar keine Bilder aus dem
    Netz, auch nicht das Logo.
  - **Freigabe:** `kampagne_zur_freigabe` schickt Felix die Mail als Testmail mit gelbem
    Hinweis obendrauf und setzt den neuen Zustand **„wartet auf Freigabe“**. Gesendet wird
    aus diesem Zustand nie. In Vendo erscheint die Kampagne mit „Freigeben und planen“
    (Termin vorbelegt) und „Zurück in den Entwurf“; Vendo meldet neue Freigaben auch, wenn
    der Bereich nicht offen ist. Ändert der Bot danach etwas, ist die Freigabe zurückgezogen.
  - **Weg:** Der Bot legt Auftragsdateien in `daten/plugins/newsletter/eingang/`, Vendo
    arbeitet sie jede Sekunde ab und legt die Antwort daneben. So bleibt Vendo der einzige
    Schreiber von `newsletter.json` — dort liegen auch Kontakte und Warteschlange, die
    Vendo laufend selbst schreibt. Ohne laufendes Vendo zieht der Bot seinen Auftrag nach
    30 Sekunden zurück, statt dass er später überraschend ausgeführt wird.
  - **Auf Hermes-Seite** (außerhalb dieses Repos, im Profil der Texterin): das Hermes-Plugin
    `plugins\vendo-newsletter` (Werkzeug `vendo_newsletter`, Muster wie `vendo-planer`) und
    der Skill `skills\email\vendo-newsletter` mit den Regeln für Mail-HTML und dem Ablauf.
    In der `config.yaml` des Profils drei Zeilen zum Freischalten (cli und telegram),
    Sicherung `config.yaml.vor-vendo-newsletter-20261111.bak` daneben. Hermes selbst ist
    unverändert, die anderen Bots haben keinen Zugriff.
  - Nebenbei: Vendo zeichnet den Bereich beim minütlichen Nachladen nicht mehr neu, wenn
    ein Editor offen ist — sonst sprang mitten im Tippen der Cursor weg.
  Tests: `tests/newsletter-bots.test.js` (25) — **295 insgesamt**.
  Bericht: `test-results/newsletter-bots.result.md`.

- **Nur echte Shop-Adressen, echte Vorlagen** (2026-11-11, nachts): Felix' Regel: jeder
  Link in einer Mail ist eine echte Adresse aus seinem Shop.
  - **Shop-Adresse:** Vendo liest die öffentliche Adresse aus der Weiterleitung der
    myshopify-Adresse (kein Zugang nötig) und merkt sie sich in den Plugin-Daten.
  - **Fertige Adressen für den Bot:** `shop_produkte` liest die öffentlichen Listen des
    Shops (`/products.json`, `/collections.json`) und gibt Titel, Preis, Verfügbarkeit,
    Bild und die fertige Produkt- bzw. Sammlungsadresse zurück, auf Wunsch gefiltert
    (`suche`). Der Bot setzt keine Adresse selbst zusammen.
  - **Prüfung vor der Freigabe** (`shoplinks.js`): Links nur auf den eigenen Shop (mit und
    ohne `www`, dazu die myshopify-Adresse), Bilder dazu von `cdn.shopify.com`. Danach
    fragt Vendo jede Adresse ab: eine erfundene Produktseite (404) sperrt die Freigabe.
    Ergebnisse werden zehn Minuten gemerkt, höchstens fünf Abrufe gleichzeitig, Frist acht
    Sekunden. `links_pruefen` zeigt dem Bot vorab jede unechte Adresse mit Grund. Ohne
    bekannte Shop-Adresse gibt es keine Freigabe.
  - **Netzzugriff:** dafür fragt Vendo nur den eigenen Shop ab, nichts sonst.
  - **Vorlagen sind Vorlagen:** jede Stelle, die pro Kampagne neu geschrieben wird, trägt
    `data-feld="name"` (optional `data-feld-hinweis`). Eine Vorlage vom Bot ohne Felder ist
    eine fertige Mail und wird abgelehnt. Auch Luzzys Vorlagen-Entwürfe bekommen Felder.
    Der Bereich zeigt die Felder einer Vorlage als Marken an.
  - **Kampagne aus einer Vorlage:** die Kampagne merkt sich die Vorlage und ihren
    Beispielinhalt. Bleibt Beispieltext oder ein Beispielbild stehen, ist die Freigabe
    gesperrt, mit Name des Feldes. Der Skill verlangt, die ganze Vorlage auszufüllen und
    zu verbessern, nicht nur das Nötigste.
  - **Vorschaubilder:** im Reiter „Vorlagen“ zeigt jede Karte den oberen Ausschnitt der
    gerenderten Vorlage.
  - Valas Werkzeug hat jetzt 25 Aktionen; Sicherung der vorigen Fassung im Profil daneben.
  Tests: `tests/newsletter-bots.test.js` (32) — **302 insgesamt**.
  Bericht: `test-results/newsletter-bots.result.md` (Nachtrag).

- **Name in Testmails, Markierungen raus** (2026-11-11, nachts): Im Reiter „Zugang“ lässt sich
  ein Vorname und Nachname für Testmails eintragen. Vendo setzt ihn in allen Testmails und
  Vorschauen ohne echten Empfänger für {{vorname}}, {{nachname}} und {{name}} ein, auch in der
  Testmail zur Freigabe; leer steht dort sichtbar „Vorname“. Die Feld-Markierungen einer
  Vorlage (data-feld, data-feld-hinweis) bleiben im Editor, werden aber aus jeder Mail entfernt.
  Tests: newsletter-zugang.test.js (32), newsletter-html.test.js (36) — **306 insgesamt**.
  Bericht: test-results/newsletter-zugang.result.md (Nachtrag).

- **Vollständiger Fuß aus dem Reiter „Zugang"** (2026-11-11): Der Fuß hatte nur Abmeldelink
  und Impressumtext. Jetzt stehen im Reiter „Zugang", Abschnitt „Marke und Pflichtangaben",
  die Fußangaben als reine Adressfelder: Impressum-, Datenschutz- und AGB-Adresse, pro
  Netzwerk (Instagram, Facebook, TikTok, Pinterest, YouTube, X, WhatsApp) die Profil-Adresse
  und optional ein eigenes Icon-Bild, Logo im Fuß mit Breite, dazu der Text des Abmeldelinks.
  Vendo baut daraus den Fuß und hängt ihn an **jede** Mail — Kampagne, Automation, Vorlage,
  Testmail, Bausteine wie freies HTML, mit und ohne Vendo-Rahmen. Reihenfolge: Logo, Icons,
  „Impressum | Datenschutzerklärung | AGB", Impressumtext, ganz unten mittig „ABMELDEN".
  Gespeichert wird in `marke.fuss`; die Listen der Netzwerke und Pflichtlinks stehen nur in
  `bausteine.js` (`NETZWERKE`, `RECHTSLINKS`), die Oberfläche baut ihre Felder daraus.
  Nur `https`-Adressen kommen durch, Verworfenes wird beim Speichern benannt statt verschluckt.
  Ein Netzwerk ohne eigenes Icon-Bild bekommt ein Kästchen mit Kürzel aus Tabelle und Text —
  SVG und eingebettete `data:`-Bilder werfen Gmail und Outlook weg. Ein `markeSpeichern` ohne
  `fuss` (so ruft die Bot-Aktion `marke_aendern` auf) lässt die Fußangaben stehen.
  Tests: newsletter-fuss.test.js (26).
  Bericht: test-results/newsletter-fuss.result.md.

- **Echte Social-Icons, mit der Mail mitgeschickt** (2026-11-11): Erst zeichnete Vendo die
  Icons selbst — das sah nicht gut genug aus. Jetzt liegen die Bilder als PNG in
  `plugins/newsletter/social media icons`, und `icons.js` liest sie beim Start einmal ein,
  verkleinert sie auf 56 px, legt sie mittig in ein Quadrat (die Vorlagen haben
  unterschiedliche Seitenverhältnisse, im Fuß stehen sie trotzdem gleich hoch) und schickt
  sie als eingebettetes Bild mit der Mail (`cid:`). Alle vier zusammen wiegen rund 1,9 kB
  pro Mail statt 380 kB roh. Eine einfarbige Vorlage bekommt die Schriftfarbe des Fußes —
  die Bilder sind weiße Silhouetten und wären auf einem hellen Fuß sonst unsichtbar; ein
  mehrfarbiges Bild bleibt, wie es ist. Der Dateiname darf sich verschreiben: `Faceboook.png`
  findet `facebook`, weil doppelte Buchstaben beim Vergleich zusammengezogen werden.
  Angeboten werden die vier Netzwerke, zu denen es ein Bild gibt (Instagram, Facebook,
  Pinterest, TikTok); ein Test hält `NETZWERKE` und die Bilddateien zusammen. Eine eigene
  Icon-Adresse hat weiter Vorrang. `mail.js` hängt nur an, worauf das HTML auch zeigt; für
  die Vorschau im Fenster tauscht `icons.alsDatenAdressen` `cid:` gegen `data:` — jede
  Stelle, die Mail-HTML an die Oberfläche gibt, geht durch `fuerAnsicht` in `haupt.js`, und
  ein Test hält das fest. Dazu nach dem Bild von Felix: Überschrift „FOLGE UNS HIER“ über
  den Icons, eine freie Zeile unter dem Impressum (etwa „Alle Preise inkl. MwSt. und zzgl.
  Versandkosten“) und eigene Fußfarben (Grund, Schrift, Abmeldelink) — mit eigenem Grund
  entfällt die Trennlinie, die Farbe trennt. Tests: newsletter-fuss.test.js (44).
  Bericht: test-results/newsletter-fuss.result.md.

- **Impressum fließt im Fuß** (2026-11-11): Jede eingetippte Zeile stand im Fuß untereinander
  und stapelte das Impressum zu einem Block. Jetzt werden die Zeilen eines Absatzes mit
  „ | “ verbunden und brechen von selbst um, wie in Shop-Fußzeilen üblich; eine freie Zeile
  im Feld erzwingt weiterhin einen festen Umbruch, ein schon getipptes „|“ am Zeilenende
  wird nicht verdoppelt. Dazu richtig gestellt: die drei Farbfelder im Reiter „Zugang“
  standen als Zeile statt als Spalte, weil `.nl-fuss-farben label` nicht von der
  Spalten-Regel in `stil.css` erfasst war — Eingabefeld und Hinweistext liefen ineinander.
  Tests: newsletter-fuss.test.js (48).
  Bericht: test-results/newsletter-fuss.result.md.

- **Kopf automatisch, Größen einstellbar** (2026-11-11): Der Auftrag an die KI sagte seit je
  „Kopf und Fuß der Mail werden automatisch ergänzt, lass sie weg“ — gestimmt hat das nur
  für den Fuß. Jetzt setzt `kopfZeile` aus `bausteine.js` den Kopf aus `marke.kopf` vor jede
  Mail: im Baustein-Weg (`mailAus`) und im HTML-Modus mit Vendo-Rahmen (`mailAusHtml`).
  Ohne Rahmen bleibt es beim Fuß allein — ein fremdes Mailing bringt seinen eigenen Kopf mit.
  Einstellbar im Reiter „Zugang“: Kopf an/aus, eigene Logo-Adresse (leer = Logo der Marke),
  Breite 40–560 px (Standard 180), Grund und Schriftzugfarbe. Ohne Logo steht der Name als
  Schriftzug, ohne beides bleibt der Kopf ganz weg statt eine leere Fläche zu zeigen.
  Damit nichts doppelt steht: `startVorlageHtml` enthält kein Logo mehr, `startVorlage` kein
  `kopf`-Baustein, und `zeilenAus` überspringt `kopf` wie schon `fuss` — eine ältere Liste
  mit Kopf darin ergibt also kein zweites Logo. Eine Baustein-Liste mit eigenem `kopf`
  bekommt in `mailAus` keinen zweiten davor. Dazu ist die Größe der Social-Icons einstellbar
  (`fuss.iconBreite`, 14–40 px) und der Standard von 28 auf 22 px gesenkt.
  Tests: newsletter-fuss.test.js (59) — **365 insgesamt**.
  Bericht: test-results/newsletter-fuss.result.md.
  Nachgezogen: Die Aufträge an die KI in `kampagnen.js` und `vorlagen.js` nennen das Logo
  jetzt ausdrücklich („Kopf mit Logo und Fuß der Mail setzt Vendo selbst davor und
  dahinter — lass beides weg"). Dieselbe Regel steht im Hermes-Plugin `vendo-newsletter`
  im Profil des Newsletter-Bots; dort stand in der Adressen-Regel noch „Logo: ueberblick →
  marke.logo", was die KI gerade dazu eingeladen hat, es ins HTML zu schreiben. Vor der
  Änderung wurde eine Sicherung angelegt
  (`__init__.py.vor-automatischem-kopf-20261111.bak`). Hermes-Programmcode selbst bleibt
  unberührt.

- **Kacheln exakt gleich, Anweisungen an die KI nachgezogen** (2026-11-11): Die Zahlen-Kacheln
  in Übersicht, Kontakten und Automationen waren unterschiedlich hoch, weil lange Hinweise
  umbrachen — eine Postfach-Adresse riss sogar mitten im Wort (`overflow-wrap: anywhere`).
  Jetzt baut ein gemeinsames `kachel()` in `ansicht.js` jede Kachel, und `stil.css` gibt den
  drei Zeilen feste Höhen (12 / 30 / 16 px) mit `white-space: nowrap` und Auslassungspunkten:
  jede Kachel ist 88 px hoch, egal was drinsteht, und der volle Text steht im `title`. Das
  Raster der Übersicht bricht statt starrer sechs Spalten jetzt um
  (`repeat(auto-fit, minmax(140px, 1fr))`), die Hinweistexte sind gekürzt. Die Übersicht
  zeigt außerdem nur noch fünf Kacheln: die Empfängerzahl stand doppelt (im Reiter
  „Kontakte“ mit den Zahlen daneben, die sie erklären) und rutschte als sechste allein in
  eine zweite Reihe. Nachgemessen im Browser von 800 bis 1400 px: überall 88 px, eine
  Reihe je Abschnitt, nichts abgeschnitten. Die Reiter stehen außerdem in der Reihenfolge,
  in der gearbeitet wird: „Automationen" vor „Vorlagen". `BEREICHE` in `ansicht.js` ist die
  einzige Stelle dafür; an der Reihenfolge hängt sonst nichts (der Startreiter steht als
  Kennung da, nicht als Nummer).
  Dazu die Anweisungen an die KI: der Skill `vendo-newsletter` im Profil des Newsletter-Bots
  ließ die Vorlage mit einem Logo-Block beginnen (`data-feld="logo"`) und nannte
  `marke.logo` als Quelle — beides raus, der Standard-Aufbau fängt jetzt beim Hero-Bild an.
  Dasselbe im Hermes-Plugin `vendo-newsletter`. Beide vorher gesichert
  (`*.vor-automatischem-kopf-20261111.bak`). Der Vertrag des Plugins wurde gegen
  `bots.js` geprüft: Aktionen, Felder und die Liste der langsamen Aktionen sind
  deckungsgleich, der Systemprompt bleibt mit 3520 Zeichen unter der Grenze von 4000.

- **Meistverkaufte Produkte** (2026-11-11): Die KI musste bisher raten oder sich durch 280
  Produkte suchen, welche in eine Verkaufsmail gehören. Jetzt zählt `bestsellerHolen` in
  `shopify.js` die Posten aus Felix' Bestellungen (Stückzahlen, nicht Bestellungen),
  `shoplinks.rennerVerbinden` hängt Adresse, Bild, Preis und Vergleichspreis aus der
  öffentlichen Produktliste an, und `haupt.js` hält das Ergebnis höchstens 20 Stunden lang —
  die Bestellabfrage ist langsam und zählt auf Shopifys Kontingent. In der Übersicht steht
  die Liste unter den Kacheln, mit Knopf „Neu holen"; der Bot holt sie mit der neuen Aktion
  `shop_bestseller` (Feld `tage`, 7 bis 365, Standard 30) und bekommt fünf fertige Produkte
  statt eines Katalogs. Gegen einen eigenen Shopify-Zugang für den Bot sprach, dass der
  Token schon in Vendo liegt und der Bot damit auch an Kundendaten käme, die er heute
  bewusst nicht sieht. **Meist angeklickte Produkte gibt es nicht** — Vendo misst keine
  Klicks, das bräuchte einen erreichbaren Server (siehe „Nicht Teil des Ziels").
  Fehlt dem Token das Recht für `product { handle }`, fällt die Abfrage auf die schlanke
  Fassung zurück und ordnet über den Titel zu — derselbe Mechanismus wie bei den
  Warenkörben.

- **Warenkorb-Renner dazu** (2026-11-12): Dieselbe Rangliste über abgebrochene Warenkörbe —
  was Leute hineinlegen und liegen lassen, ist der bessere Aufhänger für eine
  Rückhol-Mail als die Bestseller. Beide Listen teilen sich jetzt die Mechanik:
  `rangliste()` in `shopify.js` blättert und zählt, `rennerSichern(art)` in `haupt.js`
  speichert; unterschiedlich sind nur die Abfragen. Die Warenkorb-Abfrage holt **kein
  einziges Kundenfeld** (nur `lineItems`), rührt also keine geschützten Kundendaten an —
  anders als `warenkoerbeHolen`, das anschreibt und die Adresse braucht. In der Übersicht
  stehen beide Listen nebeneinander; was aus dem Shop genommen wurde, bleibt
  durchgestrichen sichtbar, kommt aber nicht in eine Mail. Bot-Aktion: `shop_warenkorb`.
  Tests: newsletter-renner.test.js (20) — **389 insgesamt**.
  Bericht: test-results/newsletter-renner.result.md.

- **Erfundene Rabatte und doppelte Bilder werden geprüft** (2026-11-12): Die erste Vorlage,
  die Vala mit den neuen Bausteinen baute, trug zwei durchgestrichene Preise, die es im
  Shop nicht gibt (von 280 Produkten hat genau eines einen Vergleichspreis), dasselbe
  Shirt-Foto dreimal und viermal denselben schwarzen Hoodie. `shoplinks.erfundenePreise`
  hält jeden Streichpreis gegen die echten Vergleichspreise und **sperrt die Freigabe** —
  ein erfundener Streichpreis ist irreführende Werbung, dieselbe Klasse wie eine erfundene
  Produktadresse. `shoplinks.doppelteBilder` meldet mehrfach verwendete Bilder als Hinweis
  (ohne Abfrageteil verglichen, `?v=…` ist dieselbe Datei). Die drei übrigen Befunde
  (gleiches Kleidungsstück, Rückansichten, Produktfoto als Sammlungsband) ließen sich nicht
  ohne Fehlalarme messen und stehen als Regeln im Skill. Dort wurde auch nachgebessert, was
  die Vorlage erst möglich machte: die Zieltabelle ohne eigenes `max-width`, das
  Rabatt-Abzeichen ohne `data-feld` (ein Feld, das man leeren soll, bleibt stehen) und ein
  Abschnitt über Abwechslung.

- **Halbfertige Gerüste fallen auf** (2026-11-12): Die nächste Vorlage zeigte kaputte
  Bildsymbole statt Produktbildern. Gemessen, dass der Bot die Daten sehr wohl bekommt
  (30 Produkte, alle mit Bild, 17 kB — weit unter der Kürzungsgrenze); die KI hatte sie
  nicht abgefragt. Zwei Lücken ließen das bis in die Vorschau durch: `bilderOhneAdresse`
  sah nur Bilder an, die überhaupt ein `src` hatten — ein `<img alt="Produkt 1" />` ohne
  Adresse kam ungeprüft durch; und für Links gab es gar keine Prüfung, ein `<a>ANSEHEN</a>`
  ohne Ziel wurde in einer Kampagne zum toten Knopf. Beides prüft jetzt `kampagnePruefen`
  und `vorlagePruefen` (`bilderOhneAdresse` erweitert, `linksOhneZiel` neu).
  Tests: newsletter-mailpruefung.test.js (24) — **413 insgesamt**.
  Bericht: test-results/newsletter-mailpruefung.result.md.

- **Bestseller schon im `ueberblick` des Bots** (2026-11-12): Der Bot musste sie bisher
  mit einem zweiten Aufruf holen und baute stattdessen Gerüste mit erfundenen Produkten.
  Jetzt trägt `ueberblick` — der erste Aufruf jedes Bots — die fünf Produkte mit Adresse,
  Bild und Preis gleich mit, dieselben, die Felix in seiner Übersicht sieht. Ausverkauftes
  und aus dem Shop Genommenes ist aussortiert. Ist die Liste leer, sagt der Antworttext,
  was zu tun ist. Tests: newsletter-renner.test.js (22) — **415 insgesamt**.
  Bericht: test-results/newsletter-renner.result.md.

**Gesamtstand der Tests: 415 in siebzehn Dateien, alle bestanden, plus der App-Lauf.**

**Als Nächstes** — der Bauplan ist abgearbeitet. Was bleibt, braucht echte Zugangsdaten:

1. **Postfach eintragen** (Reiter „Zugang") → „Anmeldung prüfen" → Testmail an dich selbst.
   Damit sind DPAPI, IONOS-Anmeldung und der Versandweg belegt oder eben nicht.
2. **Marke füllen**: Impressum und Abmeldeadresse. Ohne beides lässt sich keine Kampagne
   starten und keine Automation einschalten. Im selben Abschnitt die Fußangaben: Adressen
   für Impressum, Datenschutzerklärung und AGB, die Profil-Adressen der Netzwerke (die Icons
   bringt Vendo mit), die Überschrift darüber, eine freie Zeile unter dem Impressum, die
   Fußfarben und, wenn gewünscht, ein eigenes Logo für den Fuß.
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
  imap.js            Abmeldungen aus einem Postfach-Ordner lesen
  shopify.js         Abonnenten holen, Abmeldungen zurückschreiben
  kontakte.js        Bestand führen, zusammenführen, CSV lesen
  bausteine.js       HTML-Schnipsel und Zusammenbau der Mail
  kampagnen.js       prüfen, personalisieren, Zeitplan, KI-Auftrag und -Antwort
  vorlagen.js        wiederverwendbare Bausteinfolgen, eigener KI-Auftrag
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
- Abmeldungen per Mail auslesen — **steht** (`imap.js`): eine Filterregel bei IONOS sortiert
  sie in einen eigenen Ordner, den nur das Plugin liest, damit Vendos Wächter sie nicht als
  neue Kundenmails meldet. Verarbeitetes wird nur als gelesen markiert, nie gelöscht.
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
- Vorlage = gespeicherte Bausteinfolge mit Platzhaltern — **steht**: eigener Reiter,
  anwendbar auf Kampagnen und auf einzelne Automationsschritte, Entwurf durch Luzzy möglich.
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

- **Absenderadresse:** IONOS lehnt seit Januar 2024 Absender ab, die nicht zum angemeldeten
  Konto passen (`Sender address is not allowed`). Ob eine Alias-Adresse derselben Domain
  durchgeht, ist nicht offiziell dokumentiert — mit einem Testversand klären. Rückfall:
  Postfachadresse als Absender mit Anzeigename plus `Reply-To`.
- **Stundenbudget:** 300/h ist ein Startwert. Nach dem ersten großen Versand anpassen.
- **Geschützte Kundendaten bei Shopify:** für den Kontakt-Sync erledigt (820 Abonnenten kamen
  an). Ob die Freigabe auch für abgebrochene Warenkörbe reicht, zeigt der erste Abruf.
- **Double-Opt-In** für Anmeldungen außerhalb von Shopify ist weiterhin nicht gebaut.
- **Rückgewinnung** hat weiterhin keinen Auslöser.

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
