// Newsletter-Plugin: Abmeldungen aus dem Postfach lesen.
// Geprüft wird, welche Mail als Abmeldung zählt, wie der Absender gelesen wird, dass nur der
// eingestellte Ordner angefasst und nichts gelöscht wird, und wie Fehler übersetzt werden.
// Es wird nie eine echte IMAP-Verbindung aufgebaut: der Client ist ein Ersatz.

import assert from 'node:assert/strict'
import test from 'node:test'
import imap from '../plugins/newsletter/imap.js'

const { abmeldungenHolen, alsGelesenMarkieren, verbindungPruefen, einstellungenPruefen, absenderAus, istAbmeldung, fehlerText, istInbox, ORDNER_STANDARD, IMAP_STANDARD } = imap

const ZUGANG = { benutzer: 'info@beispiel.de' }

function umschlag(adresse, betreff, datum = '2026-11-09T10:00:00Z') {
  return { from: [{ address: adresse }], subject: betreff, date: datum }
}

// Ein IMAP-Client-Ersatz: merkt sich, was aufgerufen wurde
function clientErsatz({ nachrichten = [], fehlerBei = null, mailboxAnzahl = 3 } = {}) {
  const protokoll = { verbunden: 0, geoeffnet: [], freigegeben: 0, abgemeldet: 0, markiert: [] }
  const client = {
    mailbox: { exists: mailboxAnzahl },
    async connect() {
      protokoll.verbunden++
      if (fehlerBei === 'connect') throw new Error('Invalid credentials (Failure)')
    },
    async getMailboxLock(ordner) {
      protokoll.geoeffnet.push(ordner)
      if (fehlerBei === 'ordner') throw new Error('Mailbox doesn\'t exist: Abmeldungen')
      return { release: () => protokoll.freigegeben++ }
    },
    async *fetch(suche, optionen) {
      protokoll.suche = suche
      protokoll.fetchOptionen = optionen
      for (const n of nachrichten) yield n
    },
    async messageFlagsAdd(bereich, flags, optionen) {
      protokoll.markiert.push({ bereich, flags, optionen })
      if (fehlerBei === 'markieren') throw new Error('kaputt')
      return true
    },
    async logout() {
      protokoll.abgemeldet++
    }
  }
  return { client, protokoll, erzeuger: () => client }
}

// ── Absender und Erkennung ──

test('absenderAus liest die Adresse und schreibt sie klein', () => {
  assert.equal(absenderAus(umschlag('Anna.Beispiel@Beispiel.DE', 'Abmeldung')), 'anna.beispiel@beispiel.de')
  assert.equal(absenderAus({ sender: [{ address: 'bo@beispiel.de' }] }), 'bo@beispiel.de', 'Rückfall auf sender')
})

test('absenderAus lehnt unbrauchbare Absender ab', () => {
  assert.equal(absenderAus({}), null)
  assert.equal(absenderAus(null), null)
  assert.equal(absenderAus(umschlag('keine-adresse', 'x')), null)
})

test('im eigenen Ordner zählt jede Mail, in der INBOX nur passende Betreffs', () => {
  assert.equal(istAbmeldung({ betreff: 'Re: Lieferung', eigenerOrdner: true }), true, 'der Ordner ist die Vorauswahl')

  assert.equal(istAbmeldung({ betreff: 'Abmeldung', eigenerOrdner: false }), true)
  assert.equal(istAbmeldung({ betreff: 'unsubscribe please', eigenerOrdner: false }), true)
  assert.equal(istAbmeldung({ betreff: 'Bitte austragen', eigenerOrdner: false }), true)
  assert.equal(istAbmeldung({ betreff: 'Frage zur Lieferung', eigenerOrdner: false }), false, 'Kundenmails bleiben unangetastet')
})

test('istInbox erkennt das Hauptpostfach, Schreibweise egal', () => {
  assert.equal(istInbox('INBOX'), true)
  assert.equal(istInbox('inbox'), true)
  assert.equal(istInbox('Abmeldungen'), false)
})

