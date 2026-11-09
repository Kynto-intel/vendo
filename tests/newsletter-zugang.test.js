// Newsletter-Plugin, Phase 1: Zugang zum Postfach.
// Geprüft wird die Logik des Hintergrundteils ohne Electron und ohne SMTP-Verbindung:
// Eingabeprüfung, Tresor (verschlüsseltes Ablegen) und das Verhalten beim Speichern.
// Es wird nie eine Verbindung aufgebaut und nie eine Mail versendet.

import assert from 'node:assert/strict'
import test from 'node:test'
import haupt from '../plugins/newsletter/haupt.js'
import zugangModul from '../plugins/newsletter/zugang.js'
import tresorModul from '../plugins/newsletter/tresor.js'
import smtpModul from '../plugins/newsletter/smtp.js'

const { zugangPruefen, kuerzen, SMTP_STANDARD } = zugangModul
const { tresorMachen } = tresorModul
const { smtpFehlerText } = smtpModul

// Ein safeStorage-Ersatz: verschlüsselt sichtbar, damit der Test den Unterschied zum Klartext sieht
function tresorErsatz({ verfuegbar = true } = {}) {
  return {
    isEncryptionAvailable: () => verfuegbar,
    encryptString: (text) => Buffer.from(`roh:${text}`, 'utf8'),
    decryptString: (puffer) => {
      const text = Buffer.from(puffer).toString('utf8')
      if (!text.startsWith('roh:')) throw new Error('nicht entschlüsselbar')
      return text.slice(4)
    }
  }
}

// Fake-ctx wie Vendo ihn an haupt.js gibt, plus Zugriff auf die bereitgestellten Funktionen
function pluginStarten(startDaten = {}) {
  let daten = JSON.parse(JSON.stringify(startDaten))
  const funktionen = new Map()
  const logs = []

  // Jeden Aufruf mit umgeleitetem console.log ausführen: so prüft der Test, was das Plugin
  // ins Log schreiben würde, ohne die Testausgabe zu verschmutzen.
  const mitLog = (fn) => {
    const echteLog = console.log
    const echteWarn = console.warn
    console.log = (...t) => logs.push(t.join(' '))
    console.warn = (...t) => logs.push(t.join(' '))
    try {
      return fn()
    } finally {
      console.log = echteLog
      console.warn = echteWarn
    }
  }

  mitLog(() =>
    haupt({
      id: 'newsletter',
      datenLaden: () => daten,
      datenSpeichern: (neu) => {
        daten = JSON.parse(JSON.stringify(neu))
        return true
      },
      bereitstellen: (name, fn) => funktionen.set(name, fn),
      vault: {}
    })
  )
  return { rufen: (name, ...args) => mitLog(() => funktionen.get(name)(...args)), daten: () => daten, funktionen, logs }
}

// ── Eingabeprüfung ──

test('zugangPruefen nimmt eine vollständige Eingabe an und setzt Standardwerte', () => {
  const e = zugangPruefen({ benutzer: ' Info@Beispiel.DE ', port: 465, absenderName: 'Beispiel Versand' })
  assert.equal(e.ok, true)
  assert.deepEqual(e.fehler, [])
  assert.equal(e.wert.benutzer, 'info@beispiel.de', 'Adresse wird getrimmt und kleingeschrieben')
  assert.equal(e.wert.host, SMTP_STANDARD.host, 'ohne Angabe gilt der IONOS-Standardserver')
  assert.equal(e.wert.port, 465)
  assert.equal(e.wert.antwortAn, '')
})

test('zugangPruefen lehnt fehlende und unsinnige Adressen ab', () => {
  assert.equal(zugangPruefen({}).ok, false)
  assert.match(zugangPruefen({}).fehler.join(' '), /Postfach-Adresse fehlt/)
  assert.equal(zugangPruefen({ benutzer: 'kein-at-zeichen' }).ok, false)
  assert.equal(zugangPruefen({ benutzer: 'a@b' }).ok, false, 'Adresse ohne Punkt in der Domain')
  assert.equal(zugangPruefen({ benutzer: 'a b@beispiel.de' }).ok, false, 'Leerzeichen in der Adresse')
})

