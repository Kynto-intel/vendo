// Newsletter-Plugin: was die Warteschlange über einen Versand weiß, der gerade läuft oder
// unterbrochen wurde. Geprüft wird, dass ein Eintrag vor dem SMTP-Aufruf als `sendet`
// gespeichert ist, dass ein hängengebliebener Versand als `unklar` endet statt erneut
// rauszugehen, und dass Drossel und Fehler den Zwischenzustand wieder auflösen.
// Alle Adressen sind erfunden. Es wird nie eine Verbindung aufgebaut: nodemailer und Electrons
// safeStorage sind Ersatzteile im Speicher, nichts wird versendet.

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import ws from '../plugins/newsletter/warteschlange.js'

// Nie die echten Hermes-Einstellungen (Shopify-Token) lesen: leerer Test-Ordner
process.env.VENDO_TEST_HERMES_HOME ||= `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/vendo-test-ohne-hermes`
const { einreihen, naechster, versandBeginnen, versandZuruecknehmen, haengendeMarkieren, erfolgMerken, fehlschlagMerken, aufraeumen, stand, HAENGT, BEHALTEN } = ws

const JETZT = 1_700_000_000_000

const eins = () => einreihen([], [{ kampagneId: 'k1', an: 'anna@beispiel.invalid' }], { jetzt: JETZT }).liste

// ── Die reinen Funktionen ──

test('versandBeginnen setzt nur einen offenen Eintrag auf sendet, mit Zeitpunkt', () => {
  const liste = eins()
  const begonnen = versandBeginnen(liste, liste[0].id, JETZT)
  assert.equal(begonnen[0].zustand, 'sendet')
  assert.equal(begonnen[0].sendetSeit, JETZT)
  assert.equal(liste[0].zustand, 'offen', 'die übergebene Liste bleibt unverändert')
  assert.equal(versandBeginnen(liste, 'gibt-es-nicht', JETZT)[0].zustand, 'offen')
  const gesendet = erfolgMerken(begonnen, liste[0].id, JETZT)
  assert.equal(versandBeginnen(gesendet, liste[0].id, JETZT)[0].zustand, 'gesendet', 'Erledigtes wird nicht wieder angefasst')
})

test('ein Eintrag auf sendet ist nicht mehr dran und wird nicht doppelt eingereiht', () => {
  const liste = eins()
  const begonnen = versandBeginnen(liste, liste[0].id, JETZT)
  assert.equal(naechster(begonnen, JETZT + 1000), null)
  const nochmal = einreihen(begonnen, [{ kampagneId: 'k1', an: 'anna@beispiel.invalid' }], { jetzt: JETZT })
  assert.equal(nochmal.eingereiht, 0)
  assert.equal(nochmal.uebersprungen, 1)
})

test('versandZuruecknehmen macht den Eintrag wieder offen, ohne einen Versuch zu zählen', () => {
  const liste = eins()
  const zurueck = versandZuruecknehmen(versandBeginnen(liste, liste[0].id, JETZT), liste[0].id)
  assert.equal(zurueck[0].zustand, 'offen')
  assert.equal(zurueck[0].versuche, 0)
  assert.equal('sendetSeit' in zurueck[0], false)
  assert.equal(naechster(zurueck, JETZT + 1000)?.id, liste[0].id)
})

test('Erfolg und Fehlschlag lösen sendet auf', () => {
  const liste = eins()
  const begonnen = versandBeginnen(liste, liste[0].id, JETZT)
  const ok = erfolgMerken(begonnen, liste[0].id, JETZT + 5)
  assert.equal(ok[0].zustand, 'gesendet')
  assert.equal('sendetSeit' in ok[0], false)
  const fehler = fehlschlagMerken(begonnen, liste[0].id, 'ECONNECTION', { jetzt: JETZT + 5 })
  assert.equal(fehler[0].zustand, 'offen', 'ein Serverfehler darf es noch einmal versuchen')
  assert.equal(fehler[0].versuche, 1)
  assert.equal('sendetSeit' in fehler[0], false)
})

