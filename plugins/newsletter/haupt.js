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
const kampagnen = require('./kampagnen.js')
const automationen = require('./automationen.js')
const { mailAus, startVorlage, ARTEN, FELDER, STANDARD_FARBEN } = require('./bausteine.js')
const { protokollSchreiben, protokollLesen } = require('./protokoll.js')

const TAKT = 15000 // so oft schaut der Hintergrundteil in die Warteschlange
const AUFRAEUM_TAKT = 3600000 // einmal pro Stunde Erledigtes wegräumen
const AUSLOESER_TAKT = 600000 // alle zehn Minuten bei Shopify nach Warenkörben und Bestellungen sehen

// Vendo ruft diese Aufbaufunktion bei jedem Laden der Plugin-Liste erneut auf, das Modul
// bleibt dabei im require-Cache. Ohne diesen Schutz liefen mehrere Zeitgeber gleichzeitig
// und würden Mails doppelt verschicken.
let taktLaeuft = false

module.exports = (ctx) => {
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
      automationen: Array.isArray(d.automationen) ? d.automationen : [],
      laeufe: Array.isArray(d.laeufe) ? d.laeufe : []
    }
  }

  // Abmeldeweg: eigene Adresse, sonst das Postfach selbst
  const abmeldeAdresseVon = (daten) => daten.marke.abmeldeAdresse || daten.zugang.benutzer || ''

  // Wohin Testmails gehen: die eingetragene Testadresse, sonst das Postfach selbst.
  // Gilt für alle vier Wege (freie Testmail, Beispielmail, Kampagne, Automation).
  const testAdresseVon = (daten) => daten.zugang.testAdresse || daten.zugang.benutzer || ''

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

  ctx.bereitstellen('zugangLesen', () => {
    const z = datenLesen().zugang
    return {
      benutzer: z.benutzer || '',
      host: z.host || SMTP_STANDARD.host,
      port: z.port || SMTP_STANDARD.port,
      absenderName: z.absenderName || '',
      antwortAn: z.antwortAn || '',
      testAdresse: z.testAdresse || '',
      testAdresseWirksam: testAdresseVon(datenLesen()),
      passwortGesetzt: Boolean(z.passwortVerschluesselt),
      tresorVerfuegbar: tresor.verfuegbar(),
      ports: PORTS
    }
  })

  ctx.bereitstellen('zugangSpeichern', (eingabe = {}) => {
    const geprueft = zugangPruefen(eingabe)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }

    const daten = datenLesen()
    const passwort = String(eingabe.passwort ?? '')
    let verschluesselt = daten.zugang.passwortVerschluesselt || null
    // Die Testadresse steht im Testmail-Formular, nicht in diesem: wird sie hier nicht
    // mitgeschickt, bleibt die gespeicherte stehen, statt gelöscht zu werden.
    if (eingabe.testAdresse === undefined) geprueft.wert.testAdresse = daten.zugang.testAdresse || ''

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
  ctx.bereitstellen('testAdresseMerken', (adresse) => {
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

  ctx.bereitstellen('zugangLoeschen', () => {
    feldSpeichern('zugang', {})
    console.log('Newsletter: Zugang geloescht.')
    return { ok: true }
  })

  ctx.bereitstellen('zugangTesten', async () => {
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

  ctx.bereitstellen('drosselLesen', () => {
    const uebersicht = drosselHolen().uebersicht()
    return { ...uebersicht, budgetMax: BUDGET_MAX, budgetStandard: BUDGET_STANDARD }
  })

  ctx.bereitstellen('budgetSpeichern', (wert) => {
    const budget = budgetPruefen(wert)
    const daten = datenLesen()
    daten.einstellungen = { ...daten.einstellungen, budgetProStunde: budget }
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Stundenbudget auf ${budget} Mails gesetzt.`)
    return { ok: true, budget }
  })

  ctx.bereitstellen('pauseBeenden', () => {
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

    const gebaut = mailBauen({ art, an, betreff, html, text, zugang: z, abmeldeAdresse })
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

  ctx.bereitstellen('mailSenden', async (eingabe = {}) => {
    const art = eingabe.art === 'kampagne' ? 'kampagne' : 'test'
    const an = art === 'test' ? eingabe.an || testAdresseVon(datenLesen()) : eingabe.an
    const { ok, text } = await einzelSenden({ art, an, betreff: eingabe.betreff, html: eingabe.html, text: eingabe.text, abmeldeAdresse: eingabe.abmeldeAdresse })
    return { ok, text }
  })

  // ── Warteschlange ──

  // Inhalt eines Eintrags: entweder er trägt ihn selbst (Einzelmail), oder er verweist auf
  // eine Kampagne. So liegt das HTML einmal statt tausendmal in den Daten — und die
  // Personalisierung passiert erst hier, kurz vor dem Versand.
  const inhaltVon = (eintrag, daten) => {
    if (eintrag.html || eintrag.betreff) return { betreff: eintrag.betreff, html: eintrag.html }
    const kampagne = daten.kampagnen.find((k) => k.id === eintrag.kampagneId)
    if (!kampagne) return { fehler: 'Zu diesem Eintrag gibt es keine Kampagne mehr.' }
    const kontakt = kontakte.finden(daten.kontakte, eintrag.an) || { email: eintrag.an }
    const bausteine = kampagnen.bausteinePersonalisieren(kampagne.bausteine, kontakt)
    return {
      betreff: kampagnen.personalisieren(kampagne.betreff, kontakt),
      html: mailAus(bausteine, {
        marke: daten.marke,
        abmeldeAdresse: abmeldeAdresseVon(daten),
        vorschauText: kampagnen.personalisieren(kampagne.vorschauText, kontakt)
      })
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

  ctx.bereitstellen('warteschlangeLesen', () => {
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
  ctx.bereitstellen('warteschlangeEinreihen', (eintraege) => {
    const daten = datenLesen()
    const ergebnis = warteschlange.einreihen(daten.warteschlange, eintraege)
    feldSpeichern('warteschlange', ergebnis.liste)
    console.log(`Newsletter: ${ergebnis.eingereiht} eingereiht, ${ergebnis.uebersprungen} uebersprungen (schon in der Schlange oder ungueltig).`)
    return { ok: true, eingereiht: ergebnis.eingereiht, uebersprungen: ergebnis.uebersprungen }
  })

  ctx.bereitstellen('warteschlangeAbbrechen', () => {
    const daten = datenLesen()
    const ergebnis = warteschlange.offeneVerwerfen(daten.warteschlange)
    feldSpeichern('warteschlange', ergebnis.liste)
    console.log(`Newsletter: ${ergebnis.anzahl} offene Eintraege abgebrochen.`)
    return { ok: true, abgebrochen: ergebnis.anzahl }
  })

  // ── Shopify ──

  ctx.bereitstellen('shopifyLesen', () => {
    const s = datenLesen().shopify
    return {
      shop: s.shop || '',
      tokenGesetzt: Boolean(s.tokenVerschluesselt),
      letzterSync: s.letzterSync || null,
      letzterSyncText: s.letzterSyncText || '',
      tresorVerfuegbar: tresor.verfuegbar()
    }
  })

  ctx.bereitstellen('shopifySpeichern', (eingabe = {}) => {
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

  ctx.bereitstellen('shopifyLoeschen', () => {
    feldSpeichern('shopify', {})
    console.log('Newsletter: Shopify-Zugang geloescht.')
    return { ok: true }
  })

  // Abonnenten holen und in den Bestand einarbeiten
  ctx.bereitstellen('kontakteSynchronisieren', async () => {
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
    daten.kontakte = zusammen.liste
    daten.shopify = {
      ...daten.shopify,
      letzterSync: Date.now(),
      letzterSyncText: `${zusammen.angelegt} neu, ${zusammen.aktualisiert} aktualisiert, ${zusammen.gesperrtGelassen} gesperrt gelassen`
    }
    ctx.datenSpeichern(daten)

    const nachStand = kontakte.stand(zusammen.liste)
    const text = [
      `${geholt.kontakte.length} Abonnenten bei Shopify gefunden.`,
      `${zusammen.angelegt} neu, ${zusammen.aktualisiert} aktualisiert.`,
      `${nachStand.empfaenger} zählen als Empfänger.`,
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

  ctx.bereitstellen('kontakteLesen', (eingabe = {}) => {
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
  ctx.bereitstellen('kontaktSperren', async (eingabe = {}) => {
    const email = String(eingabe.email || '')
    const daten = datenLesen()
    const kontakt = kontakte.finden(daten.kontakte, email)
    if (!kontakt) return { ok: false, text: 'Diesen Kontakt gibt es nicht.' }

    const gesperrt = kontakte.sperren(daten.kontakte, email, { grund: eingabe.grund || 'abgemeldet' })
    feldSpeichern('kontakte', gesperrt.liste)
    console.log(`Newsletter: ${kuerzen(email)} gesperrt (${eingabe.grund || 'abgemeldet'}).`)

    if (!kontakt.shopifyId) {
      return { ok: true, text: 'Lokal gesperrt. Bei Shopify ist zu diesem Kontakt keine Kundennummer bekannt, dort wurde nichts geändert.' }
    }
    const zugang = shopifyZugang()
    if (zugang.fehler) return { ok: true, text: `Lokal gesperrt. Bei Shopify nicht geändert: ${zugang.fehler}` }

    const zurueck = await shopify.abmeldungSchreiben({ shop: zugang.shop, token: zugang.token, shopifyId: kontakt.shopifyId })
    if (!zurueck.ok) {
      console.warn(`Newsletter: Abmeldung von ${kuerzen(email)} nicht zu Shopify geschrieben: ${zurueck.fehler}`)
      return { ok: true, text: `Lokal gesperrt. Bei Shopify nicht geändert: ${zurueck.fehler} Der nächste Sync lässt die Sperre bestehen.` }
    }
    return { ok: true, text: 'Gesperrt und bei Shopify auf „nicht abonniert“ gesetzt.' }
  })

  ctx.bereitstellen('kontaktFreigeben', (eingabe = {}) => {
    const daten = datenLesen()
    const ergebnis = kontakte.freigeben(daten.kontakte, eingabe.email)
    if (!ergebnis.ok) return { ok: false, text: 'Diesen Kontakt gibt es nicht.' }
    feldSpeichern('kontakte', ergebnis.liste)
    console.log(`Newsletter: Sperre fuer ${kuerzen(eingabe.email)} aufgehoben.`)
    return { ok: true, text: 'Sperre aufgehoben. Bei Shopify wurde nichts geändert.' }
  })

  // Vollständig löschen (Löschanfrage). Sperren ist der Normalfall.
  ctx.bereitstellen('kontaktLoeschen', (eingabe = {}) => {
    const daten = datenLesen()
    const ergebnis = kontakte.loeschen(daten.kontakte, eingabe.email)
    if (!ergebnis.ok) return { ok: false, text: 'Diesen Kontakt gibt es nicht.' }
    feldSpeichern('kontakte', ergebnis.liste)
    console.log(`Newsletter: ${kuerzen(eingabe.email)} vollstaendig geloescht.`)
    return { ok: true, text: 'Vollständig gelöscht. Stimmt die Adresse bei Shopify weiter zu, holt der nächste Sync sie wieder herein — dann besser sperren.' }
  })

  ctx.bereitstellen('csvImportieren', (text) => {
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

  ctx.bereitstellen('markeLesen', () => {
    const marke = datenLesen().marke
    return {
      titel: marke.titel || '',
      logo: marke.logo || '',
      impressum: marke.impressum || '',
      abmeldeAdresse: marke.abmeldeAdresse || '',
      farben: { ...STANDARD_FARBEN, ...(marke.farben || {}) },
      standardFarben: STANDARD_FARBEN
    }
  })

  // Beispielmail mit Kopf, Logo und Fuß an die eigene Adresse. Die freie Testmail weiter
  // unten schickt genau das, was im Feld steht — ohne Rahmen. Für „sieht mein Logo im
  // Postfach gut aus?“ braucht es diesen Weg, ohne erst eine Kampagne anlegen zu müssen.
  ctx.bereitstellen('markeTesten', async () => {
    const daten = datenLesen()
    if (!daten.zugang.benutzer || !daten.zugang.passwortVerschluesselt) return { ok: false, text: 'Es sind noch keine Zugangsdaten gespeichert.' }
    if (!daten.marke.logo && !daten.marke.titel) return { ok: false, text: 'Trage erst einen Namen oder eine Logo-Adresse ein.' }

    const beispiel = { email: testAdresseVon(daten), vorname: 'Vorname', nachname: 'Nachname' }
    const html = mailAus(kampagnen.bausteinePersonalisieren(startVorlage(), beispiel), {
      marke: daten.marke,
      abmeldeAdresse: abmeldeAdresseVon(daten),
      vorschauText: 'Beispielmail aus Vendo'
    })
    const ergebnis = await einzelSenden({ art: 'test', an: testAdresseVon(daten), betreff: '[Test] Kopf, Logo und Fuss', html })
    if (!ergebnis.ok) return ergebnis
    return {
      ok: true,
      text: `${ergebnis.text} Zeigt dein Mailprogramm kein Bild, erlaube dort zuerst Bilder von Absendern — Gmail und Outlook blenden sie oft aus.`
    }
  })

  ctx.bereitstellen('markeSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const nurFarben = {}
    for (const name of Object.keys(STANDARD_FARBEN)) {
      const wert = String(eingabe.farben?.[name] || '').trim()
      if (/^#[0-9a-f]{3,8}$/i.test(wert)) nurFarben[name] = wert
    }
    daten.marke = {
      titel: String(eingabe.titel || '').trim().slice(0, 80),
      logo: /^https?:\/\//i.test(String(eingabe.logo || '').trim()) ? String(eingabe.logo).trim() : '',
      impressum: String(eingabe.impressum || '').trim().slice(0, 600),
      abmeldeAdresse: String(eingabe.abmeldeAdresse || '').trim().toLowerCase(),
      farben: nurFarben
    }
    ctx.datenSpeichern(daten)
    console.log('Newsletter: Markenangaben gespeichert.')
    return { ok: true }
  })

  // ── Kampagnen ──

  const kampagneHolen = (daten, id) => daten.kampagnen.find((k) => k.id === id) || null

  ctx.bereitstellen('kampagnenLesen', () => {
    const daten = datenLesen()
    return {
      arten: ARTEN,
      felder: FELDER,
      empfaenger: kontakte.empfaenger(daten.kontakte).length,
      liste: daten.kampagnen.map((k) => ({
        id: k.id,
        name: k.name,
        betreff: k.betreff,
        vorschauText: k.vorschauText,
        bausteine: k.bausteine || [],
        zustand: k.zustand,
        geplantAm: k.geplantAm || null,
        eingereiht: k.eingereiht || 0,
        geaendertAm: k.geaendertAm || null,
        gestartetAm: k.gestartetAm || null
      }))
    }
  })

  ctx.bereitstellen('kampagneAnlegen', (name) => {
    const daten = datenLesen()
    const kampagne = kampagnen.neueKampagne({ name })
    daten.kampagnen = [...daten.kampagnen, kampagne]
    ctx.datenSpeichern(daten)
    return { ok: true, id: kampagne.id }
  })

  ctx.bereitstellen('kampagneSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, eingabe.id)
    if (!kampagne) return { ok: false, fehler: ['Diese Kampagne gibt es nicht.'] }
    if (kampagne.zustand === 'laeuft') return { ok: false, fehler: ['Die Kampagne läuft gerade. Erst abbrechen, dann ändern.'] }

    const aenderung = {
      name: String(eingabe.name || kampagne.name).trim().slice(0, 80) || kampagne.name,
      betreff: String(eingabe.betreff ?? kampagne.betreff),
      vorschauText: String(eingabe.vorschauText ?? kampagne.vorschauText).slice(0, 200),
      bausteine: kampagnen.bausteineSaeubern(eingabe.bausteine ?? kampagne.bausteine)
    }
    const geaendert = kampagnen.kampagneAendern(daten.kampagnen, kampagne.id, aenderung)
    daten.kampagnen = geaendert.liste
    ctx.datenSpeichern(daten)
    const geprueft = kampagnePruefenMitMarke(datenLesen(), kampagne.id)
    return { ok: true, hinweise: geprueft.fehler }
  })

  ctx.bereitstellen('kampagneLoeschen', (id) => {
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
    const geprueft = kampagnen.kampagnePruefen(kampagne)
    const fehler = [...geprueft.fehler]
    if (!abmeldeAdresseVon(daten)) fehler.push('Es fehlt eine Adresse für die Abmeldung (Postfach eintragen oder unter „Marke“ angeben).')
    if (!daten.marke.impressum) fehler.push('Im Fuß fehlt das Impressum (unter „Marke“ eintragen).')
    return { ok: fehler.length === 0, fehler, kampagne, bausteine: geprueft.bausteine }
  }

  // Vorschau: fertiges HTML und der abgeleitete Textteil, mit Beispielkontakt
  ctx.bereitstellen('kampagneVorschau', (id) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    const beispiel = kontakte.empfaenger(daten.kontakte)[0] || { email: testAdresseVon(daten) || 'empfaenger@beispiel.de', vorname: 'Vorname', nachname: 'Nachname' }
    const html = mailAus(kampagnen.bausteinePersonalisieren(kampagne.bausteine, beispiel), {
      marke: daten.marke,
      abmeldeAdresse: abmeldeAdresseVon(daten),
      vorschauText: kampagnen.personalisieren(kampagne.vorschauText, beispiel)
    })
    const geprueft = kampagnePruefenMitMarke(daten, id)
    return {
      ok: true,
      html,
      text: textAusHtml(html),
      betreff: kampagnen.personalisieren(kampagne.betreff, beispiel),
      hinweise: geprueft.fehler,
      beispielAdresse: beispiel.email
    }
  })

  // Testmail der Kampagne an die eigene Adresse
  ctx.bereitstellen('kampagneTesten', async (id) => {
    const daten = datenLesen()
    const kampagne = kampagneHolen(daten, id)
    if (!kampagne) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    const beispiel = { email: testAdresseVon(daten), vorname: 'Vorname', nachname: 'Nachname' }
    const html = mailAus(kampagnen.bausteinePersonalisieren(kampagne.bausteine, beispiel), {
      marke: daten.marke,
      abmeldeAdresse: abmeldeAdresseVon(daten),
      vorschauText: kampagne.vorschauText
    })
    return einzelSenden({
      art: 'test',
      an: testAdresseVon(daten),
      betreff: `[Test] ${kampagnen.personalisieren(kampagne.betreff, beispiel) || kampagne.name}`,
      html,
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
      gestartetAm: jetzt,
      geplantAm: null,
      eingereiht: (kampagne.eingereiht || 0) + eingereiht.eingereiht
    }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Kampagne "${kampagne.name}" gestartet - ${eingereiht.eingereiht} eingereiht, ${eingereiht.uebersprungen} uebersprungen.`)
    return { ok: true, eingereiht: eingereiht.eingereiht, uebersprungen: eingereiht.uebersprungen, empfaenger: empfaenger.length }
  }

  ctx.bereitstellen('kampagneStarten', (id) => kampagneStarten(id))

  ctx.bereitstellen('kampagnePlanen', (eingabe = {}) => {
    const daten = datenLesen()
    const geprueft = kampagnePruefenMitMarke(daten, eingabe.id)
    if (!geprueft.ok) return { ok: false, fehler: geprueft.fehler }
    const zeitpunkt = Number(eingabe.geplantAm)
    if (!Number.isFinite(zeitpunkt) || zeitpunkt < Date.now()) return { ok: false, fehler: ['Der Zeitpunkt liegt in der Vergangenheit.'] }
    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, eingabe.id, { zustand: 'geplant', geplantAm: zeitpunkt }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Kampagne "${geprueft.kampagne.name}" geplant fuer ${new Date(zeitpunkt).toISOString()}.`)
    return { ok: true }
  })

  ctx.bereitstellen('kampagneAbbrechen', (id) => {
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

  ctx.bereitstellen('kampagneZurueckZumEntwurf', (id) => {
    const daten = datenLesen()
    if (!kampagneHolen(daten, id)) return { ok: false, text: 'Diese Kampagne gibt es nicht.' }
    daten.kampagnen = kampagnen.kampagneAendern(daten.kampagnen, id, { zustand: 'entwurf', geplantAm: null }).liste
    ctx.datenSpeichern(daten)
    return { ok: true, text: 'Wieder im Entwurf.' }
  })

  // ── KI ──
  // Den Auftrag baut der Hintergrundteil, die Frage stellt die Oberfläche über ctx.fragen,
  // und die Antwort kommt hierher zurück. So liegt die prüfbare Logik an einer Stelle.

  ctx.bereitstellen('kiAuftragHolen', (eingabe = {}) => {
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

  ctx.bereitstellen('kiAntwortUebernehmen', (eingabe = {}) => {
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
      bausteine: kampagnen.bausteineSaeubern(bausteine)
    }).liste
    ctx.datenSpeichern(daten)
    console.log(`Newsletter: Entwurf von Luzzy uebernommen (${gelesen.bausteine.length} Bausteine).`)
    return { ok: true, text: `Übernommen: Betreff und ${gelesen.bausteine.length} Bausteine. Vorschau prüfen, dann Testmail.` }
  })

  // ── Automationen ──

  const automationHolen = (daten, id) => daten.automationen.find((a) => a.id === id) || null

  ctx.bereitstellen('automationenLesen', () => {
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
          bausteine: s.bausteine || []
        })),
        stand: automationen.stand(daten.laeufe, a.id),
        hinweise: automationen.automationPruefen(a).fehler
      }))
    }
  })

  ctx.bereitstellen('automationAnlegen', (art) => {
    const neu = automationen.neueAutomation(art)
    if (!neu) return { ok: false, text: 'Unbekannte Art von Automation.' }
    const daten = datenLesen()
    if (daten.automationen.some((a) => a.art === art)) return { ok: false, text: 'Diese Automation gibt es schon.' }
    daten.automationen = [...daten.automationen, neu]
    ctx.datenSpeichern(daten)
    return { ok: true, id: neu.id }
  })

  ctx.bereitstellen('automationSpeichern', (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, fehler: ['Diese Automation gibt es nicht.'] }

    const schritte = (Array.isArray(eingabe.schritte) ? eingabe.schritte : automation.schritte || []).map((s, i) => ({
      nach: Math.max(Number(s?.nach) || 0, 0),
      verfallNach: Math.max(Number(s?.verfallNach) || automationen.STUNDE * 48, automationen.STUNDE),
      betreff: String(s?.betreff ?? '').slice(0, 200),
      bausteine: kampagnen.bausteineSaeubern(s?.bausteine ?? automation.schritte?.[i]?.bausteine)
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
  ctx.bereitstellen('automationSchalten', (eingabe = {}) => {
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

  ctx.bereitstellen('automationLoeschen', (id) => {
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
    const bausteine = kampagnen.bausteinePersonalisieren(schritt.bausteine, kontakt, extra)
    return {
      betreff: kampagnen.personalisieren(schritt.betreff, kontakt, extra),
      html: mailAus(bausteine, { marke: daten.marke, abmeldeAdresse: abmeldeAdresseVon(daten) })
    }
  }

  ctx.bereitstellen('automationVorschau', (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
    const beispiel = { email: testAdresseVon(daten) || 'empfaenger@beispiel.de', vorname: 'Vorname', nachname: 'Nachname' }
    const gebaut = automationMailBauen(daten, automation, Number(eingabe.schritt) || 0, beispiel, BEISPIEL_KORB)
    if (gebaut.fehler) return { ok: false, text: gebaut.fehler }
    return { ok: true, html: gebaut.html, text: textAusHtml(gebaut.html), betreff: gebaut.betreff, hinweise: automationen.automationPruefen(automation).fehler }
  })

  ctx.bereitstellen('automationTesten', async (eingabe = {}) => {
    const daten = datenLesen()
    const automation = automationHolen(daten, eingabe.id)
    if (!automation) return { ok: false, text: 'Diese Automation gibt es nicht.' }
    const beispiel = { email: testAdresseVon(daten), vorname: 'Vorname', nachname: 'Nachname' }
    const gebaut = automationMailBauen(daten, automation, Number(eingabe.schritt) || 0, beispiel, BEISPIEL_KORB)
    if (gebaut.fehler) return { ok: false, text: gebaut.fehler }
    return einzelSenden({ art: 'test', an: testAdresseVon(daten), betreff: `[Test] ${gebaut.betreff || automation.name}`, html: gebaut.html })
  })

  ctx.bereitstellen('laeufeLesen', () => {
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

  ctx.bereitstellen('ausloeserPruefen', () => ausloeserPruefen())

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

  ctx.bereitstellen('laeufeAbarbeiten', () => laeufeAbarbeiten())

  // ── Protokoll und Vorschau ──

  ctx.bereitstellen('protokollLesen', (eingabe = {}) => {
    const anzahl = Math.min(Math.max(Number(eingabe.anzahl) || 50, 1), 500)
    return protokollLesen({ anzahl })
  })

  ctx.bereitstellen('textVorschau', (html) => textAusHtml(html))

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

  ctx.bereitstellen('kampagnenPflegen', () => kampagnenPflegen())

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