test('zugangPruefen erlaubt nur die vorgesehenen Ports', () => {
  assert.equal(zugangPruefen({ benutzer: 'a@beispiel.de', port: 587 }).ok, true)
  assert.equal(zugangPruefen({ benutzer: 'a@beispiel.de', port: 25 }).ok, false)
  assert.equal(zugangPruefen({ benutzer: 'a@beispiel.de', port: 0 }).ok, false)
})

test('zugangPruefen lehnt Zeilenumbrüche ab (sonst ließen sich Mail-Header einschmuggeln)', () => {
  const name = zugangPruefen({ benutzer: 'a@beispiel.de', absenderName: 'Versand\r\nBcc: fremd@beispiel.de' })
  assert.equal(name.ok, false)
  assert.match(name.fehler.join(' '), /Zeilenumbruch/)

  const antwort = zugangPruefen({ benutzer: 'a@beispiel.de', antwortAn: 'hallo@beispiel.de\nBcc: fremd@beispiel.de' })
  assert.equal(antwort.ok, false)
  assert.match(antwort.fehler.join(' '), /Zeilenumbruch/)
})

test('zugangPruefen nimmt eine Testadresse an und putzt sie', () => {
  const e = zugangPruefen({ benutzer: 'info@beispiel.de', testAdresse: ' Privat@Gmail.COM ' })
  assert.equal(e.ok, true)
  assert.equal(e.wert.testAdresse, 'privat@gmail.com')
})

test('eine leere Testadresse ist erlaubt (dann gilt das Postfach)', () => {
  assert.equal(zugangPruefen({ benutzer: 'info@beispiel.de' }).wert.testAdresse, '')
  assert.equal(zugangPruefen({ benutzer: 'info@beispiel.de', testAdresse: '' }).ok, true)
})

test('zugangPruefen lehnt eine unsinnige Testadresse ab', () => {
  const e = zugangPruefen({ benutzer: 'info@beispiel.de', testAdresse: 'keine adresse' })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Testadresse/)
})

test('zugangPruefen lehnt einen Zeilenumbruch in der Testadresse ab', () => {
  const e = zugangPruefen({ benutzer: 'info@beispiel.de', testAdresse: 'a@beispiel.de\nBcc: fremd@beispiel.de' })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Testadresse darf keinen Zeilenumbruch/)
})

test('zugangLesen nennt die wirksame Testadresse, auch wenn keine eigene gesetzt ist', () => {
  const ohne = pluginStarten({ zugang: { benutzer: 'info@beispiel.de' } })
  assert.equal(ohne.rufen('zugangLesen').testAdresseWirksam, 'info@beispiel.de', 'Rückfall auf das Postfach')

  const mit = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', testAdresse: 'privat@gmail.com' } })
  assert.equal(mit.rufen('zugangLesen').testAdresseWirksam, 'privat@gmail.com')
})

test('die Testadresse übersteht ein Speichern ohne neues Passwort', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', passwortVerschluesselt: 'abgelegt==' } })
  p.rufen('zugangSpeichern', { benutzer: 'info@beispiel.de', testAdresse: 'privat@gmail.com', passwort: '' })
  assert.equal(p.daten().zugang.testAdresse, 'privat@gmail.com')
  assert.equal(p.daten().zugang.passwortVerschluesselt, 'abgelegt==', 'das Passwort bleibt')
})

test('das Zugangsformular löscht die Testadresse nicht, es kennt das Feld gar nicht', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', testAdresse: 'privat@gmail.com' } })
  // So schickt das Formular: ohne testAdresse, die steht im Testmail-Block
  p.rufen('zugangSpeichern', { benutzer: 'info@beispiel.de', absenderName: 'Neuer Name' })
  assert.equal(p.daten().zugang.testAdresse, 'privat@gmail.com', 'bleibt stehen')
  assert.equal(p.daten().zugang.absenderName, 'Neuer Name')
})

