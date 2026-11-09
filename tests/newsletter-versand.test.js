// Newsletter-Plugin, Phase 1: Mail bauen, Textteil ableiten, Protokoll schreiben und lesen.
// Es wird nie eine SMTP-Verbindung aufgebaut und nie eine Mail versendet. Das Protokoll
// schreibt in einen frischen Ordner unter dem Temp-Verzeichnis, nicht in daten/.

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mailModul from '../plugins/newsletter/mail.js'
import protokollModul from '../plugins/newsletter/protokoll.js'
import smtpModul from '../plugins/newsletter/smtp.js'

const { textAusHtml, mailBauen } = mailModul
const { protokollZeile, protokollSchreiben, protokollLesen, protokollDatei } = protokollModul
const { smtpFehlerText } = smtpModul

const ZUGANG = { benutzer: 'info@beispiel.de', absenderName: 'Beispiel Versand', host: 'smtp.ionos.de', port: 465 }
const MIT_ABMELDUNG = '<p>Hallo</p><p><a href="mailto:info@beispiel.de?subject=Abmeldung">Abmelden</a></p>'

function tempOrdner() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-newsletter-test-'))
}

// ── Textteil ableiten ──

test('textAusHtml macht aus Absätzen und Umbrüchen lesbaren Text', () => {
  const text = textAusHtml('<p>Hallo Felix</p><p>Zweiter Absatz<br>mit Umbruch</p>')
  assert.equal(text, 'Hallo Felix\n\nZweiter Absatz\nmit Umbruch')
})

test('textAusHtml schreibt die Adresse eines Links mit', () => {
  assert.equal(textAusHtml('<a href="https://beispiel.de/shop">Zum Shop</a>'), 'Zum Shop (https://beispiel.de/shop)')
  assert.equal(textAusHtml('<a href="mailto:info@beispiel.de">Abmelden</a>'), 'Abmelden (info@beispiel.de)')
})

test('textAusHtml wirft Skripte, Styles und Kommentare weg', () => {
  const text = textAusHtml('<style>p{color:red}</style><script>alert(1)</script><!-- Notiz --><p>Inhalt</p>')
  assert.equal(text, 'Inhalt')
})

test('textAusHtml löst Entities auf und macht aus Listen Striche', () => {
  assert.equal(textAusHtml('<ul><li>Eins</li><li>Zwei &amp; Drei</li></ul>'), '- Eins\n\n- Zwei & Drei')
  assert.equal(textAusHtml('<p>5&nbsp;Euro &lt;netto&gt;</p>'), '5 Euro <netto>')
})

test('textAusHtml verträgt leere Eingaben', () => {
  assert.equal(textAusHtml(''), '')
  assert.equal(textAusHtml(null), '')
  assert.equal(textAusHtml(undefined), '')
})

// ── Mail bauen ──

test('mailBauen baut eine Testmail mit Absendername und abgeleitetem Textteil', () => {
  const e = mailBauen({ art: 'test', an: ' Felix@Beispiel.DE ', betreff: 'Testmail', html: '<p>Hallo</p>', zugang: ZUGANG })
  assert.equal(e.ok, true)
  assert.deepEqual(e.mail.from, { name: 'Beispiel Versand', address: 'info@beispiel.de' })
  assert.equal(e.mail.to, 'felix@beispiel.de', 'Empfänger wird getrimmt und kleingeschrieben')
  assert.equal(e.mail.subject, 'Testmail')
  assert.equal(e.mail.html, '<p>Hallo</p>')
  assert.equal(e.mail.text, 'Hallo', 'der Textteil entsteht aus dem HTML')
  assert.equal(e.mail.headers['List-Unsubscribe'], undefined, 'eine Testmail ist keine Werbung')
})

test('mailBauen nimmt einen eigenen Textteil, wenn einer mitkommt', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'B', html: '<p>HTML</p>', text: 'Eigener Text', zugang: ZUGANG })
  assert.equal(e.mail.text, 'Eigener Text')
})