// ── Einstellungen ──

test('einstellungenPruefen füllt die Standardwerte auf', () => {
  const e = einstellungenPruefen({})
  assert.equal(e.ok, true)
  assert.equal(e.wert.ordner, ORDNER_STANDARD)
  assert.equal(e.wert.host, IMAP_STANDARD.host)
  assert.equal(e.wert.port, IMAP_STANDARD.port)
  assert.equal(e.wert.aktiv, false)
})

test('einstellungenPruefen lehnt kaputte Angaben ab', () => {
  assert.match(einstellungenPruefen({ ordner: 'a\nb' }).fehler.join(' '), /Zeilenumbruch/)
  assert.match(einstellungenPruefen({ host: 'kein server' }).fehler.join(' '), /Posteingangsserver/)
  assert.match(einstellungenPruefen({ port: 0 }).fehler.join(' '), /Port/)
})

// ── Abmeldungen holen ──

test('abmeldungenHolen liest ungelesene Mails aus dem eingestellten Ordner', async () => {
  const { protokoll, erzeuger } = clientErsatz({
    nachrichten: [
      { uid: 11, envelope: umschlag('anna@beispiel.de', 'Abmeldung') },
      { uid: 12, envelope: umschlag('bo@beispiel.de', 'Newsletter abbestellen') }
    ]
  })
  const e = await abmeldungenHolen({ zugang: ZUGANG, passwort: 'x', einstellungen: { ordner: 'Abmeldungen' }, erzeuger })

  assert.equal(e.ok, true)
  assert.deepEqual(e.abmeldungen.map((a) => a.email), ['anna@beispiel.de', 'bo@beispiel.de'])
  assert.deepEqual(e.abmeldungen.map((a) => a.uid), [11, 12])
  assert.deepEqual(protokoll.geoeffnet, ['Abmeldungen'], 'nur dieser Ordner wird geöffnet')
  assert.deepEqual(protokoll.suche, { seen: false }, 'nur ungelesene')
  assert.equal(protokoll.freigegeben, 1, 'die Sperre wird freigegeben')
  assert.equal(protokoll.abgemeldet, 1, 'die Verbindung wird geschlossen')
})

test('in der INBOX werden Kundenmails übersprungen', async () => {
  const { erzeuger } = clientErsatz({
    nachrichten: [
      { uid: 1, envelope: umschlag('kunde@beispiel.de', 'Frage zur Lieferung') },
      { uid: 2, envelope: umschlag('weg@beispiel.de', 'Abmeldung') }
    ]
  })
  const e = await abmeldungenHolen({ zugang: ZUGANG, passwort: 'x', einstellungen: { ordner: 'INBOX' }, erzeuger })
  assert.deepEqual(e.abmeldungen.map((a) => a.email), ['weg@beispiel.de'])
})

test('Mails ohne brauchbaren Absender werden übergangen', async () => {
  const { erzeuger } = clientErsatz({ nachrichten: [{ uid: 5, envelope: { subject: 'Abmeldung' } }] })
  const e = await abmeldungenHolen({ zugang: ZUGANG, passwort: 'x', einstellungen: {}, erzeuger })
  assert.equal(e.ok, true)
  assert.equal(e.abmeldungen.length, 0)
})

test('abmeldungenHolen hält die Obergrenze ein', async () => {
  const viele = Array.from({ length: 50 }, (_, i) => ({ uid: i + 1, envelope: umschlag(`p${i}@beispiel.de`, 'Abmeldung') }))
  const { erzeuger } = clientErsatz({ nachrichten: viele })
  const e = await abmeldungenHolen({ zugang: ZUGANG, passwort: 'x', einstellungen: {}, erzeuger, grenze: 10 })
  assert.equal(e.abmeldungen.length, 10)
})

