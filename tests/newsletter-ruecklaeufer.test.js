// Newsletter-Plugin: Rückläufer und Beschwerden (Review-Befund S1).
// Geprüft wird, wie Rückmeldungen von Mailservern gelesen und eingeordnet werden, dass nur
// tote Adressen und Beschwerden sperren, vorübergehende Fehler und Ablehnungen nur zählen, die
// eigenen Adressen nie betroffen sind, eine Rückläufer-Sperre nicht zu Shopify geht, kein Sync
// sie aufhebt und eine noch wartende Kampagnenmail an eine gesperrte Adresse nicht rausgeht.
// Alle Rückmeldungen in tests/fixtures/newsletter/ruecklaeufer/ sind erfunden, die Adressen
// liegen unter `.invalid`. Es wird nie eine Verbindung aufgebaut: IMAP, Shopify, nodemailer
// und Electrons safeStorage sind Ersatzteile im Speicher.

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import ruecklaeufer from '../plugins/newsletter/ruecklaeufer.js'
import kontakte from '../plugins/newsletter/kontakte.js'
import ergebnisse from '../plugins/newsletter/ergebnisse.js'
import imap from '../plugins/newsletter/imap.js'
import ws from '../plugins/newsletter/warteschlange.js'

// Nie die echten Hermes-Einstellungen (Shopify-Token) lesen: leerer Test-Ordner
process.env.VENDO_TEST_HERMES_HOME ||= `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/vendo-test-ohne-hermes`
const { lesen, einordnen, anwenden, ereignisseMerken, MAX_EREIGNISSE } = ruecklaeufer
const ORDNER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', 'newsletter', 'ruecklaeufer')
const fixture = (name) => fs.readFileSync(path.join(ORDNER, name), 'utf8')
const EIGENE = ['info@beispiel.invalid', 'abmelden@beispiel.invalid']
const JETZT = 1_700_000_000_000

const nachAdresse = (ergebnis) => Object.fromEntries(ergebnis.ergebnisse.map((e) => [e.email, e]))

// ── Lesen ──

test('Zustellbericht 5.1.1: die Adresse ist tot', () => {
  const r = lesen(fixture('dsn-hart.eml'), { eigene: EIGENE })
  assert.equal(r.rueckmeldung, true)
  assert.equal(r.ergebnisse.length, 1)
  const e = r.ergebnisse[0]
  assert.equal(e.email, 'kim@kunden.invalid')
  assert.equal(e.art, 'hart')
  assert.equal(e.status, '5.1.1')
  assert.equal(e.quelle, 'zustellbericht')
  assert.match(e.grund, /User unknown/, 'gefaltete Kopfzeile wird zusammengesetzt')
  assert.ok(e.grund.length <= 160)
})

test('base64-kodierter Zustellbericht mit Verzögerung: nur vorübergehend', () => {
  const [e] = lesen(fixture('dsn-verzoegert-base64.eml')).ergebnisse
  assert.equal(e.email, 'lou@kunden.invalid')
  assert.equal(e.art, 'weich')
  assert.equal(e.status, '4.4.7')
})

test('mehrere Empfänger, quoted-printable: voll, Spamverdacht, tot, zugestellt', () => {
  const r = nachAdresse(lesen(fixture('dsn-mehrere-qp.eml')))
  assert.equal(r['voll@kunden.invalid'].art, 'weich', 'Postfach voll sperrt nicht')
  assert.equal(r['spamfilter@kunden.invalid'].art, 'abgelehnt', '5.7.1 sagt etwas über die Mail, nicht über die Adresse')
  assert.match(r['spamfilter@kunden.invalid'].grund, /content restrictions/, 'weiche Zeilenumbrüche aus quoted-printable sind entfernt')
  assert.equal(r['weg@kunden.invalid'].art, 'hart', '5.0.0 mit eindeutigem Text')
  assert.equal(r['zugestellt@kunden.invalid'], undefined, 'Zugestelltes ist kein Rückläufer')
})

test('Beschwerde nach RFC 5965: Empfänger aus der mitgeschickten Originalmail', () => {
  const r = lesen(fixture('arf-beschwerde.eml'), { eigene: EIGENE })
  assert.equal(r.rueckmeldung, true)
  assert.deepEqual(
    r.ergebnisse.map((e) => [e.email, e.art]),
    [['ana@kunden.invalid', 'beschwerde']]
  )
})