test('mailBauen setzt die Antwortadresse, wenn eine eingestellt ist', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'B', html: '<p>x</p>', zugang: { ...ZUGANG, antwortAn: 'antwort@beispiel.de' } })
  assert.equal(e.mail.replyTo, 'antwort@beispiel.de')
})

test('mailBauen lehnt eine Kampagnenmail ohne Abmeldelink im Inhalt ab', () => {
  const e = mailBauen({ art: 'kampagne', an: 'a@beispiel.de', betreff: 'Angebot', html: '<p>Kauf jetzt</p>', zugang: ZUGANG })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Abmeldelink/)
})

test('mailBauen setzt bei einer Kampagnenmail den List-Unsubscribe-Header', () => {
  const e = mailBauen({ art: 'kampagne', an: 'a@beispiel.de', betreff: 'Angebot', html: MIT_ABMELDUNG, zugang: ZUGANG })
  assert.equal(e.ok, true)
  assert.equal(e.mail.headers['List-Unsubscribe'], '<mailto:info@beispiel.de?subject=Abmeldung>')
})

test('mailBauen nimmt für die Abmeldung eine eigene Adresse, wenn sie mitkommt', () => {
  const e = mailBauen({ art: 'kampagne', an: 'a@beispiel.de', betreff: 'Angebot', html: MIT_ABMELDUNG, zugang: ZUGANG, abmeldeAdresse: 'abmelden@beispiel.de' })
  assert.equal(e.mail.headers['List-Unsubscribe'], '<mailto:abmelden@beispiel.de?subject=Abmeldung>')
})

test('mailBauen lehnt Zeilenumbrüche im Betreff ab (Header-Einschmuggeln)', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'Hallo\r\nBcc: fremd@beispiel.de', html: '<p>x</p>', zugang: ZUGANG })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Betreff darf keinen Zeilenumbruch/)
})

test('mailBauen lehnt Zeilenumbrüche in der Empfängeradresse ab', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de\nBcc: fremd@beispiel.de', betreff: 'B', html: '<p>x</p>', zugang: ZUGANG })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Zeilenumbruch/)
})

test('mailBauen verlangt Empfänger, Betreff und Inhalt', () => {
  assert.match(mailBauen({ art: 'test', betreff: 'B', html: '<p>x</p>', zugang: ZUGANG }).fehler.join(' '), /Empfänger fehlt/)
  assert.match(mailBauen({ art: 'test', an: 'a@beispiel.de', html: '<p>x</p>', zugang: ZUGANG }).fehler.join(' '), /Betreff fehlt/)
  assert.match(mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'B', html: '', zugang: ZUGANG }).fehler.join(' '), /keinen Inhalt/)
})

test('mailBauen begrenzt die Länge des Betreffs', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'x'.repeat(201), html: '<p>x</p>', zugang: ZUGANG })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Betreff ist zu lang/)
})

test('mailBauen lehnt ab, wenn kein Absender-Postfach eingerichtet ist', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'B', html: '<p>x</p>', zugang: {} })
  assert.equal(e.ok, false)
  assert.match(e.fehler.join(' '), /Absender-Postfach/)
})

test('mailBauen lässt den Absendernamen weg, wenn keiner eingestellt ist', () => {
  const e = mailBauen({ art: 'test', an: 'a@beispiel.de', betreff: 'B', html: '<p>x</p>', zugang: { benutzer: 'info@beispiel.de' } })
  assert.equal(e.mail.from, 'info@beispiel.de')
})

// ── Protokoll ──

test('protokollZeile kürzt die Adresse und führt keinen Mailtext', () => {
  const zeile = protokollZeile({ an: 'felix@beispiel.de', betreff: 'Angebot', ok: true, zeit: new Date('2026-11-09T10:00:00Z') })
  assert.equal(zeile.an, 'f***@beispiel.de')
  assert.equal(zeile.betreff, 'Angebot')
  assert.equal(zeile.ok, true)
  assert.equal(zeile.fehler, null)
  assert.ok(!Object.keys(zeile).some((k) => /html|text|inhalt/i.test(k)), 'kein Feld für den Mailtext')
})

