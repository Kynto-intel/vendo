# Jarves-OS

**Felix' Kommandozentrale für Hermes – mit Luzzy in der Mitte.**

Jarves-OS ist eine eigene Desktop-App (Electron) für den Donnerwolf-Shop. Sie verbindet sich mit dem lokalen Hermes
und macht daraus eine Sprach- und Klick-Zentrale: Luzzy (Hermes-Profil `donnerwolf`) hört zu, antwortet mit ihrer
eigenen, lokalen Stimme, verteilt Aufgaben an ihre Crew, meldet Bestellungen und Mails, kennt Termine, Wetter,
Aufgaben und Notizen, findet und bearbeitet Dateien, steuert den PC – und vieles davon funktioniert sogar ohne Internet.

> **Grundregel: Hermes selbst wird nie verändert.** Jarves-OS nutzt nur, was Hermes von Haus aus anbietet
> (REST, WebSocket, eingebaute Befehle) und update-feste Einstellungen (Profile, config) – immer mit Sicherung.
> Nichts wird nachgebaut, was Hermes schon kann. Ein Hermes-Update macht nichts kaputt.

**Grundprinzip: Hermes ist das Gehirn, Jarves-OS ist das Gesicht.** Agenten, Werkzeuge, Skills, Gedächtnis, Jobs,
Kanban, Spracherkennung und Modelle kommen aus Hermes. Jarves-OS zeigt das schöner an, macht es per Stimme bedienbar
und bündelt alles an einem Ort.

- **Ziele:** mit Luzzy reden wie Tony Stark mit JARVIS · alle Agenten, Jobs und Aufgaben auf einen Blick · alles zum
  Shop auf Zuruf · Luzzy verteilt Arbeit an die Crew · Automationen und Meldungen im Blick.
- **Bewusst nicht:** kein eigener Agent, keine eigene Werkzeugsammlung oder Job-Planung, kein Server im Internet,
  keine Handy-App. Jarves-OS läuft nur auf Felix' PC.

## Inhalt

