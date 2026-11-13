# Newsletter-Plugin: ein Bot steuert alles außer dem Versand

**Datum:** 2026-11-11 (zweiter Stand des Tages)
**Gegenstand:** `plugins/newsletter/bots.js` (erlaubte Aktionen, Prüfung, Eingangskorb),
`botAuftrag`, `auswertungBauen`, `standLesen`, `freigabenLesen` und der Korb-Takt in
`haupt.js`, die Sperre gegen fremde Platzhalter und Bilder ohne Adresse (`html-mail.js`,
`kampagnen.js`, `vorlagen.js`, `automationen.js`), Freigabe-Kasten, Sofort-Aktualisieren
und Hinweis in `ansicht.js`, die Bildregel in `src/renderer/index.html`. Außerhalb des
Repos im Hermes-Profil der Newsletter-Texterin: Hermes-Plugin `vendo-newsletter` (Sicherung
der ersten Fassung daneben), Skill `vendo-newsletter`, drei Zeilen in der `config.yaml`
(Sicherung `config.yaml.vor-vendo-newsletter-20261111.bak`).

**Testbefehl:**

```
node --test tests/newsletter-bots.test.js
```

**Regressionslauf über das ganze Plugin:**

```
node --test tests/newsletter-automationen.test.js tests/newsletter-bausteine.test.js tests/newsletter-drossel.test.js tests/newsletter-imap.test.js tests/newsletter-kampagnen.test.js tests/newsletter-kontakte.test.js tests/newsletter-shopify.test.js tests/newsletter-versand.test.js tests/newsletter-vorlagen.test.js tests/newsletter-warteschlange.test.js tests/newsletter-zugang.test.js tests/newsletter-html.test.js tests/newsletter-bots.test.js
```

**Fixture:** keine Datei. Erfundene Daten im Speicher (`beispiel.de`, eine erfundene
Kontaktperson), Eingangskorb und Versandprotokoll in frischen Ordnern unter dem
Temp-Verzeichnis. Kein Passwort und kein Shopify-Token hinterlegt, also baut kein Test
eine SMTP- oder Shopify-Verbindung auf.

**Ergebnis: PASS — 25 von 25 im neuen Bericht, 295 von 295 im Regressionslauf.**

**Nachtrag (dritter Stand des Tages): PASS — 32 von 32 in `newsletter-bots.test.js`,
302 von 302 im Regressionslauf** (gleicher Befehl wie oben). Neu: nur echte Shop-Adressen,
Vorlagen mit markierten Feldern, Vorschaubilder im Reiter „Vorlagen“. Details im Abschnitt
„Nachtrag: echte Shop-Adressen und echte Vorlagen“. Zusätzliche Fixture: ein gespielter
Shop (`shopSpielen` im Test): `beispielshop.myshopify.com` leitet auf `beispielshop.de`, erfundene Produkte; kein
Netzzugriff im Test.

## Was Felix gemeldet hat — und was dahinter steckte

Nachgesehen in den lokalen Daten (nur Aufbau und Zählwerte, keine Inhalte):

1. **„Vorlage gewünscht, Entwurf bekommen“:** Vala hat eine **Kampagne** namens
   „… Master-Vorlage“ angelegt statt einer Vorlage.
2. **„Kein Betreff, kein Vorschautext“:** beide standen da, aber nur als Platzhalter
   (`{{betreff}}`, `{{vorschauText}}`). Insgesamt 15 erfundene Platzhalter, dazu `{{/if}}`
   aus einer fremden Template-Sprache. Vendo hatte das durchgelassen — es wäre so bei
   allen Empfängern angekommen.
3. **„Bilder werden nicht angezeigt“:** zwei Ursachen. Drei Bilder hatten Platzhalter als
   Adresse. Und das Logo mit echter Shopify-Adresse blockierte Vendos Sicherheitsregel
   (`img-src 'self' data: vendo-datei:`), die die Vorschau erbt.
4. **„Wird nicht in Vendo angezeigt“:** die Ansicht lud nur bei einem Klick neu.