test('Klartext-Rückmeldung: Empfänger aus der angehängten Originalmail, Grund aus dem SMTP-Text', () => {
  const r = lesen(fixture('klartext-hart.eml'), { eigene: EIGENE })
  assert.equal(r.rueckmeldung, true)
  assert.deepEqual(
    r.ergebnisse.map((e) => [e.email, e.art, e.status, e.quelle]),
    [['ben@kunden.invalid', 'hart', '5.1.1', 'klartext']]
  )
})

test('Klartext mit X-Failed-Recipients und unklarer Ablehnung: nur gezählt', () => {
  const [e] = lesen(fixture('klartext-kopfzeile.eml')).ergebnisse
  assert.equal(e.email, 'cem@kunden.invalid')
  assert.equal(e.art, 'abgelehnt')
})

test('eine Abwesenheitsnotiz ist keine Rückmeldung', () => {
  const r = lesen(fixture('abwesenheit.eml'), { eigene: EIGENE })
  assert.equal(r.rueckmeldung, false)
  assert.deepEqual(r.ergebnisse, [])
})

test('die eigenen Adressen werden nie als Rückläufer gemeldet', () => {
  const r = lesen(fixture('eigene-adresse.eml'), { eigene: EIGENE })
  assert.equal(r.rueckmeldung, true)
  assert.deepEqual(r.ergebnisse, [])
  assert.equal(lesen(fixture('eigene-adresse.eml')).ergebnisse[0].art, 'hart', 'ohne Ausnahme wäre sie gesperrt worden')
})

test('kaputte und leere Eingaben führen nicht zum Absturz', () => {
  for (const roh of [null, undefined, '', 'kein Kopf', 'Content-Type: multipart/report; boundary=X\n\n--X\nContent-Type: message/delivery-status\nContent-Transfer-Encoding: base64\n\n!!!\n--X--']) {
    const r = lesen(roh)
    assert.ok(Array.isArray(r.ergebnisse))
  }
  // Ein sehr großer Anhang wird nicht ganz gelesen
  const riesig = fixture('dsn-hart.eml') + 'x'.repeat(ruecklaeufer.MAX_QUELLE * 2)
  assert.equal(lesen(riesig).ergebnisse[0].art, 'hart')
})

test('einordnen: im Zweifel nicht sperren', () => {
  const faelle = [
    [{ aktion: 'failed', status: '5.1.1' }, 'hart'],
    [{ aktion: 'failed', status: '5.1.10' }, 'hart'],
    [{ aktion: 'failed', status: '5.2.1' }, 'hart'],
    [{ aktion: 'failed', status: '5.4.4' }, 'hart'],
    [{ aktion: 'failed', status: '5.2.2' }, 'weich'],
    [{ aktion: 'failed', status: '5.7.1', diagnose: '550 5.7.1 spam detected' }, 'abgelehnt'],
    [{ aktion: 'failed', status: '5.7.1', diagnose: '550 5.7.1 Recipient address rejected: user unknown' }, 'hart'],
    [{ aktion: 'failed', status: '5.0.0', diagnose: '550 message refused' }, 'abgelehnt'],
    [{ aktion: 'delayed', status: '4.4.1' }, 'weich'],
    [{ aktion: 'failed', status: '4.2.0' }, 'weich'],
    [{ diagnose: '550 No such user here' }, 'hart'],
    [{ diagnose: '451 Greylisted, please try again' }, 'weich'],
    [{ diagnose: 'irgendetwas ohne Code' }, 'unbekannt'],
    [{ aktion: 'delivered', status: '2.0.0' }, 'keine']
  ]
  for (const [eingabe, art] of faelle) assert.equal(einordnen(eingabe).art, art, JSON.stringify(eingabe))
})

// ── Anwenden ──

const kontakt = (email, extra = {}) => ({ email, vorname: '', nachname: '', quelle: 'shopify', zustand: 'SUBSCRIBED', zustimmungAm: '2026-01-01', gesperrt: false, ...extra })

