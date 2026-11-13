// Newsletter-Plugin: Kampagnen-Entwürfe der KI auch als .html-Datei.
// Geprüft wird der Abgleich in beide Richtungen (Vendo → Datei, Datei → Vendo), dass nur
// Kampagnen-Entwürfe einer KI im Ordner liegen (keine Vorlagen, Muster, Automationen oder
// Kampagnen von Felix), dass eine geplante Kampagne ihre Datei verliert, leere Dateien
// abgelehnt werden, der Gleichzeitig-geändert-Fall und dass Vendo nur eigene Dateien
// wegräumt. Alles in frischen Ordnern unter dem Temp-Verzeichnis, alle Daten erfunden;
// es wird nie eine SMTP- oder Shopify-Verbindung aufgebaut.

import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import modul from '../plugins/newsletter/entwurfsdateien.js'
import starten from '../plugins/newsletter/haupt.js'

const { abgleichen, dateiName, dateiText, ohneKopf, STAND_DATEI } = modul

const ordnerNeu = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `vendo-newsletter-${name}-`))
const lesen = (ordner, datei) => fs.readFileSync(path.join(ordner, datei), 'utf8')
// Eine Änderung „später“ als Vendos letzte: die Dateizeit ausdrücklich nach vorn setzen
const dateiAendern = (ordner, datei, text, zeit = Date.now() + 5000) => {
  const voll = path.join(ordner, datei)
  fs.writeFileSync(voll, text, 'utf8')
  fs.utimesSync(voll, zeit / 1000, zeit / 1000)
}

const eintrag = (html, mehr = {}) => ({ datei: 'kampagne-k1.html', titel: 'Kampagne „Herbst“', html, aenderbar: true, geaendertAm: 1000, ...mehr })

// ── Modul allein ──

test('Dateinamen nur aus gültigen Kennungen', () => {
  assert.equal(dateiName({ art: 'kampagne', id: 'kabc123' }), 'kampagne-kabc123.html')
  assert.equal(dateiName({ art: 'vorlage', id: 'v1' }), 'vorlage-v1.html')
  assert.equal(dateiName({ art: 'automation', id: 'a1', schritt: 2 }), 'automation-a1-schritt-2.html')
  assert.equal(dateiName({ art: 'kampagne', id: '../boese' }), null)
  assert.equal(dateiName({ art: 'automation', id: 'a1', schritt: 0 }), null)
  assert.equal(dateiName({ art: 'etwas', id: 'x1' }), null)
})

test('der Kopfkommentar gehört nicht zur Mail und kann kein „--“ einschmuggeln', () => {
  const text = dateiText(eintrag('<p>Hallo</p>', { titel: 'Kampagne „a -- b -->“' }))
  assert.match(text, /^<!-- vendo-entwurf:/)
  assert.equal((text.match(/-->/g) || []).length, 1, 'genau ein Kommentarende')
  assert.equal(ohneKopf(text), '<p>Hallo</p>')
  assert.equal(ohneKopf(text.replace(/\n/g, '\r\n')), '<p>Hallo</p>', 'CRLF ist keine Änderung')
})

test('Vendo legt die Datei an und schreibt sie bei jeder Änderung neu', () => {
  const ordner = ordnerNeu('entwurf-a')
  let r = abgleichen([eintrag('<p>eins</p>')], { ordner })
  assert.deepEqual(r.geschrieben, ['kampagne-k1.html'])
  assert.equal(ohneKopf(lesen(ordner, 'kampagne-k1.html')), '<p>eins</p>')

  r = abgleichen([eintrag('<p>eins</p>')], { ordner })
  assert.equal(r.geschrieben.length, 0, 'nichts geändert, nichts geschrieben')

  r = abgleichen([eintrag('<p>zwei</p>', { geaendertAm: 2000 })], { ordner })
  assert.deepEqual(r.geschrieben, ['kampagne-k1.html'])
  assert.equal(ohneKopf(lesen(ordner, 'kampagne-k1.html')), '<p>zwei</p>')

  r = abgleichen([eintrag('<p>zwei</p>', { titel: 'Kampagne „Neuer Name“' })], { ordner })
  assert.deepEqual(r.geschrieben, ['kampagne-k1.html'], 'nur der Kopfkommentar war veraltet')
  assert.match(lesen(ordner, 'kampagne-k1.html'), /Neuer Name/)
})

