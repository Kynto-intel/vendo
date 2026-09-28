# Jarves-OS

**Felix' Kommandozentrale für Hermes – mit Luzzy in der Mitte.**

Jarves-OS ist eine eigene Desktop-App (Electron) für den Donnerwolf-Shop. Sie verbindet sich mit dem lokalen Hermes
und macht daraus eine Sprach- und Klick-Zentrale: Luzzy (Hermes-Profil `donnerwolf`) hört zu, antwortet mit Stimme,
verteilt Aufgaben an ihre Crew, meldet Bestellungen und Mails, kennt Termine, Wetter, Aufgaben und Notizen – und
vieles davon funktioniert sogar ohne Internet.

> Grundregel: **Hermes selbst wird nie verändert.** Jarves-OS nutzt nur, was Hermes von Haus aus anbietet
> (REST, WebSocket, eingebaute Befehle) und update-feste Einstellungen. Ein Hermes-Update macht nichts kaputt.

## Starten

```
cd C:\Users\Felix\Desktop\jarves-os\jarves-os
npm start
```

Oder ohne Terminal: **Einstellungen → Starten → „Verknüpfung auf dem Desktop anlegen“** (dort auch „Mit Windows
starten“). Hermes muss nicht vorher laufen: Jarves-OS dockt an ein laufendes Hermes an oder startet es selbst.

Beim Start fährt die **Donnerwolf-Startsequenz** hoch (Systemcheck: Hermes, Luzzy, Stimme, Plugins, Shopify,
Postfach), danach begrüßt Luzzy dich mit Bestellungen, Mails, Terminen und Wetter. Klick oder Esc überspringt.

**Voraussetzungen:** Windows, Node.js, Hermes mit Profil `donnerwolf`. Optional: Ollama (Notbetrieb), Mikrofon.

## Bedienung auf einen Blick

| Taste | Wirkung |
|---|---|
| **Strg+Leertaste** / **„Hey Luzzy“** | Sprechen (auch im Hintergrund) |
| **Strg+Umschalt+H** / Klick auf „Mikrofon“ oben | Freihändig an/aus: aus = Luzzy hört nur auf Knopfdruck (Headset, Anrufe). Im Crew-Bereich hört sie automatisch nur auf Knopfdruck |
| **Strg+K** | Luzzys Chat öffnen/schließen (im Crew-Tab) |
| **Strg+P** | Befehlspalette: alle Befehle, Tastenkürzel und Sprachbefehle |
| **Strg+Umschalt+L** | Zwischenablage an Luzzy (aus jedem Programm) |
| **AltGr+L** / Strg+Umschalt+M | Mini-Modus |
| **Esc** | Luzzy verstummt, Fenster schließen |

- **Oben:** Hermes, Mikrofon, Shopify, Postfach (grün = verbunden, Klick = neu prüfen), Datum, Uhrzeit, Timer.
- **Rechts** (einstellbar): Wetter, Meldungen, Heute, Crew, Timer, Plugin-Karten.
- **Anhänge:** Datei/Bild ins Fenster ziehen, 📎-Knopf oder Strg+V – geht mit der nächsten Nachricht an Luzzy.

## Die Bereiche

| Gruppe | Bereiche |
|---|---|
| **Luzzy** | **Zentrale** (Reaktor, Untertitel, Schnellbefehle, Eingabe) · **Crew** (Bot-Karten, Normaler Chat, Bot Mode) |
| **Automation** | **Jobs** (Hermes-Jobs ausführen/pausieren/löschen) · **Kanban** · **Routinen** |
| **Werkzeuge** | **Aufgaben** · **Kalender** · **Fokus** · **Gedanken** · **Wetter** · **Meilensteine** |
| **Wissen** | **Wissen** (Vault) · **Bibliothek** · **Entscheidungen** · **Dateien** |
| **System** | Hermes, PC, Ollama, Nutzung/Kosten, **Shopify-Zugang**, Selbsttest |