test('anwenden sperrt tote Adressen und Beschwerden mit eigener Art und zählt den Rest', () => {
  const liste = [kontakt('kim@kunden.invalid'), kontakt('ana@kunden.invalid'), kontakt('lou@kunden.invalid'), kontakt('cem@kunden.invalid')]
  const vorher = JSON.stringify(liste)
  const r = anwenden(
    liste,
    [
      { email: 'kim@kunden.invalid', art: 'hart', status: '5.1.1', grund: 'Adresse gibt es nicht (mehr)', quelle: 'zustellbericht' },
      { email: 'ana@kunden.invalid', art: 'beschwerde', status: null, grund: 'als Spam gemeldet', quelle: 'beschwerde' },
      { email: 'lou@kunden.invalid', art: 'weich', status: '4.4.7', grund: 'vorübergehend' },
      { email: 'cem@kunden.invalid', art: 'abgelehnt', status: null, grund: 'abgelehnt' },
      { email: 'cem@kunden.invalid', art: 'abgelehnt', status: null, grund: 'abgelehnt' },
      { email: 'fremd@kunden.invalid', art: 'hart', status: '5.1.1', grund: 'tot' },
      { email: 'kim@kunden.invalid', art: 'unbekannt', grund: '?' }
    ],
    { jetzt: JETZT }
  )
  assert.equal(JSON.stringify(liste), vorher, 'die übergebene Liste bleibt unverändert')
  const k = Object.fromEntries(r.liste.map((x) => [x.email, x]))
  assert.equal(k['kim@kunden.invalid'].gesperrt, true)
  assert.equal(k['kim@kunden.invalid'].sperrArt, 'ruecklaeufer')
  assert.match(k['kim@kunden.invalid'].gesperrtGrund, /^Rückläufer: .*5\.1\.1/)
  assert.equal(k['ana@kunden.invalid'].sperrArt, 'beschwerde')
  assert.equal(k['lou@kunden.invalid'].gesperrt, false)
  assert.equal(k['lou@kunden.invalid'].ruecklaeufer.weich, 1)
  assert.equal(k['cem@kunden.invalid'].ruecklaeufer.abgelehnt, 2)
  assert.equal(r.gesperrt, 2)
  assert.equal(r.gezaehlt, 3)
  assert.equal(r.unbekannt, 1, 'Adressen außerhalb der Liste werden nur gezählt')
  assert.equal(r.ereignisse.length, 5, 'unbekannte Arten und fremde Adressen erzeugen keinen Eintrag')
})

test('eine bestehende Abmeldung bleibt eine Abmeldung', () => {
  const liste = [kontakt('kim@kunden.invalid', { gesperrt: true, gesperrtGrund: 'Abmeldung per Mail', gesperrtAm: 5 })]
  const r = anwenden(liste, [{ email: 'kim@kunden.invalid', art: 'hart', status: '5.1.1', grund: 'tot' }], { jetzt: JETZT })
  assert.equal(r.liste[0].gesperrtGrund, 'Abmeldung per Mail')
  assert.equal(r.liste[0].sperrArt, undefined)
  assert.equal(r.gesperrt, 0)
})

test('kein Sync und kein Import hebt eine Rückläufer-Sperre auf; Freigeben schon', () => {
  const gesperrt = anwenden([kontakt('kim@kunden.invalid')], [{ email: 'kim@kunden.invalid', art: 'hart', status: '5.1.1', grund: 'tot' }], { jetzt: JETZT }).liste
  const sync = kontakte.zusammenfuehren(gesperrt, [{ email: 'kim@kunden.invalid', zustand: 'SUBSCRIBED', zustimmungAm: '2026-02-01', quelle: 'shopify' }])
  assert.equal(sync.liste[0].gesperrt, true)
  assert.equal(sync.gesperrtGelassen, 1)
  assert.equal(kontakte.empfaenger(sync.liste).length, 0)
  const frei = kontakte.freigeben(sync.liste, 'kim@kunden.invalid').liste[0]
  assert.equal(frei.gesperrt, false)
  assert.equal(frei.sperrArt, null)
  assert.equal(kontakte.stand(gesperrt).ruecklaeufer, 1)
})

test('Rückläufer zählen nicht als Abmeldung nach einer Kampagne, Beschwerden schon', () => {
  const kampagnen = [{ id: 'k1', gestartetAm: JETZT, fertigAm: JETZT + 1000 }]
  const liste = [
    kontakt('a@kunden.invalid', { gesperrt: true, gesperrtAm: JETZT + 10, sperrArt: 'ruecklaeufer' }),
    kontakt('b@kunden.invalid', { gesperrt: true, gesperrtAm: JETZT + 10, sperrArt: 'beschwerde' }),
    kontakt('c@kunden.invalid', { gesperrt: true, gesperrtAm: JETZT + 10 })
  ]
  assert.equal(ergebnisse.abmeldungenNachVersand(kampagnen, liste).k1, 2)
})

test('ereignisseMerken hängt vorn an und schneidet hinten ab', () => {
  const alt = Array.from({ length: MAX_EREIGNISSE }, (_, i) => ({ am: i, email: `x${i}@kunden.invalid` }))
  const neu = ereignisseMerken(alt, [{ am: 999, email: 'neu@kunden.invalid' }])
  assert.equal(neu.length, MAX_EREIGNISSE)
  assert.equal(neu[0].email, 'neu@kunden.invalid')
  assert.deepEqual(ereignisseMerken(null, null), [])
})

