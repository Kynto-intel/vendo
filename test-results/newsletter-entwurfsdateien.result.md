# Newsletter-Plugin: Kampagnen-Entwürfe der KI auch als .html-Datei

**Plugin-ID:** `newsletter`
**Datum:** 2026-11-12
**Gegenstand:** Kampagnen, Vorlagen und Automationsschritte liegen zusätzlich als eigene
.html-Datei in `daten/plugins/newsletter/entwuerfe/`. Vendo gleicht in beide Richtungen ab:
Änderungen in Vendo landen in der Datei, Änderungen einer KI an der Datei landen in Vendo —
mit denselben Grenzen wie ein Bot-Auftrag.
Neu: `plugins/newsletter/entwurfsdateien.js` (`dateiName`, `dateiText`, `ohneKopf`,
`abgleichen`). Geändert: `plugins/newsletter/haupt.js` (`entwurfEintraege`,
`entwurfUebernehmen`, `entwuerfeAbgleichen`, Feld `datei` in den Bot-Antworten, Abgleich vor
und nach jedem Bot-Auftrag und jede Sekunde), `plugins/newsletter/README.md`.
Außerhalb von Vendo: Systemprompt im Hermes-Plugin `vendo-newsletter` und der Skill
`skills/email/vendo-newsletter` im Profil `vala-newsletter-texterin-bot` (vorher gesichert
als `*.vor-entwurfsdateien-20261112.bak`).

**Testbefehl:**

```
node --test tests/newsletter-entwurfsdateien.test.js
```

**Regressionslauf:**

```
node --test tests/newsletter-*.test.js tests/werkstatt.test.js
```

**Fixture:** keine Datei. Jeder Test arbeitet in einem frischen Ordner unter dem
Temp-Verzeichnis; Daten liegen im Speicher und sind erfunden (`beispiel.de`, „Herbst“,
„Warenkorb“). Kein Netzzugriff, keine SMTP- oder Shopify-Verbindung, nichts im echten
`daten/`-Ordner (nach dem Lauf geprüft: kein `entwuerfe/` angelegt).

**Ergebnis: PASS — 16 von 16 Tests in `tests/newsletter-entwurfsdateien.test.js`, 495 von
495 im Regressionslauf** (491 Newsletter-Tests in achtzehn Dateien plus 4 Werkstatt-Tests),
Lauf vom 2026-11-12 abends. `git diff --check` ohne Befund.

**Geändert am selben Abend (Felix' Regel):** Im Ordner liegen nur noch Kampagnen-Entwürfe,
die eine KI angelegt hat (`erstelltVon`), solange sie Entwurf sind oder auf Freigabe warten.
Vorlagen, Muster, Automationsschritte und Kampagnen von Felix werden nicht mehr gespiegelt;
eine geplante Kampagne verliert ihre Datei. Die Tests 12–14 unten sind entsprechend ersetzt.

## Was geprüft wird

Modul allein:

1. Dateinamen nur aus gültigen Kennungen (kein `../`, Schritt ab 1).
2. Der Kopfkommentar fällt beim Übernehmen weg, ein `--` im Namen beendet ihn nicht zu
   früh, CRLF statt LF gilt nicht als Änderung.
3. Vendo legt die Datei an, schreibt sie bei geändertem Inhalt neu und bei geändertem Namen
   oder Zustand nur den Kopfkommentar; ohne Änderung wird nichts geschrieben.
4. Eine Dateiänderung wird ohne Kopfkommentar übernommen, und danach kein zweites Mal.
5. Eine abgelehnte Änderung bleibt in der Datei, wird mit Grund gemeldet und nicht jede
   Sekunde neu versucht.
6. Gleichzeitig geändert: das Jüngere gewinnt, das andere liegt als `*.verworfen.html` daneben.
7. Weggeräumt werden nur Dateien, die Vendo selbst angelegt hat — eine Datei der KI daneben
   bleibt.
8. Der Stand übersteht einen Neustart (`.stand.json`).

Im Hintergrundteil über `botAuftrag`:

9. `kampagne_neu` → Datei liegt sofort, Pfad in `daten.datei` und im Antworttext;
   `ueberblick` nennt Ordner und Datei je Kampagne.
10. Die KI ändert die Datei → `kampagne_zeigen` zeigt den neuen Inhalt, eine offene
    Freigabe ist zurückgezogen (`entwurf`, `freigabe: null`), `standLesen` meldet die
    Änderung der Ansicht.
11. Felix ändert in Vendo → die Datei folgt.
12. Geplante Kampagne: ihre Datei verschwindet, die Antwort nennt keine mehr.
13. Leere Datei: nicht übernommen, Grund in den Hinweisen von `kampagne_zeigen`.
14. Nur Kampagnen-Entwürfe der KI liegen im Ordner — keine Vorlage, kein Muster, kein
    Automationsschritt, keine Kampagne von Felix; `ueberblick` und `automation_zeigen`
    nennen dafür keine Datei.
15. `kampagne_loeschen` nimmt die Datei mit.
16. Ohne eigenen Ordner (`eingangOrdner` gesetzt, kein `entwurfOrdner`) entstehen keine
    Dateien — so landet aus keinem bestehenden Test etwas im echten `daten/`.

## Hermes-Seite

- `plugins/vendo-newsletter/__init__.py`: neue Regel „DATEIEN“ im Systemprompt, die Regeln
  zu Produkten und Mustern gekürzt, damit die Grenze von 4000 Zeichen hält (jetzt 3988).
  Die Muster-Regel war zudem überholt („ohne id listet sechs“ — `vorlage_aus_muster` braucht
  eine id, die Liste steht in `ueberblick`). `python -m py_compile` ohne Fehler,
  Zeilenenden wie vorher CRLF.
- `skills/email/vendo-newsletter/SKILL.md`: neuer Abschnitt „Entwürfe als .html-Datei
  überarbeiten“, Version 0.5.0.
- Hermes-Programmcode unverändert.

## Nicht geprüft (offen)

- **In der laufenden App nicht ausprobiert.** Vendo muss neu starten, damit `haupt.js` und
  das neue Modul geladen werden. Danach sollten unter `daten/plugins/newsletter/entwuerfe/`
  die Dateien zu allen vorhandenen Kampagnen, Vorlagen und Automationsschritten erscheinen.
- **Nicht mit dem echten Bot ausprobiert**, ob Vala die Datei mit ihren Dateiwerkzeugen
  ändert. Das Profil hat das Toolset `file` und das Terminal läuft lokal (kein Container),
  der Pfad außerhalb ihres Arbeitsordners sollte also erreichbar sein — belegt ist es nicht.
  Hermes muss den Systemprompt neu laden (Neustart des Gateways bzw. neue Sitzung).