## Luzzy und die Crew

Luzzy ist die Chefin, die Crew sind die übrigen Hermes-Profile: **Kira** (Trend-Scout) → **Lira** (Design-Konzept) →
**Milla** (Listing-Texte). Neue Profile erscheinen automatisch, Bilder kommen aus `hermes\profiles\<bot>\assets\avatar.png`.

- **💬 Normaler Chat:** direkt mit Luzzy, Kira, Lira oder Milla, ohne Bot Mode. Pro Bot mehrere Chats
  (anlegen, wechseln, löschen über „Allgemein ▾“). Luzzys normaler Chat ist das Gespräch der Zentrale.
- **🤖 Bot Mode:** der „Bot Chat“ eines Bots – dort arbeiten die Bots zusammen; bei Luzzy: Crew-Aufträge.
- **🎬 Arbeitsbühne:** live sehen, wie die Bots zusammenarbeiten: Kette Luzzy → Kira → Lira → Milla, ein Brief wandert
  bei jeder Übergabe, darunter der Ablauf des Auftrags (Klick: ganzer Auftrag und Antwort). Die Bot-Karten oben
  leuchten gold, solange ein Bot arbeitet. Jarves-OS liest die Bot Chats dafür nur mit.
- **Beim Namen rufen:** „Kira, was ist gerade Trend?“ geht direkt an Kira.
- **Modell ändern:** Zahnrad auf der Bot-Karte.
- **Freigaben:** Bei riskanten Befehlen erscheint eine Karte (Einmal erlauben · Für dieses Gespräch · Ablehnen) oder
  einfach „Ja“/„Nein“ sagen; unter Luzzys Ja-Fragen stehen „Ja, mach“ / „Nein“.
- **Termine per Sprache:** „Luzzy, trag mir morgen um 10 Zahnarzt ein“ (Hermes-Skill `jarves-kalender`).
- **Luzzy muss nicht suchen:** Bei Fragen zu Wetter, Terminen, Aufgaben, Notizen schickt Jarves-OS die Daten mit.
- **Notfall-Luzzy:** Ohne Internet/Cloud antwortet Luzzy lokal über Ollama („🛟 Notbetrieb“).

## Sprache

Spracherkennung über Hermes (lokal, Deutsch), Stimme über Edge-Neural (Seraphina, Katja, Amala, Ingrid, Leni).
Satz-für-Satz-Vorlesen, Reinreden/„Stopp“, Gesprächsmodus, „Wiederhol das“, 📌 Antwort merken, Diktat
(fertige Mail in die Zwischenablage), „Neue Idee: …“ in den Vault.
**Musik erkennen:** Läuft Musik/Video auf dem PC, zählt sie nicht als Sprache; bei „Hey Luzzy“ pausiert sie kurz.

## Was Jarves-OS selbst erledigt (ohne Hermes, ohne Internet)

| Funktion | Beispiele |
|---|---|
| Timer & Wecker | „Timer 15 Minuten für die Nudeln“, „Weck mich um 7“, „Wie lange noch?“ |
| Nicht stören | „Bis 15 Uhr keine Meldungen“, „Meldungen wieder an“ |
| PC-Steuerung | „Öffne Photoshop“, „Öffne Netflix auf Terminator“, „Lauter“, „Nächstes Lied“, „Sperr den PC“ |
| Dateisuche | „Such die Datei Thor-Hoodie und öffne sie“ – ganzer PC, Anzeige und Bearbeiten in Jarves-OS |
| Zwischenablage | Text kopieren, Strg+Umschalt+L: zusammenfassen, verbessern, übersetzen |
| Notizen, Aufgaben, Fokus | „Merk dir: …“, „Neue Aufgabe: … bis Freitag“, „Fokus 25 Minuten“ |
| Gespräche, Selbsttest | „Neues Gespräch Shop“, „Mach einen Selbsttest“ |

## Meldungen und Wächter

