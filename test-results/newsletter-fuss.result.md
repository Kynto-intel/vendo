# Newsletter-Plugin: vollständiger Fuß aus dem Reiter „Zugang"

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-11
**Gegenstand:** der Fuß jeder Mail — Logo, Social-Media-Icons, die Pflichtlinks
„Impressum | Datenschutzerklärung | AGB", Impressumtext und ganz unten mittig „ABMELDEN".
Geändert: `plugins/newsletter/bausteine.js` (`BAUSTEINE.fuss`, neu `fussTeileAus`,
`fussPruefen`, `RECHTSLINKS`, `NETZWERKE`), `plugins/newsletter/html-mail.js`
(`fussTabelle` und `mailAusHtml` geben die Marke an den Fuß weiter),
`plugins/newsletter/haupt.js` (`markeLesen`, `markeSpeichern`),
`plugins/newsletter/ansicht.js` (Felder im Abschnitt „Marke und Pflichtangaben" des
Reiters „Zugang", Absenden des Formulars), `plugins/newsletter/stil.css`.

**Testbefehl:**

```
node --test tests/newsletter-fuss.test.js
```

**Regressionslauf über das ganze Plugin:**

```
node --test tests/newsletter-fuss.test.js tests/newsletter-bausteine.test.js tests/newsletter-html.test.js tests/newsletter-kampagnen.test.js tests/newsletter-vorlagen.test.js tests/newsletter-versand.test.js tests/newsletter-automationen.test.js tests/newsletter-bots.test.js tests/newsletter-kontakte.test.js tests/newsletter-shopify.test.js tests/newsletter-zugang.test.js tests/newsletter-drossel.test.js tests/newsletter-warteschlange.test.js tests/newsletter-imap.test.js
```

**Syntaxprüfung:**

```
node --check plugins/newsletter/bausteine.js
node --check plugins/newsletter/icons.js
node --check plugins/newsletter/html-mail.js
node --check plugins/newsletter/haupt.js
node --check <Kopie von ansicht.js als .mjs im Temp-Ordner>
```

**Fixture:** keine Datei. Alle Angaben sind erfunden (`beispiel.de`, „Beispiel GmbH,
Musterweg 1, 12345 Musterstadt", `instagram.com/beispielshop`). `haupt.js` läuft mit Daten
im Speicher, `eingangOrdner: false`. Keine Verbindung nach außen, keine Mail, keine
geschriebene Datei, keine echten Zugangsdaten.

**Ergebnis: PASS — 59 von 59 Tests in `tests/newsletter-fuss.test.js`, 365 von 365 im
Regressionslauf über die vierzehn Newsletter-Dateien.** Gesamtstand: **369 Tests in
fünfzehn Dateien** (mit `tests/werkstatt.test.js`).
`git diff --check` ohne Befund; `tests/werkstatt.test.js` 4 von 4.

## Nachtrag 2026-11-11: echte Icons, Überschrift, Zusatzzeile, Fußfarben

Gemeldet: die Kästchen mit Kürzel sind keine Social-Media-Icons, dazu ein Bild als Vorlage
(dunkler Fuß, Logo, „FOLGE UNS HIER“, fünf Icons, Pflichtlinks, Impressum, Preishinweis,
„ABMELDEN“ in Akzentfarbe). Umgesetzt, geändert zusätzlich: `plugins/newsletter/icons.js`
(neu), `mail.js` (`anhaenge`), `haupt.js` (`fussTinte`, `iconAnhaenge`, `fuerAnsicht`, fünf
Vorschau-Stellen).

**Die Icons (5 Tests).** Zuerst zeichnete `icons.js` die Icons selbst mit
`@napi-rs/canvas`. Das hat Felix abgelehnt („sehen überhaupt nicht gut aus") und vier
PNG-Vorlagen in `plugins/newsletter/social media icons` gelegt (Instagram, Facebook,
Pinterest, TikTok — weiße Silhouetten auf durchsichtigem Grund, rund 2500 px, zusammen
knapp 380 kB). Der Zeichencode ist raus; `icons.js` liest jetzt die Dateien, verkleinert
sie auf 56 px und legt sie mittig in ein Quadrat — die Vorlagen haben Seitenverhältnisse
von 0,577 (das f) bis 1,0 (Instagram) und stehen im Fuß trotzdem gleich hoch. Geprüft:
zu jedem angebotenen Netzwerk gibt es eine Bilddatei (hält `NETZWERKE` und den Ordner
zusammen), der verschriebene Dateiname `Faceboook.png` findet `facebook` (doppelte
Buchstaben werden beim Vergleich zusammengezogen, `Instagram` und `Pinterest` bleiben
dabei verschieden), jedes Icon kommt als gültiges PNG unter 20 kB heraus (gemessen:
281–575 Bytes, zusammen 1,9 kB pro Mail), eine weiße Vorlage bekommt die Schriftfarbe des
Fußes (sonst wäre sie auf hellem Grund unsichtbar), ein unbekanntes Netzwerk liefert
`null` statt eines kaputten Bildes.

**Lesen beim Start.** `@napi-rs/canvas` entschlüsselt ein PNG nur über `loadImage`, und das
ist asynchron (`new Image(); img.src = puffer` meldet zwar die Maße, zeichnet aber nichts —
nachgemessen: 0 deckende Pixel). Deshalb liest `icons.vorbereiten()` die Bilder einmal
beim Start des Plugins ein; `einzelSenden` wartet vor dem Bauen noch einmal darauf, und die
Tests tun es in `test.before`. Danach ist `iconPng` wieder synchron, wie Vorschau und
`mailBauen` es brauchen.

**Der Weg in die Mail (2 Tests).** `mailBauen` hängt nur an, worauf das HTML auch zeigt —
ein ungenutztes Bild hinge sonst sichtbar an der Mail. Ohne angefordertes Icon bekommt die
Mail gar keine Anhänge.

**Der Weg in die Vorschau (2 Tests).** `cid:` kennt das Fenster nicht. `alsDatenAdressen`
tauscht gegen `data:`. Ein Test geht alle fünf Stellen durch, die Mail-HTML an die
Oberfläche geben (`kampagneVorschau`, `mailVorschau`, `vorlageVorschau`, das Vorschaubild in
`vorlagenLesen`, `automationVorschau`) und verlangt: kein `cid:` darin und ein eingesetztes
`data:`-Bild. Damit fällt auf, wenn später eine sechste Stelle dazukommt und vergessen wird.

**Aufbau wie im Bild (5 Tests).** Überschrift „FOLGE UNS HIER“ über den Icons; ein leer
gespeicherter Titel heißt „keine Überschrift“; ohne Netzwerk fehlt auch die Überschrift.
Freie Zeile zwischen Impressum und Abmeldelink. Eigener Grund im Fuß färbt die Zelle
(`bgcolor` für Outlook und `background-color`), lässt die Trennlinie weg und setzt
Schrift- und Akzentfarbe; ohne eigenen Grund bleibt alles wie vorher samt Linie. Eine
Farbangabe, die keine Hexfarbe ist, wird verworfen und benannt.

**Augenschein.** Die vier Icons wurden aus `icons.js` in echter Größe (28 px) und
vergrößert (56 px), je weiß auf dunkel und eingefärbt dunkel auf hell, als Bild gerendert
und angesehen; alle vier sind bei 28 px sauber und eindeutig. Der fertige Fuß wurde als HTML gebaut und die Reihenfolge am
Markup nachgemessen: Logo, Überschrift, fünf Icons, Pflichtlinks, Impressum, Preiszeile,
ABMELDEN.

## Was geprüft wurde

**Pflichtlinks (3 Tests).** Impressum, Datenschutzerklärung und AGB stehen mit ihren
Adressen und in der eingetragenen Reihenfolge im Fuß. Ein leeres Feld erzeugt keinen Link
und keinen überzähligen Trennstrich — geprüft wird ausdrücklich auf `href=""` und darauf,
dass bei nur einem Link kein `|` erscheint. Ohne jede Fußangabe bleibt der Fuß der alte:
Impressumtext und Abmeldelink, kein Bild.

**Social-Media-Icons (3 Tests).** Mit eigener Icon-Adresse wird ein `<img>` gesetzt und mit
der Profil-Adresse verlinkt. Ohne Icon-Adresse entsteht ein Kästchen aus Tabelle und Text
mit dem Kürzel des Netzwerks (`f` für Facebook), der Link steht genau einmal da. Ein
Netzwerk ohne Profil-Adresse kommt überhaupt nicht in den Fuß.

**Logo im Fuß (3 Tests).** Ohne eigene Fuß-Adresse nimmt der Fuß das Logo aus dem Kopf.
Eine eigene Adresse gewinnt, die eingetragene Breite landet im `width`. Mit „Logo im Fuß
zeigen" aus bleibt der Fuß ohne Bild, die Icons bleiben.

**Abmeldelink (3 Tests).** „ABMELDEN" steht nach Icons, Pflichtlinks und Impressumtext —
die Reihenfolge wird über die Fundstellen im HTML gemessen — und mittig
(`text-align:center` direkt vor dem `mailto:`). Der Text lässt sich ändern. Ohne
Abmeldeadresse steht kein Abmeldelink, die Pflichtlinks bleiben.

**Prüfung der Eingaben (6 Tests).** `fussPruefen` nimmt nur `https`-Adressen; `http:`,
`javascript:` und eine Adresse ohne Schema werden verworfen und namentlich gemeldet
(`['Datenschutzerklärung', 'AGB', 'Instagram']`). Die Logobreite bleibt zwischen 40 und
300, sonst Standard 120. Der Abmeldetext wird auf 40 Zeichen gekürzt, Zeilenumbrüche werden
zu Leerzeichen, leer heißt „ABMELDEN". Jedes Netzwerk und jeder Pflichtlink aus den Listen
in `bausteine.js` wird erkannt. Ein Fußtext mit spitzen Klammern wird maskiert
(`&lt;b&gt;weg`), eine `javascript:`-Adresse wird auch beim Bauen nicht zum Link — zweite
Sperre in `url()`, falls sie auf anderem Weg in die Daten käme.

**HTML-Modus und Versand (4 Tests).** Der ganze Fuß ist mit Vendo-Rahmen dabei und — bei
fremdem HTML ohne Rahmen — vor `</body>`. Der abgeleitete Textteil nennt die Pflichtlinks
mit Adresse und `ABMELDEN (abmelden@beispiel.de?subject=Abmeldung)`. Eine Kampagnenmail mit
dem neuen Fuß wird von `mail.js` gebaut und trägt `List-Unsubscribe` — die harte Regel
„keine Werbung ohne Abmeldeweg" greift weiter, „ABMELDEN" erfüllt die Prüfung auf
`abmeld|unsubscribe` im Inhalt.

**Speichern und Lesen (4 Tests).** `markeLesen` liefert die Listen, aus denen die
Oberfläche ihre Felder baut (Reihenfolge der Pflichtlinks, sieben Netzwerke, Instagram
zuerst). `markeSpeichern` legt die Fußangaben unter `marke.fuss` ab und meldet verworfene
Adressen. Ein `markeSpeichern` **ohne** `fuss` — so ruft die Bot-Aktion `marke_aendern`
auf — lässt die gespeicherten Fußangaben unangetastet. Der gespeicherte Fuß erscheint in
der Vorschau einer Kampagne.

## Nachtrag 2026-11-11: Impressum fließt, Farbfelder gerichtet

Gemeldet: das Impressum im Fuß soll „auf einer Ebene“ stehen, mit einem Bild als Vorlage
(zwei Zeilen, Angaben mit „ | “ hintereinander, mittig). Vorher wurde jeder Zeilenumbruch
aus dem Feld zu einem `<br />`, das Impressum stapelte sich also untereinander.

**Jetzt (4 Tests).** Die Zeilen eines Absatzes werden mit „ | “ verbunden und fließen als
ein Block, der von selbst umbricht. Eine freie Zeile im Feld bleibt ein fester Umbruch —
damit ist der Aufbau aus dem Bild (zwei Blöcke) weiterhin möglich. Ein schon getipptes
„|“ am Zeilenende wird nicht verdoppelt; leere Zeilen und ein leeres Impressum erzeugen
keine leere Zeile im Fuß, der Rest des Fußes bleibt.

**Farbfelder (ohne Test, am Bild erkannt).** Im zweiten gemeldeten Bild standen
Eingabefeld und Hinweistext der drei Fußfarben nebeneinander und liefen ineinander.
Ursache: `stil.css` macht nur `.nl-form > label` und `.nl-form-paar label` zur Spalte, die
Beschriftungen im neuen `.nl-fuss-farben`-Raster waren von beidem nicht erfasst. Die Regel
deckt jetzt auch sie ab; die drei Hinweistexte wurden für die schmalen Spalten gekürzt.
Geprüft ist das nur am Quelltext und an der Regel, nicht in der laufenden App.

## Nachtrag 2026-11-11: automatischer Kopf, einstellbare Größen

Gewünscht: die Social-Icons kleiner oder einstellbar, die Logogröße im Kopf einstellbar,
und der Kopf soll wie der Fuß automatisch kommen, „so dass die KI nur noch den Inhalt
erzeugen muss“. Geändert: `bausteine.js` (`kopfTeileAus`, `kopfZeile`, `kopfPruefen`,
`zeilenAus`, `startVorlage`, `mailAus`), `html-mail.js` (`mailAusHtml`,
`startVorlageHtml`), `haupt.js` (`markeLesen`, `markeSpeichern`), `ansicht.js`, `stil.css`.

**Der Kopf (10 Tests).** Das Logo der Marke steht vor dem Inhalt, ohne dass Kampagne oder
Vorlage es mitliefern. Eine eigene Kopf-Adresse und eine eigene Breite gewinnen; ohne
Angabe sind es 180 px. Abgeschaltet fängt die Mail mit dem Inhalt an, der Fuß bleibt. Ohne
Logo steht der Name als Schriftzug, ohne Logo und ohne Namen bleibt der Kopf ganz weg
(`kopfZeile` gibt dann einen leeren String zurück) — eine leere Fläche über dem Inhalt wäre
schlimmer als kein Kopf. Ein eigener Grund färbt die Zelle. `kopfPruefen` nimmt nur
`https`, hält die Breite zwischen 40 und 560 und meldet eine kaputte Farbe namentlich.
Im HTML-Modus kommt der Kopf mit Vendo-Rahmen davor und ohne Rahmen nicht — dort bringt
das fremde Dokument seinen eigenen mit, der Fuß kommt trotzdem. Eine Baustein-Liste mit
eigenem `kopf` bekommt keinen zweiten.

**Kein doppeltes Logo.** Drei Stellen lieferten bisher selbst eines: `startVorlageHtml`
(raus), `startVorlage` (`kopf`-Baustein raus, Test angepasst) und `zeilenAus`, das `kopf`
jetzt überspringt wie schon `fuss` — damit ergibt auch eine ältere gespeicherte Liste mit
Kopf darin kein zweites Logo. Was eine bestehende Vorlage im HTML-Feld stehen hat, kann
Vendo nicht wissen; darauf weist die Oberfläche im Abschnitt „Kopf jeder Mail“ hin.

**Die Anweisungen an die KI (ohne Test, Textänderung).** Drei Stellen sagen der KI, was
sie liefern soll. `kampagnen.kiAuftrag` und `vorlagen.kiAuftrag` in Vendo sagten schon
„Kopf und Fuß der Mail werden automatisch ergänzt, lass sie weg" — richtig, aber erst seit
diesem Lauf auch wahr; sie nennen jetzt das Logo ausdrücklich. Die dritte Stelle liegt
außerhalb von Vendo: das Hermes-Plugin `vendo-newsletter` im Profil
`vala-newsletter-texterin-bot`. Dort stand in der Adressen-Regel „Logo: ueberblick →
marke.logo", also genau die Einladung, das Logo ins HTML zu schreiben. Ersetzt durch „Das
Logo gehört nicht dazu — das setzt Vendo selbst in den Kopf", dazu die Grundregel und die
Feldbeschreibungen geschärft. Vorher gesichert als
`__init__.py.vor-automatischem-kopf-20261111.bak`, Python-Syntax nach der Änderung mit
`ast.parse` geprüft. Hermes-Programmcode selbst wurde nicht angefasst. Der Bot muss neu
starten, damit die neue Beschreibung in seinen Prompt kommt.

Der ursprünglich genannte Skill `donnerwolf-email-flow` im selben Profil wurde gelesen und
**nicht** geändert: er schreibt Texte für Shopify Email und enthält keine Zeile über Logo,
Kopf oder Mail-HTML.

**Die Icon-Größe (1 Test).** `fuss.iconBreite` steuert `width`/`height` der Icons, Grenzen
14–40 px, Standard von 28 auf 22 gesenkt. Unsinn fällt auf den Standard zurück, in
`fussPruefen` wie beim Bauen.

## Nachtrag 2026-11-11: Kacheln und die Anweisungen an die KI

**Die Kacheln (gemessen, kein Test).** Gemeldet mit drei Bildern: unterschiedlich hohe
Kacheln, Texte brechen um, „info@donnerwolf.de" riss mitten im Wort. Ursache: `.nl-kachel`
war ein Flex-Block ohne feste Höhen, `.nl-kachel small` hatte `overflow-wrap: anywhere`,
`.nl-stand` hatte `word-break: break-all`, und einige Hinweise brachten Markup mit
(`<br />`, `<strong>`), das eine zweite Zeile erzwang. Jetzt baut ein gemeinsames
`kachel(name, wert, zeile, {betont, titel})` in `ansicht.js` alle 17 Stellen; `stil.css`
gibt den drei Teilen feste Höhen (12 / 30 / 16 px), `white-space: nowrap`, `overflow:
hidden` und `text-overflow: ellipsis`. Der volle Satz steht im `title`.

Nachgemessen im Browser mit der echten `stil.css` und 19 Kacheln, darunter Grenzfälle
(48-Zeichen-Adresse, „pausiert", Freigaben, Fehler in der Warteschlange): bei 700, 820,
960, 1100, 1280 und 1400 px Fensterbreite ist **jede Kachel exakt 88 px hoch**. Das Raster
der Übersicht bricht statt starrer sechs Spalten um (`repeat(auto-fit, minmax(140px, 1fr))`).

**Eine Kachel zu viel (Nachtrag am selben Tag).** In der laufenden App rutschte die sechste
Kachel der Übersicht („Warteschlange") allein in eine zweite Reihe. Gemeldet mit Bild, dazu
die Entscheidung: die Empfängerzahl steht im Reiter „Kontakte" ohnehin schon, dort mit
„Gesperrt", „Ohne Nachweis" und „Gesamt" daneben, die sie erst erklären. Also ist sie aus
der Übersicht raus; es bleiben fünf. Danach erneut gemessen, diesmal mit den echten fünf
Kacheln je Abschnitt: bei 800, 870, 900, 1100 und 1400 px steht **jeder Abschnitt in einer
Reihe**, jede Kachel ist 88 px hoch, und **nichts** wird abgeschnitten — die
Postfach-Adresse eingeschlossen. Unter 800 px bricht die Übersicht um, unter 700 px auch
die Kontakte; mit fünf lesbaren Kacheln geht es schmaler nicht.

Die Prüfdatei lag vorübergehend im Projektordner (nur so rendert die Vorschau live) und
wurde danach gelöscht.

**Die Anweisungen an die KI (Textänderung).** Der im Auftrag genannte Skill
`donnerwolf-email-flow` war nicht die Quelle — er schreibt Texte für Shopify Email und
enthält keine Zeile über Logo oder Mail-HTML. Die Quelle war der Skill
`skills/email/vendo-newsletter/SKILL.md` im selben Profil: sein Standard-Aufbau begann mit
„1. **Logo** (zentriert, `data-feld="logo"`, fest)", die Vorlagen-Regel zählte das Logo zu
den festen Teilen, und unter „Adressen" stand „Logo: `ueberblick` → `marke.logo`". Alles
drei entfernt, der Aufbau beginnt beim Hero-Bild, und die HTML-Regel „Kein eigener Fuß"
heißt jetzt „Kein eigener Kopf und kein eigener Fuß" samt Begründung. Dasselbe im
Hermes-Plugin `vendo-newsletter`. Beide Dateien vorher gesichert
(`SKILL.md.vor-automatischem-kopf-20261111.bak`,
`__init__.py.vor-automatischem-kopf-20261111.bak`).

**Das Hermes-Plugin geprüft.** Ein Skript hat seinen Vertrag gegen `plugins/newsletter/bots.js`
gestellt: 25 Aktionen, 17 Felder und 5 langsame Aktionen — alles deckungsgleich, nichts
fehlt, nichts zu viel. Der Systemprompt misst 3520 Zeichen bei einer Grenze von 4000. Die
Mechanik (Auftrag über `.tmp` und `os.replace`, Antwort abwarten, Auftrag bei Zeitüberschreitung
zurückziehen) ist unverändert und in Ordnung. Hermes-Programmcode wurde nicht angefasst.

## Nachtrag 2026-11-11: Mail-Bausteine für die KI, Produktzugang geprüft

Gemeldet: die von der KI gebauten Mails sehen langweilig aus, dazu ein Vorbild (eine
Werbemail mit Aufmacher, Abschnittsbändern, Produktraster mit Rabatt-Abzeichen,
Sammlungsbändern). Zweite Frage: wie die KI an echte Produkte kommt, „weil die hat aktuell
keinen Zugang zu Shopify".

**Produktzugang: ist da, ohne Shopify-Zugang.** `shop_produkte` liest über
`plugins/newsletter/shoplinks.js` die **öffentliche** Produktliste des Shops
(`/products.json`), nicht die Shopify-API. Live geprüft gegen donnerwolf.de: **280 Produkte**
mit Titel, Produktadresse, Preis, Vergleichspreis, CDN-Bild, Verfügbarkeit, Typ und Tags,
dazu die Sammlungen. Es braucht nur die im Reiter „Kontakte" eingetragene Shop-Adresse,
keinen Token. Der Skill sagt das jetzt ausdrücklich, weil die Annahme „kein Zugang" sonst
dazu führt, dass die KI Produkte erfindet oder weglässt.

**Neue Referenz `references/mail-bausteine.md`** im Skill (10,3 kB): sieben fertige
HTML-Blöcke — Aufmacher, großes Bild, Abschnittsband, Produkt-Duo mit Rabatt-Abzeichen und
durchgestrichenem Alt-Preis, Trenner, Sammlungsband, Schlussknopf — mit den Maßen der
600-px-Hülle (536 px Inhalt, 252 px halbe Breite) und den Markenfarben als Platzhalter.
Dazu ein Abschnitt, was eine gute Mail von einer langweiligen unterscheidet, die Formel für
den Rabatt aus `preis` und `vergleichspreis` (und die Regel: ohne Vergleichspreis kein
Abzeichen), und ein Abschnitt über Schrift im Bild: der Effekt aus dem Vorbild ist in das
Bild hineingerechnet und in HTML nicht verlässlich nachzubauen — die KI soll Felix danach
fragen statt `position` oder `background-image` zu versuchen.

**`SKILL.md` umgestellt** (Version 0.3.0 → 0.4.0): Verweis auf die Bausteine gleich im
Kopf, neuer neunteiliger Standard-Aufbau nach dem Vorbild statt der bisherigen acht
schlichten Punkte, und die Produktregel um die Felder ergänzt, die `shop_produkte`
wirklich liefert.

**Gegengeprüft.** Aus den neuen Blöcken wurde eine ganze Mail gebaut, mit vier echten,
verfügbaren Hoodies aus dem Shop (Namen, Preise, Bilder, Adressen live geholt), und durch
`mailAusHtml` geschickt: **beim Säubern wurde nichts entfernt**, kein Bild ohne gültige
Adresse, kein fremder Platzhalter, 14 161 Zeichen fertiges HTML. Die Blöcke überstehen
Vendos Prüfung also unverändert.

## Angepasste Tests

Zwei bestehende Zusicherungen in `tests/newsletter-bausteine.test.js` passten nicht mehr
zum gewollten Verhalten und wurden mitgeändert, nicht entfernt:

- „der Fuß … wird angehängt": erwartete den Linktext `Newsletter abbestellen`, jetzt
  `ABMELDEN`. Der Standardtext hat sich absichtlich geändert.
- „ein eigenes Logo im Baustein gewinnt gegen das der Marke": prüfte, dass das
  Marken-Logo **nirgends** im HTML steht. Im Fuß steht es jetzt absichtlich. Der Test
  prüft weiterhin dasselbe, aber nur noch im Kopf (alles vor `border-top`).
- „startVorlage liefert eine brauchbare Folge mit Kopf und Fuß": verlangte einen
  `kopf`-Baustein an erster Stelle. Den setzt Vendo jetzt selbst davor, also verlangt der
  Test das Gegenteil — keinen `kopf` in der Liste.

## Nicht geprüft

- **Das Aussehen in echten Postfächern (BLOCKED, braucht Zugangsdaten und Geräte).** Gmail,
  Outlook-Desktop, Apple Mail und Handy sind hier nicht prüfbar. Die Entscheidungen im Code
  sind darauf ausgelegt — Tabellen statt Flexbox, Inline-CSS, feste Pixelmaße am
  Icon-Kästchen, `border-top` statt `border-radius`, Bedingungskommentar für Outlook, kein
  SVG und kein `data:`-Bild —, belegt ist das erst mit „Beispielmail mit Logo an mich" aus
  dem Reiter „Zugang" und einem Blick in die drei Programme.
- **Die Oberfläche in Vendo (offen).** Dass die neuen Felder im Reiter „Zugang"
  erscheinen, sich speichern lassen und die Meldung über verworfene Adressen kommt, ist
  nicht in der laufenden App geprüft. `ansicht.js` ist syntaktisch geprüft, die Daten- und
  Speicherwege sind über `haupt.js` getestet. Weil `haupt.js` geändert wurde, muss Vendo
  einmal neu starten.
- **Icon-Bilder.** Ob eine eingetragene eigene Icon-Adresse ein Bild liefert, prüft Vendo
  nicht — nur, dass es eine `https`-Adresse ist.
- **Die Bilddateien selbst.** Vendo prüft nicht, ob ein PNG im Ordner wirklich das Logo
  des Netzwerks zeigt — nur, dass es sich lesen lässt. Ein ausgetauschtes Bild wirkt sofort,
  ohne Codeänderung.
- **Eingebettete Bilder im Postfach (BLOCKED, braucht Zugangsdaten).** Dass Gmail, Outlook
  und Apple Mail die mitgeschickten Icons auch anzeigen, ist hier nicht prüfbar. `cid:` ist
  der verbreitete Weg dafür; manche Programme zeigen auch eingebettete Bilder erst, wenn
  Bilder für den Absender erlaubt sind. Beleg erst über „Beispielmail mit Logo an mich“.