test('testAdresseMerken übernimmt die Adresse aus dem An-Feld', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de' } })
  const e = p.rufen('testAdresseMerken', ' Privat@Gmail.COM ')
  assert.equal(e.ok, true)
  assert.equal(e.testAdresse, 'privat@gmail.com')
  assert.equal(p.daten().zugang.testAdresse, 'privat@gmail.com')
  assert.equal(p.rufen('zugangLesen').testAdresseWirksam, 'privat@gmail.com')
})

test('testAdresseMerken setzt mit dem Postfach oder leer wieder zurück', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', testAdresse: 'privat@gmail.com' } })
  p.rufen('testAdresseMerken', 'info@beispiel.de')
  assert.equal(p.daten().zugang.testAdresse, '', 'das Postfach selbst wird nicht gemerkt')

  const q = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', testAdresse: 'privat@gmail.com' } })
  q.rufen('testAdresseMerken', '')
  assert.equal(q.daten().zugang.testAdresse, '')
  assert.equal(q.rufen('zugangLesen').testAdresseWirksam, 'info@beispiel.de', 'Rückfall auf das Postfach')
})

test('testAdresseMerken lehnt eine unsinnige Adresse ab und ändert nichts', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', testAdresse: 'privat@gmail.com' } })
  const e = p.rufen('testAdresseMerken', 'keine adresse')
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Testadresse/)
  assert.equal(p.daten().zugang.testAdresse, 'privat@gmail.com', 'die alte bleibt')
})

test('zugangPruefen begrenzt die Länge des Absendernamens', () => {
  const e = zugangPruefen({ benutzer: 'a@beispiel.de', absenderName: 'x'.repeat(81) })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /zu lang/)
})

test('zugangPruefen lehnt einen unsinnigen Servernamen ab', () => {
  assert.equal(zugangPruefen({ benutzer: 'a@beispiel.de', host: 'kein server' }).ok, false)
  assert.equal(zugangPruefen({ benutzer: 'a@beispiel.de', host: 'smtp.ionos.de' }).ok, true)
})

// ── Tresor ──

test('Tresor verschlüsselt und entschlüsselt verlustfrei', () => {
  const t = tresorMachen(tresorErsatz())
  assert.equal(t.verfuegbar(), true)
  const abgelegt = t.verschluesseln('geheimes-passwort')
  assert.ok(abgelegt)
  assert.ok(!abgelegt.includes('geheimes-passwort'), 'der abgelegte Wert enthält den Klartext nicht')
  assert.equal(t.entschluesseln(abgelegt), 'geheimes-passwort')
})

test('Tresor gibt null zurück, wenn Windows nichts verschlüsseln kann', () => {
  const t = tresorMachen(tresorErsatz({ verfuegbar: false }))
  assert.equal(t.verfuegbar(), false)
  assert.equal(t.verschluesseln('geheim'), null, 'ohne Verschlüsselung wird nichts abgelegt')
})

test('Tresor verschluckt kaputte Werte, statt zu werfen', () => {
  const t = tresorMachen(tresorErsatz())
  assert.equal(t.entschluesseln('nicht-meine-daten'), null)
  assert.equal(t.entschluesseln(''), null)
  assert.equal(t.verschluesseln(''), null)
})

// ── Speichern und Lesen über ctx ──

test('zugangSpeichern legt kein Klartext-Passwort in die Daten', () => {
  const p = pluginStarten()
  // In dieser Testumgebung gibt es kein Electron, also auch keine Verschlüsselung:
  // dann darf das Passwort gar nicht gespeichert werden.
  const ergebnis = p.rufen('zugangSpeichern', { benutzer: 'info@beispiel.de', passwort: 'geheim123' })
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.fehler.join(' '), /verschlüsseln/)
  assert.ok(!JSON.stringify(p.daten()).includes('geheim123'), 'der Klartext steht nirgends in den Daten')
})

test('zugangSpeichern nimmt eine Eingabe ohne Passwort an und meldet, dass keines liegt', () => {
  const p = pluginStarten()
  const ergebnis = p.rufen('zugangSpeichern', { benutzer: 'info@beispiel.de', absenderName: 'Versand', port: 587 })
  assert.equal(ergebnis.ok, true)
  assert.equal(ergebnis.passwortGesetzt, false)
  assert.equal(p.daten().zugang.benutzer, 'info@beispiel.de')
  assert.equal(p.daten().zugang.port, 587)
})