Neue Bestellungen (mit Artikel, Größe, Stadt, Stammkunden-Info), neue Mails, fehlgeschlagene Jobs, Meilensteine,
Termine, Aufgaben, Timer und Crew-Antworten – auf Wunsch laut mit Ton. Ruhezeit, Nicht stören und Fokus halten still.

**Shopify-Zugang erneuern:** System → Shopify-Zugang → Token eintragen → „Prüfen & eintragen“. Jarves-OS prüft ihn bei
Shopify, trägt ihn überall in Hermes ein (Hermes und alle Bots, `config.yaml` und `.env`, mit Sicherung) und lädt
Hermes neu – ohne Neustart. Der Token wird nie angezeigt oder gespeichert.

## Plugins

Je ein Ordner in `plugins\<id>\` (Anleitung: [`plugins/README.md`](plugins/README.md)):
**Routinen** (Auslösewort → Auftrag, Zeitplan, Schnellbefehle) · **Kalender** · **Aufgaben** (mit Wochen-Review) ·
**Gedankenspeicher** · **Fokus** · **Wetter** (Open-Meteo) · **Meilensteine**.
Plugin-Daten (`plugins\*\daten.json`) bleiben lokal, nicht im Git-Projekt.

## Was in Hermes eingerichtet ist (update-fest)

| Wo | Was |
|---|---|
| `profiles\donnerwolf\config.yaml` | Spracherkennung Deutsch, Aktivierungswort „hey luzzy“ |
| `profiles\donnerwolf\skills\productivity\jarves-kalender\` | Skill, damit Luzzy Termine einträgt |
| `config.yaml` / `.env` (Hermes und Profile) | Shopify-Token – nur über System → Shopify-Zugang |

Genutzte Hermes-Befehle: `session.*`, `prompt.submit`, `approval.respond`, `image/pdf/file.attach`, `reload.env`,
`reload.mcp`, `wake.*`.

## Sicherheit und Regeln

- Hermes nie verändern, nichts nachbauen, was Hermes kann. Luzzys Shop-Regeln bleiben (nichts ohne Felix' Ja).
- Zugangsdaten nie anzeigen, loggen oder an die Oberfläche geben.
- Dateien nur speichern, wenn Felix klickt – mit Sicherung und „Rückgängig“. Vault-Schreiben nur in
  `Donnerwolf-Shop\Jarves-OS\`, nie überschreiben.
- PC-Steuerung nur geprüfte Aktionen (nie beliebige Befehle, Herunterfahren, Schließen).
- Löschen nur nach Rückfrage.

## Sichern und Git

`npm run backup` (oder Einstellungen → Sicherung) legt eine Kopie in `Desktop\jarves-os\backup\` an.
Das Projekt liegt privat auf GitHub (Kynto-intel/jarves-os); `daten\` und Plugin-Daten bleiben lokal.

## Aufbau (für Entwickler)

Electron 38, reines JavaScript ohne Build. `src/main` (Hauptprozess: `main.js`, `hermes.js`, `waechter.js`,
`stimme.js`, `notfall.js`, `musik.js`, `pc.js`, `dateisuche.js`, `wissen.js`, `vaultschreiben.js`, `shopifytoken.js`,
`plugins.js`, `einstellungen.js`), `src/preload.js` (sichere Brücke), `src/renderer` (Oberfläche, ES-Module),
`plugins/`, `scripts/backup.js`.

**Testmodus:** `JARVES_TEST_STUMM=1`, `JARVES_TEST_ANSICHT=<bereich>`, `JARVES_TEST_JS=<code>` +
`JARVES_TEST_JS_NACH=<ms>` (Ergebnis als `TEST-ERGEBNIS:`), `JARVES_SCREENSHOT=<datei>` + `JARVES_SCREENSHOT_NACH`,
`JARVES_TEST_INTRO`, `JARVES_TEST_FREIGABE`, `JARVES_TEST_MIKROFON=<wav>`, `JARVES_TEST_PC=1`.
