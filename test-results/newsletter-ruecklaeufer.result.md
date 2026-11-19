# Newsletter-Plugin: Rückläufer und Beschwerden

**Datum:** 2026-11-16
**Plugin:** `newsletter`
**Gegenstand:** Review-Befund S1 in `docs/newsletter-review.md`. Neu `plugins/newsletter/ruecklaeufer.js`
(Rückmeldungen lesen, einordnen, auf Kontakte anwenden), in `imap.js` `ruecklaeuferHolen` und
`rueckEinstellungenPruefen`, in `haupt.js` `ruecklaeuferLesen`, `ruecklaeuferEinstellen`,
`ruecklaeuferVerbindungPruefen`, `ruecklaeuferPruefen`, der Abruf im Zehn-Minuten-Takt und eine
Sperrprüfung direkt vor jedem Versand (`schritt`), in `warteschlange.js` `ueberspringen`, in
`kontakte.js` `sperrArt` beim Freigeben und eine Zahl in `stand`, in `ergebnisse.js` der
Ausschluss von Rückläufern aus den Abmeldungen nach Versand, in `ansicht.js` der Abschnitt
„Rückläufer per Mail“ im Reiter „Kontakte“.

**Testbefehle:**

```
node --test tests/newsletter-ruecklaeufer.test.js
node --test tests/newsletter-ladefehler.test.js
```

**Fixtures:** `tests/fixtures/newsletter/ruecklaeufer/` mit acht erfundenen Rückmeldungen:

| Datei | Form | erwartet |
| --- | --- | --- |
| `dsn-hart.eml` | Zustellbericht, 5.1.1, gefaltete Kopfzeile | tot → sperren |
| `dsn-verzoegert-base64.eml` | Zustellbericht base64-kodiert, `Action: delayed`, 4.4.7 | vorübergehend → zählen |
| `dsn-mehrere-qp.eml` | Zustellbericht quoted-printable, vier Empfänger: 5.2.2, 5.7.1, 5.0.0 mit „does not exist“, 2.0.0 | voll → zählen, Spamverdacht → zählen, tot → sperren, zugestellt → nichts |
| `arf-beschwerde.eml` | Beschwerde nach RFC 5965, Empfänger nur in der Originalmail | Beschwerde → sperren |
| `klartext-hart.eml` | Klartext, Originalmail hinter Trennzeile, „550“ auch im Originaltext | tot → sperren, der Originaltext zählt nicht |
| `klartext-kopfzeile.eml` | Klartext mit `X-Failed-Recipients`, 554 ohne eindeutigen Grund | abgelehnt → zählen |
| `abwesenheit.eml` | Abwesenheitsnotiz | keine Rückmeldung |
| `eigene-adresse.eml` | Zustellbericht für die eigene Abmeldeadresse | nie sperren |

Alle Adressen liegen unter `.invalid`, die IP stammt aus dem Dokumentationsbereich 192.0.2.0/24.
IMAP, Shopify (`ctx.abrufen`), nodemailer und Electrons `safeStorage` sind Ersatzteile im
Speicher; es wird nie eine Verbindung aufgebaut. Das Versandprotokoll liegt in einem frischen
Temp-Ordner, nie in `daten/`.

**Ergebnis: PASS — 23 von 23 (Rückläufer) und 5 von 5 (Oberfläche, davon einer für den neuen
Abschnitt).** Gesamtstand des Plugins: **597 Tests in vierundzwanzig Dateien, alle bestanden**
(`node --test tests/newsletter-*.test.js`, die Dateien sind dabei einzeln benannt).

## Die Regeln, um die es hier geht

- **Gesperrt** wird nur bei toter Adresse (5.1.x, 5.2.1, 5.4.4 oder eindeutiger Text) und bei
  einer Beschwerde. Vorübergehende Fehler und Ablehnungen wegen Spamverdacht werden am Kontakt
  gezählt. Unlesbares, Abwesenheitsnotizen und die eigenen Adressen ändern nichts.
- Die Sperre trägt eine eigene Art (`ruecklaeufer`, `beschwerde`). Eine bestehende Abmeldung
  bleibt eine Abmeldung.
- **Nicht zu Shopify:** Der Test zählt jeden Aufruf an Shopify während eines Durchgangs; es
  sind null.
- Kein Sync und kein Import heben die Sperre auf; „Freigeben“ schon und löscht die Art.
- Rückläufer zählen nicht als Abmeldung nach einer Kampagne, Beschwerden schon.
- Der Ordner darf nicht die INBOX sein; dort wird nicht einmal geöffnet.
- Gelesen wird nur Ungelesenes und von jeder Mail nur der Anfang (256 KB); alles Gelesene wird
  als gelesen markiert.
- Eine noch wartende Kampagnenmail an eine inzwischen gesperrte Adresse geht nicht raus,
  ohne SMTP-Aufruf. Testmails ans eigene Postfach gehen weiter raus.
- Löschen eines Kontakts entfernt auch seine Rückläufer-Einträge.
- Die Oberfläche bekommt Adressen in der Rückläufer-Liste nur gekürzt, Gründe maskiert.

## Fehler und Korrekturen

Keine Fehlschläge in den Tests. Beim Einbauen der Einstellungsprüfung in `imap.js` war durch
ein Werkzeug ein echter Zeilenumbruch in einen regulären Ausdruck geraten (Syntaxfehler, von
`node --check` gemeldet); vor dem ersten Testlauf behoben.

## Nicht geprüft (BLOCKED)

- **Echte IONOS-Rückmeldungen in einem automatisierten Test.** Die Fixtures folgen den gängigen
  Formaten (RFC 3464, RFC 5965, Klartext im Stil verbreiteter Mailserver). Erkennt Vendo eine
  echte Rückmeldung nicht, sperrt es nichts (sicherer Ausfall); im Text des letzten Laufs
  steht dann „ohne lesbaren Grund“ oder „waren keine Rückmeldung“.
- Weiche Rückläufer werden nur gezählt, nie automatisch gesperrt, auch nicht nach vielen.
  Das ist eine bewusste Entscheidung, kein offener Test.

## Von Hand geprüft (Felix, 2026-11-16, kein automatisierter Test)

- **Filterregel bei IONOS:** Absender enthält „mailer-daemon“ oder „postmaster“ (irgendeine
  Bedingung) → „Speichern unter“ Ordner `Ruecklaeufer`, ohne „Gegen nachfolgende Regeln
  prüfen“, als erste Regel. PASS.
- **Verbindung prüfen** in Vendo: „Ordner „Ruecklaeufer“ geöffnet, 0 Mails darin.“ PASS.
- **Echte Rückmeldungen:** Zwei Mails an nicht vorhandene Adressen (eine bei der eigenen
  Domain, eine bei Gmail). Beide Rückmeldungen kamen als „Mail delivery failed: returning
  message to sender“ von „Mail Delivery System“ im Ordner an; „Jetzt einlesen“ hat sie laut
  Felix verarbeitet, gesperrt wurde nichts, weil die Testadressen keine Kontakte sind. PASS.
  Der genaue Meldungstext von Vendo liegt nicht als Bild vor.
- **Der Abschnitt in der laufenden App** ist damit benutzt worden; die Tabelle der letzten
  Einträge blieb leer, wie vorgesehen, weil keine Kontaktadresse betroffen war.
