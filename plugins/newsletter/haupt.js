'use strict'
// Newsletter-Plugin, Hintergrundteil. Läuft im Hauptprozess mit vollen Node-Rechten.
// Stand und Bauplan: README.md im Plugin-Ordner.
//
// Diese Datei verdrahtet nur: sie hält die Daten, treibt die Warteschlange an und stellt der
// Oberfläche Funktionen bereit. Die Arbeit machen die Module:
//   tresor.js         Passwort und Token verschlüsselt ablegen (Windows-DPAPI)
//   zugang.js         Zugangsdaten prüfen, Adressen kürzen
//   mail.js           eine Mail aufbauen, Textteil ableiten
//   smtp.js           Verbindung zu IONOS, anmelden, verschicken
//   drossel.js        Stundenbudget, Mindestabstand, Pause bei Limit-Fehler
//   warteschlange.js  Einträge, Idempotenz, Versuche, Verfall
//   shopify.js        Abonnenten holen, Abmeldungen zurückschreiben
//   kontakte.js       Bestand führen, zusammenführen, CSV lesen
//   protokoll.js      eine Zeile je Mail in Monatsdateien
//
// Regeln, die hier nie gebrochen werden:
//   - Passwort und Shopify-Token verlassen diesen Prozess nicht. Sie werden verschlüsselt
//     abgelegt und nie an die Oberfläche zurückgegeben, nie geloggt.
//   - E-Mail-Adressen stehen nur gekürzt im Log und im Protokoll (f***@beispiel.de).
//   - Ein Sync hebt keine Sperre auf.
//   - Hermes und sein ionos-mail-Plugin werden nicht angefasst.

const { tresorMachen } = require('./tresor.js')
const { zugangPruefen, kuerzen, SMTP_STANDARD, PORTS } = require('./zugang.js')
const { mailBauen, textAusHtml } = require('./mail.js')
const { anmeldungPruefen, mailVerschicken } = require('./smtp.js')
const { drosselMachen, istLimitFehler, budgetPruefen, BUDGET_STANDARD, BUDGET_MAX } = require('./drossel.js')
const warteschlange = require('./warteschlange.js')
const shopify = require('./shopify.js')
const kontakte = require('./kontakte.js')
const imap = require('./imap.js')
const kampagnen = require('./kampagnen.js')
const vorlagen = require('./vorlagen.js')
const muster = require('./muster.js')
const automationen = require('./automationen.js')
const icons = require('./icons.js')
const {
  startVorlage,
  inhaltAus,
  fussPruefen,
  fussTeileAus,
  kopfPruefen,
  STANDARD_FARBEN,
  RECHTSLINKS,
  NETZWERKE,
  FUSS_FARBEN,
  KOPF_FARBEN,
  ABMELDE_TEXT,
  SOCIAL_TITEL,
  LOGO_BREITE_FUSS,
  LOGO_BREITE_KOPF,
  ICON_BREITE,
  ICON_BREITE_MIN,
  ICON_BREITE_MAX,
  maskieren: maskierenHtml
} = require('./bausteine.js')
const bots = require('./bots.js')
const { mailAusHtml, beispielHtml, hatInhalt, fremdePlatzhalter, felderLesen, unveraendertAusVorlage, MAX_HTML } = require('./html-mail.js')
const shoplinks = require('./shoplinks.js')
const { protokollSchreiben, protokollLesen } = require('./protokoll.js')

const TAKT = 15000 // so oft schaut der Hintergrundteil in die Warteschlange
const AUFRAEUM_TAKT = 3600000 // einmal pro Stunde Erledigtes wegräumen
const AUSLOESER_TAKT = 600000 // alle zehn Minuten bei Shopify nach Warenkörben und Bestellungen sehen

// Vendo ruft diese Aufbaufunktion bei jedem Laden der Plugin-Liste erneut auf, das Modul
// bleibt dabei im require-Cache. Ohne diesen Schutz liefen mehrere Zeitgeber gleichzeitig
// und würden Mails doppelt verschicken.
let taktLaeuft = false
// Dasselbe für den Eingangskorb der Bots: genau ein Zeitgeber, sonst liefe ein Auftrag doppelt
let eingangLaeuft = false