test('ueberspringen schließt einen offenen Eintrag ohne Versuch ab', () => {
  const [e] = ws.einreihen([], [{ kampagneId: 'k1', an: 'kim@kunden.invalid' }], { jetzt: JETZT }).liste
  const [x] = ws.ueberspringen([e], e.id, 'Empfänger inzwischen gesperrt', JETZT)
  assert.equal(x.zustand, 'abgelaufen')
  assert.equal(x.versuche, 0)
  assert.match(x.letzterFehler, /gesperrt/)
})

// ── IMAP ──

function imapErsatz(mails = []) {
  const protokoll = { geoeffnet: [], markiert: [], fetchOptionen: null }
  const client = {
    mailbox: { exists: mails.length },
    async connect() {},
    async getMailboxLock(ordner) {
      protokoll.geoeffnet.push(ordner)
      return { release() {} }
    },
    async *fetch(suche, optionen) {
      protokoll.suche = suche
      protokoll.fetchOptionen = optionen
      for (const [i, quelle] of mails.entries()) yield { uid: 100 + i, source: Buffer.from(quelle) }
    },
    async messageFlagsAdd(bereich, flags) {
      protokoll.markiert.push({ bereich, flags })
    },
    async logout() {}
  }
  return { protokoll, erzeuger: () => client }
}

test('der Rückläufer-Ordner darf nicht die INBOX sein', async () => {
  assert.equal(imap.rueckEinstellungenPruefen({ ordner: 'inbox' }).ok, false)
  assert.equal(imap.rueckEinstellungenPruefen({}).wert.ordner, imap.RUECK_ORDNER_STANDARD)
  const { protokoll, erzeuger } = imapErsatz()
  const r = await imap.ruecklaeuferHolen({ zugang: { benutzer: 'info@beispiel.invalid' }, passwort: 'x', einstellungen: { ordner: 'INBOX' }, erzeuger })
  assert.equal(r.ok, false)
  assert.deepEqual(protokoll.geoeffnet, [], 'nicht einmal geöffnet')
})

test('ruecklaeuferHolen liest nur Ungelesenes und nur den Anfang jeder Mail', async () => {
  const { protokoll, erzeuger } = imapErsatz([fixture('dsn-hart.eml')])
  const r = await imap.ruecklaeuferHolen({ zugang: { benutzer: 'info@beispiel.invalid' }, passwort: 'x', einstellungen: {}, erzeuger })
  assert.equal(r.ok, true)
  assert.deepEqual(protokoll.suche, { seen: false })
  assert.ok(protokoll.fetchOptionen.source.maxLength > 0)
  assert.deepEqual(protokoll.geoeffnet, ['Ruecklaeufer'])
  assert.match(r.mails[0].quelle, /delivery-status/)
})

// ── Zusammenspiel in haupt.js ──

const require = createRequire(import.meta.url)
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
const gesendet = []
ersatz(require.resolve('nodemailer'), {
  createTransport: () => ({
    sendMail: async (mail) => {
      gesendet.push(mail.to)
      return { messageId: 'x' }
    },
    close() {}
  })
})
const { default: starten } = await import('../plugins/newsletter/haupt.js')

function hauptStarten(mails, warteschlange = []) {
  let daten = {
    zugang: { benutzer: 'info@beispiel.invalid', passwortVerschluesselt: Buffer.from('test:nur-ein-test-passwort').toString('base64') },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.invalid', farben: {} },
    shopify: { shop: 'beispielshop.myshopify.com', tokenVerschluesselt: Buffer.from('test:shpat_nur_ein_test_token_abcdefghij').toString('base64') },
    kontakte: [
      kontakt('kim@kunden.invalid', { shopifyId: 'gid://shopify/Customer/1' }),
      kontakt('lou@kunden.invalid'),
      kontakt('ana@kunden.invalid', { shopifyId: 'gid://shopify/Customer/2' })
    ],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange
  }
  const shopifyAufrufe = []
  const { protokoll, erzeuger } = imapErsatz(mails)
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
    protokollOrdner: fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-newsletter-ruecklaeufer-')),
    imapErzeuger: erzeuger,
    abrufen: async (url) => {
      shopifyAufrufe.push(String(url))
      return { ok: false, status: 500, json: async () => ({}) }
    }
  })
  return { fn, daten: () => daten, protokoll, shopifyAufrufe }
}