## Was jetzt gilt und getestet ist

- **Keine Aktion zum Senden, Planen, Starten, Einschalten, Sperren**, keine für Postfach,
  Impressum, Abmeldeadresse oder Stundenbudget; bei Kontakten nur der Shopify-Abgleich.
  Unbekannte Aktionen werden abgelehnt, fremde Felder fallen weg.
- **Überblick und Auswertung** enthalten keine Adresse, keinen Namen, kein Impressum.
  Die Auswertung zählt Versand und Fehler aus dem Protokoll, Kontakte je Monat und sagt
  ausdrücklich, dass Öffnungen und Klicks nicht gemessen werden.
- **Kampagnen-Entwurf vom Bot** braucht echten Betreff und Vorschautext; Platzhalter dort
  werden abgelehnt, und abgelehnt wird nichts angelegt.
- **Valas erster Entwurf als Testfall:** `{{headline}}` und ein Bild mit `{{heroBild}}` —
  die Antwort nennt es im Text („Noch offen: …“), die Freigabe ist gesperrt, **und auch
  Felix kann so etwas nicht planen.**
- Kopieren, Vorlage aus Kampagne, Löschen von Entwürfen und Vorlagen.
- Freigabe-Weg wie zuvor: Zustand „freigabe“, nichts in der Warteschlange, Ändern zieht
  zurück, nach Felix' Planen weder Ändern noch Löschen (Kopieren geht).
- **Automationen:** anlegen (ausgeschaltet, je Art eine), Schritte ändern mit Wartezeiten,
  hinzufügen, löschen; eingeschaltet weder ändern noch löschen. **Ein unbekannter
  Platzhalter sperrt das Einschalten** — in einer Willkommensserie auch `{{warenkorb}}`.
- **Marke:** Name, Logo (nur https), Farben; unbekannte Farbnamen werden gemeldet,
  Impressum und Abmeldeadresse bleiben unberührt.
- Kontakte abgleichen ohne Shopify-Zugang: Grund gemeldet, keine Kontakte herausgegeben.
- `standLesen` zählt nur gelungene Änderungen, nicht Lesen und nicht Abgelehntes.
- Eingangskorb wie zuvor, Ende zu Ende mit Annahme und Ablehnung.

## In der echten App

**Lesender Testmodus-Lauf** (Prüfskript im Scratchpad der Sitzung, Bildschirmfoto danach):
Valas Kampagne zeigt die rote Warnung mit allen unbekannten Platzhaltern und „3 Bilder
haben keine gültige Adresse“. Ein Bild von `cdn.shopify.com` **lädt jetzt**, ein Bild von
`example.com` bleibt gesperrt. Dabei fielen drei Konsolenmeldungen auf: die Säuberung
ersetzte ungültige Bildadressen durch `#`, was die Vorschau als Pfad zu Vendo selbst
auflöste. Jetzt werden Bildadressen leer gemacht, Links weiter zu `#`.

**Valas Werkzeug gegen das laufende Vendo**, nur `auswertung`: alle sieben Bereiche da,
820 Kontakte, die Mails der letzten 30 Tage gezählt, **kein @-Zeichen** in der Antwort.
Das Werkzeug und Vendo kennen dieselben 23 Aktionen; der Regelabschnitt für Valas
Systemprompt hat 2444 von höchstens 4000 Zeichen.

**Sofort-Aktualisieren** auf der Prüfseite mit gespieltem Bot: eine neue Kampagne erscheint
ohne Klick in der Liste; ist genau diese Kampagne offen, bleibt das Code-Feld unangetastet
und ein Hinweis erscheint, „Neu laden“ zeigt den Stand des Bots. Beim ersten Versuch
erschien die neue Kampagne nicht: der Wächter nahm seinen Ausgangsstand erst nach drei
Sekunden und hielt die frühe Änderung dafür. Er nimmt ihn jetzt sofort beim Start.

## Nachtrag: echte Shop-Adressen und echte Vorlagen