module.exports = (ctx) => {
  // Alles, was die Ansicht aufrufen kann, ist auch für die Bot-Aufträge greifbar — so gibt
  // es Abgleich, Löschen und Anlegen nur einmal, mit denselben Prüfungen.
  const eigene = new Map()
  const bereitstellen = (name, fn) => {
    eigene.set(name, fn)
    ctx.bereitstellen(name, fn)
  }

  const tresor = tresorMachen()

  const datenLesen = () => {
    const d = ctx.datenLaden() || {}
    return {
      ...d,
      zugang: d.zugang || {},
      shopify: d.shopify || {},
      einstellungen: d.einstellungen || {},
      marke: d.marke || {},
      drossel: d.drossel || {},
      warteschlange: Array.isArray(d.warteschlange) ? d.warteschlange : [],
      kontakte: Array.isArray(d.kontakte) ? d.kontakte : [],
      kampagnen: Array.isArray(d.kampagnen) ? d.kampagnen : [],
      vorlagen: Array.isArray(d.vorlagen) ? d.vorlagen : [],
      automationen: Array.isArray(d.automationen) ? d.automationen : [],
      laeufe: Array.isArray(d.laeufe) ? d.laeufe : []
    }
  }

  // Abmeldeweg: eigene Adresse, sonst das Postfach selbst
  const abmeldeAdresseVon = (daten) => daten.marke.abmeldeAdresse || daten.zugang.benutzer || ''

  // Die Icon-Bilder einmal einlesen und auf Mailgröße bringen. Läuft beim Start los, damit
  // Vorschauen sie gleich zeigen; `einzelSenden` wartet zur Sicherheit noch einmal darauf.
  icons.vorbereiten().then(
    (bereit) => console.log(`Newsletter: ${bereit.length} Social-Icons bereit.`),
    () => console.warn('Newsletter: die Social-Icons liessen sich nicht lesen.')
  )

  // In welcher Farbe die Social-Icons erscheinen: in der Schriftfarbe des Fußes.
  const fussTinte = (daten) => fussTeileAus(daten.marke, { ...STANDARD_FARBEN, ...(daten.marke.farben || {}) }).farben.text

  // Die gezeichneten Icons als eingebettete Bilder für den Versand …
  const iconAnhaenge = (daten, html) => icons.anhaengeFuer(html, { farbe: fussTinte(daten) })

  // … und für die Vorschau im Fenster, das `cid:` nicht kennt, als data:-Adressen.
  // Jede Stelle, die Mail-HTML an die Oberfläche gibt, muss hier durch.
  const fuerAnsicht = (daten, html) => icons.alsDatenAdressen(html, { farbe: fussTinte(daten) })

  // Wohin Testmails gehen: die eingetragene Testadresse, sonst das Postfach selbst.
  // Gilt für alle vier Wege (freie Testmail, Beispielmail, Kampagne, Automation).
  const testAdresseVon = (daten) => daten.zugang.testAdresse || daten.zugang.benutzer || ''

  // Wer in Testmails angeredet wird. Mit eingetragenem Namen prüft eine Testmail, ob
  // {{vorname}} wirklich ersetzt wird; ohne steht dort sichtbar „Vorname“.
  const testKontakt = (daten) => ({
    email: testAdresseVon(daten),
    vorname: daten.zugang.testVorname || 'Vorname',
    nachname: daten.zugang.testNachname || 'Nachname'
  })

  const feldSpeichern = (feld, wert) => {
    const d = datenLesen()
    d[feld] = wert
    ctx.datenSpeichern(d)
  }

  // Drossel aus den gespeicherten Zeitstempeln aufbauen. Der Zustand muss einen Neustart
  // überleben, sonst wäre das Stundenlimit nach jedem Vendo-Start wieder leer.
  const drosselHolen = () => {
    const d = datenLesen()
    return drosselMachen({ budget: d.einstellungen.budgetProStunde, stand: d.drossel })
  }

  const passwortHolen = (zugang) => {
    const passwort = tresor.entschluesseln(zugang.passwortVerschluesselt)
    if (!passwort) {
      return { fehler: 'Das gespeicherte Passwort lässt sich nicht mehr entschlüsseln. Bitte neu eintragen (das passiert, wenn das Windows-Konto gewechselt hat).' }
    }
    return { passwort }
  }

  const shopifyZugang = () => {
    const s = datenLesen().shopify
    if (!s.shop || !s.tokenVerschluesselt) return { fehler: 'Es ist kein Shopify-Zugang eingerichtet.' }
    const token = tresor.entschluesseln(s.tokenVerschluesselt)
    if (!token) return { fehler: 'Der gespeicherte Shopify-Token lässt sich nicht mehr entschlüsseln. Bitte neu eintragen.' }
    return { shop: s.shop, token }
  }

  // ── Zugang zum Postfach ──

  bereitstellen('zugangLesen', () => {
    const z = datenLesen().zugang
    return {
      benutzer: z.benutzer || '',
      host: z.host || SMTP_STANDARD.host,
      port: z.port || SMTP_STANDARD.port,
      absenderName: z.absenderName || '',
      antwortAn: z.antwortAn || '',
      testAdresse: z.testAdresse || '',
      testAdresseWirksam: testAdresseVon(datenLesen()),
      testVorname: z.testVorname || '',
      testNachname: z.testNachname || '',
      passwortGesetzt: Boolean(z.passwortVerschluesselt),
      tresorVerfuegbar: tresor.verfuegbar(),
      ports: PORTS
    }
  })

  bereitstellen('zugangSpeichern', (eingabe = {}) => {
    const geprueft = zugangPruefen(eingabe)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }

    const daten = datenLesen()
    const passwort = String(eingabe.passwort ?? '')
    let verschluesselt = daten.zugang.passwortVerschluesselt || null
    // Die Testadresse steht im Testmail-Formular, nicht in diesem: wird sie hier nicht
    // mitgeschickt, bleibt die gespeicherte stehen, statt gelöscht zu werden.
    if (eingabe.testAdresse === undefined) geprueft.wert.testAdresse = daten.zugang.testAdresse || ''
    if (eingabe.testVorname === undefined) geprueft.wert.testVorname = daten.zugang.testVorname || ''
    if (eingabe.testNachname === undefined) geprueft.wert.testNachname = daten.zugang.testNachname || ''

    if (passwort) {
      if (!tresor.verfuegbar()) {
        return { ok: false, fehler: ['Windows kann gerade nichts verschlüsseln. Ohne Verschlüsselung wird das Passwort nicht gespeichert.'] }
      }
      verschluesselt = tresor.verschluesseln(passwort)
      if (!verschluesselt) return { ok: false, fehler: ['Das Passwort konnte nicht verschlüsselt werden, es wurde nichts gespeichert.'] }
    }

    daten.zugang = { ...geprueft.wert, passwortVerschluesselt: verschluesselt }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Zugang gespeichert fuer ${kuerzen(geprueft.wert.benutzer)} (${geprueft.wert.host}:${geprueft.wert.port})`)
    return { ok: true, passwortGesetzt: Boolean(verschluesselt) }
  })

  // Die Adresse aus dem „An“-Feld der Testmail merken. Damit stellt man sie dort ein, wo man
  // sie ohnehin eintippt — und sie gilt danach auch für Beispielmail, Kampagnen- und
  // Automations-Testmails. Leer setzt zurück auf das Postfach.
  bereitstellen('testAdresseMerken', (adresse) => {
    const neu = String(adresse || '').trim().toLowerCase()
    const daten = datenLesen()
    if (neu && neu === String(daten.zugang.benutzer || '').toLowerCase()) {
      // Das Postfach selbst braucht nicht gemerkt zu werden
      if (daten.zugang.testAdresse) {
        daten.zugang = { ...daten.zugang, testAdresse: '' }
        ctx.datenSpeichern(daten)
      }
      return { ok: true, testAdresse: '' }
    }
    const geprueft = zugangPruefen({ ...daten.zugang, testAdresse: neu })
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }
    if ((daten.zugang.testAdresse || '') === geprueft.wert.testAdresse) return { ok: true, testAdresse: geprueft.wert.testAdresse }

    daten.zugang = { ...daten.zugang, testAdresse: geprueft.wert.testAdresse }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Testmails gehen jetzt an ${kuerzen(geprueft.wert.testAdresse || daten.zugang.benutzer)}.`)
    return { ok: true, testAdresse: geprueft.wert.testAdresse }
  })

  // Den Namen für Testmails merken (Reiter „Zugang“, Block Testmail)
  bereitstellen('testNameMerken', (eingabe = {}) => {
    const daten = datenLesen()
    const geprueft = zugangPruefen({ ...daten.zugang, testVorname: eingabe.vorname ?? '', testNachname: eingabe.nachname ?? '' })
    const eigene = geprueft.fehler.filter((f) => f.includes('für Testmails'))
    if (eigene.length) return { ok: false, fehler: eigene }
    daten.zugang = { ...daten.zugang, testVorname: geprueft.wert.testVorname, testNachname: geprueft.wert.testNachname }
    ctx.datenSpeichern(daten)
    return { ok: true, testVorname: geprueft.wert.testVorname, testNachname: geprueft.wert.testNachname }
  })

  bereitstellen('zugangLoeschen', () => {
    feldSpeichern('zugang', {})
    console.log('Newsletter: Zugang geloescht.')
    return { ok: true }
  })

  bereitstellen('zugangTesten', async () => {
    const z = datenLesen().zugang
    if (!z.benutzer || !z.passwortVerschluesselt) return { ok: false, text: 'Es sind noch keine Zugangsdaten gespeichert.' }
    const { passwort, fehler } = passwortHolen(z)
    if (fehler) return { ok: false, text: fehler }

    const ergebnis = await anmeldungPruefen({ zugang: z, passwort })
    if (ergebnis.ok) console.log(`Newsletter: Anmeldung am Postfach ${kuerzen(z.benutzer)} erfolgreich.`)
    else console.warn(`Newsletter: Anmeldung am Postfach ${kuerzen(z.benutzer)} fehlgeschlagen: ${ergebnis.fehler?.code || 'ohne Code'}`)
    return { ok: ergebnis.ok, text: ergebnis.text }
  })

  // ── Drossel ──

  bereitstellen('drosselLesen', () => {
    const uebersicht = drosselHolen().uebersicht()
    return { ...uebersicht, budgetMax: BUDGET_MAX, budgetStandard: BUDGET_STANDARD }
  })

  bereitstellen('budgetSpeichern', (wert) => {
    const budget = budgetPruefen(wert)
    const daten = datenLesen()
    daten.einstellungen = { ...daten.einstellungen, budgetProStunde: budget }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Stundenbudget auf ${budget} Mails gesetzt.`)
    return { ok: true, budget }
  })

  bereitstellen('pauseBeenden', () => {
    feldSpeichern('drossel', drosselHolen().pauseBeenden())
    console.log('Newsletter: Pause von Hand beendet.')
    return { ok: true }
  })

  // ── Eine Mail verschicken ──
  // Gemeinsamer Weg für Testmails und für je einen Schritt der Warteschlange.
  const einzelSenden = async ({ art, an, betreff, html, text, kampagneId = null, abmeldeAdresse }) => {
    const daten = datenLesen()
    const z = daten.zugang
    if (!z.benutzer || !z.passwortVerschluesselt) return { ok: false, text: 'Es sind noch keine Zugangsdaten gespeichert.' }

    const drossel = drosselHolen()
    const erlaubt = drossel.darfSenden()
    if (!erlaubt.ok) {
      const sekunden = Math.ceil(erlaubt.wartenMs / 1000)
      const wann = sekunden > 90 ? `${Math.ceil(sekunden / 60)} Minuten` : `${sekunden} Sekunden`
      return { ok: false, gedrosselt: true, grund: erlaubt.grund, wartenMs: erlaubt.wartenMs, text: `${erlaubt.text} Nächster Versuch in etwa ${wann}.` }
    }

    await icons.vorbereiten() // beim ersten Mal nach dem Start: die Icon-Bilder zu Ende lesen
    const gebaut = mailBauen({ art, an, betreff, html, text, zugang: z, abmeldeAdresse, anhaenge: iconAnhaenge(daten, html) })
    if (!gebaut.ok) return { ok: false, text: gebaut.fehler.join(' ') }

    const { passwort, fehler } = passwortHolen(z)
    if (fehler) return { ok: false, text: fehler }

    const ergebnis = await mailVerschicken({ zugang: z, passwort, mail: gebaut.mail })

    if (ergebnis.ok) {
      feldSpeichern('drossel', drossel.gesendetMerken())
      protokollSchreiben({ an: gebaut.mail.to, betreff: gebaut.mail.subject, art, kampagneId, ok: true })
      console.log(`Newsletter: Mail an ${kuerzen(gebaut.mail.to)} verschickt (${art}).`)
      return { ok: true, text: ergebnis.text }
    }

    // Limit-Fehler: der Server weiß es besser als unsere Rechnung. Pause setzen.
    if (istLimitFehler(ergebnis.fehler)) {
      feldSpeichern('drossel', drossel.pausieren())
      console.warn('Newsletter: Postfach meldet ein Limit, der Versand pausiert.')
    }
    protokollSchreiben({ an: gebaut.mail.to, betreff: gebaut.mail.subject, art, kampagneId, ok: false, fehler: ergebnis.fehler?.code || ergebnis.fehler?.message })
    console.warn(`Newsletter: Mail an ${kuerzen(gebaut.mail.to)} fehlgeschlagen: ${ergebnis.fehler?.code || 'ohne Code'}`)
    return { ok: false, text: ergebnis.text, fehler: ergebnis.fehler }
  }

  bereitstellen('mailSenden', async (eingabe = {}) => {
    const art = eingabe.art === 'kampagne' ? 'kampagne' : 'test'
    const an = art === 'test' ? eingabe.an || testAdresseVon(datenLesen()) : eingabe.an
    const { ok, text } = await einzelSenden({ art, an, betreff: eingabe.betreff, html: eingabe.html, text: eingabe.text, abmeldeAdresse: eingabe.abmeldeAdresse })
    return { ok, text }
  })

  // ── Das Mail-HTML einer Kampagne ──
  // Eine Stelle für beide Wege (Bausteine oder eigenes HTML), damit Vorschau, Testmail und
  // echter Versand nie auseinanderlaufen. Gibt { html, hinweis } zurück; `hinweis` sagt,
  // was beim Säubern des eigenen HTML entfernt wurde.
  // Eine Stelle für jede Mail, die Vendo baut: Kampagne, Vorlage, Automationsschritt.
  // `stueck` braucht nur `html` (oder ältere `bausteine`, die dann gewandelt werden),
  // dazu optional `htmlRahmen` und `vorschauText`.
  // `extra` sind Platzhalter, die nur in einem Zusammenhang gelten — bei Vorlagen und
  // Automationen etwa der Beispiel-Warenkorb.
  const mailBauenAus = (daten, stueck = {}, kontakt = {}, extra = {}) => {
    const gebaut = mailAusHtml(kampagnen.personalisierenHtml(kampagnen.htmlVon(stueck, { marke: daten.marke }), kontakt, extra), {
      marke: daten.marke,
      abmeldeAdresse: abmeldeAdresseVon(daten),
      vorschauText: kampagnen.personalisieren(stueck.vorschauText, kontakt, extra),
      rahmen: stueck.htmlRahmen !== false
    })
    return { html: gebaut.html, hinweis: gebaut.hinweis }
  }

  // ── Warteschlange ──

  // Inhalt eines Eintrags: entweder er trägt ihn selbst (Einzelmail), oder er verweist auf
  // eine Kampagne. So liegt das HTML einmal statt tausendmal in den Daten — und die
  // Personalisierung passiert erst hier, kurz vor dem Versand.
  const inhaltVon = (eintrag, daten) => {
    if (eintrag.html || eintrag.betreff) return { betreff: eintrag.betreff, html: eintrag.html }
    const kampagne = daten.kampagnen.find((k) => k.id === eintrag.kampagneId)
    if (!kampagne) return { fehler: 'Zu diesem Eintrag gibt es keine Kampagne mehr.' }
    const kontakt = kontakte.finden(daten.kontakte, eintrag.an) || { email: eintrag.an }
    return {
      betreff: kampagnen.personalisieren(kampagne.betreff, kontakt),
      html: mailBauenAus(daten, kampagne, kontakt).html
    }
  }

  // Einen fälligen Eintrag abarbeiten. Gibt zurück, was passiert ist.
  const schritt = async () => {
    let daten = datenLesen()
    if (!daten.warteschlange.length) return { nichts: true }

    // Was zu lange gewartet hat, geht nicht mehr raus
    const verfallen = warteschlange.verfalleneMarkieren(daten.warteschlange)
    if (verfallen.anzahl) {
      feldSpeichern('warteschlange', verfallen.liste)
      console.log(`Newsletter: ${verfallen.anzahl} Eintrag/Eintraege verfallen.`)
      daten = datenLesen()
    }

    const eintrag = warteschlange.naechster(daten.warteschlange)
    if (!eintrag) return { nichts: true }

    const inhalt = inhaltVon(eintrag, daten)
    if (inhalt.fehler) {
      feldSpeichern('warteschlange', warteschlange.fehlschlagMerken(daten.warteschlange, eintrag.id, inhalt.fehler, { maxVersuche: 1 }))
      return { fehler: inhalt.fehler }
    }

    const ergebnis = await einzelSenden({
      art: eintrag.art,
      an: eintrag.an,
      betreff: inhalt.betreff,
      html: inhalt.html,
      kampagneId: eintrag.kampagneId
    })

    // Gedrosselt heißt: nicht jetzt. Kein Versuch, kein Fehler — beim nächsten Takt wieder.
    if (ergebnis.gedrosselt) return { gedrosselt: true, text: ergebnis.text }

    const liste = datenLesen().warteschlange
    if (ergebnis.ok) {
      feldSpeichern('warteschlange', warteschlange.erfolgMerken(liste, eintrag.id))
      return { gesendet: true, an: eintrag.an }
    }
    feldSpeichern('warteschlange', warteschlange.fehlschlagMerken(liste, eintrag.id, ergebnis.fehler?.code || ergebnis.text))
    return { fehler: ergebnis.text }
  }

  bereitstellen('warteschlangeLesen', () => {
    const daten = datenLesen()
    const liste = daten.warteschlange
    return {
      ...warteschlange.stand(liste),
      naechste: liste
        .filter((e) => e.zustand === 'offen')
        .sort((a, b) => a.faelligAb - b.faelligAb)
        .slice(0, 20)
        .map((e) => ({ id: e.id, an: kuerzen(e.an), betreff: e.betreff, faelligAb: e.faelligAb, versuche: e.versuche, letzterFehler: e.letzterFehler })),
      letzteFehler: liste
        .filter((e) => e.zustand === 'fehler')
        .slice(-10)
        .map((e) => ({ id: e.id, an: kuerzen(e.an), letzterFehler: e.letzterFehler }))
    }
  })

  // Einreihen. Für Tests und später für Kampagnen und Automationen.
  bereitstellen('warteschlangeEinreihen', (eintraege) => {
    const daten = datenLesen()
    const ergebnis = warteschlange.einreihen(daten.warteschlange, eintraege)
    feldSpeichern('warteschlange', ergebnis.liste)
    console.log(`Newsletter: ${ergebnis.eingereiht} eingereiht, ${ergebnis.uebersprungen} uebersprungen (schon in der Schlange oder ungueltig).`)
    return { ok: true, eingereiht: ergebnis.eingereiht, uebersprungen: ergebnis.uebersprungen }
  })

  bereitstellen('warteschlangeAbbrechen', () => {
    const daten = datenLesen()
    const ergebnis = warteschlange.offeneVerwerfen(daten.warteschlange)
    feldSpeichern('warteschlange', ergebnis.liste)
    console.log(`Newsletter: ${ergebnis.anzahl} offene Eintraege abgebrochen.`)
    return { ok: true, abgebrochen: ergebnis.anzahl }
  })

  // ── Shopify ──

  bereitstellen('shopifyLesen', () => {
    const s = datenLesen().shopify
    return {
      shop: s.shop || '',
      tokenGesetzt: Boolean(s.tokenVerschluesselt),
      letzterSync: s.letzterSync || null,
      letzterSyncText: s.letzterSyncText || '',
      tresorVerfuegbar: tresor.verfuegbar()
    }
  })

  bereitstellen('shopifySpeichern', (eingabe = {}) => {
    const geprueft = shopify.zugangPruefen(eingabe)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }

    const daten = datenLesen()
    let verschluesselt = daten.shopify.tokenVerschluesselt || null
    if (geprueft.wert.token) {
      if (!tresor.verfuegbar()) return { ok: false, fehler: ['Windows kann gerade nichts verschlüsseln. Ohne Verschlüsselung wird der Token nicht gespeichert.'] }
      verschluesselt = tresor.verschluesseln(geprueft.wert.token)
      if (!verschluesselt) return { ok: false, fehler: ['Der Token konnte nicht verschlüsselt werden, es wurde nichts gespeichert.'] }
    }
    daten.shopify = { ...daten.shopify, shop: geprueft.wert.shop, tokenVerschluesselt: verschluesselt }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Shopify-Zugang gespeichert (${geprueft.wert.shop}).`)
    return { ok: true, tokenGesetzt: Boolean(verschluesselt) }
  })

  bereitstellen('shopifyLoeschen', () => {
    feldSpeichern('shopify', {})
    console.log('Newsletter: Shopify-Zugang geloescht.')
    return { ok: true }
  })

  // Abonnenten holen und in den Bestand einarbeiten
  bereitstellen('kontakteSynchronisieren', async () => {
    const zugang = shopifyZugang()
    if (zugang.fehler) {
      console.warn(`Newsletter: Sync nicht moeglich: ${zugang.fehler}`)
      return { ok: false, text: zugang.fehler }
    }

    const geholt = await shopify.abonnentenHolen({ shop: zugang.shop, token: zugang.token })
    if (!geholt.ok) {
      // Auch ins Log, nicht nur in die Oberflaeche: so laesst sich der Grund nachlesen
      console.warn(`Newsletter: Sync fehlgeschlagen (${zugang.shop}): ${geholt.fehler}`)
      return { ok: false, text: geholt.fehler }
    }

    const daten = datenLesen()
    const zusammen = kontakte.zusammenfuehren(daten.kontakte, geholt.kontakte)
    // Wer bei Shopify nicht mehr abonniert ist, darf auch von hier nichts mehr bekommen —
    // egal, wo die Abmeldung passiert ist. Nur bei einem vollständigen Abruf, sonst würde
    // ein abgebrochener Durchgang halbe Listen sperren.
    const abgemeldet = kontakte.abgemeldeteUebernehmen(zusammen.liste, geholt.kontakte.map((k) => k.email), {
      vollstaendig: geholt.ok && !geholt.abgebrochen
    })
    daten.kontakte = abgemeldet.liste
    daten.shopify = {
      ...daten.shopify,
      letzterSync: Date.now(),
      letzterSyncText: `${zusammen.angelegt} neu, ${zusammen.aktualisiert} aktualisiert, ${zusammen.gesperrtGelassen} gesperrt gelassen`
    }
    ctx.datenSpeichern(daten)

    const nachStand = kontakte.stand(abgemeldet.liste)
    const text = [
      `${geholt.kontakte.length} Abonnenten bei Shopify gefunden.`,
      `${zusammen.angelegt} neu, ${zusammen.aktualisiert} aktualisiert.`,
      `${nachStand.empfaenger} zählen als Empfänger.`,
      abgemeldet.anzahl ? `${abgemeldet.anzahl} bei Shopify abgemeldet und hier gesperrt.` : '',
      nachStand.offeneBestaetigung
        ? `${nachStand.offeneBestaetigung} haben ihre Anmeldung noch nicht bestätigt (Shopify: PENDING) und bekommen nichts.`
        : '',
      nachStand.andererZustand ? `${nachStand.andererZustand} haben einen anderen Zustand und bekommen nichts.` : '',
      zusammen.gesperrtGelassen ? `${zusammen.gesperrtGelassen} bleiben gesperrt (abgemeldet).` : '',
      geholt.abgebrochen ? 'Es gibt noch mehr Seiten — beim nächsten Lauf geht es weiter.' : '',
      geholt.schlank ? 'Hinweis: diese API-Version kennt das Zustimmungsdatum nicht, genommen wurde das Anlegedatum.' : ''
    ]
      .filter(Boolean)
      .join(' ')
    console.log(`Newsletter: Sync fertig - ${zusammen.angelegt} neu, ${zusammen.aktualisiert} aktualisiert.`)
    return { ok: true, text, ...zusammen, gefunden: geholt.kontakte.length }
  })

  // ── Kontakte ──

  bereitstellen('kontakteLesen', (eingabe = {}) => {
    const alle = datenLesen().kontakte
    const suche = String(eingabe.suche || '').trim().toLowerCase()
    const gefiltert = suche
      ? alle.filter((k) => `${k.email} ${k.vorname} ${k.nachname}`.toLowerCase().includes(suche))
      : alle
    const anzahl = Math.min(Math.max(Number(eingabe.anzahl) || 100, 1), 500)
    return {
      ...kontakte.stand(alle),
      liste: gefiltert.slice(0, anzahl).map((k) => ({
        email: k.email,
        vorname: k.vorname,
        nachname: k.nachname,
        quelle: k.quelle,
        zustand: k.zustand || null,
        zustimmungAm: k.zustimmungAm,
        gesperrt: Boolean(k.gesperrt),
        gesperrtGrund: k.gesperrtGrund || null,
        hatShopifyId: Boolean(k.shopifyId)
      })),
      gefunden: gefiltert.length
    }
  })

  // Abmelden: lokal sperren und, wenn möglich, bei Shopify zurückschreiben. Ohne das
  // Zurückschreiben holt der nächste Sync die Person wieder herein.
  // Als eigene Funktion, weil beide Wege sie brauchen: die Liste und die Abmeldungen per Mail.
  const kontaktSperrenIntern = async (email, grund = 'abgemeldet') => {
    const daten = datenLesen()
    const kontakt = kontakte.finden(daten.kontakte, email)
    if (!kontakt) return { ok: false, unbekannt: true, text: 'Diesen Kontakt gibt es nicht.' }

    const gesperrt = kontakte.sperren(daten.kontakte, email, { grund })
    feldSpeichern('kontakte', gesperrt.liste)
    console.log(`Newsletter: ${kuerzen(email)} gesperrt (${grund}).`)

    if (!kontakt.shopifyId) {
      return { ok: true, text: 'Lokal gesperrt. Bei Shopify ist zu diesem Kontakt keine Kundennummer bekannt, dort wurde nichts geändert.' }
    }
    const zugang = shopifyZugang()
    if (zugang.fehler) return { ok: true, text: `Lokal gesperrt. Bei Shopify nicht geändert: ${zugang.fehler}` }

    const zurueck = await shopify.abmeldungSchreiben({ shop: zugang.shop, token: zugang.token, shopifyId: kontakt.shopifyId })
    if (!zurueck.ok) {
      console.warn(`Newsletter: Abmeldung von ${kuerzen(email)} nicht zu Shopify geschrieben: ${zurueck.fehler}`)
      return { ok: true, beiShopify: false, text: `Lokal gesperrt. Bei Shopify nicht geändert: ${zurueck.fehler} Der nächste Sync lässt die Sperre bestehen.` }
    }
    return { ok: true, beiShopify: true, text: 'Gesperrt und bei Shopify auf „nicht abonniert“ gesetzt.' }
  }

  bereitstellen('kontaktSperren', (eingabe = {}) => kontaktSperrenIntern(String(eingabe.email || ''), eingabe.grund || 'abgemeldet'))

  bereitstellen('kontaktFreigeben', (eingabe = {}) => {
    const daten = datenLesen()
    const ergebnis = kontakte.freigeben(daten.kontakte, eingabe.email)
    if (!ergebnis.ok) return { ok: false, text: 'Diesen Kontakt gibt es nicht.' }
    feldSpeichern('kontakte', ergebnis.liste)
    console.log(`Newsletter: Sperre fuer ${kuerzen(eingabe.email)} aufgehoben.`)
    return { ok: true, text: 'Sperre aufgehoben. Bei Shopify wurde nichts geändert.' }
  })

  // Vollständig löschen (Löschanfrage). Sperren ist der Normalfall.
  bereitstellen('kontaktLoeschen', (eingabe = {}) => {
    const daten = datenLesen()
    const ergebnis = kontakte.loeschen(daten.kontakte, eingabe.email)
    if (!ergebnis.ok) return { ok: false, text: 'Diesen Kontakt gibt es nicht.' }
    feldSpeichern('kontakte', ergebnis.liste)
    console.log(`Newsletter: ${kuerzen(eingabe.email)} vollstaendig geloescht.`)
    return { ok: true, text: 'Vollständig gelöscht. Stimmt die Adresse bei Shopify weiter zu, holt der nächste Sync sie wieder herein — dann besser sperren.' }
  })

  bereitstellen('csvImportieren', (text) => {
    const gelesen = kontakte.csvLesen(text)
    if (!gelesen.kontakte.length) {
      return { ok: false, fehler: gelesen.fehler?.length ? gelesen.fehler : ['In der Datei wurde keine brauchbare Adresse gefunden.'] }
    }
    const daten = datenLesen()
    const zusammen = kontakte.zusammenfuehren(daten.kontakte, gelesen.kontakte)
    feldSpeichern('kontakte', zusammen.liste)
    console.log(`Newsletter: CSV-Import - ${zusammen.angelegt} neu, ${zusammen.aktualisiert} aktualisiert.`)
    return {
      ok: true,
      angelegt: zusammen.angelegt,
      aktualisiert: zusammen.aktualisiert,
      uebersprungen: zusammen.uebersprungen,
      gesperrtGelassen: zusammen.gesperrtGelassen,
      hinweise: (gelesen.fehler || []).slice(0, 20)
    }
  })

  // ── Marke (Logo, Farben, Impressum) ──

  bereitstellen('markeLesen', () => {
    const marke = datenLesen().marke
    return {
      titel: marke.titel || '',
      logo: marke.logo || '',
      impressum: marke.impressum || '',
      abmeldeAdresse: marke.abmeldeAdresse || '',
      farben: { ...STANDARD_FARBEN, ...(marke.farben || {}) },
      standardFarben: STANDARD_FARBEN,
      // Der Fuß: gespeicherte Adressen, dazu die Listen, aus denen die Oberfläche ihre
      // Felder baut. So steht die Reihenfolge der Icons nur an einer Stelle (bausteine.js).
      fuss: { ...(marke.fuss || {}) },
      kopf: { ...(marke.kopf || {}) },
      rechtslinks: RECHTSLINKS,
      // `gezeichnet`: für dieses Netzwerk zeichnet Vendo das Icon selbst, ein eigenes
      // Icon-Bild ist dann nur noch die Ausnahme.
      netzwerke: NETZWERKE.map(({ id, name }) => ({ id, name, mitBild: icons.MIT_BILD.includes(id) })),
      fussFarben: FUSS_FARBEN,
      kopfFarben: KOPF_FARBEN,
      abmeldeTextStandard: ABMELDE_TEXT,
      socialTitelStandard: SOCIAL_TITEL,
      logoBreiteFussStandard: LOGO_BREITE_FUSS,
      logoBreiteKopfStandard: LOGO_BREITE_KOPF,
      iconBreiteStandard: ICON_BREITE,
      iconBreiteMin: ICON_BREITE_MIN,
      iconBreiteMax: ICON_BREITE_MAX
    }
  })

  // Beispielmail mit Kopf, Logo und Fuß an die eigene Adresse. Die freie Testmail weiter
  // unten schickt genau das, was im Feld steht — ohne Rahmen. Für „sieht mein Logo im
  // Postfach gut aus?“ braucht es diesen Weg, ohne erst eine Kampagne anlegen zu müssen.
  bereitstellen('markeTesten', async () => {
    const daten = datenLesen()
    if (!daten.zugang.benutzer || !daten.zugang.passwortVerschluesselt) return { ok: false, text: 'Es sind noch keine Zugangsdaten gespeichert.' }
    if (!daten.marke.logo && !daten.marke.titel) return { ok: false, text: 'Trage erst einen Namen oder eine Logo-Adresse ein.' }

    const beispiel = testKontakt(daten)
    const html = mailBauenAus(daten, { html: inhaltAus(startVorlage(), { marke: daten.marke }), vorschauText: 'Beispielmail aus Vendo' }, beispiel).html
    const ergebnis = await einzelSenden({ art: 'test', an: testAdresseVon(daten), betreff: '[Test] Kopf, Logo und Fuss', html })
    if (!ergebnis.ok) return ergebnis
    return {
      ok: true,
      text: `${ergebnis.text} Zeigt dein Mailprogramm kein Bild, erlaube dort zuerst Bilder von Absendern — Gmail und Outlook blenden sie oft aus.`
    }
  })

  bereitstellen('markeSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const nurFarben = {}
    for (const name of Object.keys(STANDARD_FARBEN)) {
      const wert = String(eingabe.farben?.[name] || '').trim()
      if (/^#[0-9a-f]{3,8}$/i.test(wert)) nurFarben[name] = wert
    }
    // Fußangaben: ohne `fuss` im Aufruf bleiben die gespeicherten stehen. Sonst würde ein
    // Aufruf, der nur den Titel ändert (etwa von einem Bot), Pflichtlinks und Icons leeren.
    const fuss = eingabe.fuss === undefined ? { ...(daten.marke.fuss || {}) } : fussPruefen(eingabe.fuss)
    const kopf = eingabe.kopf === undefined ? { ...(daten.marke.kopf || {}) } : kopfPruefen(eingabe.kopf)
    daten.marke = {
      titel: String(eingabe.titel || '').trim().slice(0, 80),
      logo: /^https?:\/\//i.test(String(eingabe.logo || '').trim()) ? String(eingabe.logo).trim() : '',
      impressum: String(eingabe.impressum || '').trim().slice(0, 600),
      abmeldeAdresse: String(eingabe.abmeldeAdresse || '').trim().toLowerCase(),
      farben: nurFarben,
      fuss: fuss.wert || fuss,
      kopf: kopf.wert || kopf
    }
    ctx.datenSpeichern(daten)
    console.log('Newsletter: Markenangaben gespeichert.')
    return { ok: true, verworfen: [...(fuss.verworfen || []), ...(kopf.verworfen || [])] }
  })

  // ── Kampagnen ──

  const kampagneHolen = (daten, id) => daten.kampagnen.find((k) => k.id === id) || null

  bereitstellen('kampagnenLesen', () => {
    const daten = datenLesen()
    return {
      maxHtml: MAX_HTML,
      beispielHtml: beispielHtml({ marke: daten.marke }),
      empfaenger: kontakte.empfaenger(daten.kontakte).length,
      liste: daten.kampagnen.map((k) => ({
        id: k.id,
        name: k.name,
        betreff: k.betreff,
        vorschauText: k.vorschauText,
        html: kampagnen.htmlVon(k, { marke: daten.marke }),
        htmlRahmen: k.htmlRahmen !== false,
        zustand: k.zustand,
        geplantAm: k.geplantAm || null,
        eingereiht: k.eingereiht || 0,
        geaendertAm: k.geaendertAm || null,
        gestartetAm: k.gestartetAm || null,
        // Ein Bot hat sie zur Freigabe gegeben: wann, von wem, Wunschtermin, ob die Testmail raus ist
        freigabe: k.freigabe || null,
        erstelltVon: k.erstelltVon || null
      }))
    }
  })

  bereitstellen('kampagneAnlegen', (name) => {
    const daten = datenLesen()
    const kampagne = kampagnen.neueKampagne({ name, marke: daten.marke })
    daten.kampagnen = [...daten.kampagnen, kampagne]
    ctx.datenSpeichern(daten)
    return { ok: true, id: kampagne.id }
  })

  bereitstellen('kampagneSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, eingabe.id)
    if (!kampagne) return { ok: false, fehler: ['Diese Kampagne gibt es nicht.'] }
    if (kampagne.zustand === 'laeuft') return { ok: false, fehler: ['Die Kampagne läuft gerade. Erst abbrechen, dann ändern.'] }

    const aenderung = {
      name: String(eingabe.name || kampagne.name).trim().slice(0, 80) || kampagne.name,
      betreff: String(eingabe.betreff ?? kampagne.betreff),
      vorschauText: String(eingabe.vorschauText ?? kampagne.vorschauText).slice(0, 200),
      // Roh speichern, gesäubert wird beim Bauen der Mail: so bleibt im Editor stehen,
      // was eingetippt wurde, auch wenn Vendo es später nicht mitschickt.
      html: String(eingabe.html ?? kampagnen.htmlVon(kampagne, { marke: daten.marke })).slice(0, MAX_HTML),
      htmlRahmen: eingabe.htmlRahmen === undefined ? kampagne.htmlRahmen !== false : Boolean(eingabe.htmlRahmen)
    }
    const geaendert = kampagnen.kampagneAendern(daten.kampagnen, kampagne.id, aenderung)
    daten.kampagnen = geaendert.liste
    ctx.datenSpeichern(daten)
    const geprueft = kampagnePruefenMitMarke(datenLesen(), kampagne.id)
    return { ok: true, hinweise: geprueft.fehler }
  })

  bereitstellen('kampagneLoeschen', (id) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    if (kampagne.zustand === 'laeuft') return { ok: false, text: 'Die Kampagne läuft gerade. Erst abbrechen.' }
    daten.kampagnen = daten.kampagnen.filter((k) => k.id !== id)
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Kampagne "${kampagne.name}" geloescht.`)
    return { ok: true, text: 'Kampagne gelöscht.' }
  })

  // Prüfen inklusive dessen, was die Marke liefern muss (Impressum, Abmeldeweg)
  const kampagnePruefenMitMarke = (daten, id) => {
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, fehler: ['Diese Kampagne gibt es nicht.'] }
    const geprueft = kampagnen.kampagnePruefen(kampagne, { marke: daten.marke })
    const fehler = [...geprueft.fehler]
    if (!abmeldeAdresseVon(daten)) fehler.push('Es fehlt eine Adresse für die Abmeldung (Postfach eintragen oder unter „Marke“ angeben).')
    if (!daten.marke.impressum) fehler.push('Im Fuß fehlt das Impressum (unter „Marke“ eintragen).')
    return { ok: fehler.length === 0, fehler, kampagne, html: geprueft.html }
  }

  // Vorschau: fertiges HTML und der abgeleitete Textteil, mit Beispielkontakt
  bereitstellen('kampagneVorschau', (id) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    const beispiel = kontakte.empfaenger(daten.kontakte)[0] || { ...testKontakt(daten), email: testAdresseVon(daten) || 'empfaenger@beispiel.de' }
    const gebaut = mailBauenAus(daten, kampagne, beispiel)
    const geprueft = kampagnePruefenMitMarke(daten, id)
    return {
      ok: true,
      html: fuerAnsicht(daten, gebaut.html),
      text: textAusHtml(gebaut.html),
      betreff: kampagnen.personalisieren(kampagne.betreff, beispiel),
      hinweise: geprueft.fehler,
      gesaeubert: gebaut.hinweis,
      beispielAdresse: beispiel.email
    }
  })

  // Vorschau aus dem, was gerade im Editor steht — ohne vorher zu speichern. Das ist der
  // Weg für die mitlaufende Vorschau neben dem HTML-Feld: sie soll beim Tippen folgen,
  // und beim Tippen gehört nichts in die Daten geschrieben.
  bereitstellen('mailVorschau', (eingabe = {}) => {
    const daten = datenLesen()
    const alsVorlage = eingabe.art === 'vorlage'
    const beispiel = kontakte.empfaenger(daten.kontakte)[0] || { ...testKontakt(daten), email: testAdresseVon(daten) || 'empfaenger@beispiel.de' }
    const entwurf = {
      name: String(eingabe.name ?? '').slice(0, 80),
      betreff: String(eingabe.betreff ?? ''),
      vorschauText: String(eingabe.vorschauText ?? '').slice(0, 200),
      html: String(eingabe.html ?? '').slice(0, MAX_HTML),
      htmlRahmen: eingabe.htmlRahmen !== false
    }
    // Eine Vorlage hat keinen Betreff und keine Empfänger — sie darf nicht nach beidem
    // gefragt werden. Dafür zeigt sie den Beispiel-Warenkorb wie im Automationsschritt.
    const gebaut = mailBauenAus(daten, entwurf, beispiel, alsVorlage ? BEISPIEL_KORB : {})
    const geprueft = alsVorlage ? vorlagen.vorlagePruefen(entwurf, { marke: daten.marke }) : kampagnen.kampagnePruefen(entwurf, { marke: daten.marke })
    const fehler = [...geprueft.fehler]
    if (!abmeldeAdresseVon(daten)) fehler.push('Es fehlt eine Adresse für die Abmeldung (Postfach eintragen oder unter „Marke“ angeben).')
    if (!daten.marke.impressum) fehler.push('Im Fuß fehlt das Impressum (unter „Marke“ eintragen).')
    return {
      ok: true,
      html: fuerAnsicht(daten, gebaut.html),
      text: textAusHtml(gebaut.html),
      betreff: kampagnen.personalisieren(entwurf.betreff, beispiel),
      hinweise: fehler,
      gesaeubert: gebaut.hinweis,
      beispielAdresse: beispiel.email
    }
  })

  // Eine schlichte Startmail als Quelltext — für ein leeres Feld oder einen neuen Anfang
  bereitstellen('startHtml', () => ({ ok: true, html: inhaltAus(startVorlage(), { marke: datenLesen().marke }) }))

  // Testmail der Kampagne an die eigene Adresse
  bereitstellen('kampagneTesten', async (id) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    const beispiel = testKontakt(daten)
    return einzelSenden({
      art: 'test',
      an: testAdresseVon(daten),
      betreff: `[Test] ${kampagnen.personalisieren(kampagne.betreff, beispiel) || kampagne.name}`,
      html: mailBauenAus(daten, kampagne, beispiel).html,
      kampagneId: kampagne.id
    })
  })

  // Kampagne starten: Empfänger auflösen und in die Warteschlange legen. Von da an macht der
  // Takt weiter, gebremst durch die Drossel.
  const kampagneStarten = (id, { jetzt = Date.now() } = {}) => {
    const daten = datenLesen()
    const geprueft = kampagnePruefenMitMarke(daten, id)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }
    const kampagne = geprueft.kampagne
    if (kampagne.zustand === 'laeuft') return { ok: false, fehler: ['Die Kampagne läuft schon.'] }

    const empfaenger = kontakte.empfaenger(daten.kontakte)
    if (!empfaenger.length) return { ok: false, fehler: ['Es gibt keine Empfänger mit Zustimmung.'] }

    const eingereiht = warteschlange.einreihen(
      daten.warteschlange,
      empfaenger.map((k) => ({ kampagneId: kampagne.id, an: k.email, art: 'kampagne' })),
      { jetzt }
    )
    daten.warteschlange = eingereiht.liste
    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, kampagne.id, {
      zustand: 'laeuft',
      freigabe: null,
      gestartetAm: jetzt,
      geplantAm: null,
      eingereiht: (kampagne.eingereiht || 0) + eingereiht.eingereiht
    }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Kampagne "${kampagne.name}" gestartet - ${eingereiht.eingereiht} eingereiht, ${eingereiht.uebersprungen} uebersprungen.`)
    return { ok: true, eingereiht: eingereiht.eingereiht, uebersprungen: eingereiht.uebersprungen, empfaenger: empfaenger.length }
  }

  bereitstellen('kampagneStarten', (id) => kampagneStarten(id))

  bereitstellen('kampagnePlanen', (eingabe = {}) => {
    const daten = datenLesen()
    const geprueft = kampagnePruefenMitMarke(daten, eingabe.id)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }
    const zeitpunkt = Number(eingabe.geplantAm)
    if (!Number.isFinite(zeitpunkt) || zeitpunkt < Date.now()) return { ok: false, fehler: ['Der Zeitpunkt liegt in der Vergangenheit.'] }
    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, eingabe.id, { zustand: 'geplant', geplantAm: zeitpunkt, freigabe: null }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Kampagne "${geprueft.kampagne.name}" geplant fuer ${new Date(zeitpunkt).toISOString()}.`)
    return { ok: true }
  })

  bereitstellen('kampagneAbbrechen', (id) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    const verworfen = warteschlange.offeneVerwerfen(daten.warteschlange, { kampagneId: id })
    daten.warteschlange = verworfen.liste
    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, id, { zustand: 'abgebrochen', geplantAm: null }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Kampagne "${kampagne.name}" abgebrochen, ${verworfen.anzahl} Eintraege verworfen.`)
    return { ok: true, text: `Abgebrochen, ${verworfen.anzahl} offene Einträge verworfen.` }
  })

  bereitstellen('kampagneZurueckZumEntwurf', (id) => {
    const daten = datenLesen()
    if (!kampagneHolen(daten, id)) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, id, { zustand: 'entwurf', geplantAm: null, freigabe: null }).liste
    ctx.datenSpeichern(daten)
    return { ok: true, text: 'Wieder im Entwurf.' }
  })

  // ── KI ──
  // Den Auftrag baut der Hintergrundteil, die Frage stellt die Oberfläche über ctx.fragen,
  // und die Antwort kommt hierher zurück. So liegt die prüfbare Logik an einer Stelle.

  bereitstellen('kiAuftragHolen', (eingabe = {}) => {
    const daten = datenLesen()
    return {
      ok: true,
      auftrag: kampagnen.kiAuftrag({
        thema: eingabe.thema,
        ton: eingabe.ton,
        marke: daten.marke,
        produkte: Array.isArray(eingabe.produkte) ? eingabe.produkte.slice(0, 10) : [],
        anzahlBausteine: eingabe.anzahlBausteine
      })
    }
  })

  bereitstellen('kiAntwortUebernehmen', (eingabe = {}) => {
    const gelesen = kampagnen.kiAntwortLesen(eingabe.text)
    if (!gelesen.ok) return { ok: false, text: gelesen.fehler }

    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, eingabe.id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    if (kampagne.zustand === 'laeuft') return { ok: false, text: 'Die Kampagne läuft gerade.' }

    // Kopf und Fuß behalten, den Inhalt dazwischen ersetzen
    const kopf = (kampagne.bausteine || []).filter((b) => b.art === 'kopf')
    const fuss = (kampagne.bausteine || []).filter((b) => b.art === 'fuss')
    const bausteine = [...kopf, ...gelesen.bausteine, ...fuss]

    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, kampagne.id, {
      betreff: gelesen.betreff || kampagne.betreff,
      vorschauText: gelesen.vorschauText || kampagne.vorschauText,
      // Luzzys Entwurf wird hier zu HTML: sie liefert geprüfte Bausteine, Vendo macht
      // daraus Tabellen-HTML und legt es ins Code-Feld. Was vorher dort stand, ist weg —
      // deshalb steht es in der Meldung.
      html: inhaltAus(bausteine, { marke: daten.marke })
    }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Entwurf von Luzzy uebernommen (${gelesen.bausteine.length} Bausteine als HTML).`)
    return { ok: true, text: `Übernommen: Betreff und ein Entwurf aus ${gelesen.bausteine.length} Bausteinen, als HTML im Code-Feld. Das bisherige HTML wurde ersetzt.` }
  })

  // ── Vorlagen ──
  // Eine Vorlage ist eine gespeicherte Bausteinfolge. Angewendet wird sie auf eine Kampagne
  // oder einen Automationsschritt; dort wird weiter bearbeitet, ohne die Vorlage zu ändern.

  const vorlageHolen = (daten, id) => daten.vorlagen.find((v) => v.id === id) || null

  bereitstellen('vorlagenLesen', () => {
    const daten = datenLesen()
    const beispiel = { ...testKontakt(daten), email: testAdresseVon(daten) || 'empfaenger@beispiel.de' }
    return {
      maxHtml: MAX_HTML,
      beispielHtml: beispielHtml({ marke: daten.marke }),
      liste: daten.vorlagen.map((v) => {
        const geprueft = vorlagen.vorlagePruefen(v, { marke: daten.marke })
        return {
          id: v.id,
          name: v.name,
          beschreibung: v.beschreibung || '',
          html: kampagnen.htmlVon(v, { marke: daten.marke }),
          htmlRahmen: v.htmlRahmen !== false,
          geaendertAm: v.geaendertAm || null,
          hinweise: geprueft.fehler,
          felder: geprueft.felder.map(({ name, hinweis, art }) => ({ name, hinweis, art })),
          // Die fertige Mail für das kleine Vorschaubild in der Übersicht
          vorschau: fuerAnsicht(daten, mailBauenAus(daten, v, beispiel, BEISPIEL_KORB).html)
        }
      })
    }
  })

  // ── Mustervorlagen ──
  // Sechs fertige Vorlagen im Stil der Marke. Sie sind der Gegenentwurf zum leeren Feld:
  // wer bei null anfängt, baut ein Gerüst und füllt es mit erfundenen Produkten.

  bereitstellen('musterLesen', () => ({ liste: muster.musterListe() }))

  bereitstellen('vorlageAusMuster', (eingabe = {}) => {
    const daten = datenLesen()
    if (daten.vorlagen.length >= vorlagen.MAX_VORLAGEN) return { ok: false, text: `Mehr als ${vorlagen.MAX_VORLAGEN} Vorlagen sind nicht vorgesehen.` }
    const gewaehlt = muster.musterListe().find((x) => x.id === eingabe.id)
    const html = muster.musterHtml(eingabe.id, { marke: daten.marke })
    if (!gewaehlt || !html) return { ok: false, text: 'Dieses Muster gibt es nicht.' }

    const neu = vorlagen.neueVorlage({ name: gewaehlt.name, beschreibung: gewaehlt.beschreibung, html, marke: daten.marke })
    daten.vorlagen = [...daten.vorlagen, neu]
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Vorlage aus Muster „${gewaehlt.id}" angelegt.`)
    return { ok: true, id: neu.id, text: `Vorlage „${gewaehlt.name}" angelegt. Jedes Feld für die Kampagne neu schreiben, Produkte aus dem Shop.` }
  })

  bereitstellen('vorlageAnlegen', (eingabe = {}) => {
    const daten = datenLesen()
    if (daten.vorlagen.length >= vorlagen.MAX_VORLAGEN) return { ok: false, text: `Mehr als ${vorlagen.MAX_VORLAGEN} Vorlagen sind nicht vorgesehen.` }
    const neu = vorlagen.neueVorlage({ name: eingabe.name, beschreibung: eingabe.beschreibung, marke: daten.marke })
    daten.vorlagen = [...daten.vorlagen, neu]
    ctx.datenSpeichern(daten)
    return { ok: true, id: neu.id }
  })

  bereitstellen('vorlageSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const vorhanden = vorlageHolen(daten, eingabe.id)
    if (!vorhanden) return { ok: false, fehler: ['Diese Vorlage gibt es nicht.'] }
    const geaendert = vorlagen.vorlageAendern(daten.vorlagen, eingabe.id, {
      name: String(eingabe.name ?? vorhanden.name).trim().slice(0, 80) || 'Vorlage',
      beschreibung: String(eingabe.beschreibung ?? vorhanden.beschreibung ?? '').trim().slice(0, 200),
      // Roh speichern, gesäubert wird beim Bauen der Mail — wie bei Kampagnen
      html: String(eingabe.html ?? kampagnen.htmlVon(vorhanden, { marke: daten.marke })).slice(0, MAX_HTML),
      htmlRahmen: eingabe.htmlRahmen === undefined ? vorhanden.htmlRahmen !== false : Boolean(eingabe.htmlRahmen)
    })
    daten.vorlagen = geaendert.liste
    ctx.datenSpeichern(daten)
    return { ok: true, hinweise: vorlagen.vorlagePruefen(vorlageHolen(datenLesen(), eingabe.id), { marke: daten.marke }).fehler }
  })

  bereitstellen('vorlageLoeschen', (id) => {
    const daten = datenLesen()
    if (!vorlageHolen(daten, id)) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
    daten.vorlagen = daten.vorlagen.filter((v) => v.id !== id)
    ctx.datenSpeichern(daten)
    return { ok: true, text: 'Vorlage gelöscht.' }
  })

  bereitstellen('vorlageVorschau', (id) => {
    const daten = datenLesen()
    const vorlage = vorlageHolen(daten, id)
    if (!vorlage) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
    const beispiel = { ...testKontakt(daten), email: testAdresseVon(daten) || 'empfaenger@beispiel.de' }
    const gebaut = mailBauenAus(daten, vorlage, beispiel, BEISPIEL_KORB)
    return { ok: true, html: fuerAnsicht(daten, gebaut.html), text: textAusHtml(gebaut.html), gesaeubert: gebaut.hinweis, hinweise: vorlagen.vorlagePruefen(vorlage, { marke: daten.marke }).fehler }
  })

  bereitstellen('vorlageTesten', async (id) => {
    const daten = datenLesen()
    const vorlage = vorlageHolen(daten, id)
    if (!vorlage) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
    const beispiel = testKontakt(daten)
    return einzelSenden({
      art: 'test',
      an: testAdresseVon(daten),
      betreff: `[Vorlage] ${vorlage.name}`,
      html: mailBauenAus(daten, vorlage, beispiel, BEISPIEL_KORB).html
    })
  })

  // Aus einer Kampagne oder einem Automationsschritt eine Vorlage sichern
  bereitstellen('vorlageAusBausteinen', (eingabe = {}) => {
    const daten = datenLesen()
    const html = String(eingabe.html ?? '').slice(0, MAX_HTML)
    if (!hatInhalt(html)) return { ok: false, text: 'Da ist noch kein Inhalt, den man sichern könnte.' }
    const neu = vorlagen.ausHtml(html, {
      name: eingabe.name || 'Aus Kampagne',
      beschreibung: eingabe.beschreibung,
      htmlRahmen: eingabe.htmlRahmen !== false,
      marke: daten.marke
    })
    daten.vorlagen = [...daten.vorlagen, neu]
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Vorlage "${neu.name}" gesichert.`)
    return { ok: true, id: neu.id, text: `Als Vorlage „${neu.name}“ gesichert.` }
  })

  // Vorlage auf eine Kampagne oder einen Automationsschritt anwenden
  bereitstellen('vorlageAnwenden', (eingabe = {}) => {
    const daten = datenLesen()
    const vorlage = vorlageHolen(daten, eingabe.vorlageId)
    if (!vorlage) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
    const inhalt = vorlagen.anwenden(vorlage, { marke: daten.marke })

    if (eingabe.ziel === 'kampagne') {
      const kampagne = daten.kampagnen.find((k) => k.id === eingabe.id)
      if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      if (kampagne.zustand === 'laeuft') return { ok: false, text: 'Die Kampagne läuft gerade.' }
      daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, kampagne.id, { html: inhalt.html, htmlRahmen: inhalt.htmlRahmen }).liste
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Vorlage „${vorlage.name}“ übernommen. Texte jetzt anpassen.` }
    }

    if (eingabe.ziel === 'automation') {
      const automation = daten.automationen.find((a) => a.id === eingabe.id)
      if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      const nummer = Number(eingabe.schritt) || 0
      const schritte = (automation.schritte || []).map((s, i) => (i === nummer ? { ...s, html: inhalt.html } : s))
      if (!schritte[nummer]) return { ok: false, text: 'Diesen Schritt gibt es nicht.' }
      daten.automationen = daten.automationen.map((a) => (a.id === automation.id ? { ...a, schritte, geaendertAm: Date.now() } : a))
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Vorlage „${vorlage.name}“ auf Schritt ${nummer + 1} übernommen.` }
    }

    return { ok: false, text: 'Unbekanntes Ziel.' }
  })

  // KI-Entwurf für eine Vorlage: Auftrag hier, Frage über ctx.fragen in der Oberfläche
  bereitstellen('vorlageKiAuftrag', (eingabe = {}) => ({
    ok: true,
    auftrag: vorlagen.kiAuftrag({ zweck: eingabe.zweck, ton: eingabe.ton, marke: datenLesen().marke })
  }))

  bereitstellen('vorlageKiUebernehmen', (eingabe = {}) => {
    const gelesen = vorlagen.kiAntwortLesenVorlage(eingabe.text)
    if (!gelesen.ok) return { ok: false, text: gelesen.fehler }

    const daten = datenLesen()
    // Ohne Ziel wird eine neue Vorlage angelegt, sonst die genannte ersetzt
    if (!eingabe.id) {
      if (daten.vorlagen.length >= vorlagen.MAX_VORLAGEN) return { ok: false, text: `Mehr als ${vorlagen.MAX_VORLAGEN} Vorlagen sind nicht vorgesehen.` }
      const neu = vorlagen.neueVorlage({ name: gelesen.name || 'Entwurf von Luzzy', beschreibung: gelesen.beschreibung, html: inhaltAus(gelesen.bausteine, { marke: daten.marke, felder: true }), marke: daten.marke })
      daten.vorlagen = [...daten.vorlagen, neu]
      ctx.datenSpeichern(daten)
      console.log(`Newsletter: Vorlage "${neu.name}" von Luzzy entworfen (${gelesen.bausteine.length} Bausteine als HTML).`)
      return { ok: true, id: neu.id, text: `Vorlage „${neu.name}“ angelegt, als HTML im Code-Feld. Vorschau prüfen.` }
    }

    const vorlage = vorlageHolen(daten, eingabe.id)
    if (!vorlage) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
    daten.vorlagen = vorlagen.vorlageAendern(daten.vorlagen, vorlage.id, {
      name: gelesen.name || vorlage.name,
      beschreibung: gelesen.beschreibung || vorlage.beschreibung,
      // Luzzys Entwurf wird zu HTML (siehe kiAntwortUebernehmen); das bisherige wird ersetzt
      html: inhaltAus(gelesen.bausteine, { marke: daten.marke, felder: true })
    }).liste
    ctx.datenSpeichern(daten)
    return { ok: true, id: vorlage.id, text: `Übernommen: ein Entwurf aus ${gelesen.bausteine.length} Bausteinen, als HTML im Code-Feld. Das bisherige HTML wurde ersetzt.` }
  })

  // ── Automationen ──

  const automationHolen = (daten, id) => daten.automationen.find((a) => a.id === id) || null

  bereitstellen('automationenLesen', () => {
    const daten = datenLesen()
    return {
      arten: automationen.ARTEN.map((art) => ({
        art,
        name: automationen.AUSLOESER[art].name,
        beschreibung: automationen.AUSLOESER[art].beschreibung,
        abbruchBei: automationen.AUSLOESER[art].abbruchBei
      })),
      shopifyBereit: Boolean(datenLesen().shopify.tokenVerschluesselt),
      liste: daten.automationen.map((a) => ({
        id: a.id,
        art: a.art,
        name: a.name,
        aktiv: Boolean(a.aktiv),
        nurMitZustimmung: a.nurMitZustimmung !== false,
        schritte: (a.schritte || []).map((s) => ({
          nach: s.nach,
          verfallNach: s.verfallNach,
          betreff: s.betreff || '',
          html: kampagnen.htmlVon(s, { marke: daten.marke }),
          htmlRahmen: s.htmlRahmen !== false
        })),
        stand: automationen.stand(daten.laeufe, a.id),
        hinweise: automationen.automationPruefen(a).fehler
      }))
    }
  })

  bereitstellen('automationAnlegen', (art) => {
    const neu = automationen.neueAutomation(art)
    if (!neu) return { ok: false, text: 'Unbekannte Art von Automation.' }
    const daten = datenLesen()
    if (daten.automationen.some((a) => a.art === art)) return { ok: false, text: 'Diese Automation gibt es schon.' }
    daten.automationen = [...daten.automationen, neu]
    ctx.datenSpeichern(daten)
    return { ok: true, id: neu.id }
  })

  bereitstellen('automationSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, fehler: ['Diese Automation gibt es nicht.'] }

    const schritte = (Array.isArray(eingabe.schritte) ? eingabe.schritte : automation.schritte || []).map((s, i) => ({
      nach: Math.max(Number(s?.nach) || 0, 0),
      verfallNach: Math.max(Number(s?.verfallNach) || automationen.STUNDE * 48, automationen.STUNDE),
      betreff: String(s?.betreff ?? '').slice(0, 200),
      html: String(s?.html ?? kampagnen.htmlVon(automation.schritte?.[i] || {}, { marke: daten.marke })).slice(0, MAX_HTML),
      htmlRahmen: s?.htmlRahmen === undefined ? automation.schritte?.[i]?.htmlRahmen !== false : Boolean(s.htmlRahmen)
    }))

    daten.automationen = daten.automationen.map((a) =>
      a.id === automation.id
        ? {
            ...a,
            name: String(eingabe.name || a.name).slice(0, 80),
            nurMitZustimmung: eingabe.nurMitZustimmung !== false,
            schritte,
            geaendertAm: Date.now()
          }
        : a
    )
    ctx.datenSpeichern(daten)
    const geprueft = automationen.automationPruefen(automationHolen(datenLesen(), automation.id))
    return { ok: true, hinweise: geprueft.fehler }
  })

  // Einschalten geht nur, wenn jeder Schritt vollständig ist: eine halb fertige Automation
  // würde sonst still Mails mit leerem Inhalt erzeugen.
  bereitstellen('automationSchalten', (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
    const an = Boolean(eingabe.aktiv)

    if (an) {
      const geprueft = automationen.automationPruefen(automation)
      if (!geprueft.ok) return { ok: false, text: `Noch nicht sendefertig: ${geprueft.fehler.join(' ')}` }
      if (!abmeldeAdresseVon(daten)) return { ok: false, text: 'Es fehlt eine Adresse für die Abmeldung (Reiter „Zugang“).' }
      if (!daten.marke.impressum) return { ok: false, text: 'Im Fuß fehlt das Impressum (Reiter „Zugang“, Abschnitt Marke).' }
      if (automation.art === 'warenkorb' && !daten.shopify.tokenVerschluesselt) {
        return { ok: false, text: 'Für den Warenkorbabbruch fehlt der Shopify-Zugang (Reiter „Kontakte“).' }
      }
    }

    daten.automationen = daten.automationen.map((a) => (a.id === automation.id ? { ...a, aktiv: an, geaendertAm: Date.now() } : a))
    // Beim Abschalten laufende Läufe beenden: sonst käme die zweite Mail noch Tage später
    if (!an) {
      const beendet = automationen.abbrechen(daten.laeufe, { grund: 'Automation abgeschaltet', automationIds: [automation.id] })
      daten.laeufe = beendet.liste
      if (beendet.anzahl) console.log(`Newsletter: ${beendet.anzahl} laufende Automationen beendet (abgeschaltet).`)
    }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Automation "${automation.name}" ${an ? 'eingeschaltet' : 'abgeschaltet'}.`)
    return { ok: true, text: an ? 'Eingeschaltet.' : 'Abgeschaltet, laufende Serien beendet.' }
  })

  bereitstellen('automationLoeschen', (id) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, id)
    if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
    daten.automationen = daten.automationen.filter((a) => a.id !== id)
    daten.laeufe = automationen.abbrechen(daten.laeufe, { grund: 'Automation gelöscht', automationIds: [id] }).liste
    ctx.datenSpeichern(daten)
    return { ok: true, text: 'Automation gelöscht.' }
  })

  // Beispieldaten für Vorschau und Testmail eines Schritts
  const BEISPIEL_KORB = {
    warenkorb: '1 × Beispielartikel\n1 × Zweiter Artikel',
    warenkorbLink: 'https://beispiel.de/warenkorb-wiederherstellen',
    summe: '59,80 EUR'
  }

  const automationMailBauen = (daten, automation, schrittNummer, kontakt, extra) => {
    const schritt = (automation.schritte || [])[schrittNummer]
    if (!schritt) return { fehler: 'Diesen Schritt gibt es nicht.' }
    return {
      betreff: kampagnen.personalisieren(schritt.betreff, kontakt, extra),
      html: mailBauenAus(daten, schritt, kontakt, extra).html
    }
  }

  bereitstellen('automationVorschau', (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
    const beispiel = { ...testKontakt(daten), email: testAdresseVon(daten) || 'empfaenger@beispiel.de' }
    const gebaut = automationMailBauen(daten, automation, Number(eingabe.schritt) || 0, beispiel, BEISPIEL_KORB)
    if (gebaut.fehler) return { ok: false, text: gebaut.fehler }
    return { ok: true, html: fuerAnsicht(daten, gebaut.html), text: textAusHtml(gebaut.html), betreff: gebaut.betreff, hinweise: automationen.automationPruefen(automation).fehler }
  })

  bereitstellen('automationTesten', async (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
    const beispiel = testKontakt(daten)
    const gebaut = automationMailBauen(daten, automation, Number(eingabe.schritt) || 0, beispiel, BEISPIEL_KORB)
    if (gebaut.fehler) return { ok: false, text: gebaut.fehler }
    return einzelSenden({ art: 'test', an: testAdresseVon(daten), betreff: `[Test] ${gebaut.betreff || automation.name}`, html: gebaut.html })
  })

  bereitstellen('laeufeLesen', () => {
    const daten = datenLesen()
    return {
      ...automationen.stand(daten.laeufe),
      ausloeser: daten.einstellungen.ausloeser || {},
      liste: daten.laeufe
        .filter((l) => l.zustand === 'laeuft')
        .slice(-30)
        .map((l) => ({
          id: l.id,
          automationId: l.automationId,
          an: kuerzen(l.email),
          schritt: l.schritt + 1,
          faelligAb: l.faelligAb,
          verfaelltAm: l.verfaelltAm
        }))
    }
  })

  // ── Auslöser: was Automationen in Gang setzt ──
  // Wird selten aufgerufen (alle zehn Minuten), damit Shopify nicht unnötig abgefragt wird.
  const ausloeserPruefen = async ({ jetzt = Date.now() } = {}) => {
    const daten = datenLesen()
    const aktive = daten.automationen.filter((a) => a.aktiv)
    if (!aktive.length) return { nichts: true }

    const stand = daten.einstellungen.ausloeser || {}
    const zugang = shopifyZugang()
    const bericht = { warenkoerbe: 0, willkommen: 0, abgebrochen: 0 }

    // 1. Abmeldungen und Bestellungen brechen laufende Serien ab
    const mitBestellAbbruch = aktive.filter((a) => automationen.AUSLOESER[a.art]?.abbruchBei.includes('bestellung')).map((a) => a.id)
    if (mitBestellAbbruch.length && !zugang.fehler) {
      const seit = Number(stand.bestellerSeit) || jetzt - 86400000
      const besteller = await shopify.bestellerHolen({ shop: zugang.shop, token: zugang.token, seit })
      if (besteller.ok) {
        let liste = datenLesen().laeufe
        for (const email of besteller.adressen) {
          const e = automationen.abbrechen(liste, { email, grund: 'Bestellung eingegangen', automationIds: mitBestellAbbruch, jetzt })
          liste = e.liste
          bericht.abgebrochen += e.anzahl
        }
        const d = datenLesen()
        d.laeufe = liste
        d.einstellungen = { ...d.einstellungen, ausloeser: { ...(d.einstellungen.ausloeser || {}), bestellerSeit: jetzt } }
        ctx.datenSpeichern(d)
      } else {
        console.warn(`Newsletter: Bestellungen konnten nicht geprueft werden: ${besteller.fehler}`)
      }
    }

    // Gesperrte Kontakte: ihre Serien enden, unabhängig von der Automationsart
    {
      let liste = datenLesen().laeufe
      let anzahl = 0
      for (const lauf of liste.filter((l) => l.zustand === 'laeuft')) {
        const kontakt = kontakte.finden(datenLesen().kontakte, lauf.email)
        if (!kontakt?.gesperrt) continue
        const e = automationen.abbrechen(liste, { email: lauf.email, grund: 'abgemeldet', jetzt })
        liste = e.liste
        anzahl += e.anzahl
      }
      if (anzahl) {
        feldSpeichern('laeufe', liste)
        bericht.abgebrochen += anzahl
      }
    }

    // 2. Warenkorbabbrüche holen
    const warenkorb = aktive.find((a) => a.art === 'warenkorb')
    if (warenkorb && !zugang.fehler) {
      const seit = Number(stand.warenkorbSeit) || jetzt - 86400000
      const geholt = await shopify.warenkoerbeHolen({ shop: zugang.shop, token: zugang.token, seit })
      if (geholt.ok) {
        let liste = datenLesen().laeufe
        for (const korb of geholt.koerbe) {
          const kontakt = kontakte.finden(datenLesen().kontakte, korb.email)
          const erlaubt = automationen.darfSenden({ automation: warenkorb, kontakt })
          if (!erlaubt.ok) continue // ohne Zustimmung keine Werbung
          const e = automationen.laufStarten(liste, {
            automationId: warenkorb.id,
            email: korb.email,
            ausloeserId: korb.id,
            schritte: warenkorb.schritte,
            jetzt,
            daten: {
              warenkorbLink: korb.link,
              summe: korb.summe,
              warenkorb: korb.posten.map((p) => `${p.menge} × ${p.titel}`).join('\n')
            }
          })
          liste = e.liste
          if (e.gestartet) bericht.warenkoerbe++
        }
        const d = datenLesen()
        d.laeufe = liste
        d.einstellungen = { ...d.einstellungen, ausloeser: { ...(d.einstellungen.ausloeser || {}), warenkorbSeit: jetzt } }
        ctx.datenSpeichern(d)
      } else {
        console.warn(`Newsletter: Warenkoerbe konnten nicht geholt werden: ${geholt.fehler}`)
      }
    }

    // 3. Willkommen: Kontakte, die seit dem letzten Lauf neu dazugekommen sind
    const willkommen = aktive.find((a) => a.art === 'willkommen')
    if (willkommen) {
      const seit = Number(stand.willkommenSeit) || jetzt
      let liste = datenLesen().laeufe
      for (const kontakt of datenLesen().kontakte) {
        if (!Number(kontakt.angelegtAm) || Number(kontakt.angelegtAm) <= seit) continue
        if (!automationen.darfSenden({ automation: willkommen, kontakt }).ok) continue
        const e = automationen.laufStarten(liste, {
          automationId: willkommen.id,
          email: kontakt.email,
          ausloeserId: `neu:${kontakt.email}`,
          schritte: willkommen.schritte,
          jetzt
        })
        liste = e.liste
        if (e.gestartet) bericht.willkommen++
      }
      const d = datenLesen()
      d.laeufe = liste
      d.einstellungen = { ...d.einstellungen, ausloeser: { ...(d.einstellungen.ausloeser || {}), willkommenSeit: jetzt } }
      ctx.datenSpeichern(d)
    }

    if (bericht.warenkoerbe || bericht.willkommen || bericht.abgebrochen) {
      console.log(`Newsletter: Automationen - ${bericht.warenkoerbe} Warenkoerbe, ${bericht.willkommen} Willkommen, ${bericht.abgebrochen} abgebrochen.`)
    }
    return { ok: true, ...bericht }
  }

  bereitstellen('ausloeserPruefen', () => ausloeserPruefen())

  // Fällige Schritte in die Warteschlange legen. Von dort holt sie der Takt gedrosselt ab.
  const laeufeAbarbeiten = ({ jetzt = Date.now() } = {}) => {
    let daten = datenLesen()
    if (!daten.laeufe.length) return { nichts: true }

    const verfallen = automationen.verfalleneMarkieren(daten.laeufe, jetzt)
    if (verfallen.anzahl) {
      feldSpeichern('laeufe', verfallen.liste)
      console.log(`Newsletter: ${verfallen.anzahl} Automationsschritt(e) verfallen (zu spaet).`)
      daten = datenLesen()
    }

    let eingereiht = 0
    for (const lauf of automationen.faellige(daten.laeufe, jetzt)) {
      const frisch = datenLesen()
      const automation = automationHolen(frisch, lauf.automationId)
      if (!automation || !automation.aktiv) {
        feldSpeichern('laeufe', automationen.abbrechen(frisch.laeufe, { email: lauf.email, grund: 'Automation nicht mehr aktiv', automationIds: [lauf.automationId], jetzt }).liste)
        continue
      }
      const kontakt = kontakte.finden(frisch.kontakte, lauf.email)
      const erlaubt = automationen.darfSenden({ automation, kontakt })
      if (!erlaubt.ok) {
        feldSpeichern('laeufe', automationen.abbrechen(frisch.laeufe, { email: lauf.email, grund: erlaubt.grund, automationIds: [automation.id], jetzt }).liste)
        continue
      }

      const gebaut = automationMailBauen(frisch, automation, lauf.schritt, kontakt || { email: lauf.email }, lauf.daten || {})
      if (gebaut.fehler) {
        feldSpeichern('laeufe', automationen.abbrechen(frisch.laeufe, { email: lauf.email, grund: gebaut.fehler, automationIds: [automation.id], jetzt }).liste)
        continue
      }

      // Der Schlüssel aus Lauf und Schritt verhindert, dass derselbe Schritt zweimal rausgeht
      const ergebnis = warteschlange.einreihen(
        frisch.warteschlange,
        [
          {
            kampagneId: `auto:${lauf.id}:${lauf.schritt}`,
            an: lauf.email,
            betreff: gebaut.betreff,
            html: gebaut.html,
            art: 'kampagne',
            verfaelltAm: lauf.verfaelltAm
          }
        ],
        { jetzt }
      )
      const d = datenLesen()
      d.warteschlange = ergebnis.liste
      d.laeufe = automationen.schrittGemacht(d.laeufe, lauf.id, automation.schritte, { jetzt })
      ctx.datenSpeichern(d)
      if (ergebnis.eingereiht) eingereiht++
    }

    if (eingereiht) console.log(`Newsletter: ${eingereiht} Automationsmail(s) in die Warteschlange gelegt.`)
    return { ok: true, eingereiht }
  }

  bereitstellen('laeufeAbarbeiten', () => laeufeAbarbeiten())

  // ── Abmeldungen per Mail ──
  // Der Abmeldelink in jeder Kampagne ist ein `mailto:`. Hier werden die eingehenden Mails
  // gelesen und die Adressen gesperrt — sonst müsste das jemand von Hand abarbeiten.

  const abmeldeEinstellungen = (daten) => {
    const gespeichert = daten.einstellungen.abmeldungen || {}
    return {
      aktiv: Boolean(gespeichert.aktiv),
      ordner: gespeichert.ordner || imap.ORDNER_STANDARD,
      host: gespeichert.host || imap.IMAP_STANDARD.host,
      port: Number(gespeichert.port) || imap.IMAP_STANDARD.port,
      letzterLauf: gespeichert.letzterLauf || null,
      letzterText: gespeichert.letzterText || ''
    }
  }

  bereitstellen('abmeldungenLesen', () => {
    const daten = datenLesen()
    return {
      ...abmeldeEinstellungen(daten),
      standardOrdner: imap.ORDNER_STANDARD,
      standardHost: imap.IMAP_STANDARD.host,
      postfachBereit: Boolean(daten.zugang.benutzer && daten.zugang.passwortVerschluesselt),
      abmeldeAdresse: abmeldeAdresseVon(daten)
    }
  })

  bereitstellen('abmeldungenEinstellen', (eingabe = {}) => {
    const geprueft = imap.einstellungenPruefen(eingabe)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }
    const daten = datenLesen()
    const bisher = abmeldeEinstellungen(daten)
    daten.einstellungen = {
      ...daten.einstellungen,
      abmeldungen: { ...bisher, ...geprueft.wert }
    }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Abmeldungen per Mail ${geprueft.wert.aktiv ? 'eingeschaltet' : 'ausgeschaltet'} (Ordner ${geprueft.wert.ordner}).`)
    return { ok: true }
  })

  bereitstellen('abmeldungenVerbindungPruefen', async () => {
    const daten = datenLesen()
    const z = daten.zugang
    if (!z.benutzer || !z.passwortVerschluesselt) return { ok: false, text: 'Es sind noch keine Zugangsdaten gespeichert.' }
    const { passwort, fehler } = passwortHolen(z)
    if (fehler) return { ok: false, text: fehler }
    return imap.verbindungPruefen({ zugang: z, passwort, einstellungen: abmeldeEinstellungen(daten) })
  })

  // Einen Durchgang machen: lesen, sperren, als gelesen markieren.
  const abmeldungenPruefen = async () => {
    const daten = datenLesen()
    const einstellungen = abmeldeEinstellungen(daten)
    const z = daten.zugang
    if (!z.benutzer || !z.passwortVerschluesselt) return { ok: false, text: 'Es sind noch keine Zugangsdaten gespeichert.' }

    const { passwort, fehler } = passwortHolen(z)
    if (fehler) return { ok: false, text: fehler }

    const geholt = await imap.abmeldungenHolen({ zugang: z, passwort, einstellungen })
    if (!geholt.ok) {
      console.warn(`Newsletter: Abmeldungen nicht lesbar: ${geholt.fehler}`)
      return { ok: false, text: geholt.fehler }
    }

    let gesperrt = 0
    let unbekannt = 0
    const erledigt = []
    for (const abmeldung of geholt.abmeldungen) {
      const ergebnis = await kontaktSperrenIntern(abmeldung.email, 'Abmeldung per Mail')
      if (ergebnis.unbekannt) unbekannt++
      else gesperrt++
      // Auch unbekannte Adressen gelten als erledigt: sie stehen nicht in der Liste, es gibt
      // also nichts zu tun, und beim nächsten Lauf sollen sie nicht wieder auftauchen.
      erledigt.push(abmeldung.uid)
    }

    let markiert = { ok: true, markiert: 0 }
    if (erledigt.length) {
      markiert = await imap.alsGelesenMarkieren({ zugang: z, passwort, einstellungen, uids: erledigt })
      if (!markiert.ok) console.warn(`Newsletter: Abmeldungen konnten nicht als gelesen markiert werden: ${markiert.fehler}`)
    }

    const text = geholt.abmeldungen.length
      ? [
          `${gesperrt} abgemeldet`,
          unbekannt ? `${unbekannt} Adressen waren nicht in der Liste` : '',
          markiert.ok ? '' : 'Die Mails konnten nicht als gelesen markiert werden — beim nächsten Lauf kommen sie noch einmal.'
        ]
          .filter(Boolean)
          .join(', ')
      : 'Keine neuen Abmeldungen.'

    const frisch = datenLesen()
    frisch.einstellungen = {
      ...frisch.einstellungen,
      abmeldungen: { ...abmeldeEinstellungen(frisch), letzterLauf: Date.now(), letzterText: text }
    }
    ctx.datenSpeichern(frisch)

    if (geholt.abmeldungen.length) console.log(`Newsletter: Abmeldungen per Mail — ${text}`)
    return { ok: true, text, gesperrt, unbekannt, gefunden: geholt.abmeldungen.length }
  }

  bereitstellen('abmeldungenPruefen', () => abmeldungenPruefen())

  // ── Protokoll und Vorschau ──

  bereitstellen('protokollLesen', (eingabe = {}) => {
    const anzahl = Math.min(Math.max(Number(eingabe.anzahl) || 50, 1), 500)
    return protokollLesen({ anzahl })
  })

  bereitstellen('textVorschau', (html) => textAusHtml(html))

  // Geplante Kampagnen starten, verpasste zurückstellen, fertige abschließen.
  // Läuft im Takt mit — dadurch wird ein Zeitpunkt, der verstrichen ist, während Vendo aus
  // war, beim nächsten Start nachgeholt (innerhalb des Fensters von 24 Stunden).
  const kampagnenPflegen = ({ jetzt = Date.now() } = {}) => {
    const daten = datenLesen()
    if (!daten.kampagnen.length) return { nichts: true }

    // Zu lange liegen geblieben: nicht ungefragt rausschicken
    const verpasst = kampagnen.verpasste(daten.kampagnen, { jetzt })
    if (verpasst.length) {
      let liste = daten.kampagnen
      for (const k of verpasst) {
        liste = kampagnen.kampagneAendern(liste, k.id, { zustand: 'entwurf', geplantAm: null }, { jetzt }).liste
        console.warn(`Newsletter: Kampagne "${k.name}" war laenger als 24 Stunden ueberfaellig und ist wieder ein Entwurf.`)
      }
      feldSpeichern('kampagnen', liste)
    }

    for (const k of kampagnen.faellige(datenLesen().kampagnen, { jetzt })) {
      const ergebnis = kampagneStarten(k.id, { jetzt })
      if (!ergebnis.ok) {
        console.warn(`Newsletter: Kampagne "${k.name}" konnte nicht starten: ${ergebnis.fehler.join(' ')}`)
        feldSpeichern('kampagnen', kampagnen.kampagneAendern(datenLesen().kampagnen, k.id, { zustand: 'entwurf', geplantAm: null }, { jetzt }).liste)
      }
    }

    // Laufende ohne offene Einträge sind fertig
    const frisch = datenLesen()
    const laufende = frisch.kampagnen.filter((k) => k.zustand === 'laeuft')
    if (laufende.length) {
      let liste = frisch.kampagnen
      let geaendert = false
      for (const k of laufende) {
        const offen = frisch.warteschlange.some((e) => e.kampagneId === k.id && e.zustand === 'offen')
        if (offen) continue
        liste = kampagnen.kampagneAendern(liste, k.id, { zustand: 'fertig', fertigAm: jetzt }, { jetzt }).liste
        geaendert = true
        console.log(`Newsletter: Kampagne "${k.name}" ist durch.`)
      }
      if (geaendert) feldSpeichern('kampagnen', liste)
    }
    return { ok: true }
  }

  bereitstellen('kampagnenPflegen', () => kampagnenPflegen())

  // ── Aufträge von Bots ──
  // Regeln und Begründung stehen in bots.js. Kurz: ein Bot bereitet vor, Felix entscheidet.
  // Hier gibt es keinen Weg, der an Empfänger sendet, eine Kampagne plant oder startet,
  // Kontakte zeigt oder etwas löscht.

  const kampagneKurz = (k) => ({
    id: k.id,
    name: k.name,
    betreff: k.betreff || '',
    zustand: k.zustand,
    geplantAm: k.geplantAm ? new Date(k.geplantAm).toISOString() : null,
    gewuenschtAm: k.freigabe?.gewuenschtAm ? new Date(k.freigabe.gewuenschtAm).toISOString() : null,
    aenderbar: bots.BOT_AENDERBAR.includes(k.zustand)
  })

  // ── Nur echte Adressen aus dem Shop (Begründung in shoplinks.js) ──
  // `ctx.abrufen` gibt es nur in Tests, damit dort nichts ins Netz geht
  const abrufen = ctx.abrufen || ((url, optionen) => fetch(url, optionen))
  const shopHostsVon = (daten) => shoplinks.shopHosts({ primaer: daten.shopify?.primaerDomain, myshopify: daten.shopify?.shop })

  // Die öffentliche Adresse des Shops einmal ermitteln und merken
  // ── Renner: was sich verkauft und was liegen bleibt ──
  // Beide Listen kommen aus Shopify und beide sind teuer: die Abfragen blättern über
  // Bestellungen bzw. Warenkörbe und zählen auf Shopifys Kontingent. Deshalb wird das
  // Ergebnis gespeichert und höchstens einmal am Tag erneuert — eine Rangliste ändert sich
  // nicht stündlich. Beide teilen sich hier alles außer der Abfrage.
  const RENNER_FRISCH = 20 * 3600000 // 20 Stunden
  const RENNER_TAGE = 30
  const RENNER_ANZAHL = 5

  const RENNER = {
    bestseller: {
      feld: 'bestseller',
      holen: (angaben) => shopify.bestsellerHolen(angaben),
      // Wie die Quelle heißt — für Meldungen und die Oberfläche
      quelle: 'Bestellungen',
      ohneZugang: 'Bestseller kommen aus den Bestellungen bei Shopify.'
    },
    warenkorb: {
      feld: 'korbRenner',
      holen: (angaben) => shopify.korbRennerHolen(angaben),
      quelle: 'abgebrochenen Warenkörben',
      ohneZugang: 'Die Warenkorb-Renner kommen aus den abgebrochenen Warenkörben bei Shopify.'
    }
  }

  const rennerStand = (daten, art) => daten[RENNER[art].feld] || {}

  // Holt eine Rangliste, wenn der gespeicherte Stand alt ist. `erzwingen` holt sofort.
  const rennerSichern = async (art, { tage = RENNER_TAGE, erzwingen = false } = {}) => {
    const sorte = RENNER[art]
    if (!sorte) return { ok: false, text: 'Diese Rangliste gibt es nicht.' }

    const stand = rennerStand(datenLesen(), art)
    const frisch = stand.geholtAm && Date.now() - stand.geholtAm < RENNER_FRISCH && stand.tage === tage
    if (frisch && !erzwingen) return { ok: true, ...stand, ausSpeicher: true }

    const zugang = shopifyZugang()
    if (zugang.fehler) return { ok: false, text: `${zugang.fehler} ${sorte.ohneZugang}` }

    const geholt = await sorte.holen({ shop: zugang.shop, token: zugang.token, seit: Date.now() - tage * 86400000, holen: abrufen })
    if (!geholt.ok) return { ok: false, text: geholt.fehler }

    const domain = await shopAdresseSichern()
    const produkte = domain ? (await shoplinks.produkteLaden(domain, abrufen, { anzahl: 500 })).produkte : []
    const neu = {
      geholtAm: Date.now(),
      tage,
      // Aus wie vielen Bestellungen bzw. Warenkörben gezählt wurde
      quellen: geholt.quellen || 0,
      // Ganze Rangliste gekürzt gespeichert: mehr als die besten zwanzig braucht niemand,
      // und die Datei soll nicht wachsen.
      liste: shoplinks.rennerVerbinden(geholt.liste.slice(0, 20), produkte)
    }
    feldSpeichern(sorte.feld, neu)
    console.log(`Newsletter: ${art} aus ${neu.quellen} ${sorte.quelle} der letzten ${tage} Tage.`)
    return { ok: true, ...neu, ausSpeicher: false }
  }

  bereitstellen('rennerLesen', () => {
    const daten = datenLesen()
    const lesen = (art) => {
      const stand = rennerStand(daten, art)
      return {
        geholtAm: stand.geholtAm || null,
        tage: stand.tage || RENNER_TAGE,
        quellen: stand.quellen || 0,
        liste: (stand.liste || []).slice(0, RENNER_ANZAHL)
      }
    }
    return { anzahl: RENNER_ANZAHL, bestseller: lesen('bestseller'), warenkorb: lesen('warenkorb') }
  })

  bereitstellen('rennerHolen', async (eingabe = {}) => {
    const art = eingabe.art === 'warenkorb' ? 'warenkorb' : 'bestseller'
    const r = await rennerSichern(art, { tage: Number(eingabe.tage) || RENNER_TAGE, erzwingen: true })
    if (!r.ok) return r
    return { ok: true, text: `${r.liste.length} Produkte aus ${r.quellen} ${RENNER[art].quelle} der letzten ${r.tage} Tage.` }
  })

  const shopAdresseSichern = async () => {
    const daten = datenLesen()
    if (daten.shopify?.primaerDomain) return daten.shopify.primaerDomain
    if (!daten.shopify?.shop) return null
    const r = await shoplinks.primaerDomain(daten.shopify.shop, abrufen)
    if (!r.ok) return null
    const frisch = datenLesen()
    frisch.shopify = { ...frisch.shopify, primaerDomain: r.host }
    ctx.datenSpeichern(frisch)
    console.log(`Newsletter: oeffentliche Shop-Adresse ist ${r.host}.`)
    return r.host
  }
  setTimeout(() => shopAdresseSichern().catch(() => {}), 4000).unref?.()

  // Ohne Netz: Adressen, die nicht zum Shop gehören
  const shopHinweise = (daten, html) => {
    const hinweise = []
    const hosts = shopHostsVon(daten)
    if (hosts.length) {
      const fremd = shoplinks.fremdeAdressen(html, hosts)
      if (fremd.length) {
        hinweise.push(`Adressen, die nicht aus deinem Shop sind: ${fremd.slice(0, 6).map((f) => `${f.url} (${f.grund})`).join(', ')}. Nur Adressen aus shop_produkte verwenden.`)
      }
    }
    // Dasselbe Produkt mehrfach: drei Kacheln auf dieselbe Seite sind zwei zu viel.
    const produkte = shoplinks.doppelteProdukte(html)
    if (produkte.length) {
      hinweise.push(
        `Dasselbe Produkt mehrfach verlinkt: ${produkte.slice(0, 3).map((p) => p.url.split('/products/')[1]).join(', ')}. Nimm verschiedene Produkte — aus ueberblick oder shop_bestseller.`
      )
    }
    // Dasselbe Bild mehrfach: kein Fehler, aber die Mail wirkt dann, als hätte der Shop
    // drei Artikel. Als Hinweis, nicht als Sperre — manchmal ist es gewollt.
    const doppelt = shoplinks.doppelteBilder(html)
    if (doppelt.length) {
      hinweise.push(
        `Dasselbe Bild mehrfach: ${doppelt.slice(0, 4).map((b) => `${b.anzahl}× ${b.url.split('/').pop()}`).join(', ')}. Jede Stelle verdient ein eigenes Bild, sonst sieht die Mail nach einem einzigen Artikel aus.`
      )
    }
    return hinweise
  }

  // Was aus der Vorlage einer Kampagne noch unverändert drinsteht
  const vorlagenReste = (daten, k) => {
    const rest = unveraendertAusVorlage(kampagnen.htmlVon(k, { marke: daten.marke }), k.vorlageBeispiele)
    return rest.length ? [`Noch Beispielinhalt aus der Vorlage in: ${rest.map((r) => r.name).join(', ')}. Jedes Feld für diese Kampagne neu schreiben, Bilder aus dem Shop.`] : []
  }

  // Mit Netz: jede Adresse gehört zum Shop und ist erreichbar. Ohne bekannte Shop-Adresse
  // lässt sich das nicht prüfen — dann ist das ein Fehler, kein „wird schon passen“.
  const shopAdressenPruefen = async (html) => {
    await shopAdresseSichern()
    const hosts = shopHostsVon(datenLesen())
    if (!hosts.length) return { ok: false, text: 'Vendo kennt die Adresse deines Shops nicht und kann die Links nicht prüfen. Felix muss im Reiter „Kontakte“ den Shop eintragen.' }
    // Durchgestrichene Preise, die es im Shop nicht gibt, sperren wie eine erfundene
    // Adresse: ein erfundener Streichpreis behauptet „war teurer“ und ist irreführende
    // Werbung. Geprüft wird gegen die echten Vergleichspreise aus der Produktliste.
    const domain = datenLesen().shopify?.primaerDomain
    if (domain) {
      const geladen = await shoplinks.produkteLaden(domain, abrufen, { anzahl: 500 })
      const erfunden = shoplinks.erfundenePreise(html, geladen.produkte)
      if (erfunden.length) {
        return {
          ok: false,
          probleme: erfunden.map((preis) => ({ url: preis, grund: 'Streichpreis ohne Vergleichspreis im Shop' })),
          text: `Durchgestrichene Preise, die es im Shop nicht gibt: ${erfunden.slice(0, 6).join(', ')}. Ein erfundener Streichpreis ist irreführende Werbung — entweder steht der alte Preis als Vergleichspreis im Shop, oder er kommt raus (samt Rabatt-Abzeichen).`
        }
      }
    }

    const ergebnis = await shoplinks.adressenPruefen(html, { hosts, abrufen })
    if (ergebnis.ok) return { ok: true, geprueft: ergebnis.geprueft }
    return { ok: false, probleme: ergebnis.probleme, text: `Keine echten Adressen aus deinem Shop: ${ergebnis.probleme.slice(0, 8).map((p) => `${p.url} — ${p.grund}`).join('; ')}. Nimm die Adressen aus shop_produkte.` }
  }

  const kampagneGanz = (daten, k) => {
    const html = kampagnen.htmlVon(k, { marke: daten.marke })
    return {
      ...kampagneKurz(k),
      vorschauText: k.vorschauText || '',
      html,
      htmlRahmen: k.htmlRahmen !== false,
      ...(k.vorlageId ? { vorlageId: k.vorlageId } : {}),
      hinweise: [...kampagnePruefenMitMarke(daten, k.id).fehler, ...shopHinweise(daten, html), ...vorlagenReste(daten, k)]
    }
  }

  const vorlageGanz = (daten, v) => {
    const html = kampagnen.htmlVon(v, { marke: daten.marke })
    const geprueft = vorlagen.vorlagePruefen(v, { marke: daten.marke })
    return {
      id: v.id,
      name: v.name,
      beschreibung: v.beschreibung || '',
      html,
      htmlRahmen: v.htmlRahmen !== false,
      felder: geprueft.felder,
      hinweise: [...geprueft.fehler, ...shopHinweise(daten, html)]
    }
  }

  const automationGanz = (daten, a) => ({
    id: a.id,
    name: a.name,
    art: a.art,
    aktiv: Boolean(a.aktiv),
    aenderbar: !a.aktiv,
    schritte: (a.schritte || []).map((s, i) => ({
      schritt: i + 1,
      nachStunden: Math.round((Number(s.nach) || 0) / automationen.STUNDE),
      betreff: s.betreff || '',
      html: kampagnen.htmlVon(s, { marke: daten.marke }),
      htmlRahmen: s.htmlRahmen !== false
    })),
    hinweise: [
      ...automationen.automationPruefen(a).fehler,
      ...(a.schritte || []).flatMap((s, i) => shopHinweise(daten, kampagnen.htmlVon(s, { marke: daten.marke })).map((h) => `Schritt ${i + 1}: ${h}`))
    ]
  })

  // Der Hinweis oben in der Testmail: sie ist eine Probe, nicht die Mail an die Empfänger
  const freigabeBanner = (von, text) =>
    `<div style="margin:0;padding:12px 16px;background-color:#fff4d6;border-bottom:1px solid #e0c27a;font-family:Arial,sans-serif;font-size:13px;line-height:1.5;color:#5a4a1f;"><strong>${maskierenHtml(von)}:</strong> ${maskierenHtml(text)}</div>`

  const botName = (roh) => String(roh?.von || 'Bot').replace(/[^A-Za-zÄÖÜäöüß0-9 ._-]/g, '').trim().slice(0, 40) || 'Bot'

  const botAuftragAusfuehren = async (roh) => {
    const geprueft = bots.auftragPruefen(roh)
    if (!geprueft.ok) return { ok: false, text: geprueft.fehler }
    const { aktion, argumente: a } = geprueft
    const von = botName(roh)
    const daten = datenLesen()
    const marke = daten.marke

    if (aktion === 'ueberblick') {
      // Die Produkte, die Felix in seiner Übersicht sieht, gehen gleich mit: Namen, Preise,
      // Bilder und Adressen, fertig zum Einsetzen. Sonst baut der Bot ein Gerüst und füllt
      // es mit erfundenen Produkten, weil ihm ein zweiter Aufruf zu umständlich war.
      const renner = (rennerStand(daten, 'bestseller').liste || []).filter((e) => e.imShop && e.verfuegbar !== false).slice(0, RENNER_ANZAHL)
      const rennerSatz = renner.length
        ? ` Meistverkauft gerade: ${renner.map((e) => e.titel).slice(0, 3).join(', ')}${renner.length > 3 ? ' …' : ''} — die stehen mit Adresse, Bild und Preis unter "bestseller", nimm die für eine Verkaufsmail.`
        : ' Es sind keine Bestseller geholt. Für eine Verkaufsmail aktion=shop_bestseller aufrufen, sonst aktion=shop_produkte — niemals Produkte erfinden.'
      return {
        ok: true,
        text: `${daten.kampagnen.length} Kampagnen, ${daten.vorlagen.length} Vorlagen, ${daten.automationen.length} Automationen.${rennerSatz}`,
        daten: {
          marke: { titel: marke.titel || '', logo: marke.logo || '', farben: { ...STANDARD_FARBEN, ...(marke.farben || {}) } },
          bestseller: renner,
          // Die fertigen Muster stehen hier, weil vorlage_aus_muster immer eine Kennung
          // braucht — eine Aktion ohne id lehnt die Auftragsprüfung grundsätzlich ab.
          muster: muster.musterListe(),
          empfaenger: kontakte.empfaenger(daten.kontakte).length,
          platzhalter: ['{{vorname}}', '{{nachname}}', '{{name}}', '{{email}}'],
          platzhalterWarenkorb: ['{{warenkorb}}', '{{warenkorbLink}}', '{{summe}}'],
          kampagnen: daten.kampagnen.map(kampagneKurz),
          vorlagen: daten.vorlagen.map((v) => ({ id: v.id, name: v.name, beschreibung: v.beschreibung || '' })),
          automationen: daten.automationen.map((x) => {
            const g = automationGanz(daten, x)
            return { ...g, schritte: g.schritte.map(({ html, ...rest }) => rest) }
          })
        }
      }
    }

    // ── Kampagnen ──
    if (aktion === 'kampagne_zeigen') {
      const k = kampagneHolen(daten, a.id)
      if (!k) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      return { ok: true, text: `Kampagne „${k.name}“ (${k.zustand}).`, daten: kampagneGanz(daten, k) }
    }

    if (aktion === 'kampagne_neu') {
      // Ein Entwurf ohne echten Betreff und Vorschautext ist keiner. Felix hat das ausdrücklich
      // bemängelt — deshalb hier eine Pflicht, nicht nur ein Hinweis.
      for (const [feld, wie] of [['betreff', 'Betreff'], ['vorschauText', 'Vorschautext']]) {
        const wert = String(a[feld] ?? '').trim()
        if (!wert) return { ok: false, text: `Der ${wie} fehlt („${feld}“). Ein Kampagnen-Entwurf braucht beides, als echten Text.` }
        const fremd = fremdePlatzhalter(wert)
        if (fremd.length) return { ok: false, text: `Im ${wie} stehen Platzhalter, die Vendo nicht ersetzt (${fremd.join(', ')}). Schreib den echten Text.` }
      }
      let quelle = null
      if (a.vorlage_id) {
        quelle = vorlageHolen(daten, a.vorlage_id)
        if (!quelle) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
      }
      const k = kampagnen.neueKampagne({ name: a.name || `Entwurf von ${von}`, marke })
      k.betreff = a.betreff ?? ''
      k.vorschauText = a.vorschauText ?? ''
      if (quelle) {
        Object.assign(k, vorlagen.anwenden(quelle, { marke }))
        // Den Beispielinhalt der Vorlage merken: was davon in der Kampagne stehen bleibt,
        // ist nicht für diese Kampagne geschrieben und sperrt die Freigabe
        k.vorlageId = quelle.id
        k.vorlageBeispiele = felderLesen(kampagnen.htmlVon(quelle, { marke }))
          .filter((f) => f.art !== 'link')
          .map(({ name, art, beispiel }) => ({ name, art, beispiel }))
      }
      if (a.html !== undefined) k.html = a.html
      if (a.htmlRahmen !== undefined) k.htmlRahmen = a.htmlRahmen
      k.erstelltVon = von
      daten.kampagnen = [...daten.kampagnen, k]
      ctx.datenSpeichern(daten)
      console.log(`Newsletter: ${von} hat einen Kampagnen-Entwurf angelegt.`)
      return { ok: true, text: `Entwurf „${k.name}“ angelegt (ID ${k.id}). Ist er fertig: kampagne_zur_freigabe.`, daten: kampagneGanz(datenLesen(), k) }
    }

    if (aktion === 'kampagne_aendern') {
      const k = kampagneHolen(daten, a.id)
      if (!k) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      if (!bots.BOT_AENDERBAR.includes(k.zustand)) {
        return { ok: false, text: `Die Kampagne ist ${k.zustand === 'geplant' ? 'schon von Felix freigegeben und geplant' : k.zustand}. Ändern kann sie jetzt nur Felix in Vendo.` }
      }
      const aenderung = { zustand: 'entwurf', freigabe: null }
      for (const feld of ['name', 'betreff', 'vorschauText', 'html', 'htmlRahmen']) if (a[feld] !== undefined) aenderung[feld] = a[feld]
      daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, k.id, aenderung).liste
      ctx.datenSpeichern(daten)
      const zurueck = k.zustand === 'freigabe' ? ' Die offene Freigabe ist damit zurückgezogen — nach dem Ändern erneut zur Freigabe geben.' : ''
      return { ok: true, text: `Geändert.${zurueck}`, daten: kampagneGanz(datenLesen(), kampagneHolen(datenLesen(), k.id)) }
    }

    if (aktion === 'kampagne_zur_freigabe') {
      const k = kampagneHolen(daten, a.id)
      if (!k) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      if (!bots.BOT_AENDERBAR.includes(k.zustand)) return { ok: false, text: `Die Kampagne ist ${k.zustand}. Zur Freigabe geht nur ein Entwurf.` }
      const termin = bots.zeitpunktLesen(a.zeitpunkt)
      if (!termin.ok) return { ok: false, text: termin.fehler }
      const vorab = kampagnePruefenMitMarke(daten, k.id)
      if (!vorab.ok) return { ok: false, text: `Noch nicht freigabefertig: ${vorab.fehler.join(' ')}` }
      // Aus einer Vorlage: jedes Feld muss für diese Kampagne neu geschrieben sein
      const reste = vorlagenReste(daten, k)
      if (reste.length) return { ok: false, text: `Noch nicht freigabefertig: ${reste.join(' ')}` }
      // Jeder Link und jedes Bild: echte, erreichbare Adresse aus Felix' Shop
      const adressen = await shopAdressenPruefen(kampagnen.htmlVon(k, { marke }))
      if (!adressen.ok) return { ok: false, text: `Noch nicht freigabefertig. ${adressen.text}` }

      // Die Probe an Felix: dieselbe Mail wie für die Empfänger, mit einem Hinweis obendrauf
      const an = testAdresseVon(daten)
      const beispiel = { ...testKontakt(daten), email: an }
      const wann = termin.wert ? `gewünscht für ${new Date(termin.wert).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}` : 'noch ohne Termin'
      const banner = freigabeBanner(von, `zur Freigabe, ${wann}. Bestätigen in Vendo unter Newsletter → Kampagnen. Ohne deine Bestätigung geht nichts raus.`)
      const probe = { ...k, html: banner + kampagnen.htmlVon(k, { marke }) }
      const versand = an
        ? await einzelSenden({ art: 'test', an, betreff: `[Freigabe] ${kampagnen.personalisieren(k.betreff, beispiel)}`, html: mailBauenAus(daten, probe, beispiel).html, kampagneId: k.id })
        : { ok: false, text: 'Es ist kein Postfach eingerichtet.' }

      // Neu lesen: während die Mail rausging, kann Felix etwas geändert haben
      const frisch = datenLesen()
      const jetzt = kampagneHolen(frisch, k.id)
      if (!jetzt) return { ok: false, text: 'Die Kampagne wurde inzwischen gelöscht.' }
      if (!bots.BOT_AENDERBAR.includes(jetzt.zustand)) return { ok: false, text: `Felix hat die Kampagne inzwischen auf „${jetzt.zustand}“ gesetzt.` }
      frisch.kampagnen = kampagnen.kampagneAendern(frisch.kampagnen, k.id, {
        zustand: 'freigabe',
        freigabe: { angefragtAm: Date.now(), gewuenschtAm: termin.wert, von, testmail: { ok: Boolean(versand.ok), text: String(versand.text || '').slice(0, 200) } }
      }).liste
      ctx.datenSpeichern(frisch)
      console.log(`Newsletter: ${von} hat eine Kampagne zur Freigabe gegeben (Testmail ${versand.ok ? 'raus' : 'nicht raus'}).`)
      return {
        ok: true,
        text: versand.ok
          ? `Zur Freigabe gegeben (${wann}). Die Testmail ist an Felix raus. Erst wenn Felix in Vendo bestätigt, wird sie geplant — du kannst hier nichts mehr auslösen.`
          : `Zur Freigabe gegeben (${wann}), aber die Testmail kam nicht raus: ${versand.text} Felix sieht die Kampagne trotzdem in Vendo. Sag ihm Bescheid.`,
        daten: kampagneKurz(kampagneHolen(datenLesen(), k.id))
      }
    }

    // ── Vorlagen ──
    if (aktion === 'vorlage_zeigen') {
      const v = vorlageHolen(daten, a.id)
      if (!v) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
      return { ok: true, text: `Vorlage „${v.name}“.`, daten: vorlageGanz(daten, v) }
    }

    if (aktion === 'vorlage_neu' || aktion === 'vorlage_aendern') {
      if (a.html !== undefined && !felderLesen(a.html).length) {
        return { ok: false, text: 'Das ist eine fertige Mail, keine Vorlage: es fehlen markierte Felder. Jede Stelle, die pro Kampagne neu geschrieben wird, braucht data-feld="name" und data-feld-hinweis="was hier hinkommt" (siehe Skill vendo-newsletter).' }
      }
    }

    if (aktion === 'vorlage_neu') {
      if (daten.vorlagen.length >= vorlagen.MAX_VORLAGEN) return { ok: false, text: `Mehr als ${vorlagen.MAX_VORLAGEN} Vorlagen sind nicht vorgesehen.` }
      const v = vorlagen.neueVorlage({ name: a.name || `Vorlage von ${von}`, beschreibung: a.beschreibung, html: a.html, htmlRahmen: a.htmlRahmen, marke })
      daten.vorlagen = [...daten.vorlagen, v]
      ctx.datenSpeichern(daten)
      console.log(`Newsletter: ${von} hat eine Vorlage angelegt.`)
      return { ok: true, text: `Vorlage „${v.name}“ angelegt (ID ${v.id}).`, daten: vorlageGanz(datenLesen(), v) }
    }

    if (aktion === 'vorlage_aendern') {
      const v = vorlageHolen(daten, a.id)
      if (!v) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
      const aenderung = {}
      for (const feld of ['name', 'beschreibung', 'html', 'htmlRahmen']) if (a[feld] !== undefined) aenderung[feld] = a[feld]
      daten.vorlagen = vorlagen.vorlageAendern(daten.vorlagen, v.id, aenderung).liste
      ctx.datenSpeichern(daten)
      return { ok: true, text: 'Vorlage geändert.', daten: vorlageGanz(datenLesen(), vorlageHolen(datenLesen(), v.id)) }
    }

    // ── Automationen ──
    if (aktion === 'automation_zeigen') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      return { ok: true, text: `Automation „${x.name}“ (${x.aktiv ? 'eingeschaltet' : 'aus'}).`, daten: automationGanz(daten, x) }
    }

    if (aktion === 'automation_schritt_aendern') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      if (x.aktiv) return { ok: false, text: 'Die Automation ist eingeschaltet und sendet von selbst. Texte ändern geht nur, wenn Felix sie in Vendo ausschaltet.' }
      const nummer = (a.schritt || 1) - 1
      if (!x.schritte?.[nummer]) return { ok: false, text: `Schritt ${nummer + 1} gibt es nicht.` }
      const schritte = x.schritte.map((s, i) => {
        if (i !== nummer) return s
        const neu = { ...s }
        if (a.betreff !== undefined) neu.betreff = a.betreff
        if (a.html !== undefined) neu.html = a.html
        if (a.htmlRahmen !== undefined) neu.htmlRahmen = a.htmlRahmen
        if (a.nach_stunden !== undefined) neu.nach = a.nach_stunden * automationen.STUNDE
        if (a.verfall_stunden !== undefined) neu.verfallNach = a.verfall_stunden * automationen.STUNDE
        return neu
      })
      daten.automationen = daten.automationen.map((y) => (y.id === x.id ? { ...y, schritte, geaendertAm: Date.now() } : y))
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Schritt ${nummer + 1} geändert. Zur Probe an Felix: automation_zur_probe. Einschalten tut Felix.`, daten: automationGanz(datenLesen(), automationHolen(datenLesen(), x.id)) }
    }

    if (aktion === 'automation_zur_probe') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      const nummer = (a.schritt || 1) - 1
      if (!x.schritte?.[nummer]) return { ok: false, text: `Schritt ${nummer + 1} gibt es nicht.` }
      const an = testAdresseVon(daten)
      if (!an) return { ok: false, text: 'Es ist kein Postfach eingerichtet.' }
      const beispiel = { ...testKontakt(daten), email: an }
      const schritt = x.schritte[nummer]
      const probe = { ...x, schritte: x.schritte.map((s, i) => (i === nummer ? { ...s, html: freigabeBanner(von, `Probe für „${x.name}“, Schritt ${nummer + 1}. Eingeschaltet wird die Automation nur von dir in Vendo.`) + kampagnen.htmlVon(s, { marke }) } : s)) }
      const adressen = await shopAdressenPruefen(kampagnen.htmlVon(schritt, { marke }))
      if (!adressen.ok) return { ok: false, text: `Keine Probe: ${adressen.text}` }
      const gebaut = automationMailBauen(daten, probe, nummer, beispiel, BEISPIEL_KORB)
      if (gebaut.fehler) return { ok: false, text: gebaut.fehler }
      const versand = await einzelSenden({ art: 'test', an, betreff: `[Probe] ${gebaut.betreff || schritt.betreff || x.name}`, html: gebaut.html })
      return { ok: Boolean(versand.ok), text: versand.ok ? `Probe von Schritt ${nummer + 1} ist an Felix raus.` : `Die Probe kam nicht raus: ${versand.text}` }
    }

    // ── Weitere Kampagnen-Aktionen ──
    if (aktion === 'kampagne_kopieren') {
      const k = kampagneHolen(daten, a.id)
      if (!k) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      const neu = kampagnen.neueKampagne({ name: (a.name || `Kopie von ${k.name}`).slice(0, 80), marke })
      Object.assign(neu, { betreff: k.betreff || '', vorschauText: k.vorschauText || '', html: kampagnen.htmlVon(k, { marke }), htmlRahmen: k.htmlRahmen !== false, erstelltVon: von })
      daten.kampagnen = [...daten.kampagnen, neu]
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Kopie „${neu.name}“ als Entwurf angelegt (ID ${neu.id}).`, daten: kampagneGanz(datenLesen(), neu) }
    }

    if (aktion === 'kampagne_loeschen') {
      const k = kampagneHolen(daten, a.id)
      if (!k) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      if (!bots.BOT_AENDERBAR.includes(k.zustand)) return { ok: false, text: `Die Kampagne ist ${k.zustand}. Löschen kannst du nur Entwürfe; Geplantes und Verschicktes bleibt, das entscheidet Felix.` }
      daten.kampagnen = daten.kampagnen.filter((x) => x.id !== k.id)
      ctx.datenSpeichern(daten)
      console.log(`Newsletter: ${von} hat einen Kampagnen-Entwurf geloescht.`)
      return { ok: true, text: `Entwurf „${k.name}“ gelöscht.` }
    }

    // ── Weitere Vorlagen-Aktionen ──
    if (aktion === 'vorlage_aus_kampagne') {
      const k = kampagneHolen(daten, a.id)
      if (!k) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
      if (daten.vorlagen.length >= vorlagen.MAX_VORLAGEN) return { ok: false, text: `Mehr als ${vorlagen.MAX_VORLAGEN} Vorlagen sind nicht vorgesehen.` }
      const v = vorlagen.ausHtml(kampagnen.htmlVon(k, { marke }), { name: a.name || k.name, beschreibung: a.beschreibung, htmlRahmen: k.htmlRahmen !== false, marke })
      daten.vorlagen = [...daten.vorlagen, v]
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Vorlage „${v.name}“ aus der Kampagne angelegt (ID ${v.id}).`, daten: vorlageGanz(datenLesen(), v) }
    }

    if (aktion === 'vorlage_loeschen') {
      const v = vorlageHolen(daten, a.id)
      if (!v) return { ok: false, text: 'Diese Vorlage gibt es nicht.' }
      daten.vorlagen = daten.vorlagen.filter((x) => x.id !== v.id)
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Vorlage „${v.name}“ gelöscht. Kampagnen, die sie schon übernommen haben, bleiben unverändert.` }
    }

    // ── Weitere Automations-Aktionen ──
    // Alles nur, solange die Automation aus ist: eingeschaltet sendet sie von selbst.
    const nurWennAus = (x) => (x.aktiv ? { ok: false, text: 'Die Automation ist eingeschaltet und sendet von selbst. Ändern geht nur, wenn Felix sie in Vendo ausschaltet.' } : null)

    if (aktion === 'automation_neu') {
      const art = String(a.art || '').trim()
      if (!automationen.ARTEN.includes(art)) return { ok: false, text: `Unbekannte Art. Möglich: ${automationen.ARTEN.join(', ')}.` }
      const angelegt = eigene.get('automationAnlegen')(art)
      if (!angelegt?.ok) return { ok: false, text: angelegt?.text || 'Anlegen nicht möglich.' }
      if (a.name) {
        const frisch = datenLesen()
        frisch.automationen = frisch.automationen.map((x) => (x.id === angelegt.id ? { ...x, name: a.name } : x))
        ctx.datenSpeichern(frisch)
      }
      console.log(`Newsletter: ${von} hat eine Automation angelegt (${art}).`)
      return { ok: true, text: `Automation angelegt (ID ${angelegt.id}), ausgeschaltet. Texte mit automation_schritt_aendern, Probe mit automation_zur_probe — einschalten tut Felix.`, daten: automationGanz(datenLesen(), automationHolen(datenLesen(), angelegt.id)) }
    }

    if (aktion === 'automation_aendern') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      if (a.name) daten.automationen = daten.automationen.map((y) => (y.id === x.id ? { ...y, name: a.name, geaendertAm: Date.now() } : y))
      ctx.datenSpeichern(daten)
      return { ok: true, text: 'Automation geändert.', daten: automationGanz(datenLesen(), automationHolen(datenLesen(), x.id)) }
    }

    if (aktion === 'automation_schritt_neu') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      const gesperrt = nurWennAus(x)
      if (gesperrt) return gesperrt
      if ((x.schritte || []).length >= 10) return { ok: false, text: 'Mehr als zehn Schritte sind nicht vorgesehen.' }
      const schritt = {
        nach: (a.nach_stunden ?? 24) * automationen.STUNDE,
        verfallNach: (a.verfall_stunden ?? 48) * automationen.STUNDE,
        betreff: a.betreff ?? '',
        html: a.html ?? '',
        htmlRahmen: a.htmlRahmen !== false
      }
      daten.automationen = daten.automationen.map((y) => (y.id === x.id ? { ...y, schritte: [...(y.schritte || []), schritt], geaendertAm: Date.now() } : y))
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Schritt ${(x.schritte || []).length + 1} angelegt.`, daten: automationGanz(datenLesen(), automationHolen(datenLesen(), x.id)) }
    }

    if (aktion === 'automation_schritt_loeschen') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      const gesperrt = nurWennAus(x)
      if (gesperrt) return gesperrt
      const nummer = (a.schritt || 1) - 1
      if (!x.schritte?.[nummer]) return { ok: false, text: `Schritt ${nummer + 1} gibt es nicht.` }
      if (x.schritte.length <= 1) return { ok: false, text: 'Eine Automation braucht mindestens einen Schritt. Lieber den Text ändern oder die ganze Automation löschen.' }
      daten.automationen = daten.automationen.map((y) => (y.id === x.id ? { ...y, schritte: y.schritte.filter((_, i) => i !== nummer), geaendertAm: Date.now() } : y))
      ctx.datenSpeichern(daten)
      return { ok: true, text: `Schritt ${nummer + 1} gelöscht.`, daten: automationGanz(datenLesen(), automationHolen(datenLesen(), x.id)) }
    }

    if (aktion === 'automation_loeschen') {
      const x = automationHolen(daten, a.id)
      if (!x) return { ok: false, text: 'Diese Automation gibt es nicht.' }
      const gesperrt = nurWennAus(x)
      if (gesperrt) return gesperrt
      const r = eigene.get('automationLoeschen')(x.id)
      console.log(`Newsletter: ${von} hat eine Automation geloescht.`)
      return { ok: Boolean(r?.ok), text: r?.ok ? `Automation „${x.name}“ gelöscht.` : r?.text || 'Löschen nicht möglich.' }
    }

    // ── Kontakte, Marke, Auswertung ──
    if (aktion === 'kontakte_abgleichen') {
      const r = await eigene.get('kontakteSynchronisieren')()
      // Nur Zahlen weitergeben, nie einzelne Kontakte
      const zahlen = Object.fromEntries(Object.entries(r || {}).filter(([, w]) => typeof w === 'number'))
      return { ok: Boolean(r?.ok), text: r?.text || 'Abgleich nicht möglich.', daten: zahlen }
    }

    if (aktion === 'marke_aendern') {
      if (a.logo && !/^https:\/\//i.test(a.logo)) return { ok: false, text: 'Das Logo braucht eine https-Adresse.' }
      const alt = marke || {}
      // Impressum, Abmeldeadresse sowie die Kopf- und Fußangaben (Pflichtlinks, Social-Icons, Logo im
      // Kopf und Fuß) bleiben, wie Felix sie eingetragen hat — ohne `fuss` und `kopf` im Aufruf rührt
      // markeSpeichern sie nicht an.
      eigene.get('markeSpeichern')({
        titel: a.titel ?? alt.titel,
        logo: a.logo ?? alt.logo,
        impressum: alt.impressum,
        abmeldeAdresse: alt.abmeldeAdresse,
        farben: { ...(alt.farben || {}), ...(a.farben || {}) }
      })
      const neu = datenLesen().marke
      const verworfen = Object.keys(a.farben || {}).filter((name) => neu.farben?.[name] !== a.farben[name])
      return {
        ok: true,
        text: `Marke gespeichert.${verworfen.length ? ` Nicht übernommen (unbekannter Name oder keine Hexfarbe wie #8a6a3b): ${verworfen.join(', ')}.` : ''}`,
        daten: { titel: neu.titel || '', logo: neu.logo || '', farben: { ...STANDARD_FARBEN, ...(neu.farben || {}) } }
      }
    }

    if (aktion === 'vorlage_aus_muster') {
      const r = eigene.get('vorlageAusMuster')({ id: a.id })
      // Bei falscher Kennung die gültigen mitschicken, statt den Bot raten zu lassen
      if (!r.ok) return { ...r, text: `${r.text} Vorhanden: ${muster.musterListe().map((x) => x.id).join(', ')}.`, daten: { muster: muster.musterListe() } }
      return { ok: true, text: r.text, daten: { id: r.id } }
    }

    if (aktion === 'shop_bestseller' || aktion === 'shop_warenkorb') {
      const art = aktion === 'shop_warenkorb' ? 'warenkorb' : 'bestseller'
      const r = await rennerSichern(art, { tage: Number(a.tage) || RENNER_TAGE })
      if (!r.ok) return r
      // Nur, was es noch gibt: ein Renner, der aus dem Shop genommen wurde, gehört in
      // Felix' Übersicht, aber nicht in eine Mail.
      const liste = r.liste.filter((e) => e.imShop && e.verfuegbar !== false).slice(0, RENNER_ANZAHL)
      const wasser = art === 'warenkorb' ? 'liegen geblieben' : 'verkauft'
      if (!liste.length) return { ok: false, text: `In den letzten ${r.tage} Tagen ist nichts ${wasser}, was noch im Shop steht.` }
      const satz =
        art === 'warenkorb'
          ? `Die ${liste.length} Produkte, die am häufigsten in abgebrochenen Warenkörben lagen (letzte ${r.tage} Tage, ${r.quellen} Körbe)`
          : `Die ${liste.length} meistverkauften Produkte der letzten ${r.tage} Tage, aus ${r.quellen} Bestellungen`
      return {
        ok: true,
        text: `${satz}${r.ausSpeicher ? ' (Stand von heute)' : ''}. Adressen, Bilder und Preise unverändert übernehmen.`,
        daten: { tage: r.tage, quellen: r.quellen, produkte: liste }
      }
    }

    if (aktion === 'shop_produkte') {
      const domain = await shopAdresseSichern()
      if (!domain) return { ok: false, text: 'Vendo kennt die Adresse des Shops nicht. Felix muss im Reiter „Kontakte“ den Shop eintragen.' }
      const [produkte, sammlungen] = await Promise.all([shoplinks.produkteLaden(domain, abrufen, { suche: a.suche }), shoplinks.sammlungenLaden(domain, abrufen)])
      if (!produkte.gesamt) return { ok: false, text: `Die Produktliste von ${domain} ist gerade nicht lesbar.` }
      return {
        ok: true,
        text: `${a.suche ? `${produkte.passend} Produkte passen zu „${a.suche}“` : `${produkte.gesamt} Produkte im Shop`}${produkte.passend > produkte.produkte.length ? `, hier die ersten ${produkte.produkte.length} — mit genaueren Suchwörtern eingrenzen` : ''}. Nur diese Adressen, Bilder, Namen und Preise verwenden, nichts zusammensetzen.`,
        daten: { shop: `https://${domain}`, produkte: produkte.produkte, sammlungen }
      }
    }

    if (aktion === 'links_pruefen') {
      const id = String(a.id)
      let html = ''
      if (id.startsWith('k')) html = kampagnen.htmlVon(kampagneHolen(daten, id) || {}, { marke })
      else if (id.startsWith('v')) html = kampagnen.htmlVon(vorlageHolen(daten, id) || {}, { marke })
      else if (id.startsWith('a')) html = ((automationHolen(daten, id) || {}).schritte || []).map((s) => kampagnen.htmlVon(s, { marke })).join(' ')
      if (!html) return { ok: false, text: 'Dazu gibt es keinen Inhalt (ID aus ueberblick nehmen).' }
      const ergebnis = await shopAdressenPruefen(html)
      return ergebnis.ok
        ? { ok: true, text: `Alle ${ergebnis.geprueft} Adressen sind echte, erreichbare Adressen aus dem Shop.` }
        : { ok: false, text: ergebnis.text, daten: { probleme: ergebnis.probleme || [] } }
    }

    if (aktion === 'auswertung') {
      return { ok: true, text: 'Auswertung. Öffnungen und Klicks misst Vendo nicht.', daten: auswertungBauen(daten) }
    }

    return { ok: false, text: 'Unbekannte Aktion.' }
  }

  // Zahlen für die Auswertung — nie einzelne Kontakte oder Adressen
  const auswertungBauen = (daten) => {
    // `ctx.protokollOrdner` gibt es nur in Tests: dort nie das echte Protokoll lesen
    const protokoll = protokollLesen({ anzahl: 50000, ...(ctx.protokollOrdner ? { ordner: ctx.protokollOrdner } : {}) })
    const tag = 86400000
    const zaehlen = (liste, schluessel) =>
      liste.reduce((summe, x) => {
        const k = schluessel(x)
        if (k) summe[k] = (summe[k] || 0) + 1
        return summe
      }, {})
    const monat = (wert) => {
      const t = new Date(wert)
      return Number.isNaN(t.getTime()) ? null : t.toISOString().slice(0, 7)
    }
    const letzteMonate = (werte) => Object.fromEntries(Object.entries(werte).sort(([x], [y]) => x.localeCompare(y)).slice(-12))
    const letzte30 = protokoll.filter((e) => new Date(e.zeit).getTime() >= Date.now() - 30 * tag)
    const fehlerArten = zaehlen(letzte30.filter((e) => !e.ok), (e) => String(e.fehler || 'unbekannt').slice(0, 40))
    const liste = daten.kontakte

    return {
      hinweis: 'Öffnungen und Klicks misst Vendo nicht — dafür bräuchte es einen erreichbaren Tracking-Server. Gezählt wird, was raus ist, was scheiterte und wie sich die Liste entwickelt.',
      kampagnen: daten.kampagnen.map((k) => {
        const eintraege = protokoll.filter((e) => e.kampagneId === k.id)
        return {
          id: k.id,
          name: k.name,
          zustand: k.zustand,
          gestartetAm: k.gestartetAm ? new Date(k.gestartetAm).toISOString() : null,
          eingereiht: k.eingereiht || 0,
          gesendet: eintraege.filter((e) => e.ok && e.art === 'kampagne').length,
          fehlgeschlagen: eintraege.filter((e) => !e.ok && e.art === 'kampagne').length,
          testmails: eintraege.filter((e) => e.art === 'test').length,
          offenInWarteschlange: daten.warteschlange.filter((e) => e.kampagneId === k.id && e.zustand === 'offen').length
        }
      }),
      versandLetzte30Tage: {
        gesendet: letzte30.filter((e) => e.ok).length,
        fehlgeschlagen: letzte30.filter((e) => !e.ok).length,
        nachArt: zaehlen(letzte30, (e) => e.art || 'ohne'),
        haeufigsteFehler: Object.entries(fehlerArten).sort((x, y) => y[1] - x[1]).slice(0, 5)
      },
      warteschlange: zaehlen(daten.warteschlange, (e) => e.zustand),
      drossel: drosselHolen().uebersicht(),
      kontakte: {
        gesamt: liste.length,
        empfaenger: kontakte.empfaenger(liste).length,
        gesperrt: liste.filter((x) => x.gesperrt).length,
        nachZustand: zaehlen(liste, (x) => x.zustand || 'ohne'),
        nachQuelle: zaehlen(liste, (x) => x.quelle || 'ohne'),
        neuJeMonat: letzteMonate(zaehlen(liste, (x) => monat(x.zustimmungAm || x.angelegtAm))),
        abmeldungenJeMonat: letzteMonate(zaehlen(liste.filter((x) => x.gesperrt), (x) => monat(x.gesperrtAm)))
      },
      automationen: daten.automationen.map((x) => ({ id: x.id, name: x.name, art: x.art, aktiv: Boolean(x.aktiv), schritte: (x.schritte || []).length, laeufe: automationen.stand(daten.laeufe, x.id) }))
    }
  }

  // Was ein Bot zuletzt geändert hat. Die Ansicht fragt das alle paar Sekunden ab und zeigt
  // Änderungen sofort, statt erst beim nächsten Klick.
  let botStand = 0
  const botAenderungen = []

  const botAuftrag = async (roh) => {
    const antwort = await botAuftragAusfuehren(roh)
    const aktion = String(roh?.aktion || '')
    if (antwort.ok && !bots.NUR_LESEN.includes(aktion)) {
      botStand += 1
      botAenderungen.push({ aktion, id: roh?.argumente?.id || antwort.daten?.id || null, von: botName(roh), zeit: Date.now() })
      if (botAenderungen.length > 20) botAenderungen.shift()
    }
    // Was noch fehlt, gehört in den Text — sonst überliest es der Bot im JSON darunter
    if (antwort.ok && antwort.daten?.hinweise?.length && !NUR_LESEN_OHNE_HINWEIS.includes(aktion)) {
      antwort.text = `${antwort.text} Noch offen: ${antwort.daten.hinweise.join(' ')}`
    }
    return antwort
  }
  const NUR_LESEN_OHNE_HINWEIS = ['ueberblick', 'auswertung']

  bereitstellen('standLesen', () => ({ stand: botStand, zuletzt: botAenderungen.slice(-10) }))

  bereitstellen('botAuftrag', (auftrag) => botAuftrag(auftrag))

  // Was auf Felix' Freigabe wartet — klein gehalten, die Ansicht fragt das jede Minute ab
  bereitstellen('freigabenLesen', () =>
    datenLesen()
      .kampagnen.filter((k) => k.zustand === 'freigabe')
      .map((k) => ({ id: k.id, name: k.name, von: k.freigabe?.von || 'Ein Bot', angefragtAm: k.freigabe?.angefragtAm || null }))
  )

  // Eingangskorb: Aufträge der Bots als Dateien, eine Antwort je Auftrag. Einer nach dem
  // anderen, damit Vendo der einzige Schreiber der Daten bleibt. `ctx.eingangOrdner` gibt
  // es nur in Tests (false = kein Korb); Vendo selbst setzt es nicht.
  const eingangOrdner = ctx.eingangOrdner === undefined ? bots.EINGANG : ctx.eingangOrdner
  if (eingangOrdner && !eingangLaeuft) {
    eingangLaeuft = true
    let arbeitet = false
    let letztesAufraeumen = 0
    setInterval(async () => {
      if (arbeitet) return
      arbeitet = true
      try {
        for (const eintrag of bots.eingangLesen(eingangOrdner)) {
          if (!bots.auftragNehmen(eintrag)) continue // der Bot hat ihn zurückgezogen
          let antwort
          try {
            antwort = eintrag.fehler ? { ok: false, text: eintrag.fehler } : await botAuftrag(eintrag.roh)
          } catch (fehler) {
            antwort = { ok: false, text: `Fehler in Vendo: ${String(fehler?.message || fehler).slice(0, 160)}` }
          }
          bots.antwortSchreiben(eintrag.id, antwort, eingangOrdner)
          const aktion = String(eintrag.roh?.aktion || '?').replace(/[^a-z_]/g, '').slice(0, 30)
          console.log(`Newsletter: Bot-Auftrag ${aktion} - ${antwort.ok ? 'ok' : 'abgelehnt'}.`)
        }
        if (Date.now() - letztesAufraeumen > 60000) {
          letztesAufraeumen = Date.now()
          bots.aufraeumen(eingangOrdner)
        }
      } catch (fehler) {
        console.warn(`Newsletter: Eingangskorb-Fehler: ${fehler?.message || fehler}`)
      } finally {
        arbeitet = false
      }
    }, 1000).unref?.()
  }

  // ── Takt ──
  // Treibt die Warteschlange an, solange Vendo läuft. Der Schutz oben verhindert, dass bei
  // einem erneuten Laden der Plugin-Liste ein zweiter Zeitgeber dazukommt.
  if (!taktLaeuft) {
    taktLaeuft = true
    let beschaeftigt = false
    let letztesAufraeumen = 0
    let letzteAusloeser = 0

    setInterval(async () => {
      if (beschaeftigt) return // ein Versand kann länger dauern als der Takt
      beschaeftigt = true
      try {
        kampagnenPflegen()
        laeufeAbarbeiten()

        // Shopify nicht im 15-Sekunden-Takt fragen: alle zehn Minuten reicht für
        // Warenkörbe und Bestellungen und bleibt weit unter den Abfragegrenzen.
        if (Date.now() - letzteAusloeser > AUSLOESER_TAKT) {
          letzteAusloeser = Date.now()
          await ausloeserPruefen()
          // Abmeldungen im selben Rhythmus: sie müssen zeitnah wirken, aber das Postfach
          // soll deswegen nicht alle 15 Sekunden geöffnet werden.
          if (abmeldeEinstellungen(datenLesen()).aktiv) await abmeldungenPruefen()
        }

        const ergebnis = await schritt()
        if (ergebnis.gesendet) console.log(`Newsletter: Warteschlange - Mail an ${kuerzen(ergebnis.an)} raus.`)

        if (Date.now() - letztesAufraeumen > AUFRAEUM_TAKT) {
          letztesAufraeumen = Date.now()
          const liste = datenLesen().warteschlange
          const geraeumt = warteschlange.aufraeumen(liste)
          if (geraeumt.length !== liste.length) feldSpeichern('warteschlange', geraeumt)
          const laeufe = datenLesen().laeufe
          const geraeumteLaeufe = automationen.aufraeumen(laeufe)
          if (geraeumteLaeufe.length !== laeufe.length) feldSpeichern('laeufe', geraeumteLaeufe)
        }
      } catch (fehler) {
        console.warn(`Newsletter: Takt-Fehler: ${fehler?.message || fehler}`)
      } finally {
        beschaeftigt = false
      }
    }, TAKT).unref?.()

    console.log('Newsletter: Warteschlange laeuft.')
  }
}