1. [Einrichten](#einrichten)
2. [Starten](#starten)
3. [Bedienung auf einen Blick](#bedienung-auf-einen-blick)
4. [Die Oberfläche](#die-oberfläche)
5. [Luzzy und die Crew](#luzzy-und-die-crew)
6. [Sprechen und Zuhören](#sprechen-und-zuhören)
7. [Luzzys Stimme (Pocket TTS)](#luzzys-stimme-pocket-tts)
8. [Alle Sprachbefehle](#alle-sprachbefehle)
9. [Dateien finden, anzeigen und bearbeiten](#dateien-finden-anzeigen-und-bearbeiten)
10. [PC-Steuerung](#pc-steuerung)
11. [Mehrere Gespräche](#mehrere-gespräche)
12. [Diktat, Ideen und Zwischenablage](#diktat-ideen-und-zwischenablage)
13. [Mini-Modus](#mini-modus)
14. [Meldungen und Wächter](#meldungen-und-wächter)
15. [Notfall-Luzzy (ohne Internet)](#notfall-luzzy-ohne-internet)
16. [Plugins](#plugins)
17. [Einstellungen](#einstellungen)
18. [Was in Hermes eingerichtet ist](#was-in-hermes-eingerichtet-ist-update-fest)
19. [Sicherheit, Regeln und Datenschutz](#sicherheit-regeln-und-datenschutz)
20. [Probleme lösen](#probleme-lösen)
21. [Sichern, Git und Updates](#sichern-git-und-updates)
22. [Aufbau (für Entwickler)](#aufbau-für-entwickler)

---

## Einrichten

**Voraussetzungen**

| Was | Wofür | Pflicht? |
|---|---|---|
| Windows 10/11 | PC-Steuerung, Musik-Erkennung, Verknüpfungen | ja |
| [Node.js](https://nodejs.org) (LTS) | Jarves-OS selbst | ja |
| Hermes mit Profil `donnerwolf` | Luzzy, Crew, Spracherkennung | ja |
| [uv](https://docs.astral.sh/uv/) | Luzzys Stimme (Pocket TTS) | ja, für die Stimme |
| Hugging-Face-Konto | einmalige Freigabe für Pocket TTS | ja, für die Stimme |
| Mikrofon / Headset | Sprechen mit Luzzy | empfohlen |
| [Ollama](https://ollama.com) | Notfall-Luzzy ohne Internet | optional |

**Einmalig einrichten** (jeden Befehl einzeln in PowerShell):

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
```
```
npm install
```

uv installieren (falls noch nicht da):

```
powershell -ExecutionPolicy ByPass -c "irm https://astral.sh/uv/install.ps1 | iex"
```

Pocket TTS freischalten: auf [huggingface.co/kyutai/pocket-tts](https://huggingface.co/kyutai/pocket-tts) anmelden,
den Bedingungen zustimmen, dann einmal anmelden (der Schlüssel bleibt auf dem PC, niemandem weitergeben):

```
uvx hf auth login
```

Beim ersten Start lädt Pocket TTS das deutsche Modell (gut 200 MB). Das dauert einmalig ein paar Minuten.

## Starten

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
```
```
npm start
```

Oder ohne Terminal: **Einstellungen → Start & Sicherung → „Verknüpfung auf dem Desktop anlegen“** (dort auch
„Mit Windows starten“). Hermes muss nicht vorher laufen: Jarves-OS dockt an ein laufendes Hermes an oder startet es selbst.

Beim Start fährt die **Donnerwolf-Startsequenz** hoch (Systemcheck: Hermes, Luzzy, Stimme, Plugins, Shopify,
Postfach), danach begrüßt Luzzy dich passend zur Tageszeit mit Bestellungen über Nacht, Mails, Terminen, Aufgaben
und Wetter. Klick oder Esc überspringt das Intro. Fenstergröße, Position und der zuletzt offene Bereich werden gemerkt.

## Bedienung auf einen Blick

**Tastenkürzel, die überall gehen** (auch wenn Jarves-OS im Hintergrund ist):

| Taste | Wirkung |
|---|---|
| **Strg+Leertaste** / **„Hey Luzzy“** | Sprechen |
| **Strg+Umschalt+H** | Freihändig an/aus (aus = Luzzy hört nur auf Knopfdruck, gut mit Headset oder in Anrufen) |
| **Strg+Umschalt+L** | Zwischenablage an Luzzy (aus jedem Programm) |
| **AltGr+L** / **Strg+Umschalt+M** | Mini-Modus an/aus |

**Tastenkürzel im Fenster:**

| Taste | Wirkung |
|---|---|
| **Strg+F** | Suchleiste oben in der Kopfleiste: Bots, Bereiche, Befehle, Notizen und Dateien |
| **Strg+P** | Befehlspalette: alle Befehle, Bereiche, Tastenkürzel und Sprachbefehle zum Tippen |
| **Strg+K** | Luzzys Chat öffnen/schließen (im Crew-Bereich) |
| **Strg+B** / **Strg+J** | Linke / rechte Leiste ein- und ausklappen |
| **Strg+Alt+←/→/↑** | Fenster an die linke/rechte Bildschirmhälfte / ganzer Bildschirm |
| **Strg+S** | Geöffnete Datei speichern (in der Dateiansicht) |
| **Esc** | Luzzy verstummt, Fenster schließen |

- **Oben:** Hermes, Mikrofon, Shopify, Postfach (grün = verbunden, Klick = neu prüfen), Nicht-stören-Symbol,
  Suchleiste, Datum, Uhrzeit und laufende Timer. Ist das Fenster schmal, kürzt sich die Leiste von selbst: erst das
  Datum, dann die Namen, zuletzt nur noch die farbigen Punkte (Name beim Drüberfahren). Klick auf „Mikrofon“ schaltet Freihändig um.
- **Suchleiste** (oben in der Kopfleiste, in jedem Bereich, Strg+F): nach allem suchen, der Treffer öffnet sich in der App. Gruppen:
  **Bots** (öffnet ein kleines Chat-Fenster unten rechts: direkt mit Kira, Lira oder Milla schreiben – derselbe Chat
  wie im Crew-Tab, ⤢ öffnet ihn groß), **Bereiche** und **Befehle** (wie in der Befehlspalette), **Notizen** aus dem
  Vault, **Dateien** auf dem PC (ohne Programm- und Hermes-Innereien) und ganz unten „Luzzy fragen“.
  ↑ ↓ wählen, Enter öffnet, Esc schließt.
- **Anhänge:** Datei oder Bild ins Fenster ziehen, 📎-Knopf oder Strg+V – geht mit der nächsten Nachricht an Luzzy.
  Hermes bekommt Bilder als Bild, PDFs Seite für Seite, den Rest als Datei.

## Die Oberfläche

**Links** die Bereiche, **in der Mitte** der gewählte Bereich, **rechts** Karten (Wetter, Crew live, Meldungen, Heute, Crew,
Timer, Plugin-Karten – welche und in welcher Reihenfolge stellst du in den Einstellungen ein). Die Farben wechseln
mit der Tageszeit: morgens heller, abends wärmer und dunkler.

| Gruppe | Bereich | Was er kann |
|---|---|---|
| **Luzzy** | **Zentrale** | **Cockpit** (siehe unten) und die Chat-Eingabe; Luzzys Reaktor sitzt unten in der rechten Spalte. Ohne Cockpit: Reaktor, Untertitel, Schnellbefehle, 📌 Antwort merken |
| | **Crew** | Bot-Karten, Normaler Chat, Bot Mode, Arbeitsbühne (siehe unten) |
| **Automation** | **Jobs** | Hermes-Jobs ansehen, ausführen, pausieren, löschen (mit Rückfrage) |
| | **Kanban** | Hermes-Kanban-Board |
| | **Routinen** | Auslösewort → Auftrag, mit Zeitplan und Schnellbefehlen |
| **Werkzeuge** | **Aufgaben** · **Kalender** · **Fokus** · **Gedanken** · **Wetter** · **Meilensteine** | Plugins, siehe [Plugins](#plugins) |
| **Wissen** | **Wissen** | Der Obsidian-Vault (`Documents\Donnerwolf`) zum Lesen, mit Morgenbericht |
| | **Bibliothek** · **Entscheidungen** · **Dateien** | Nachschlagen, offene Entscheidungen, Dokumente – nur lesend |
| **System** | **System** | Hermes, PC (Festplatte, Grafikkarte), Ollama, Nutzung/Kosten, **Kosten-Wächter**, **Shopify-Zugang**, **Selbsttest** |
| | **Terminal** | PowerShell in Jarves-OS mit den gängigen Hermes-Befehlen zum Anklicken und eigenen gespeicherten Befehlen (siehe unten) |

**Cockpit in der Zentrale** – auf einen Blick sehen, was los ist (abschaltbar: Einstellungen → Aussehen):

- **Instrumente:** Erfolgsquote der Agenten (mit Verlauf der letzten 14 Tage) · **Mission Control** mit der Zahl der
  Aufträge der letzten 30 Tage und dem Systemstatus · Ø Bearbeitungszeit (vom Auftrag bis zur fertigen Antwort) ·
  darunter Systemstatus, CPU, RAM und Festplatte.
- **Agenten-Orchestrierung:** Luzzy als Chefin oben (mit „arbeiten gerade“), darunter die 4 aktivsten Bots mit Anteil
  an den Aufträgen der letzten 24 Stunden, Ø Antwortzeit und Sitzungen. Ein Bot, der gerade arbeitet, leuchtet gold.
  Klick auf einen Bot öffnet das kleine Chat-Fenster.
- **Zentrale = nur Cockpit und Chat-Eingabe.** Luzzy (Reaktor, Name, Zustand, Sprach-Welle) sitzt unten in der rechten
  Spalte, ohne Untertitel – ihre Antworten hörst du, der Verlauf steht im Crew-Tab. Die Schnellbefehl-Knöpfe sind
  ausgeblendet (Routinen gehen weiter per Auslösewort, Befehlspalette oder Suchleiste). Freigabe-Karten und Anhänge
  erscheinen wie gewohnt über der Eingabe. Cockpit aus (Einstellungen → Aussehen): alles wieder wie früher.
- **So wird gerechnet** (Hermes selbst führt keine Erfolgsquote): Ein Auftrag ist jede Nachricht an einen Agenten – von
  dir oder von einem anderen Bot. Erfolgreich, wenn danach eine fertige Antwort kommt; gescheitert, wenn keine kommt.
  Ein gescheiterter Auftrag in den letzten 24 Stunden oder ein nicht erreichbarer Dienst setzt den Status auf
  „Eingeschränkt“, ohne Hermes auf „Gestört“. Jarves-OS rechnet nur, solange die Zentrale zu sehen ist.

**Terminal** (System → Terminal):

- Eine **echte PowerShell-Konsole** direkt in Jarves-OS, gebaut mit den Standard-Bausteinen **xterm.js** (Anzeige) und
  **node-pty** (Konsole) – wie das Terminal in VS Code. Farben, Tab-Vervollständigung, Pfeiltasten, Strg+C laufen wie
  gewohnt; auch interaktive Programme (`hermes chat`, `hermes model`, `hermes setup`) laufen direkt darin.
  `hermes …` geht ohne Pfad. Die Konsole läuft weiter, wenn du den Bereich wechselst.
- **Strg+C** kopiert markierten Text (sonst bricht es den laufenden Befehl ab), **Strg+V** fügt ein.
  „↻ Neu“ startet die Konsole neu. Leeren: `cls` eintippen.
- **Meine Befehle** (rechts): eine Liste zum Anklicken. Am Anfang 5 Standardbefehle (Hermes-Status, Gateway-Status,
  Gateway neu starten, Nach Update suchen, Nur Fehler). **Jeden** kannst du löschen (✕ beim Drüberfahren), eigene mit
  Name und Befehl speichern, „Standard wiederherstellen“ holt gelöschte Standardbefehle zurück. Befehle, die etwas
  stoppen, neu starten, löschen oder aktualisieren (⚠), fragen vorher nach.
  Gespeichert in einer eigenen Datei: `daten	erminal-befehle.json` (lokal, nicht im Git-Projekt, in „Jarves-OS sichern“
  enthalten). Von Hand bearbeiten geht auch – dabei Jarves-OS geschlossen lassen.
- Das Terminal bedienst nur du – Luzzy und die Crew haben darauf keinen Zugriff.

**Wissen & Co. im Detail** (alles nur lesend, nur im Ordner `Documents\Donnerwolf`):

- **Wissen:** der Obsidian-Vault mit Suche und Notiz-Links, Einstieg über `00_Übersicht.md`. Zugangsdaten in Notizen
  werden verdeckt. Änderungen am Vault macht Luzzy nur nach deinem Ja.
- **Morgenbericht:** Ein Hermes-Job erstellt ihn und legt ihn unter `04_Analytics\Morgenberichte\JJJJ-MM-TT.md` ab.
  Jarves-OS zeigt ihn als Karte, liest ihn vor und startet ihn über die Routine „Morgenbericht“ (mit Zeitplan) oder
  „Heute erstellen“.
- **Bibliothek:** Blog-Recherchen, Entwürfe, fertige Artikel und der Ordner `Donnerwolf\Bibliothek`, schön formatiert.
- **Entscheidungen:** das Entscheidungs-Tagebuch aus `Donnerwolf-Shop\04_Decision_Log\` mit Filter gilt / überholt /
  Prüfung fällig. Neue Entscheidungen legt Luzzy an.
- **Dateien:** Donnerwolf-Ordner und zuletzt geänderte Dateien, öffnen im Programm oder Explorer.
- **Jobs:** Hermes-Jobs aller Profile mit Zeitplan, letztem und nächstem Lauf; ausführen, pausieren, löschen (mit Rückfrage).
- **Kanban:** Hermes' eigenes Kanban-Board (Tafeln, Spalten, Aufgaben der Agenten).
- **Kosten-Wächter** (System): was Luzzy und die Crew heute und diesen Monat kosten (in Dollar, wie Hermes rechnet),
  dazu Tokens und Aufrufe, ein 14-Tage-Verlauf und wer wie viel verbraucht. Tages- und Monatsbudget eintragen:
  Luzzy warnt bei 80 % und 100 % (je einmal, als Meldung mit Warnton), auch wenn der System-Tab nicht offen ist.
  Kostenlose Modelle zählen 0 $ – dann zeigt der Verlauf die Tokens.

## Luzzy und die Crew

**Luzzy** ist Felix' rechte Hand bei Donnerwolf und läuft im Hermes-Profil `donnerwolf`. Ihr Charakter und ihre Regeln
stehen in `hermes\profiles\donnerwolf\SOUL.md`: direkt, warm, trocken im Humor, loyal, ehrliche Meinung, Ergebnis
zuerst, immer Deutsch und „du“. Jarves-OS schickt **keinen eigenen Persona-Text** mit – es gibt nur eine Luzzy, egal
ob Felix sie in der Hermes-App, in Telegram oder in Jarves-OS anspricht.

Luzzy ist die Chefin, die Crew sind die übrigen Hermes-Profile (alle außer `default`), zurzeit eine Design-Kette:
**Kira** (Trend-Scout) → **Lira** (Design-Konzept) → **Milla** (Listing-Texte für Shopify). Neue Profile erscheinen
automatisch, Bilder kommen aus `hermes\profiles\<bot>\assets\avatar.png`.

- **Aufbau wie ein Messenger:** links der Chat (oben Bild, Name und Rolle des gewählten Bots, die Reiter und
  „Aktualisieren“), rechts die Bots als Liste mit „Bot finden …“ und der Karte „Crew-Netzwerk“ (wie viele arbeiten).
  Im sehr schmalen Fenster rutscht die Bot-Liste als Leiste über den Chat.
- **Bot-Karten rechts:** Bild, Name, Rolle, zuletzt aktiv (Details wie Modell, Tokens und Kosten der letzten 30 Tage
  im Tooltip). Klick auf eine Karte öffnet den Chat mit diesem Bot, die gewählte Karte ist hervorgehoben.
- **💬 Normaler Chat:** direkt mit Luzzy, Kira, Lira oder Milla, ohne Bot Mode. Pro Bot mehrere Chats
  (anlegen, wechseln, mit dem Papierkorb-Symbol löschen über „Allgemein ▾“). Luzzys normaler Chat ist das Gespräch der Zentrale.
- **Aktualisieren** (oben rechts): lädt Bot-Karten und Bot-Liste neu und holt den offenen Chat frisch aus Hermes –
  z. B. nachdem du in der Hermes-App Nachrichten oder einen Chat gelöscht hast. Nichts geht dabei verloren.
  Hermes löscht einen Chat nicht, solange Jarves-OS ihn offen hat: dann erst in Jarves-OS zu einem anderen Chat wechseln.
- **🤖 Bot Mode:** der „Bot Chat“ eines Bots – dort arbeiten die Bots zusammen; bei Luzzy: Crew-Aufträge.
  Den Bot Chat nur für die Zusammenarbeit nutzen, sonst wird er lang, teuer und unübersichtlich.
- **🎬 Arbeitsbühne:** live sehen, wie die Bots zusammenarbeiten: Kette Luzzy → Kira → Lira → Milla, ein Brief wandert
  bei jeder Übergabe, darunter der Ablauf des Auftrags (Klick: ganzer Auftrag und Antwort, „Bot Chat öffnen“).
  Die Bot-Karten oben leuchten gold, solange ein Bot arbeitet. Jarves-OS liest die Bot Chats dafür nur mit.
- **Crew live (rechte Spalte):** zeigt immer nur den Bot, der gerade dran ist – Bild, was er tut („sucht im Netz · 1:20“),
  den Auftrag und eine kleine Kette (gold = arbeitet, grün = fertig). Ist er fertig und gibt weiter, wechselt die Karte
  von selbst zum nächsten Bot. Klick öffnet die Arbeitsbühne. Ein- und ausschalten: Einstellungen → Rechte Spalte.
- **Beim Namen rufen:** „Kira, was ist gerade Trend?“ geht in der Zentrale direkt an Kira (Antwort als Untertitel).
- **Modell ändern:** Zahnrad auf der Bot-Karte. Liste mit Suche, Anbieter zum Ein- und Ausklappen.
- **Im Crew-Bereich hört Luzzy nicht von selbst mit** (z. B. Musik im Headset). Sprechen geht dort mit Strg+Leertaste.
- **Freigaben:** Bei riskanten Befehlen erscheint eine Karte (Einmal erlauben · Für dieses Gespräch · Ablehnen) und
  Luzzy sagt, worum es geht – einfach „Ja“ oder „Nein“ sagen. Unter Luzzys Ja-Fragen stehen „Ja, mach“ / „Nein“.
- **Termine per Sprache:** „Luzzy, trag mir morgen um 10 Zahnarzt ein“ (Hermes-Skill `jarves-kalender`, meldet
  Überschneidungen; geht in Jarves-OS und der Hermes-App, nicht in Telegram).
- **Luzzy muss nicht suchen:** Bei Fragen zu Wetter, Terminen, Aufgaben und Notizen schickt Jarves-OS die Daten samt
  Datum und Uhrzeit gleich mit.

## Sprechen und Zuhören

- **Spracherkennung** macht Hermes (lokal, Deutsch). Aktivierungswort **„Hey Luzzy“**, oder Strg+Leertaste / Mikrofon-Knopf.
- **Freihändig** (Standard an): Luzzy hört von selbst auf „Hey Luzzy“. Aus = nur auf Knopfdruck. Umschalten:
  Strg+Umschalt+H, Klick auf „Mikrofon“ oben oder in den Einstellungen.
- **Gesprächsmodus:** Nach Luzzys Antwort hört sie kurz weiter zu, du kannst direkt weiterreden.
- **Früh vorlesen:** Luzzy spricht, sobald der erste Satz fertig ist, nicht erst am Ende der Antwort.
  Lange Antworten liest sie gekürzt vor („Den Rest hab ich dir unten hingeschrieben“).
- **Unterbrechen:** einfach reinreden, „Stopp“ / „Hey Luzzy“ sagen oder Esc. Luzzy lernt dabei ihr eigenes Echo
  kennen und bricht nicht wegen ihrer eigenen Stimme ab.
- **Musik erkennen:** Läuft Musik oder ein Video auf dem PC, zählt das nicht als Sprache; bei „Hey Luzzy“ pausiert
  die Musik kurz und läuft danach weiter.

## Luzzys Stimme (Pocket TTS)

Luzzy spricht mit **Pocket TTS** (Kyutai, deutsches Modell), **komplett lokal auf dem PC**. Kein Text geht dafür ins
Internet, es kostet nichts, und die Stimme ist schneller als Echtzeit.

- **13 weibliche Stimmen:** Alba, Anna, Azelma, Caro, Cosette, Eponine, Estelle, Eve, Fantine, Jane, Lola, Mary, Vera.
  Alle sprechen Deutsch; die Sprecherinnen stammen aus anderen Sprachen, ein leichter Akzent ist möglich.
- **Eigene Stimme:** eine saubere Aufnahme (WAV/MP3, 10 bis 30 Sekunden, ohne Musik) wählen – **nur von jemandem,
  der zugestimmt hat**.
- **Tempo** (−20 bis +20 %) und **Lautstärke** (100 bis 400 %, Standard 250 %; ein Begrenzer verhindert Übersteuern).
- **Probe hören** in Einstellungen → Stimme. Dort steht auch, ob Pocket TTS läuft.
- Jarves-OS startet `uvx pocket-tts serve --language german` beim Start selbst (nur auf 127.0.0.1) und beendet es
  beim Schließen. Nach dem Start braucht Luzzy ein paar Sekunden, bis sie sprechen kann.

## Alle Sprachbefehle

Diese Befehle erledigt Jarves-OS **selbst** – sofort, ohne auf Hermes zu warten, kostenlos und ohne Internet.
Alles andere geht an Luzzy. Die komplette Liste steht auch in der Befehlspalette (Strg+P).

| Thema | Beispiele |
|---|---|
| Stoppen / Wiederholen | „Stopp“, „Sei still“, „Das reicht“ · „Wiederhol das“, „Was hast du gesagt?“ |
| Timer & Wecker | „Timer 15 Minuten für die Nudeln“, „Weck mich um 7“, „Erinner mich um 14 Uhr an den Anruf“, „Wie lange noch für die Nudeln?“, „Timer um 5 Minuten verlängern“, „Nudel-Timer stoppen“ |
| Nicht stören | „Bis 15 Uhr keine Meldungen“, „Nicht stören für 30 Minuten“, „Bitte nicht stören“ (1 Stunde), „Meldungen wieder an“ |
| Freihändig | „Hör nur auf Knopfdruck“, „Freihändig aus“ bzw. Strg+Umschalt+H |
| Selbsttest | „Mach einen Selbsttest“, „Systemcheck“ |
| Gespräche | „Neues Gespräch Shop“, „Wechsel zum Gespräch Privat“, „Welche Gespräche gibt es?“ |
| Dateien | „Such die Datei Thor-Hoodie und öffne sie“, „Öffne die Preisliste“, „Zeig mir das Bild Logo“, „die zweite“ |
| Datei ändern | (Datei offen) „Ändere den Preis auf 39 Euro“, „Kürze den zweiten Absatz“, „Übersetze das ins Englische“ |
| PC-Steuerung | „Öffne Photoshop“, „Öffne Netflix und such Terminator“, „Spiel Metallica auf YouTube“, „Lauter“, „Lautstärke auf 30 Prozent“, „Nächstes Lied“, „Musik Pause“, „Öffne Downloads“, „Sperr den PC“ |
| Diktat | „Diktat“ (lange Aufnahme), „Diktat: …“, „Schreib eine Mail an Jana, dass …“ |
| Ideen & Notizen | „Neue Idee: …“ (in den Vault), „Merk dir: Stoffproben bestellen“ |
| Aufgaben | „Neue Aufgabe: Etiketten bestellen bis Freitag“, „Erledigt: Etiketten“, „Was muss ich heute noch?“ |
| Fokus | „Fokus 25 Minuten“, „Fokus beenden“ |
| Routinen | das Auslösewort, z. B. „Morgenbericht“, „Feierabend“, „Shop-Check“ |
| Crew | „Kira, …“, „Lira, …“, „Milla, …“ |
| Freigaben | „Ja“ / „Nein“, wenn eine Freigabe-Karte offen ist |

## Dateien finden, anzeigen und bearbeiten

**Finden:** „Luzzy, such die Datei … und öffne sie“ oder in die Eingabe tippen. Jarves-OS durchsucht den **ganzen PC**
(alle Laufwerke, auch AppData und OneDrive) – außer Windows- und Programmordnern. Der Index wird im Hintergrund
aufgebaut und gemerkt (`daten\dateiindex.txt`). Hörfehler werden verziehen („Donnerwolf Soul“ findet `SOUL.md`).
Mehrere Treffer: Liste zum Anklicken oder „die zweite“ sagen. Auch ein Pfad geht direkt.

**Anzeigen:** Die Datei erscheint in einem Fenster über Jarves-OS, ohne eigenen Tab: Notizen (Markdown), Texte,
Tabellen (CSV), Bilder, PDF, Videos und Musik. Alles andere (Word, Excel …): „Mit Programm öffnen“ oder „Im Ordner zeigen“.

**Bearbeiten:** Knopf „Bearbeiten“, dann selbst tippen – oder Luzzy sagen, was sie ändern soll. Ihre Änderungen
erscheinen **live** im Text und als Liste zum Nachvollziehen. **Gespeichert wird nur, wenn du auf „Speichern“ klickst
(oder Strg+S)** – Luzzy speichert nie selbst. Vor jedem Speichern legt Jarves-OS eine Sicherung an
(`daten\datei-sicherungen\`), „Rückgängig“ holt den alten Stand zurück. Wurde die Datei inzwischen woanders geändert,
warnt Jarves-OS, statt zu überschreiben.

**Nie gefunden oder gezeigt** werden geheime Dateien: Hermes-`config.yaml`/`.env`/Zugänge, Schlüssel und Tokens,
Browser- und Windows-Anmeldedaten.

## PC-Steuerung

Luzzy öffnet Programme und Seiten und steuert Ton und Musik – ohne KI, direkt und sofort:

- **Programme:** alles aus dem Startmenü, auch Store-Apps („Öffne Photoshop“, „Starte Spotify“).
- **Browser und Seiten:** „Öffne den Browser und geh auf Netflix und such Terminator“, „Öffne Chrome und geh auf
  chefkoch.de“. Suche direkt auf YouTube, Netflix, Google, Google Maps, Amazon, Prime Video, Spotify, Wikipedia,
  eBay, Etsy, Twitch, Pinterest, TikTok, Instagram, Facebook; dazu Disney+, Shopify-Admin, Gmail.
  Gibt es die Seite als App (Netflix, Spotify …), öffnet Jarves-OS die App.
- **Ton und Musik:** lauter/leiser (auch „viel“, „etwas“), „Lautstärke auf 30 Prozent“, „Ton aus“, „Nächstes Lied“,
  „Vorheriges Lied“, „Musik Pause/weiter“.
- **Ordner:** Desktop, Downloads, Dokumente, Bilder, Musik, Videos, Donnerwolf, Jarves-OS.
- **PC sperren.**

**Nie:** beliebige Befehle, Herunterfahren, Programme schließen, Programme über einen Pfad starten.

## Mehrere Gespräche

Themen getrennt halten (Shop, Privat, ein Projekt): Liste oben im Gespräch („Allgemein ▾“), Wechsel mit einem Klick
oder per Stimme. Jedes Thema ist eine eigene Hermes-Unterhaltung, Luzzy behält pro Thema den Faden.
Löschen geht nur mit Rückfrage.

## Diktat, Ideen und Zwischenablage

- **Diktat:** frei drauflos reden, auch länger (Pausen bis 3,5 Sekunden). Luzzy macht daraus eine fertige Mail,
  Nachricht oder einen Text und legt ihn **in die Zwischenablage** (Strg+V). Abschicken tust du selbst.
- **„Neue Idee: …“** – Luzzy legt eine saubere Notiz mit Datum und Schlagworten in den Vault
  (`Donnerwolf-Shop\Jarves-OS\Ideen\`, das Original-Diktat steht mit drin).
- **📌 Antwort merken:** speichert eine Antwort als Notiz in `Donnerwolf-Shop\Jarves-OS\Gemerkte Antworten\`.
- **Zwischenablage an Luzzy:** in irgendeinem Programm Text kopieren, **Strg+Umschalt+L**: zusammenfassen,
  verbessern, übersetzen oder beantworten. Das Ergebnis kommt zurück in die Zwischenablage.

## Mini-Modus

Eine schmale Leiste **fest oben in der Bildschirmmitte**, immer im Vordergrund, zeigt nur Luzzys Stimme als Balken.
So kannst du jederzeit mit ihr reden, ohne dass Jarves-OS Platz braucht.
**AltGr+L** oder Strg+Umschalt+M: an/aus · **Klick:** sprechen · **Doppelklick:** großes Fenster.

**„Luzzy, was siehst du?“** (nur im Mini-Modus): Luzzy macht **ein** Bildschirmfoto vom Bildschirm mit der Maus,
sagt, was sie sieht, und hilft bei dem, was offen ist (Fehlermeldung, Shopify-Seite, Design). Geht nur auf deinen Befehl,
nie heimlich; die Leiste leuchtet dabei weiß. Das Foto wird nicht gespeichert. Auch: „Schau dir das an“,
„Schau mal auf den Bildschirm“, „Kannst du das sehen?“ – gern mit Frage dahinter („Was siehst du, warum geht das nicht?“).

## Meldungen und Wächter

Jarves-OS prüft regelmäßig und meldet (rechts in der Liste und auf Wunsch laut, mit Ton):

- **Neue Bestellungen** – „Der Laden redet mit dir“: „Thor-Hoodie in L nach Hamburg, dritte Bestellung von dieser
  Person“. Ohne Namen und Adresse, nichts wird gespeichert. Ton: Horn.
- **Neue Mails** (über das IONOS-Mail-Plugin von Hermes), **fehlgeschlagene Jobs** (Warnton),
  **Meilensteine** (10., 25., 50., 100. … 1.000. Bestellung, danach alle 500 – Luzzy feiert mit),
  **Termine, fällige Aufgaben, Timer, Crew-Antworten**.
- Luzzy redet nicht dazwischen, wenn du sprichst oder sie antwortet. **Ruhezeit** (z. B. 22 bis 7 Uhr),
  **Nicht stören** und **Fokus** halten sie still – die Meldungen landen trotzdem in der Liste. Timer klingeln immer.

**Shopify-Zugang erneuern:** System → Shopify-Zugang → Token eintragen → „Prüfen & eintragen“. Jarves-OS prüft ihn bei
Shopify, trägt ihn überall in Hermes ein (Hermes und alle Bots, `config.yaml` und `.env`, mit Sicherung) und lädt
Hermes neu – ohne Neustart. Der Token wird nie angezeigt, geloggt oder gespeichert.

## Notfall-Luzzy (ohne Internet)

Ist Hermes nicht erreichbar oder scheitert eine Antwort an Internet oder Cloud-Modell, antwortet Luzzy **lokal über
Ollama** (kleinstes vorhandene Modell, z. B. `gemma4:12b`; Jarves-OS startet Ollama selbst). Sie kennt Datum,
Uhrzeit, Termine, Aufgaben und Notizen; Shop, Mails und Internet gehen dann nicht, das sagt sie ehrlich.
Solche Antworten sind mit **„🛟 Notbetrieb“** markiert. Timer, Notizen, Aufgaben, PC-Steuerung, Dateisuche und
Luzzys Stimme laufen ohnehin ohne Internet.

## Plugins

Je ein Ordner in `plugins\<id>\` – eigener Bereich links, optional eine Karte rechts
(Anleitung zum Selberbauen: [`plugins/README.md`](plugins/README.md)).

| Plugin | Was es kann |
|---|---|
| **Routinen** | Deine Standardaufgaben: Auslösewort sagen oder tippen, Luzzy erledigt den hinterlegten Auftrag. Bausteine (Wetter, Termine, Shop, Postfach …) werden automatisch angehängt. Mit Zeitplan (z. B. Morgenbericht werktags 7:30) und als Schnellbefehle über der Eingabe |
| **Kalender** | Eigener Kalender (statt Google/Outlook): Monatsansicht zum Einklappen, Tagesliste, Suche, Erinnerung vor Terminen, „Heute“-Karte rechts; Luzzy trägt per Sprache ein, ändert und löscht (auch Post-Termine für Instagram/Facebook) |
| **Aufgaben** | To-do-Liste mit Fälligkeit und Erinnerung, dazu das **Wochen-Review**: Sonntagabend fasst Luzzy die Woche zusammen, fragt nach Zielen und legt sie als Aufgaben an |
| **Gedanken** | Gedankenspeicher: „Merk dir: …“, landet auch im Vault (`Jarves-OS\Gedankenspeicher.md`); Ideen in `Jarves-OS\Ideen\` |
| **Fokus** | Pomodoro-Timer mit Hintergrundklang; in der Fokuszeit stört Luzzy nicht |
| **Wetter** | Jetzt und 7 Tage für deinen Ort (Open-Meteo, kostenlos, ohne Konto; übertragen wird nur der Ort) |
| **Meilensteine** | Bestellungen insgesamt, der nächste Meilenstein und alle erreichten (Liste auch im Vault) |
| **Werkstatt** | Neue Plugins in eigenen Worten bestellen („Bau mir ein Plugin für …“): Luzzy baut sie in `werkstatt\`, Jarves-OS prüft Aufbau, Syntax und Rechte (✓ Sicher · ⚠ Braucht Rechte · ⛔ Vorsicht), eingebaut wird erst nach deinem Ja (altes Plugin gesichert, deine Daten bleiben). **Vorher Pflicht: Testlauf** in einem eigenen Fenster (Plugin wie echt ausprobieren; Daten nur simuliert, Hintergrundteil in einem eigenen Prozess – Absturz oder Aufhängen betrifft nur den Test). **Notbremse:** Stürzt die Oberfläche nach dem Einbauen ab oder hängt sie, wird das neue Plugin beim nächsten Start automatisch abgeschaltet (normales Schließen zählt nicht; entfernte Plugins vergisst sie). **Luzzy repariert selbst:** Sie baut mit ihrem Hermes-Skill `jarves-plugin-werkstatt`, prüft sich mit dem Prüfprogramm und liest die Fehler aus deinem Testlauf; „🔧 Luzzy soll die Fehler beheben“ schickt sie ihr. Auch eingebaute Plugins ändern lassen oder entfernen; danach Jarves-OS neu starten (Knopf) |

Plugin-Daten (`plugins\*\daten.json`) bleiben lokal und gehören nicht ins Git-Projekt.

## Einstellungen

Knopf „Einstellungen“ unten links. Gespeichert in `daten\einstellungen.json` (bleibt lokal, ist in der Sicherung enthalten).

| Tab | Was du einstellst |
|---|---|
| **Stimme** | Stimme (13 Stimmen oder eigene Aufnahme), Tempo, Lautstärke, automatisch vorlesen, Probe hören |
| **Sprechen** | Freihändig, im Crew-Bereich nicht mithören, „Hey Luzzy“, sofort abschicken, weiter zuhören, Unterbrechen, Musik erkennen, Mikrofon-Status |
| **Meldungen** | Was gemeldet und vorgelesen wird, Ton, Ruhezeit |
| **Aussehen** | Animationen (Reaktor, Welle, Scanlinie, Hintergrund), Farben nach Tageszeit |
| **Rechte Spalte** | Welche Karten sichtbar sind und in welcher Reihenfolge |
| **Start & Sicherung** | Intro, Begrüßung, Verknüpfung, mit Windows starten, „Jarves-OS sichern“ |

## Was in Hermes eingerichtet ist (update-fest)

| Wo | Was |
|---|---|
Alles liegt unter `C:\Users\Felix\AppData\Local\hermes\` in Profil- bzw. Nutzer-Einstellungen, die ein Hermes-Update
nicht anfasst. Am Hermes-Programm (`hermes-agent\`) wurde nie etwas geändert.

| Wo | Was | Sicherung |
|---|---|---|
| `profiles\donnerwolf\config.yaml` | Spracherkennung an, Deutsch (`stt.enabled`, `stt.language: de`, Modell `base`) | `config.yaml.vor-jarves-os-20260926-0207.bak` |
| `profiles\donnerwolf\config.yaml` | Aktivierungswort (`wake_word`: provider sherpa, phrase „hey luzzy“, capture client, surface tui, sensitivity 0.45) | `config.yaml.vor-jarves-os-phase2-*.bak` |
| `profiles\donnerwolf\skills\productivity\jarves-plugin-werkstatt\` | Skill: wie Luzzy Jarves-OS-Plugins baut, prüft und repariert (Werkstatt) | – (neu) |
| `profiles\donnerwolf\skills\productivity\jarves-kalender\` | Skill, damit Luzzy Termine einträgt (`scripts\termin.py`: neu, ändern, löschen, suchen, liste; meldet Überschneidungen) | – (neu) |
| `config.yaml` / `.env` (Hermes und Profile) | Shopify-Token – nur über System → Shopify-Zugang | automatisch bei jedem Eintragen |

`surface: tui` sorgt dafür, dass nur Jarves-OS das Aktivierungswort bekommt, nicht die Hermes-App.
Empfindlichkeit: höher = strenger. Termine per Sprache gehen überall, wo Luzzy das Terminal-Werkzeug hat
(Jarves-OS, Hermes-App), nicht in Telegram.

**So spricht Jarves-OS mit Hermes:**

- **Nur ein Hermes-Backend pro PC.** Läuft schon eins (z. B. weil die Hermes-App offen ist), dockt Jarves-OS an –
  die Adresse steht in `hermes\spawn-ledger.json`. Sonst startet es selbst `hermes serve --host 127.0.0.1 --port 0`.
  Alles nur lokal (127.0.0.1).
- **REST** mit Kopfzeile `X-Hermes-Session-Token`, **Live-Verbindung** `ws://127.0.0.1:<port>/api/ws?token=…`
  (JSON-RPC, Antworten kommen Wort für Wort: `message.start/delta/complete`, `tool.start/complete`, `thinking.delta` …).
- **Gespräche:** Zentrale = Luzzys Chat „Jarves-OS“ (weitere Themen „Jarves-OS · <Name>“), Crew = Luzzys fester
  „Bot Chat“ (nur dort hat sie `message_agent` und kann an die Bots delegieren), Bots = je ein Chat „Jarves-OS“ im
  Profil des Bots. Arbeitsordner der Sitzungen: `Documents\Donnerwolf`. Ist eine Unterhaltung weg, legt Jarves-OS
  sie neu an. Lange Chats fasst Hermes selbst zusammen.
- **Spracherkennung:** Jarves-OS nimmt das Mikrofon selbst auf und schickt den Ton an `POST /api/audio/transcribe`,
  Hermes schreibt ihn lokal mit faster-whisper mit. Das Aktivierungswort läuft über `wake.feed`.
- **Genutzte Befehle:** `session.*` (list, create, resume, title, close, delete, active_list), `prompt.submit`,
  `approval.respond`, `image.attach` / `image.attach_bytes` / `pdf.attach` / `file.attach`, `reload.env`,
  `reload.mcp`, `skills.reload`, `wake.*`.
- **Gelesen über REST:** `/api/profiles` (auch Modell pro Bot ändern), `/api/sessions`, `/api/analytics/usage`,
  `/api/cron/jobs` (ausführen, pausieren, fortsetzen, löschen), `/api/plugins/kanban/*`, `/api/config`, Status.

## Sicherheit, Regeln und Datenschutz

- **Hermes nie verändern**, nichts nachbauen, was Hermes kann. Luzzys Shop-Regeln bleiben: nichts veröffentlichen
  und nichts im Shop ändern ohne Felix' Ja.
- **Zugangsdaten** (Shopify-Token, Hermes-Schlüssel) nie anzeigen, loggen, speichern oder an die Oberfläche geben.
  Geheime Dateien werden von der Dateisuche nie gefunden.
- **Dateien** nur speichern, wenn Felix klickt – mit Sicherung und „Rückgängig“. **Vault-Schreiben** nur in
  `Donnerwolf-Shop\Jarves-OS\` und nie überschreiben. Wissen, Bibliothek & Co. sind nur lesend.
- **PC-Steuerung** nur geprüfte Aktionen: nie beliebige Befehle, Herunterfahren, Schließen, Programme per Pfad.
- **Löschen** (Jobs, Gespräche, Chats) nur nach Rückfrage.
- **Was das Haus verlässt:** Nachrichten an Luzzy gehen an das Modell, das in Hermes eingestellt ist. Die Stimme
  (Pocket TTS), Spracherkennung, Dateisuche, PC-Steuerung, Timer und Notizen bleiben auf dem PC. Das Wetter bekommt
  nur den Ort. Das Mikrofon darf nur Jarves-OS selbst benutzen.

## Probleme lösen

Erster Schritt immer: **„Mach einen Selbsttest“** (oder System → Selbsttest). Er sagt, was nicht geht und was zu tun ist.

| Problem | Lösung |
|---|---|
| Luzzy spricht nicht, Status „uv ist nicht installiert“ | uv installieren (siehe [Einrichten](#einrichten)), Jarves-OS neu starten |
| Status „braucht die Hugging-Face-Freigabe“ | Auf huggingface.co/kyutai/pocket-tts zustimmen, dann `uvx hf auth login` |
| Pocket TTS „Zeichensatz-Fehler“ | Setzt Jarves-OS selbst (`PYTHONUTF8=1`); nur bei Tests im Terminal vorher `$env:PYTHONUTF8=1` |
| Luzzy ist zu leise | Einstellungen → Stimme → Lautstärke höher |
| Nach dem Start kurz keine Stimme | Normal: Pocket TTS braucht ein paar Sekunden, beim allerersten Mal ein paar Minuten |
| Luzzy reagiert auf Musik oder Gespräche im Headset | Freihändig aus (Strg+Umschalt+H) – dann nur auf Knopfdruck |
| „Hey Luzzy“ geht nicht | Mikrofon-Status in Einstellungen → Sprechen prüfen; in Hermes (Profil donnerwolf) das Aktivierungswort |
| Datei wird nicht gefunden | Kurz warten, der Index baut sich im Hintergrund auf; genauer benennen oder Endung dazusagen („… PDF“) |
| Shopify rot | System → Shopify-Zugang: neuen Token eintragen |
| Mini-Modus-Taste geht nicht | Ein anderes Programm belegt sie (z. B. Teams) – die andere Taste oder den Mini-Knopf nehmen |

## Sichern, Git und Updates

`npm run backup` (oder Einstellungen → Start & Sicherung → „Jarves-OS sichern“) legt eine Kopie in
`Desktop\jarves-os\backup\` an. Das Projekt liegt privat auf GitHub (Kynto-intel/jarves-os); `daten\` und
Plugin-Daten bleiben lokal.

**Neuen Stand holen** (jeden Befehl einzeln, ohne das `PS C:\...>` davor):

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
```
```
git switch main
```
```
git pull
```

Neue Funktionen kommen direkt auf `main` oder als Pull Request auf dem Branch `claude/fervent-pasteur-dft0hp`.

**Neue Ideen** (Runde 2: Optimierungen, Stimme, Killer-Funktionen, ungenutzte Hermes-Funktionen): [`ideen.md`](ideen.md).

**Für später** (bewusst nicht gebaut): eine kostenpflichtige ElevenLabs-Stimme, falls Pocket TTS einmal nicht reicht.
Neue Wünsche am einfachsten als Plugin über die [Werkstatt](#plugins) bauen lassen.

**Bewusst gestrichen:** Produktideen-Schmiede (macht die Crew mit Kira → Lira → Milla schon) und Social-Planer
(Post-Termine stehen im Kalender, veröffentlicht wird nur nach deinem Ja).

## Aufbau (für Entwickler)

Electron 38, reines JavaScript ohne Build. Abhängigkeiten: `ws` (Hermes-Verbindung), `node-pty`, `@xterm/xterm` und `@xterm/addon-fit` (Terminal; node-pty bringt fertige Windows-Dateien mit, nichts muss kompiliert werden).

| Ordner / Datei | Inhalt |
|---|---|
| `src/main/main.js` | Hauptprozess: Fenster, Mini-Fenster, Tastenkürzel, IPC, Protokoll `jarves-datei:` |
| `src/main/hermes.js` | Verbindung zu Hermes (WebSocket-RPC und REST), Gespräche, Bot Chats |
| `src/main/waechter.js` | Bestellungen, Mails, Jobs, Meilensteine |
| `src/main/pocket.js` | Luzzys Stimme: Pocket-TTS-Server starten/stoppen, Sprechen |
| `src/main/dateisuche.js` | Index über den ganzen PC, Suche, Anzeigen, Speichern mit Sicherung |
| `src/main/pc.js` | Programme, Webseiten, Tasten, Lautstärke, Ordner, Sperren (geprüft) |
| `src/main/notfall.js` · `musik.js` · `wissen.js` | Ollama-Notbetrieb · Musik-Erkennung · Vault lesen |
| `src/main/vaultschreiben.js` · `shopifytoken.js` · `plugins.js` · `einstellungen.js` | Vault schreiben (eng begrenzt) · Shopify-Token · Plugin-Host · Einstellungen |
| `src/preload.js` · `src/mini-preload.js` | Sichere Brücke `window.jarves` zur Oberfläche |
| `src/renderer/` | Oberfläche (ES-Module): `app.js` (Zentrale, Befehle), `vorlesen.js`, `mikrofon.js`, `crewchat.js`, `buehne.js`, `ansichten.js`, `dateiansicht.js`, `pcsteuerung.js`, `gespraeche.js`, `diktat.js`, `meldungen.js`, `timer.js`, `palette.js`, `selbsttest.js`, `mini.js` … |
| `plugins/` | Plugins (siehe oben) |
| `plugins/werkstatt/` | Werkstatt: Prüfung, Testlauf-Fenster (`test.html`, `test-runner.js`), Prüfprogramm für Luzzy (`pruefen-cli.js`) |
| `werkstatt/` | Plugin-Entwürfe, an denen Luzzy baut (nicht in Git) |
| `scripts/backup.js` | Sicherung |
| `daten/` | Einstellungen, Dateiindex, Datei-Sicherungen, Notbremse (`plugin-start.json`) – nicht in Git |

**Design:** Donnerwolf Gold auf Anthrazit, alle Farben zentral in `src/renderer/style.css` unter `:root`
(Mitte `#131315`, Seitenspalten `#0E0E10`, Karten `#19191C`, Eingaben `#101012`, Rahmen `#26262A`, Gold `#C9A14A`,
helles Gold `#E3BE6C`, Text `#ECE6DA`, leiser Text `#8C877E`). Karten mit runden Ecken und weichem Schatten, Gold nur
als Akzent, Monospace für Status und Zahlen. Reaktor mit drehenden Ringen, Sprach-Welle, Scanlinie – alles abschaltbar.
Plugins nutzen dieselben Variablen und Klassen (`hud`, `knopf-gold`, `knopf-flach`, `leise`).

**Testmodus** (Umgebungsvariablen):

| Variable | Wirkung |
|---|---|
| `JARVES_TEST_STUMM=1` | ohne Intro und Vorlesen |
| `JARVES_TEST_ANSICHT=<bereich>` | startet in diesem Bereich |
| `JARVES_TEST_JS=<code>` + `JARVES_TEST_JS_NACH=<ms>` | führt Code in der Oberfläche aus (Ergebnis als `TEST-ERGEBNIS:`) |
| `JARVES_SCREENSHOT=<datei>` + `JARVES_SCREENSHOT_NACH=<ms>` | Bild der App, danach beenden |
| `JARVES_TEST_INTRO` · `JARVES_TEST_FREIGABE` | Intro zeigen · Freigabe-Anfrage vorspielen |
| `JARVES_TEST_MIKROFON=<wav>` | Mikrofon aus einer WAV-Datei |
| `JARVES_TEST_PC=1` · `JARVES_TEST_PROGRAMME` | PC-Aktionen nur protokollieren · Programmliste vorgeben |
| `JARVES_TEST_DATEIEN` · `JARVES_TEST_VAULT` · `JARVES_TEST_HERMES_HOME` | Dateisuche · Vault · Hermes-Ordner auf Testordner |
| `JARVES_TEST_TAGESZEIT` · `JARVES_TEST_MELDUNG` · `JARVES_TEST_NACHRICHT` | Tageszeit-Farben · Meldung · Nachricht vorspielen |
| `JARVES_TEST_POCKET=<url>` | schon laufenden Pocket-TTS-Server nutzen |