test('eine Änderung in der Datei wird übernommen, ohne den Kopfkommentar', () => {
  const ordner = ordnerNeu('entwurf-b')
  abgleichen([eintrag('<p>eins</p>')], { ordner })
  const alt = lesen(ordner, 'kampagne-k1.html')
  dateiAendern(ordner, 'kampagne-k1.html', alt.replace('eins', 'von der KI'))

  const erhalten = []
  const r = abgleichen([eintrag('<p>eins</p>')], { ordner, uebernehmen: (e, html) => (erhalten.push(html), { ok: true }) })
  assert.deepEqual(r.uebernommen, ['kampagne-k1.html'])
  assert.deepEqual(erhalten, ['<p>von der KI</p>'])

  // Danach hat Vendo den neuen Inhalt — kein zweites Übernehmen
  const nochmal = abgleichen([eintrag('<p>von der KI</p>', { geaendertAm: Date.now() })], { ordner, uebernehmen: () => assert.fail('nicht nochmal') })
  assert.equal(nochmal.uebernommen.length, 0)
})

test('eine abgelehnte Änderung bleibt stehen, wird gemeldet und nicht jede Sekunde neu versucht', () => {
  const ordner = ordnerNeu('entwurf-c')
  abgleichen([eintrag('<p>eins</p>', { aenderbar: false })], { ordner })
  dateiAendern(ordner, 'kampagne-k1.html', '<p>trotzdem geändert</p>')

  let versuche = 0
  const nein = () => (versuche++, { ok: false, text: 'Die Kampagne ist geplant.' })
  let r = abgleichen([eintrag('<p>eins</p>', { aenderbar: false })], { ordner, uebernehmen: nein })
  assert.equal(r.abgelehnt.length, 1)
  assert.equal(r.offen['kampagne-k1.html'], 'Die Kampagne ist geplant.')
  r = abgleichen([eintrag('<p>eins</p>', { aenderbar: false })], { ordner, uebernehmen: nein })
  assert.equal(versuche, 1, 'kein zweiter Versuch ohne neue Änderung')
  assert.equal(r.offen['kampagne-k1.html'], 'Die Kampagne ist geplant.', 'weiter als offen gemeldet')
  assert.equal(ohneKopf(lesen(ordner, 'kampagne-k1.html')), '<p>trotzdem geändert</p>', 'die Arbeit der KI bleibt in der Datei')
})

test('gleichzeitig geändert: das Jüngere gewinnt, das andere liegt als .verworfen.html daneben', () => {
  const ordner = ordnerNeu('entwurf-d')
  abgleichen([eintrag('<p>eins</p>')], { ordner })
  const frueher = Date.now() - 60000
  dateiAendern(ordner, 'kampagne-k1.html', '<p>KI, älter</p>', frueher)
  const r = abgleichen([eintrag('<p>Felix, neuer</p>', { geaendertAm: Date.now() })], { ordner, uebernehmen: () => assert.fail('Vendo ist jünger') })
  assert.deepEqual(r.verworfen, ['kampagne-k1.verworfen.html'])
  assert.equal(ohneKopf(lesen(ordner, 'kampagne-k1.html')), '<p>Felix, neuer</p>')
  assert.equal(lesen(ordner, 'kampagne-k1.verworfen.html'), '<p>KI, älter</p>')
})

test('weggeräumt wird nur, was Vendo selbst angelegt hat', () => {
  const ordner = ordnerNeu('entwurf-e')
  abgleichen([eintrag('<p>eins</p>')], { ordner })
  fs.writeFileSync(path.join(ordner, 'notizen-der-ki.html'), '<p>meins</p>')
  const r = abgleichen([], { ordner })
  assert.deepEqual(r.geloescht, ['kampagne-k1.html'])
  assert.equal(fs.existsSync(path.join(ordner, 'kampagne-k1.html')), false)
  assert.equal(fs.existsSync(path.join(ordner, 'notizen-der-ki.html')), true)
  assert.deepEqual(JSON.parse(lesen(ordner, STAND_DATEI)).dateien, {})
})