test('haengendeMarkieren: erst nach der Frist unklar, und nie wieder dran', () => {
  const liste = eins()
  const begonnen = versandBeginnen(liste, liste[0].id, JETZT)
  assert.equal(haengendeMarkieren(begonnen, JETZT + HAENGT - 1).anzahl, 0, 'ein laufender Versand bleibt unangetastet')
  const markiert = haengendeMarkieren(begonnen, JETZT + HAENGT)
  assert.equal(markiert.anzahl, 1)
  assert.equal(markiert.liste[0].zustand, 'unklar')
  assert.match(markiert.liste[0].letzterFehler, /unklar/)
  assert.equal(naechster(markiert.liste, JETZT + HAENGT + 1), null)
  assert.equal(einreihen(markiert.liste, [{ kampagneId: 'k1', an: 'anna@beispiel.invalid' }]).eingereiht, 0, 'auch nicht über ein erneutes Einreihen')
  // Ein Eintrag ohne Zeitpunkt (kaputte Daten) gilt als hängend
  assert.equal(haengendeMarkieren([{ ...begonnen[0], sendetSeit: undefined }], JETZT).anzahl, 1)
  assert.ok(HAENGT > 3 * 60000, 'weit über der SMTP-Frist von dreimal 60 Sekunden')
})

test('stand zählt sendet und unklar, aufraeumen behält Laufendes', () => {
  const liste = eins()
  const begonnen = versandBeginnen(liste, liste[0].id, JETZT)
  assert.equal(stand(begonnen, JETZT).sendet, 1)
  assert.equal(stand(haengendeMarkieren(begonnen, JETZT + HAENGT).liste).unklar, 1)
  assert.equal(aufraeumen(begonnen, JETZT + BEHALTEN * 2).length, 1, 'ein laufender Versand wird nicht weggeräumt')
  assert.equal(aufraeumen(haengendeMarkieren(begonnen, JETZT + HAENGT).liste, JETZT + HAENGT + BEHALTEN * 2).length, 0, 'unklar wird nach einer Woche weggeräumt')
})

// ── Zusammenspiel in haupt.js ──
// nodemailer und electron werden vor dem Laden von haupt.js durch Ersatzteile vertreten.

const require = createRequire(import.meta.url)
const smtp = { verhalten: async () => ({ messageId: 'x' }), aufrufe: [] }
const ersatz = (pfad, exports) => {
  require.cache[pfad] = { id: pfad, filename: pfad, loaded: true, exports }
}
ersatz(require.resolve('electron'), {
  safeStorage: {
    isEncryptionAvailable: () => true,
    encryptString: (t) => Buffer.from(`test:${t}`),
    decryptString: (b) => Buffer.from(b).toString().slice(5)
  }
})
ersatz(require.resolve('nodemailer'), {
  createTransport: () => ({
    sendMail: async (mail) => {
      smtp.aufrufe.push(mail.to)
      return smtp.verhalten(mail)
    },
    close: () => {}
  })
})
const { default: starten } = await import('../plugins/newsletter/haupt.js')

function hauptStarten(warteschlange, extra = {}) {
  let daten = {
    zugang: { benutzer: 'info@beispiel.invalid', passwortVerschluesselt: Buffer.from('test:nur-ein-test-passwort').toString('base64') },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.invalid', farben: {} },
    kontakte: [],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange,
    ...extra
  }
  const fn = {}
  starten({
    datenLaden: () => JSON.parse(JSON.stringify(daten)),
    datenSpeichern: (d) => {
      daten = JSON.parse(JSON.stringify(d))
    },
    bereitstellen: (name, f) => {
      fn[name] = f
    },
    fragen: async () => '',
    eingangOrdner: false,
    protokollOrdner: fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-newsletter-versandzustand-'))
  })
  return { fn, daten: () => daten }
}