Felix' Regeln: „es müssen immer echte URLs von meinem Shop sein“; die KI baut **Vorlagen**,
keine fertigen Mails; eine Kampagne „mit Vorlage X“ heißt, die ganze Vorlage auszufüllen
und zu verbessern, nicht nur das Minimum; im Reiter „Vorlagen“ ein gerenderter Ausschnitt.

**Getestet (`tests/newsletter-bots.test.js`, gespielter Shop, kein Netz):**

- `shop_produkte` liefert fertige Adressen (`https://beispielshop.de/products/…`,
  `/collections/…`), Suche über Titel, Typ und Tags; der Bot muss nichts zusammensetzen.
- Ein Link auf eine fremde Domain, eine erfundene Produktseite (404) oder ein Bild nicht
  von `cdn.shopify.com` bzw. dem Shop sperrt die Freigabe; eine echte Produktseite mit
  Shopify-Bild geht durch.
- Ohne bekannte Shop-Adresse gibt es keine Freigabe.
- `links_pruefen` meldet jede unechte Adresse einzeln mit Grund (kein https, nicht aus
  deinem Shop, gibt es nicht (404), Bild nicht aus deinem Shop).
- Eine Vorlage ohne markierte Felder (`data-feld`) ist eine fertige Mail und wird abgelehnt.
- Eine Kampagne aus einer Vorlage: übrig gebliebener Beispieltext sperrt die Freigabe und
  wird mit Feldnamen genannt.
- Ein Vorlagen-Entwurf von Luzzy bekommt markierte Felder.

**Echter Probelauf, nur lesend** (Prüfskript im Scratchpad, gegen das laufende Vendo und
den echten Shop; ausgegeben nur Zählwerte und Adressmuster):

- Vendo ermittelt die öffentliche Shop-Adresse selbst aus der Weiterleitung der
  myshopify-Adresse.
- `shop_produkte`: 280 Produkte, 13 Sammlungen; alle gelieferten Produktadressen haben das
  Muster `https://<Shop>/products/<handle>`, alle Bilder liegen auf `cdn.shopify.com`.
- Live-Linkprüfung: eine echte Produktseite antwortet mit 200, eine erfundene mit 404 und
  sperrt, eine fremde Domain wird ohne Abruf gesperrt.
- Valas Werkzeug kennt jetzt 25 Aktionen (neu: `shop_produkte`, `links_pruefen`); der
  Regelabschnitt für ihren Systemprompt hat 3258 von höchstens 4000 Zeichen. Sicherung der
  vorigen Fassung liegt daneben.

**Vorschaubilder im Reiter „Vorlagen“** auf der Prüfseite: jede Karte zeigt den oberen
Ausschnitt der gerenderten Vorlage (verkleinert, nicht anklickbar, Bilder nach derselben
Sicherheitsregel wie die Vorschau), darunter Name und markierte Felder. Bildschirmfoto in
Ordnung, Karten per Tastatur bedienbar.

## Nachtrag 2026-11-12 abends: ein Entwurf, und das Muster verbessern

**Befehl:** `node --test tests/newsletter-bots.test.js tests/newsletter-mailpruefung.test.js`,
Regressionslauf `node --test tests/newsletter-*.test.js tests/werkstatt.test.js`.
**Ergebnis: PASS — 33 von 33 (Bots), 25 von 25 (Mailprüfung), 498 von 498 im
Regressionslauf.** Fixture: erfundene Daten im Speicher, gespielter Shop, kein Netz.

Gemeldet: Die Texterin legt bei einem Fehler einen neuen Entwurf an, statt den vorhandenen
zu reparieren, und tauscht im Muster nur Produkte. Belegt im Hermes-Log: dreimal
`kampagne_neu` mit vollem HTML um 16:21, 16:23 und 16:24 in einer Sitzung; ihre Kampagne
„Meistverkauft November“ hatte dieselben 122 Zeilen wie `vorlagen/bestseller.html`, nur
21 Zeilen mit Texten, Preisen und Links anders (Aufbau-Ähnlichkeit 99,8 %).