test('der Stand übersteht einen Neustart', () => {
  const ordner = ordnerNeu('entwurf-f')
  abgleichen([eintrag('<p>eins</p>')], { ordner })
  // Neuer Prozess: kein Merker im Speicher, nur die Stand-Datei
  dateiAendern(ordner, 'kampagne-k1.html', '<p>neu</p>')
  const r = abgleichen([eintrag('<p>eins</p>')], { ordner, merker: {}, uebernehmen: () => ({ ok: true }) })
  assert.deepEqual(r.uebernommen, ['kampagne-k1.html'])
})

// ── Im Hintergrundteil, über die Bot-Aufträge ──

function hauptStarten() {
  const entwurfOrdner = ordnerNeu('entwuerfe')
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    marke: { titel: 'Beispielshop', impressum: 'Beispielshop, Musterweg 1', abmeldeAdresse: 'abmelden@beispiel.de', farben: {} },
    shopify: {},
    kontakte: [],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: []
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
    entwurfOrdner,
    protokollOrdner: ordnerNeu('protokoll')
  })
  return {
    fn,
    ordner: entwurfOrdner,
    daten: () => daten,
    setzen: (aenderung) => {
      daten = { ...daten, ...JSON.parse(JSON.stringify(aenderung)) }
    },
    bot: (aktion, argumente = {}) => fn.botAuftrag({ aktion, argumente, von: 'Vala' })
  }
}

const GUT = { name: 'Herbst', betreff: 'Zwei neue Motive', vorschauText: 'Limitiert, schwere Qualität', html: '<p>Hallo {{vorname}}</p>' }

test('ein Kampagnen-Entwurf vom Bot liegt sofort als .html-Datei, und die Antwort nennt sie', async () => {
  const h = hauptStarten()
  const r = await h.bot('kampagne_neu', GUT)
  assert.equal(r.ok, true, r.text)
  assert.ok(r.daten.datei, 'Pfad in der Antwort')
  assert.equal(path.dirname(r.daten.datei), h.ordner)
  assert.match(r.text, /Als Datei: .*kampagne-.*\.html/)
  assert.equal(ohneKopf(fs.readFileSync(r.daten.datei, 'utf8')), '<p>Hallo {{vorname}}</p>')

  const ueberblick = await h.bot('ueberblick')
  assert.equal(ueberblick.daten.entwurfsdateien, h.ordner)
  assert.equal(ueberblick.daten.kampagnen[0].datei, r.daten.datei)
})

test('die KI ändert die Datei — Vendo übernimmt, zieht eine offene Freigabe zurück und meldet es der Ansicht', async () => {
  const h = hauptStarten()
  const { daten: k } = await h.bot('kampagne_neu', GUT)
  const id = k.id
  // Als hätte der Bot sie schon zur Freigabe gegeben
  h.setzen({ kampagnen: h.daten().kampagnen.map((x) => ({ ...x, zustand: 'freigabe', freigabe: { von: 'Vala' } })) })
  const vorher = h.fn.standLesen().stand

  const text = fs.readFileSync(k.datei, 'utf8').replace('Hallo {{vorname}}', 'Moin {{vorname}}, neu aus der Datei')
  dateiAendern(h.ordner, path.basename(k.datei), text)

  const gezeigt = await h.bot('kampagne_zeigen', { id })
  assert.equal(gezeigt.daten.html, '<p>Moin {{vorname}}, neu aus der Datei</p>')
  const gespeichert = h.daten().kampagnen.find((x) => x.id === id)
  assert.equal(gespeichert.zustand, 'entwurf', 'Freigabe zurückgezogen')
  assert.equal(gespeichert.freigabe, null)
  const stand = h.fn.standLesen()
  assert.ok(stand.stand > vorher, 'die Ansicht erfährt davon')
  assert.equal(stand.zuletzt.at(-1).id, id)
  assert.match(stand.zuletzt.at(-1).von, /\.html-Datei/)
})

