# Newsletter-Plugin: Abmeldungen per Mail

**Datum:** 2026-11-09
**Gegenstand:** `plugins/newsletter/imap.js` — eingehende Abmeldungen aus einem Postfach-Ordner
lesen und die Adressen sperren. Damit wirkt der `List-Unsubscribe`-Link ohne Handarbeit.

**Testbefehl:**

```
node --test tests/newsletter-imap.test.js
```

**Fixture:** keine Datei. Der Test setzt einen IMAP-Client-Ersatz ein, der mitschreibt, welcher
Ordner geöffnet und welche Flags gesetzt wurden. Es wird **nie** eine echte Verbindung
aufgebaut und kein Postfach berührt.

**Ergebnis: PASS — 17 von 17 Tests.** Gesamtstand: **212 Tests in zehn Dateien.**

## Die Regeln, um die es hier geht

- **Die INBOX bleibt in Ruhe.** Dort liegen die Kundenmails, die Vendos Wächter beobachtet.
  Vorgesehen ist ein eigener Ordner, den eine Filterregel bei IONOS füllt; geöffnet wird
  genau dieser eine Ordner. Trägt jemand doch `INBOX` ein, zählt nur, was im Betreff nach
  einer Abmeldung aussieht (`abmeld`, `unsubscribe`, `austragen`, `abbestell`) — eine Mail
  mit dem Betreff „Frage zur Lieferung" wird nachweislich übersprungen. Die Oberfläche warnt
  zusätzlich.
- **Nichts wird gelöscht oder verschoben.** Verarbeitete Mails bekommen nur `\Seen`. Der Test
  prüft ausdrücklich, dass kein `\Deleted` gesetzt wird. Ein Fehler hier vernichtet also
  nichts, und alles bleibt im Postfach nachvollziehbar.
- **Nur ungelesene Mails** werden geholt (`{ seen: false }`), und höchstens 200 pro Lauf.
- **Verbindungen werden immer geschlossen**, auch im Fehlerfall: Sperre freigeben und
  abmelden stehen im `finally`, nachgewiesen für den Anmelde- und den Ordner-Fehler.

Weiter abgedeckt: Absender wird gelesen und kleingeschrieben (mit Rückfall auf `sender`),
Mails ohne brauchbare Absenderadresse werden übergangen, Einstellungen werden mit
Standardwerten gefüllt und auf Zeilenumbruch, Servernamen und Port geprüft, die Obergrenze
hält, eine leere UID-Liste baut gar keine Verbindung auf, und die Fehlertexte sind
verständlich (Anmeldung abgelehnt, Ordner fehlt, Server nicht gefunden, keine Verbindung).

## Verdrahtung

- `abmeldungenPruefen` in `haupt.js` liest, sperrt über denselben Weg wie die Liste
  (lokal **und** bei Shopify auf „nicht abonniert") und markiert danach als gelesen.
- Adressen, die gar nicht in den Kontakten stehen, gelten ebenfalls als erledigt — es gibt
  nichts zu tun, und beim nächsten Lauf sollen sie nicht erneut auftauchen.
- Der Takt prüft alle zehn Minuten, im selben Rhythmus wie die Shopify-Auslöser: zeitnah
  genug für eine Abmeldung, ohne das Postfach alle 15 Sekunden zu öffnen.
- Die Zugangsdaten sind dieselben wie beim Versand; eingestellt werden nur Ordner, Server
  und der Schalter. Voreinstellung: `imap.ionos.de`, Port 993, Ordner `Abmeldungen`, **aus**.

## Neue Abhängigkeit

`imapflow` 2.11.0, **MIT-Lizenz** — vor der Installation geprüft, weil eine AGPL-Bibliothek
nicht zur Lizenz dieses Projekts gepasst hätte. `npm audit` meldet danach dieselben zwei
Altlasten wie vorher (`electron`, `extract-zip`), nichts Neues. Der Logger der Bibliothek ist
abgeschaltet, sonst stünde der ganze IMAP-Verkehr samt Betreffzeilen im Terminal.

## Nicht geprüft (BLOCKED in dieser Umgebung)

- **Ein echter Postfach-Zugriff.** Ob `imap.ionos.de` die Anmeldung annimmt, wie IONOS den
  Ordner benennt (Groß-/Kleinschreibung, mögliche Präfixe wie `INBOX.Abmeldungen`) und ob die
  Filterregel greift, zeigt erst „Verbindung prüfen" in der laufenden App.
- **Eine echte Abmeldemail** von einem Empfänger, inklusive der Frage, welche Absenderadresse
  dabei ankommt — bei Weiterleitungen oder Sammeladressen kann das eine andere sein als die,
  die im Verteiler steht. Dann greift die Sperre nicht, und die Adresse muss von Hand
  gesperrt werden.
- **Das Zusammenspiel mit dem Wächter**: dass Abmeldungen dank Filterregel nicht als neue
  Kundenmails gemeldet werden.