test('ein Durchgang sperrt tote Adressen und Beschwerden, zählt Verzögerungen und schreibt nichts zu Shopify', async () => {
  const h = hauptStarten([fixture('dsn-hart.eml'), fixture('dsn-verzoegert-base64.eml'), fixture('arf-beschwerde.eml'), fixture('abwesenheit.eml'), fixture('eigene-adresse.eml')])
  const r = await h.fn.ruecklaeuferPruefen()
  assert.equal(r.ok, true, r.text)
  assert.equal(r.gelesen, 5)
  assert.equal(r.gesperrt, 2)
  assert.equal(r.gezaehlt, 1)
  const k = Object.fromEntries(h.daten().kontakte.map((x) => [x.email, x]))
  assert.equal(k['kim@kunden.invalid'].sperrArt, 'ruecklaeufer')
  assert.equal(k['ana@kunden.invalid'].sperrArt, 'beschwerde')
  assert.equal(k['lou@kunden.invalid'].gesperrt, false)
  assert.equal(k['lou@kunden.invalid'].ruecklaeufer.weich, 1)
  assert.deepEqual(h.shopifyAufrufe, [], 'eine Rückläufer-Sperre ändert die Zustimmung bei Shopify nicht')
  assert.deepEqual(h.protokoll.markiert.map((m) => m.bereich.uid), ['100,101,102,103,104'], 'alles Gelesene wird markiert')
  assert.match(r.text, /1 waren keine Rückmeldung/)
  assert.equal(h.daten().ruecklaeufer.length, 3)
  assert.match(h.daten().einstellungen.ruecklaeufer.letzterText, /2 gesperrt/)

  const gelesen = h.fn.ruecklaeuferLesen()
  assert.equal(gelesen.gesperrt, 1)
  assert.equal(gelesen.beschwerden, 1)
  assert.equal(gelesen.mitWeichen, 1)
  assert.equal(gelesen.letzte.some((e) => e.an.includes('kim@')), false, 'die Oberfläche bekommt Adressen nur gekürzt')
})

test('eine wartende Kampagnenmail an eine inzwischen gesperrte Adresse geht nicht raus', async () => {
  const [e] = ws.einreihen([], [{ kampagneId: 'k1', an: 'kim@kunden.invalid', betreff: 'Neu', html: '<p>x</p>' }]).liste
  const h = hauptStarten([fixture('dsn-hart.eml')], [e])
  await h.fn.ruecklaeuferPruefen()
  gesendet.length = 0
  const r = await h.fn.warteschlangeSchritt()
  assert.equal(r.uebersprungen, true)
  assert.deepEqual(gesendet, [], 'kein SMTP-Aufruf')
  assert.equal(h.daten().warteschlange[0].zustand, 'abgelaufen')
  assert.match(h.daten().warteschlange[0].letzterFehler, /Rückläufer/)
})

test('Testmails gehen auch ohne Kontakt raus', async () => {
  const [e] = ws.einreihen([], [{ an: 'info@beispiel.invalid', betreff: 'Probe', html: '<p>x</p>', art: 'test' }]).liste
  const h = hauptStarten([], [e])
  gesendet.length = 0
  const r = await h.fn.warteschlangeSchritt()
  assert.equal(r.gesendet, true, JSON.stringify(r))
  assert.deepEqual(gesendet, ['info@beispiel.invalid'])
})

test('Löschen eines Kontakts entfernt auch seine Rückläufer-Einträge', async () => {
  const h = hauptStarten([fixture('dsn-hart.eml'), fixture('dsn-verzoegert-base64.eml')])
  await h.fn.ruecklaeuferPruefen()
  assert.equal(h.daten().ruecklaeufer.length, 2)
  assert.equal(h.fn.kontaktLoeschen({ email: 'kim@kunden.invalid' }).ok, true)
  assert.deepEqual(
    h.daten().ruecklaeufer.map((x) => x.email),
    ['lou@kunden.invalid']
  )
})

test('Einstellungen: INBOX wird abgelehnt, ein eigener Ordner gespeichert', () => {
  const h = hauptStarten([])
  assert.equal(h.fn.ruecklaeuferEinstellen({ ordner: 'INBOX', aktiv: true }).ok, false)
  assert.equal(h.fn.ruecklaeuferEinstellen({ ordner: 'Rueckmeldungen', aktiv: true }).ok, true)
  const r = h.fn.ruecklaeuferLesen()
  assert.equal(r.ordner, 'Rueckmeldungen')
  assert.equal(r.aktiv, true)
  assert.equal(r.host, 'imap.ionos.de', 'Server wie bei den Abmeldungen')
})