const testEintrag = (zusatz = {}) => {
  const [e] = einreihen([], [{ an: 'anna@beispiel.invalid', betreff: 'Probe', html: '<p>Hallo</p>', art: 'test' }]).liste
  return { ...e, ...zusatz }
}

test('der Eintrag steht schon auf sendet, während der Server die Mail annimmt', async () => {
  const e = testEintrag()
  const h = hauptStarten([e])
  let waehrenddessen = null
  smtp.aufrufe = []
  smtp.verhalten = async () => {
    waehrenddessen = h.daten().warteschlange[0]
    return { messageId: 'x' }
  }
  const r = await h.fn.warteschlangeSchritt()
  assert.equal(r.gesendet, true, JSON.stringify(r))
  assert.equal(waehrenddessen.zustand, 'sendet', 'so übersteht der Zustand einen Absturz genau in diesem Moment')
  assert.equal(h.daten().warteschlange[0].zustand, 'gesendet')
  assert.deepEqual(smtp.aufrufe, ['anna@beispiel.invalid'])
})

test('nach einem Absturz mitten im Versand wird nicht erneut gesendet, sondern unklar gemeldet', async () => {
  const h = hauptStarten([testEintrag({ zustand: 'sendet', sendetSeit: Date.now() - HAENGT - 1000 })])
  smtp.aufrufe = []
  const r = await h.fn.warteschlangeSchritt()
  assert.equal(r.nichts, true)
  assert.deepEqual(smtp.aufrufe, [], 'keine zweite Mail')
  assert.equal(h.daten().warteschlange[0].zustand, 'unklar')
  const gelesen = h.fn.warteschlangeLesen()
  assert.equal(gelesen.unklar, 1)
  assert.equal(gelesen.letzteFehler.length, 1, 'unklare Einträge erscheinen bei den Fehlern')
})

test('ein gerade laufender Versand wird vom nächsten Takt nicht angefasst', async () => {
  const h = hauptStarten([testEintrag({ zustand: 'sendet', sendetSeit: Date.now() - 1000 })])
  smtp.aufrufe = []
  await h.fn.warteschlangeSchritt()
  assert.deepEqual(smtp.aufrufe, [])
  assert.equal(h.daten().warteschlange[0].zustand, 'sendet')
})

test('gedrosselt: der Eintrag ist danach wieder offen, ohne Versuch und ohne SMTP', async () => {
  const h = hauptStarten([testEintrag()], { drossel: { sendungen: [], pauseBis: Date.now() + 3600000 } })
  smtp.aufrufe = []
  const r = await h.fn.warteschlangeSchritt()
  assert.equal(r.gedrosselt, true)
  assert.deepEqual(smtp.aufrufe, [])
  const e = h.daten().warteschlange[0]
  assert.equal(e.zustand, 'offen')
  assert.equal(e.versuche, 0)
  assert.equal('sendetSeit' in e, false)
})

test('ein Serverfehler zählt als Fehlversuch und lässt den Eintrag wieder offen', async () => {
  const h = hauptStarten([testEintrag()])
  smtp.aufrufe = []
  smtp.verhalten = async () => {
    throw Object.assign(new Error('Verbindung weg'), { code: 'ECONNECTION' })
  }
  const r = await h.fn.warteschlangeSchritt()
  assert.ok(r.fehler)
  const e = h.daten().warteschlange[0]
  assert.equal(e.zustand, 'offen')
  assert.equal(e.versuche, 1)
  assert.equal('sendetSeit' in e, false)
})

test('eine laufende Kampagne gilt nicht als fertig, solange ihre letzte Mail unterwegs ist', () => {
  const k = { id: 'k1', name: 'Herbst', zustand: 'laeuft', betreff: 'Neu', html: '<p>x</p>' }
  const h = hauptStarten([testEintrag({ kampagneId: 'k1', zustand: 'sendet', sendetSeit: Date.now() })], { kampagnen: [k] })
  h.fn.kampagnenPflegen()
  assert.equal(h.daten().kampagnen[0].zustand, 'laeuft')
})