test('zugangSpeichern gibt Prüffehler weiter und ändert dabei nichts', () => {
  const p = pluginStarten({ zugang: { benutzer: 'alt@beispiel.de' } })
  const ergebnis = p.rufen('zugangSpeichern', { benutzer: 'kaputt' })
  assert.equal(ergebnis.ok, false)
  assert.equal(p.daten().zugang.benutzer, 'alt@beispiel.de', 'der alte Zugang bleibt stehen')
})

test('zugangSpeichern behält ein vorhandenes Passwort, wenn das Feld leer bleibt', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', passwortVerschluesselt: 'abgelegt==' } })
  const ergebnis = p.rufen('zugangSpeichern', { benutzer: 'info@beispiel.de', passwort: '' })
  assert.equal(ergebnis.ok, true)
  assert.equal(ergebnis.passwortGesetzt, true)
  assert.equal(p.daten().zugang.passwortVerschluesselt, 'abgelegt==')
})

test('zugangLesen gibt das Passwort nie heraus', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', passwortVerschluesselt: 'abgelegt==', host: 'smtp.ionos.de', port: 465 } })
  const gelesen = p.rufen('zugangLesen')
  assert.equal(gelesen.benutzer, 'info@beispiel.de')
  assert.equal(gelesen.passwortGesetzt, true)
  assert.equal(gelesen.passwort, undefined)
  assert.equal(gelesen.passwortVerschluesselt, undefined)
  assert.ok(!JSON.stringify(gelesen).includes('abgelegt=='), 'auch der verschlüsselte Wert bleibt im Hintergrundteil')
})

test('zugangLoeschen räumt den Zugang weg und lässt andere Daten stehen', () => {
  const p = pluginStarten({ zugang: { benutzer: 'info@beispiel.de', passwortVerschluesselt: 'x' }, kontakte: [{ email: 'a@beispiel.de' }] })
  assert.equal(p.rufen('zugangLoeschen').ok, true)
  assert.deepEqual(p.daten().zugang, {})
  assert.equal(p.daten().kontakte.length, 1)
})

test('zugangTesten antwortet ohne Zugangsdaten mit einem Hinweis statt einem Fehler', async () => {
  const p = pluginStarten()
  const ergebnis = await p.rufen('zugangTesten')
  assert.equal(ergebnis.ok, false)
  assert.match(ergebnis.text, /keine Zugangsdaten/i)
})

test('das Log enthält nie die ganze Adresse', () => {
  const p = pluginStarten()
  p.rufen('zugangSpeichern', { benutzer: 'felix@beispiel.de' })
  const log = p.logs.join(' ')
  assert.ok(log.length > 0, 'es wurde etwas geloggt')
  assert.ok(!log.includes('felix@beispiel.de'), 'die vollständige Adresse steht nicht im Log')
  assert.ok(log.includes('f***@beispiel.de'), 'sie steht gekürzt im Log')
})

// ── Fehlertexte ──

test('smtpFehlerText übersetzt die häufigen Fälle verständlich', () => {
  assert.match(smtpFehlerText({ code: 'EAUTH' }), /Anmeldung abgelehnt/)
  assert.match(smtpFehlerText({ code: 'ENOTFOUND' }), /nicht gefunden/)
  assert.match(smtpFehlerText({ code: 'ETIMEDOUT' }), /Keine Verbindung/)
  assert.match(smtpFehlerText({ response: '550 Sender address is not allowed' }), /abgelehnt/)
  assert.equal(typeof smtpFehlerText({ message: 'irgendwas' }), 'string')
})

test('kuerzen verrät nur den ersten Buchstaben', () => {
  assert.equal(kuerzen('felix@beispiel.de'), 'f***@beispiel.de')
  assert.equal(kuerzen('@beispiel.de'), '***')
  assert.equal(kuerzen(''), '***')
  assert.equal(kuerzen(null), '***')
})
