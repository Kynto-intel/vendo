# Newsletter-Plugin: Drossel und Aufteilung in Module

**Datum:** 2026-11-09
**Gegenstand:** Phase 1, dritter Teil — das Stundenbudget (`drossel.js`), dazu die Aufteilung
des Hintergrundteils in Module (`tresor.js`, `zugang.js`, `mail.js`, `smtp.js`, `drossel.js`,
`protokoll.js`), nachdem alles in einer `haupt.js` zu unübersichtlich wurde.

**Testbefehle:**

```
node --test tests/newsletter-drossel.test.js
```

```
node --test tests/newsletter-versand.test.js
```

```
node --test tests/newsletter-zugang.test.js
```

**Fixture:** keine Datei. Der Drossel-Test stellt die Uhr selbst (`jetzt`-Funktion), damit
eine Stunde in einer Millisekunde durchlaufen kann. Es wird nicht gewartet, nichts versendet
und keine Verbindung aufgebaut.

**Ergebnis: PASS — 60 Tests, alle bestanden**

| Testdatei | Ergebnis |
|---|---|
| `newsletter-drossel.test.js` | 15 von 15 |
| `newsletter-versand.test.js` | 26 von 26 |
| `newsletter-zugang.test.js` | 19 von 19 |

Abgedeckt bei der Drossel:

- **Budgetgrenzen:** mehr als 500/h wird auf 500 gekappt (mehr erlaubt IONOS bei Mail
  Basic/Business nicht), 0, negative Werte und Text fallen auf die Voreinstellung 300
  zurück, Kommazahlen werden gerundet.
- **Mindestabstand:** die erste Mail darf sofort raus; danach gilt Fenster geteilt durch
  Budget (bei 300/h genau 12 s), vorher kommt `grund: 'abstand'` mit der Restzeit; bei
  60/h sind es 60 s.
- **Stundenbudget:** ist es aufgebraucht, kommt `grund: 'budget'` samt Wartezeit; das
  Fenster rollt, nach einer Stunde ist wieder Platz und alte Zeitstempel werden aufgeräumt;
  die Übersicht zeigt Budget, Verbrauch und freien Rest.
- **Pause:** nach einem Limit-Fehler wird pausiert, auch wenn das Budget nicht voll ist;
  nach Ablauf geht es von selbst weiter; von Hand beenden funktioniert; die Pause hat
  Vorrang vor dem Mindestabstand.
- **Neustart:** Verbrauch und laufende Pause überstehen einen Neustart, weil der Stand in
  den Plugin-Daten liegt. Ohne das wäre das Limit nach jedem Vendo-Start wieder leer — und
  genau dann würde ein zweiter Versand die Kundenservice-Mails blockieren.
- **Robustheit:** ein kaputter Stand (`'keine Zahl'`, `null`, `NaN`, `pauseBis: 'gestern'`)
  blockiert nicht, abgelaufene Zeitstempel und Pausen zählen nicht mehr, die Liste der
  Zeitstempel ist auf 2000 begrenzt.
- **Limit-Fehler erkennen:** `450 Mail send limit exceeded` und `452 … limit reached` ja,
  `550 Sender address is not allowed` und `EAUTH` nein.

**Zusätzliche Prüfung: Syntax aller Dateien**

```
node --check plugins/newsletter/<datei>.js
```

Für `ansicht.js` (ES-Modul) über eine Kopie mit Endung `.mjs`, weil `node --check` eine
`.js`-Datei als CommonJS liest. Ergebnis: alle acht Dateien fehlerfrei.

**Beobachtung 1: Fehler im Test, nicht im Code**

Im ersten Durchlauf fielen drei Drossel-Tests um (12 von 15). Ursache lag im Test-Helfer:
er vermerkte die Mails im Abstand des Mindestabstands und schob die Uhr dabei mit — bei
Budget 10 ergab das genau ein ganzes Fenster, die erste Mail war beim Prüfen also schon
wieder herausgefallen. Der Helfer vermerkt jetzt ohne Zeitvorschub. Danach 15 von 15.

**Beobachtung 2: die Werkstatt-Prüfung meldet jetzt Fehler — erwartet**

```
node -e "const path=require('path');const w=require('./plugins/werkstatt/haupt.js');const e=w.pruefen('newsletter',{ordnerBasis:path.join(process.cwd(),'plugins')});console.log(JSON.stringify(e,null,2))"
```

Ergebnis: `stufe: fehler`, sechsmal „Datei … gehört nicht in ein Plugin" (`drossel.js`,
`mail.js`, `protokoll.js`, `smtp.js`, `tresor.js`, `zugang.js`). Die Prüfung kennt nur die
sechs erlaubten Dateinamen. Das ist die bewusst in Kauf genommene Folge der Aufteilung und
betrifft nur die Prüfung — Vendo lädt das Plugin unabhängig davon.

**Dabei aufgefallen, und das ist der wichtigere Teil:** Die Prüfung erkennt Rechte nur aus
`ansicht.js` und `haupt.js` zusammen (`const code = ansicht + haupt`). Vor der Aufteilung
meldete sie „Nutzt Electron direkt" und „Schreibt Dateien auf dem PC"; jetzt meldet sie
beides **nicht mehr**, weil `safeStorage` in `tresor.js` und `fs.appendFileSync` in
`protokoll.js` stehen. Für dieses Plugin ist das unkritisch, weil bekannt ist, was darin
passiert. Es heißt aber: die Liste der erlaubten Dateien einfach zu erweitern, würde die
Prüfung für von Luzzy gebaute Plugins löchrig machen — dann käme ungeprüfter Code in
Dateien, die niemand ansieht. Diese Änderung wäre also kein Einzeiler, sondern müsste die
Mustererkennung mitziehen. Festgehalten in der README des Plugins.

**Nicht geprüft (BLOCKED in dieser Umgebung)**

- **Der tatsächliche Versand** und damit auch, ob IONOS wirklich bei der eingestellten Rate
  mitspielt. Die Drossel rechnet mit den dokumentierten 500/h; ob der echte Server früher
  bremst, zeigt erst der erste größere Versand. Deshalb die Voreinstellung 300.
- **Die Oberfläche.** Drossel-Block, Versand-Kachel und „Pause beenden" wurden in Vendo noch
  nicht geöffnet.
- **Warteschlange** gibt es noch nicht: es geht weiterhin eine Mail pro Klick raus, jetzt
  zusätzlich durch die Drossel gebremst. Ein Massenversand ist nicht möglich.