Jetzt:

- `kampagne_neu` eines Bots wird abgelehnt, wenn es schon einen offenen Entwurf einer KI
  mit gleichem Namen oder Betreff gibt oder aus demselben Muster innerhalb von zwei
  Stunden. Die Antwort nennt ID und Datei des vorhandenen und sagt, dass Fehler dort
  behoben werden.
- `aufbauAehnlichkeit` (html-mail.js) vergleicht die Folge der Elemente mit dem Muster.
  Ab 90 % steht bei einem Entwurf der KI „Der Aufbau ist noch … das Muster“ unter
  „Noch offen“, und `kampagne_zur_freigabe` ist gesperrt. Gemessen: verschiedene Muster
  gleichen sich höchstens zu 78 %.
- Systemprompt (3944 Zeichen) und Skill (0.8.0) der Texterin: „EIN ENTWURF“ und
  „Aufbau verbessern“, vorher gesichert als `*.vor-ein-entwurf-20261112.bak`.

Neue Tests: Ablehnung bei gleichem Namen, Betreff und Muster mit Rückgabe der ID; nach
dem Planen ist ein neuer Entwurf wieder möglich; nur getauschte Inhalte sperren die
Freigabe; `aufbauAehnlichkeit` an den echten Mustern. Ältere Tests, die absichtlich
mehrere gleichnamige Entwürfe anlegten, haben eigene Namen bekommen.
Nicht geprüft: mit der echten Texterin (braucht eine neue Hermes-Sitzung).

## Nachtrag 2026-11-12, später Abend: Umbauten über kampagne_aendern

Gemeldet: der nächste Entwurf (`kmwdqm86vzbkc`) war wieder das unveränderte Muster. Im
Hermes-Log: die Texterin las die Entwurfsdatei, schrieb zwei Minuten an einem Umbau (5605
Ausgabe-Tokens) und speicherte ihn mit `write_file` — Hermes lehnte ab („Refusing to
overwrite …“, Schutz in `tools/file_tools_write_guards.py`: ganze Datei nur nach
vollständigem, aktuellem Lesen). Vendo hatte die Datei in der Zeit nicht geändert (Zeit
17:03:32 unverändert); Schwärzung und gekürzte Zeilen schieden aus (mit Hermes' eigener
`redact_sensitive_text` nachgestellt, nur lesend). Außerdem lief Hermes noch mit dem
Systemprompt vom Morgen (3973 Zeichen) — Plugins lädt Hermes nur beim Start.

Jetzt: Umbauten gehen als komplettes HTML über `kampagne_aendern`, kleine Stellen per
`patch` in die Datei, nie `write_file`; bei einer Ablehnung sofort `kampagne_aendern`.
So steht es in Skill (0.9.0), Systemprompt (3933 Zeichen), im Antworttext von
`kampagne_neu` und im Kopfkommentar der Datei. Hermes-Dateien vorher gesichert als
`*.vor-umbau-weg-20261112.bak`.
**Befehl:** `node --test tests/newsletter-*.test.js tests/werkstatt.test.js` —
**PASS, 498 von 498.** Nicht geprüft: mit der echten Texterin; Hermes muss dafür neu
starten.

## Nicht geprüft (BLOCKED in dieser Umgebung)

- **Vala im Gespräch mit dem neuen Werkzeug** (auch Shop-Produkte, Linkprüfung und
  Vorlagen mit Feldern). Ihr Hermes muss neu starten, um die
  geänderte Fassung zu laden.
- **Schreibende Bot-Aufträge gegen deine echten Daten** und eine echte Freigabe mit
  Testmail — bewusst nicht ausgelöst. Mit erfundenen Daten getestet.
- **Sofort-Aktualisieren in der echten App** — dafür hätte ein Bot dort schreiben müssen.
  Auf der Prüfseite mit gespieltem Bot geprüft.
- **Ausschnitte im Reiter „Vorlagen“ in der echten App** — auf der Prüfseite geprüft,
  in Vendo nach dem Neustart noch nicht angesehen.