test('protokollZeile kappt sehr lange Betreffs und Fehlertexte', () => {
  const zeile = protokollZeile({ an: 'a@beispiel.de', betreff: 'x'.repeat(400), ok: false, fehler: 'y'.repeat(400) })
  assert.equal(zeile.betreff.length, 200)
  assert.equal(zeile.fehler.length, 200)
})

test('protokollDatei benennt die Datei nach dem Monat', () => {
  const datei = protokollDatei('/irgendwo', new Date('2026-03-04T12:00:00Z'))
  assert.equal(path.basename(datei), 'protokoll-2026-03.ndjson')
})

test('protokollSchreiben legt den Ordner an und hängt eine Zeile an', () => {
  const ordner = tempOrdner()
  try {
    const unterordner = path.join(ordner, 'neu')
    protokollSchreiben({ an: 'a@beispiel.de', betreff: 'Erste', ok: true }, unterordner)
    protokollSchreiben({ an: 'b@beispiel.de', betreff: 'Zweite', ok: false, fehler: 'EAUTH' }, unterordner)
    const datei = protokollDatei(unterordner)
    const zeilen = fs.readFileSync(datei, 'utf8').split('\n').filter(Boolean)
    assert.equal(zeilen.length, 2)
    assert.equal(JSON.parse(zeilen[0]).betreff, 'Erste')
    assert.equal(JSON.parse(zeilen[1]).fehler, 'EAUTH')
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true })
  }
})

test('protokollSchreiben wirft nicht, wenn der Pfad nicht beschreibbar ist', () => {
  const ordner = tempOrdner()
  try {
    // Eine Datei dort, wo der Ordner sein müsste: mkdir muss scheitern
    const datei = path.join(ordner, 'blockiert')
    fs.writeFileSync(datei, 'x', 'utf8')
    assert.equal(protokollSchreiben({ an: 'a@beispiel.de', betreff: 'B', ok: true }, datei), null)
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true })
  }
})

test('protokollLesen gibt die neuesten Einträge zuerst und hält die Anzahl ein', () => {
  const ordner = tempOrdner()
  try {
    for (const betreff of ['A', 'B', 'C']) protokollSchreiben({ an: 'a@beispiel.de', betreff, ok: true }, ordner)
    const alle = protokollLesen({ ordner, anzahl: 50 })
    assert.deepEqual(alle.map((e) => e.betreff), ['C', 'B', 'A'])
    assert.equal(protokollLesen({ ordner, anzahl: 2 }).length, 2)
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true })
  }
})

test('protokollLesen überspringt kaputte Zeilen und fremde Dateien', () => {
  const ordner = tempOrdner()
  try {
    protokollSchreiben({ an: 'a@beispiel.de', betreff: 'Gut', ok: true }, ordner)
    fs.appendFileSync(protokollDatei(ordner), 'das ist kein JSON\n', 'utf8')
    fs.writeFileSync(path.join(ordner, 'notizen.txt'), 'nichts', 'utf8')
    const alle = protokollLesen({ ordner, anzahl: 50 })
    assert.equal(alle.length, 1)
    assert.equal(alle[0].betreff, 'Gut')
  } finally {
    fs.rmSync(ordner, { recursive: true, force: true })
  }
})

test('protokollLesen gibt eine leere Liste, wenn es noch nichts gibt', () => {
  assert.deepEqual(protokollLesen({ ordner: path.join(os.tmpdir(), 'vendo-newsletter-gibt-es-nicht'), anzahl: 10 }), [])
})

// ── Fehlertexte ──

test('smtpFehlerText erkennt das Stundenlimit des Postfachs', () => {
  const text = smtpFehlerText({ response: '450 Mail send limit exceeded' })
  assert.match(text, /Stundenlimit/)
})
