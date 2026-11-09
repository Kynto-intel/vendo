# Newsletter-Plugin: erster Lauf in der echten App

**Datum:** 2026-11-09
**Gegenstand:** Das Plugin zum ersten Mal in der laufenden Electron-App. Geprüft wurde, ob
es geladen wird, ob der Zeitgeber genau einmal startet, ob alle sechs Reiter ohne Fehler
zeichnen — und ob die Kernerweiterung `ctx.fragen` gegen das echte Hermes funktioniert.

**Testbefehle:**

```
npm start
```

Für den automatischen Durchgang Vendos eigener Oberflächen-Testmodus (dokumentiert in
`README-Doko.md`), der Code im Renderer ausführt und Fehler als `TEST-KONSOLE:` zeigt:

```
$env:VENDO_TEST_JS_NACH = '16000'; $env:VENDO_TEST_JS = 'import("file:///C:/Users/Felix/Desktop/Vendo/Vendo/werkstatt/newsletter-pruef.mjs").then(m => m.lauf())'; npm start
```

**Fixture / Prüfskript:** `werkstatt/newsletter-pruef.mjs` (liegt in `werkstatt/`, also von Git
ausgeschlossen, weil es kein Teil des Plugins ist). Es öffnet den Newsletter-Bereich, klickt
jeden Reiter an, zählt den gezeichneten Inhalt, sammelt `console.error`, `window.onerror`
und unbehandelte Promise-Fehler ein und stellt zum Schluss eine winzige Frage über
`vendo.hermes.fragen` — denselben Weg, den das Plugin für einen KI-Entwurf nutzt.

**Ergebnis: PASS**

```json
{
  "oberflaeche": { "ok": true, "reiter": ["uebersicht","kontakte","kampagnen","automationen","protokoll","zugang"],
    "stand": { "uebersicht": {"zeichen":480,"formulare":0}, "kontakte": {"zeichen":791,"formulare":3},
               "kampagnen": {"zeichen":101,"formulare":0}, "automationen": {"zeichen":424,"formulare":0},
               "protokoll": {"zeichen":396,"formulare":0}, "zugang": {"zeichen":1567,"formulare":3} } },
  "fragen": { "ok": true, "dauerMs": 6020, "laenge": 2, "antwort": "OK" },
  "fehler": []
}
```

Was damit belegt ist:

- **Das Plugin wird geladen.** `Newsletter: Warteschlange laeuft.` erscheint im Terminal —
  **genau einmal pro Start**. Der Schutz im Modul-Scope greift also; mehrere Zeitgeber, die
  Mails doppelt verschicken würden, entstehen nicht.
- **Alle sechs Reiter zeichnen**, mit Inhalt und den erwarteten Formularen (Kontakte 3:
  Shopify, CSV, Suche — Zugang 3: Postfach, Marke, Drossel).
- **Keine Fehler in der Oberfläche:** kein `console.error`, kein `window.onerror`, keine
  unbehandelte Promise. Das war das größte offene Risiko, weil Renderer-Fehler in den
  Node-Tests nicht auftauchen.
- **`ctx.fragen` funktioniert gegen das echte Hermes.** Die Frage „Antworte ausschliesslich
  mit dem Wort OK" kam nach **6,0 Sekunden** mit der Antwort `OK` zurück. Damit steht der
  Weg für die KI-Entwürfe: eigene Unterhaltung, Antwort als Text im Plugin, nichts davon im
  Gespräch in der Zentrale.
- Das Hermes-Gateway startet normal mit.

**Dabei behoben**

Die Konsolenausgaben des Plugins enthielten Umlaute und zeigten sich in der PowerShell als
`Warteschlange l├ñuft`. Vendo macht es im Kern bewusst anders („Nur ASCII ausgeben", siehe
`src/main/main.js`). Alle 25 Log-Zeilen in `haupt.js` sind jetzt ASCII
(`laeuft`, `geloescht`, `uebersprungen`, gerade Anführungszeichen). Die 176 Tests laufen
danach unverändert durch.

**Beobachtung: Daten aus einem früheren Start**

`daten/plugins/newsletter.json` existierte bereits (Zeitstempel 02:28 Uhr) und enthält die
Datenstruktur plus eine leere Kampagne „Neue Kampagne" mit der Startvorlage. Der
Testdurchgang hat die Datei **nicht** verändert. Woher sie stammt, ist nicht festzustellen —
vermutlich ein früherer Start mit einem Klick auf „+ Neu". Harmlos: die Kampagne ist ohne
Betreff und damit nicht sendefähig; sie lässt sich im Reiter „Kampagnen" löschen.

**Beim Beenden mit Ctrl-C**

Nach dem Abbruch im Terminal protokolliert Vendo mehrfach
`Error occurred in handler for 'hermes:lesen': ECONNREFUSED`. Das sind Folgefehler des
Abbruchs: Ctrl-C beendet die Prozessgruppe samt Hermes-Backend, während die Oberfläche noch
Anfragen stellt. Sie kamen **nach** dem Testergebnis, betreffen eine Vendo-Funktion, die
dieses Plugin nicht benutzt, und traten während des Laufs nicht auf. Vendo besser über das
Fenster schließen als über Ctrl-G im Terminal.

**Weiterhin nicht geprüft (braucht echte Zugangsdaten)**

- **Windows-Verschlüsselung (DPAPI/safeStorage):** erst prüfbar, wenn ein Passwort
  eingetragen wird. Die Oberfläche zeigt eine Warnung, falls Windows nicht verschlüsseln kann.
- **Anmeldung bei IONOS** und ein echter Mailversand.
- **Darstellung der Mails** in Outlook, Gmail und auf dem Handy.
- **Shopify-Sync, Warenkörbe und Bestellungen** — braucht Shop-Adresse und Token mit
  `read_customers`, `write_customers`, `read_orders` und die Freigabe für geschützte
  Kundendaten.
- **Ein vollständiger KI-Entwurf:** dass `ctx.fragen` antwortet, ist belegt; dass Luzzy auf
  den Kampagnen-Auftrag mit verwertbarem JSON antwortet, noch nicht.