test('abmeldungenHolen gibt Fehler verständlich zurück und gibt die Sperre trotzdem frei', async () => {
  const anmeldung = clientErsatz({ fehlerBei: 'connect' })
  const e1 = await abmeldungenHolen({ zugang: ZUGANG, passwort: 'x', einstellungen: {}, erzeuger: anmeldung.erzeuger })
  assert.equal(e1.ok, false)
  assert.match(e1.fehler, /Anmeldung abgelehnt/)

  const ordner = clientErsatz({ fehlerBei: 'ordner' })
  const e2 = await abmeldungenHolen({ zugang: ZUGANG, passwort: 'x', einstellungen: { ordner: 'Abmeldungen' }, erzeuger: ordner.erzeuger })
  assert.equal(e2.ok, false)
  assert.match(e2.fehler, /Ordner gibt es im Postfach nicht/)
  assert.equal(ordner.protokoll.abgemeldet, 1, 'auch im Fehlerfall wird abgemeldet')
})

// ── Als gelesen markieren ──

test('alsGelesenMarkieren setzt nur das Gelesen-Zeichen, löscht nichts', async () => {
  const { protokoll, erzeuger } = clientErsatz()
  const e = await alsGelesenMarkieren({ zugang: ZUGANG, passwort: 'x', einstellungen: { ordner: 'Abmeldungen' }, uids: [11, 12], erzeuger })

  assert.equal(e.ok, true)
  assert.equal(e.markiert, 2)
  assert.equal(protokoll.markiert.length, 1)
  assert.deepEqual(protokoll.markiert[0].flags, ['\\Seen'], 'nur \\Seen, kein \\Deleted')
  assert.equal(protokoll.markiert[0].bereich.uid, '11,12')
})

test('alsGelesenMarkieren verträgt eine leere Liste und baut dafür keine Verbindung auf', async () => {
  const { protokoll, erzeuger } = clientErsatz()
  const e = await alsGelesenMarkieren({ zugang: ZUGANG, passwort: 'x', uids: [], erzeuger })
  assert.equal(e.ok, true)
  assert.equal(protokoll.verbunden, 0)
})

test('alsGelesenMarkieren wirft bei einem Fehler nicht, sondern meldet ihn', async () => {
  const { erzeuger } = clientErsatz({ fehlerBei: 'markieren' })
  const e = await alsGelesenMarkieren({ zugang: ZUGANG, passwort: 'x', uids: [1], erzeuger })
  assert.equal(e.ok, false)
  assert.ok(e.fehler)
})

// ── Verbindung prüfen ──

test('verbindungPruefen meldet den geöffneten Ordner mit Anzahl', async () => {
  const { erzeuger } = clientErsatz({ mailboxAnzahl: 7 })
  const e = await verbindungPruefen({ zugang: ZUGANG, passwort: 'x', einstellungen: { ordner: 'Abmeldungen' }, erzeuger })
  assert.equal(e.ok, true)
  assert.match(e.text, /Abmeldungen/)
  assert.match(e.text, /7 Mails/)
})

test('verbindungPruefen warnt, wenn die INBOX eingestellt ist', async () => {
  const { erzeuger } = clientErsatz()
  const e = await verbindungPruefen({ zugang: ZUGANG, passwort: 'x', einstellungen: { ordner: 'INBOX' }, erzeuger })
  assert.match(e.text, /Kundenmails/)
})

// ── Fehlertexte ──

test('fehlerText übersetzt die häufigen Fälle', () => {
  assert.match(fehlerText(new Error('Invalid credentials')), /Anmeldung abgelehnt/)
  assert.match(fehlerText(new Error('Mailbox doesn\'t exist')), /Ordner gibt es/)
  assert.match(fehlerText(new Error('getaddrinfo ENOTFOUND imap.beispiel.de')), /nicht gefunden/)
  assert.match(fehlerText(new Error('ETIMEDOUT')), /Keine Verbindung/)
  assert.equal(typeof fehlerText(new Error('irgendwas')), 'string')
})