test('Felix ändert in Vendo — die Datei folgt', async () => {
  const h = hauptStarten()
  const { daten: k } = await h.bot('kampagne_neu', GUT)
  h.setzen({ kampagnen: h.daten().kampagnen.map((x) => ({ ...x, html: '<p>Felix hat umgeschrieben</p>', geaendertAm: Date.now() + 10000 })) })
  await h.bot('ueberblick')
  assert.equal(ohneKopf(fs.readFileSync(k.datei, 'utf8')), '<p>Felix hat umgeschrieben</p>')
})

test('eine geplante Kampagne ist kein Entwurf mehr: ihre Datei verschwindet', async () => {
  const h = hauptStarten()
  const { daten: k } = await h.bot('kampagne_neu', GUT)
  assert.ok(fs.existsSync(k.datei))
  h.setzen({ kampagnen: h.daten().kampagnen.map((x) => ({ ...x, zustand: 'geplant' })) })
  const gezeigt = await h.bot('kampagne_zeigen', { id: k.id })
  assert.equal(fs.existsSync(k.datei), false)
  assert.equal(gezeigt.daten.datei, undefined, 'die Antwort nennt keine Datei mehr')
})

test('eine leere Datei wird nicht übernommen, der Bot erfährt den Grund', async () => {
  const h = hauptStarten()
  const { daten: k } = await h.bot('kampagne_neu', GUT)
  dateiAendern(h.ordner, path.basename(k.datei), '   ')
  const gezeigt = await h.bot('kampagne_zeigen', { id: k.id })
  assert.equal(gezeigt.daten.html, '<p>Hallo {{vorname}}</p>')
  assert.ok(gezeigt.daten.hinweise.some((x) => /nicht übernommen: Die Datei ist leer/.test(x)), gezeigt.daten.hinweise.join(' | '))
})

test('nur Kampagnen-Entwürfe der KI liegen im Ordner — keine Vorlagen, keine Muster, keine Automationen, nichts von Felix', async () => {
  const h = hauptStarten()
  h.fn.vorlageAnlegen({ name: 'Felix eigene Vorlage' })
  h.fn.kampagneAnlegen('Von Felix selbst')
  h.setzen({ automationen: [{ id: 'a1abcdef', name: 'Warenkorb', art: 'warenkorb', aktiv: false, schritte: [{ nach: 3600000, betreff: 'Vergessen?', html: '<p>Schritt eins</p>' }] }] })
  const { daten: k } = await h.bot('kampagne_neu', GUT)
  const dateien = fs.readdirSync(h.ordner).filter((n) => n.endsWith('.html'))
  assert.deepEqual(dateien, [path.basename(k.datei)])

  const ueberblick = await h.bot('ueberblick')
  const vonFelix = ueberblick.daten.kampagnen.find((x) => x.name === 'Von Felix selbst')
  assert.equal(vonFelix.datei, undefined)
  const auto = await h.bot('automation_zeigen', { id: 'a1abcdef' })
  assert.equal(auto.daten.schritte[0].datei, undefined)
})

test('eine gelöschte Kampagne nimmt ihre Datei mit', async () => {
  const h = hauptStarten()
  const { daten: k } = await h.bot('kampagne_neu', GUT)
  assert.ok(fs.existsSync(k.datei))
  const r = await h.bot('kampagne_loeschen', { id: k.id })
  assert.equal(r.ok, true, r.text)
  assert.equal(fs.existsSync(k.datei), false)
})

test('ohne eigenen Ordner legen Tests keine Dateien an', async () => {
  let daten = { marke: {}, kampagnen: [], vorlagen: [], automationen: [] }
  const fn = {}
  starten({
    datenLaden: () => daten,
    datenSpeichern: (d) => {
      daten = d
    },
    bereitstellen: (name, f) => {
      fn[name] = f
    },
    fragen: async () => '',
    eingangOrdner: false,
    protokollOrdner: ordnerNeu('protokoll')
  })
  const r = await fn.botAuftrag({ aktion: 'kampagne_neu', argumente: GUT, von: 'Vala' })
  assert.equal(r.ok, true, r.text)
  assert.equal(r.daten.datei, undefined)
  assert.doesNotMatch(r.text, /Als Datei/)
})
