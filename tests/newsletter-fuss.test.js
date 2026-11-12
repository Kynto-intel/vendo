// Newsletter-Plugin: der Fuß jeder Mail — Logo, Social-Icons, Pflichtlinks, Abmeldelink.
// Geprüft wird, dass die Angaben aus `marke.fuss` in jede Mail kommen (Bausteine wie
// HTML-Modus, mit und ohne Vendo-Rahmen), dass leere Felder keinen leeren Link erzeugen,
// dass nur https-Adressen durchkommen und dass „ABMELDEN“ ganz unten mittig steht.
// Es geht keine Mail raus, es wird keine Datei geschrieben, alle Daten sind erfunden.

import assert from 'node:assert/strict'
import test from 'node:test'
import bausteine from '../plugins/newsletter/bausteine.js'
import htmlMail from '../plugins/newsletter/html-mail.js'
import mailModul from '../plugins/newsletter/mail.js'
import icons from '../plugins/newsletter/icons.js'
import starten from '../plugins/newsletter/haupt.js'

const {
  mailAus,
  fussPruefen,
  fussTeileAus,
  kopfPruefen,
  kopfTeileAus,
  kopfZeile,
  RECHTSLINKS,
  NETZWERKE,
  ABMELDE_TEXT,
  LOGO_BREITE_FUSS,
  LOGO_BREITE_KOPF,
  ICON_BREITE,
  ICON_BREITE_MAX
} = bausteine
const { mailAusHtml } = htmlMail
const { mailBauen, textAusHtml } = mailModul

const ABMELDUNG = 'abmelden@beispiel.de'
const ZUGANG = { benutzer: 'info@beispiel.de', absenderName: 'Beispielshop', host: 'smtp.beispiel.de', port: 465 }

// Ein vollständig ausgefüllter Fuß, alles erfunden
const FUSS = {
  impressumUrl: 'https://beispiel.de/impressum',
  datenschutzUrl: 'https://beispiel.de/datenschutz',
  agbUrl: 'https://beispiel.de/agb',
  instagram: 'https://instagram.com/beispielshop',
  instagramIcon: 'https://beispiel.de/icons/ig.png',
  facebook: 'https://facebook.com/beispielshop',
  logo: 'https://beispiel.de/fuss-logo.png',
  logoBreite: 140
}

const MARKE = {
  titel: 'Beispielshop',
  logo: 'https://beispiel.de/kopf-logo.png',
  impressum: 'Beispiel GmbH, Musterweg 1, 12345 Musterstadt',
  farben: {},
  fuss: FUSS
}

const bauen = (marke = MARKE) => mailAus([{ art: 'text', text: 'Hallo' }], { marke, abmeldeAdresse: ABMELDUNG })

// Die Icon-Bilder werden einmal eingelesen, bevor irgendein Test sie anfordert.
test.before(() => icons.vorbereiten())

// ── Pflichtlinks ──

test('Impressum, Datenschutzerklärung und AGB stehen mit ihren Adressen im Fuß', () => {
  const html = bauen()
  assert.match(html, /<a href="https:\/\/beispiel\.de\/impressum"[^>]*>Impressum<\/a>/)
  assert.match(html, /<a href="https:\/\/beispiel\.de\/datenschutz"[^>]*>Datenschutzerkl/)
  assert.match(html, /<a href="https:\/\/beispiel\.de\/agb"[^>]*>AGB<\/a>/)
  assert.ok(html.indexOf('/impressum') < html.indexOf('/datenschutz'), 'Reihenfolge wie eingetragen')
  assert.ok(html.indexOf('/datenschutz') < html.indexOf('/agb'))
})

test('leere Felder erzeugen keinen Link und keine leere Trennlinie', () => {
  const html = bauen({ ...MARKE, fuss: { impressumUrl: 'https://beispiel.de/impressum' } })
  assert.match(html, />Impressum</)
  assert.doesNotMatch(html, />Datenschutzerkl/)
  assert.doesNotMatch(html, />AGB</)
  assert.doesNotMatch(html, /href=""/, 'kein leerer Link')
  assert.equal(html.includes('|'), false, 'ohne zweiten Link kein Trennstrich')
})

test('ohne Fußangaben bleibt der Fuß der alte: Impressumtext und Abmeldelink', () => {
  const html = bauen({ ...MARKE, logo: '', fuss: {} })
  assert.match(html, /Musterweg 1/)
  assert.match(html, /mailto:abmelden@beispiel\.de\?subject=Abmeldung/)
  assert.doesNotMatch(html, /<img/, 'ohne Logo kein Bild')
})

// ── Social-Icons ──

test('mit eigener Icon-Adresse wird das Icon als Bild eingesetzt und verlinkt', () => {
  const html = bauen()
  assert.match(html, /<a href="https:\/\/instagram\.com\/beispielshop"/)
  assert.match(html, /<img src="https:\/\/beispiel\.de\/icons\/ig\.png"[^>]*alt="Instagram"/)
})

test('ohne Icon-Adresse zeigt der Fuß auf das Icon, das Vendo selbst mitschickt', () => {
  const html = bauen()
  // Facebook hat kein eigenes Icon hinterlegt
  assert.match(html, /<a href="https:\/\/facebook\.com\/beispielshop"[^>]*><img src="cid:vendo-nl-facebook"/)
  assert.match(html, /alt="Facebook"/)
  assert.equal(html.match(/facebook\.com/g).length, 1, 'der Link steht genau einmal da')
})

test('über den Icons steht „FOLGE UNS HIER“, und ein leerer Titel lässt sie weg', () => {
  assert.match(bauen(), /FOLGE UNS HIER/)
  assert.doesNotMatch(bauen({ ...MARKE, fuss: { ...FUSS, socialTitel: '' } }), /FOLGE UNS HIER/)
  assert.match(bauen({ ...MARKE, fuss: { ...FUSS, socialTitel: 'Folge uns' } }), />Folge uns</)
})

test('ohne ein einziges Netzwerk fehlt auch die Überschrift', () => {
  const html = bauen({ ...MARKE, fuss: { impressumUrl: FUSS.impressumUrl } })
  assert.doesNotMatch(html, /FOLGE UNS HIER/)
  assert.doesNotMatch(html, /cid:/)
})

test('ein Netzwerk ohne Profil-Adresse kommt nicht in den Fuß', () => {
  const html = bauen()
  for (const name of ['TikTok', 'Pinterest']) {
    assert.ok(!html.includes(`alt="${name}"`), `${name} hat keine Adresse und darf nicht erscheinen`)
  }
  assert.doesNotMatch(html, /tiktok\.com/)
  assert.doesNotMatch(html, /cid:vendo-nl-tiktok/)
})

// ── Logo im Fuß ──

test('ohne eigene Fuß-Adresse nimmt der Fuß das Logo aus dem Kopf', () => {
  const html = bauen({ ...MARKE, fuss: {} })
  assert.match(html, /kopf-logo\.png/)
})

test('eine eigene Fuß-Adresse gewinnt gegen das Logo aus dem Kopf', () => {
  const html = bauen()
  const fuss = html.slice(html.indexOf('border-top'))
  assert.match(fuss, /fuss-logo\.png/)
  assert.ok(!fuss.includes('kopf-logo.png'))
  assert.match(fuss, /width="140"/, 'die eingetragene Breite kommt an')
})

test('„Logo im Fuß zeigen“ aus lässt den Fuß ohne Bild', () => {
  const html = bauen({ ...MARKE, fuss: { ...FUSS, logoZeigen: false } })
  const fuss = html.slice(html.indexOf('border-top'))
  assert.ok(!fuss.includes('fuss-logo.png'))
  assert.ok(!fuss.includes('kopf-logo.png'))
  assert.match(fuss, /icons\/ig\.png/, 'die Icons bleiben')
})

// ── Abmeldelink ──

test('„ABMELDEN“ steht ganz unten, nach Icons, Pflichtlinks und Impressum', () => {
  const html = bauen()
  const abmelden = html.indexOf('subject=Abmeldung')
  assert.ok(abmelden > 0)
  for (const vorher of ['icons/ig.png', '/impressum', 'Musterweg 1']) {
    assert.ok(html.indexOf(vorher) < abmelden, `${vorher} steht vor dem Abmeldelink`)
  }
  assert.match(html, /ABMELDEN<\/a>/)
  assert.match(html, /text-align:center;">\s*<a href="mailto:/, 'der Abmeldelink steht mittig')
})

test('der Text des Abmeldelinks lässt sich ändern', () => {
  const html = bauen({ ...MARKE, fuss: { ...FUSS, abmeldeText: 'Kein Newsletter mehr' } })
  assert.match(html, /Kein Newsletter mehr<\/a>/)
  assert.doesNotMatch(html, /ABMELDEN</)
})

test('ohne Abmeldeadresse steht kein Abmeldelink im Fuß', () => {
  const html = mailAus([{ art: 'text', text: 'Hallo' }], { marke: MARKE, abmeldeAdresse: '' })
  assert.doesNotMatch(html, /subject=Abmeldung/)
  assert.match(html, /\/impressum/, 'die Pflichtlinks bleiben')
})

// ── Der Kopf jeder Mail ──
// Wie der Fuß steht er einmal in den Markenangaben und kommt dann vor jede Mail. Kampagne,
// Vorlage und KI liefern nur noch den Inhalt.

test('der Kopf mit Logo steht vor dem Inhalt, ohne dass ihn jemand mitliefert', () => {
  const html = bauen()
  const kopf = html.indexOf('kopf-logo.png')
  assert.ok(kopf > 0, 'das Logo der Marke steht im Kopf')
  assert.ok(kopf < html.indexOf('Hallo'), 'und zwar vor dem Inhalt')
})

test('eine eigene Kopf-Adresse und eine eigene Breite gewinnen', () => {
  const html = bauen({ ...MARKE, kopf: { logo: 'https://beispiel.de/eigenes.png', logoBreite: 240 } })
  assert.match(html, /<img src="https:\/\/beispiel\.de\/eigenes\.png" width="240"/)
})

test('ohne Angabe ist das Logo im Kopf 180 breit', () => {
  assert.match(bauen(), /kopf-logo\.png" width="180"/)
  assert.equal(kopfTeileAus({}).logoBreite, LOGO_BREITE_KOPF)
})

test('abgeschaltet lässt der Kopf die Mail mit dem Inhalt anfangen', () => {
  const html = bauen({ ...MARKE, kopf: { zeigen: false } })
  assert.ok(!html.slice(0, html.indexOf('Hallo')).includes('kopf-logo.png'))
  assert.match(html, /fuss-logo\.png/, 'der Fuß bleibt')
})

test('ohne Logo steht der Name als Schriftzug im Kopf', () => {
  const html = bauen({ ...MARKE, logo: '', kopf: {}, fuss: {} })
  assert.match(html, /text-transform:uppercase;[^"]*">Beispielshop</)
})

test('ohne Logo und ohne Namen bleibt der Kopf ganz weg', () => {
  const leer = { impressum: MARKE.impressum }
  assert.equal(kopfZeile(leer), '', 'keine leere Fläche über dem Inhalt')
  const html = mailAus([{ art: 'text', text: 'Hallo' }], { marke: leer, abmeldeAdresse: ABMELDUNG })
  assert.doesNotMatch(html, /padding:28px 32px 20px/, 'die Kopfzeile fehlt im fertigen HTML')
  assert.match(html, /ABMELDEN/, 'der Fuß bleibt')
})

test('ein eigener Grund im Kopf färbt die Zelle', () => {
  const html = bauen({ ...MARKE, kopf: { hintergrund: '#17304f' } })
  assert.match(html, /<td align="center" bgcolor="#17304f"/)
})

test('kopfPruefen nimmt nur https und hält die Breite im Rahmen', () => {
  assert.equal(kopfPruefen({ logo: 'http://beispiel.de/l.png' }).verworfen[0], 'Logo im Kopf')
  assert.equal(kopfPruefen({ logoBreite: 9999 }).wert.logoBreite, LOGO_BREITE_KOPF)
  assert.equal(kopfPruefen({ logoBreite: 240 }).wert.logoBreite, 240)
  assert.equal(kopfPruefen({ zeigen: false }).wert.zeigen, false)
  assert.deepEqual(kopfPruefen({ hintergrund: 'blau' }).verworfen, ['Kopffarbe hintergrund'])
})

test('im HTML-Modus mit Rahmen kommt der Kopf davor, ohne Rahmen nicht', () => {
  const mit = mailAusHtml('<p>Hallo</p>', { marke: MARKE, abmeldeAdresse: ABMELDUNG, rahmen: true })
  assert.ok(mit.html.indexOf('kopf-logo.png') < mit.html.indexOf('Hallo'))

  // Ein fremdes Dokument bringt seinen eigenen Kopf mit — ein zweiter stünde doppelt da
  const ohne = mailAusHtml('<html><body><p>Fremd</p></body></html>', { marke: MARKE, abmeldeAdresse: ABMELDUNG, rahmen: false })
  assert.ok(!ohne.html.includes('kopf-logo.png'))
  assert.match(ohne.html, /ABMELDEN/, 'der Fuß kommt trotzdem')
})

test('eine Liste mit eigenem Kopf-Baustein bekommt keinen zweiten', () => {
  const html = mailAus([{ art: 'kopf', logo: 'https://beispiel.de/eigenes.png' }, { art: 'text', text: 'Hallo' }], {
    marke: MARKE,
    abmeldeAdresse: ABMELDUNG
  })
  assert.match(html, /eigenes\.png/)
  assert.ok(!html.slice(0, html.indexOf('Hallo')).includes('kopf-logo.png'), 'kein zweites Logo darüber')
})

// ── Das Impressum im Fuß ──

test('die Zeilen des Impressums stehen mit „ | “ hintereinander statt untereinander', () => {
  const marke = { ...MARKE, impressum: 'Beispiel GmbH\nMusterweg 1, 12345 Musterstadt\nUSt-ID: DE000000000' }
  const html = bauen(marke)
  assert.match(html, /Beispiel GmbH \| Musterweg 1, 12345 Musterstadt \| USt-ID: DE000000000/)
  assert.doesNotMatch(html.slice(html.indexOf('Beispiel GmbH')), /^[^<]*<br/, 'kein harter Umbruch zwischen den Teilen')
})

test('eine freie Zeile erzwingt doch einen Umbruch', () => {
  const marke = { ...MARKE, impressum: 'Beispiel GmbH | Musterweg 1\n\nGeschäftsführer: Vorname Nachname\nUSt-ID: DE000000000' }
  const html = bauen(marke)
  assert.match(html, /Beispiel GmbH \| Musterweg 1<br \/>Geschäftsführer: Vorname Nachname \| USt-ID: DE000000000/)
})

test('ein bereits getipptes „|“ am Zeilenende wird nicht verdoppelt', () => {
  const html = bauen({ ...MARKE, impressum: 'Beispiel GmbH |\nMusterweg 1' })
  assert.match(html, /Beispiel GmbH \| Musterweg 1/)
  assert.doesNotMatch(html, /\| \|/)
})

test('leere Zeilen und ein leeres Impressum erzeugen keine leere Zeile im Fuß', () => {
  assert.match(bauen({ ...MARKE, impressum: '\n  \nBeispiel GmbH\n\n\n' }), />Beispiel GmbH</)
  const ohne = bauen({ ...MARKE, impressum: '   \n\n ' })
  assert.doesNotMatch(ohne, /<p style="margin:0;font-family[^"]*">\s*<\/p>/)
  assert.match(ohne, /ABMELDEN/, 'der Rest des Fußes bleibt')
})

test('die Icon-Größe lässt sich stellen und bleibt in ihren Grenzen', () => {
  assert.match(bauen(), new RegExp(`width="${ICON_BREITE}" height="${ICON_BREITE}"`), 'ohne Angabe die Standardgröße')
  assert.match(bauen({ ...MARKE, fuss: { ...FUSS, iconBreite: 18 } }), /width="18" height="18"/)
  assert.match(bauen({ ...MARKE, fuss: { ...FUSS, iconBreite: 999 } }), new RegExp(`width="${ICON_BREITE}"`), 'Unsinn fällt auf den Standard zurück')
  assert.equal(fussPruefen({ iconBreite: 18 }).wert.iconBreite, 18)
  assert.equal(fussPruefen({ iconBreite: 999 }).wert.iconBreite, ICON_BREITE)
  assert.equal(fussPruefen({ iconBreite: ICON_BREITE_MAX }).wert.iconBreite, ICON_BREITE_MAX)
})

// ── Zusatzzeile und Farben ──

test('die freie Zeile steht zwischen Impressum und Abmeldelink', () => {
  const html = bauen({ ...MARKE, fuss: { ...FUSS, zusatz: 'Alle Preise inkl. MwSt. und zzgl. Versandkosten' } })
  const zeile = html.indexOf('Alle Preise inkl')
  assert.ok(zeile > html.indexOf('Musterweg 1'), 'steht unter dem Impressum')
  assert.ok(zeile < html.indexOf('subject=Abmeldung'), 'steht über dem Abmeldelink')
  assert.doesNotMatch(bauen(), /Alle Preise/, 'ohne Eintrag keine Zeile')
})

test('ein eigener Grund im Fuß färbt die Zelle und lässt die Trennlinie weg', () => {
  const html = bauen({ ...MARKE, fuss: { ...FUSS, hintergrund: '#17304f', text: '#ffffff', akzent: '#e8622a' } })
  assert.match(html, /bgcolor="#17304f"/)
  const fuss = html.slice(html.indexOf('bgcolor="#17304f"'))
  assert.doesNotMatch(fuss, /border-top/, 'die Farbe trennt schon')
  assert.match(fuss, /color:#ffffff;text-align:center;">Impressum|color:#ffffff/, 'die Schrift ist hell')
  assert.match(fuss, /color:#e8622a;text-decoration:underline;">ABMELDEN/, 'der Abmeldelink hebt sich ab')
})

test('ohne eigenen Grund bleibt der Fuß wie die Mail, mit Trennlinie', () => {
  const html = bauen()
  assert.match(html, /border-top:1px solid/)
  assert.doesNotMatch(html, /bgcolor="#17304f"/)
})

test('eine kaputte Farbangabe wird verworfen und benannt', () => {
  const r = fussPruefen({ hintergrund: 'dunkelblau', text: '#ffffff' })
  assert.equal(r.wert.hintergrund, undefined)
  assert.equal(r.wert.text, '#ffffff')
  assert.deepEqual(r.verworfen, ['Fußfarbe hintergrund'])
})

// ── Die mitgeschickten Icons ──
// Die Bilder liegen in plugins/newsletter/social media icons. Sie werden gelesen, aber
// nicht verändert, und es geht nichts nach außen.

test('zu jedem angebotenen Netzwerk gibt es eine Bilddatei', () => {
  assert.deepEqual(
    icons.MIT_BILD,
    NETZWERKE.map((n) => n.id),
    'ein Netzwerk ohne Bild bliebe im Fuß leer'
  )
})

test('der Dateiname darf sich verschreiben — Faceboook.png findet facebook', () => {
  assert.equal(icons.zusammenziehen('Faceboook'), icons.zusammenziehen('Facebook'))
  assert.equal(icons.zusammenziehen('TikTok'), 'tiktok')
  assert.notEqual(icons.zusammenziehen('Instagram'), icons.zusammenziehen('Pinterest'))
  assert.ok(icons.DATEIEN.facebook, 'für Facebook ist eine Datei gefunden')
})

test('jedes Icon kommt als kleines PNG heraus', () => {
  for (const id of icons.MIT_BILD) {
    const png = icons.iconPng(id, { farbe: '#ffffff' })
    assert.ok(Buffer.isBuffer(png), `${id} liefert kein Bild`)
    assert.equal(png.slice(1, 4).toString('latin1'), 'PNG', `${id} ist kein PNG`)
    assert.ok(png.length > 100, `${id} ist verdächtig klein`)
    // Die Vorlagen sind rund 2500 px groß; in der Mail darf davon nichts übrig sein
    assert.ok(png.length < 20000, `${id} ist mit ${png.length} Bytes zu groß für eine Mail`)
  }
})

test('eine weiße Vorlage bekommt die Schriftfarbe des Fußes', () => {
  const hell = icons.iconPng('instagram', { farbe: '#ffffff' })
  const dunkel = icons.iconPng('instagram', { farbe: '#23201c' })
  assert.ok(!hell.equals(dunkel), 'sonst wäre das Icon auf hellem Grund unsichtbar')
})

test('ein unbekanntes Netzwerk liefert kein Bild statt eines kaputten', () => {
  assert.equal(icons.iconPng('myspace'), null)
})

test('iconsImHtml findet genau die angeforderten Icons', () => {
  const html = bauen()
  // Instagram hat ein eigenes Icon-Bild, wird also nicht mitgeschickt
  assert.deepEqual(icons.iconsImHtml(html), ['facebook'])
  assert.deepEqual(icons.iconsImHtml('<p>ohne</p>'), [])
})

test('die Anhänge einer Mail tragen cid, Inhalt und sind eingebettet', () => {
  const anhaenge = icons.anhaengeFuer(bauen(), { farbe: '#ffffff' })
  assert.equal(anhaenge.length, 1)
  assert.equal(anhaenge[0].cid, 'vendo-nl-facebook')
  assert.equal(anhaenge[0].contentType, 'image/png')
  assert.equal(anhaenge[0].contentDisposition, 'inline')
  assert.ok(Buffer.isBuffer(anhaenge[0].content))
})

test('für die Vorschau wird cid durch eine data-Adresse ersetzt', () => {
  const ansicht = icons.alsDatenAdressen(bauen(), { farbe: '#ffffff' })
  assert.doesNotMatch(ansicht, /cid:/)
  assert.match(ansicht, /src="data:image\/png;base64,[A-Za-z0-9+/=]+"/)
})

test('mailBauen hängt nur an, worauf das HTML auch zeigt', () => {
  const html = bauen()
  const anhaenge = [
    ...icons.anhaengeFuer(html, { farbe: '#ffffff' }),
    { filename: 'x.png', content: Buffer.from('x'), cid: 'vendo-nl-x', contentType: 'image/png' }
  ]
  const gebaut = mailBauen({ art: 'kampagne', an: 'kunde@beispiel.de', betreff: 'Neu', html, zugang: ZUGANG, abmeldeAdresse: ABMELDUNG, anhaenge })
  assert.equal(gebaut.ok, true, gebaut.fehler?.join(' '))
  assert.equal(gebaut.mail.attachments.length, 1, 'das ungenutzte Bild bleibt draußen')
  assert.equal(gebaut.mail.attachments[0].cid, 'vendo-nl-facebook')
})

test('ohne angefordertes Icon bekommt die Mail gar keine Anhänge', () => {
  const html = bauen({ ...MARKE, fuss: { ...FUSS, facebook: '' } })
  const gebaut = mailBauen({
    art: 'kampagne',
    an: 'kunde@beispiel.de',
    betreff: 'Neu',
    html,
    zugang: ZUGANG,
    abmeldeAdresse: ABMELDUNG,
    anhaenge: icons.anhaengeFuer(html, { farbe: '#ffffff' })
  })
  assert.equal(gebaut.ok, true, gebaut.fehler?.join(' '))
  assert.equal(gebaut.mail.attachments, undefined)
})

// ── Prüfung der Eingaben ──

test('fussPruefen nimmt nur https-Adressen und benennt, was es verwirft', () => {
  const r = fussPruefen({
    impressumUrl: 'https://beispiel.de/impressum',
    datenschutzUrl: 'http://beispiel.de/datenschutz',
    agbUrl: 'javascript:alert(1)',
    instagram: 'instagram.com/ohne-schema'
  })
  assert.equal(r.wert.impressumUrl, 'https://beispiel.de/impressum')
  assert.equal(r.wert.datenschutzUrl, undefined)
  assert.equal(r.wert.agbUrl, undefined)
  assert.equal(r.wert.instagram, undefined)
  assert.deepEqual(r.verworfen, ['Datenschutzerklärung', 'AGB', 'Instagram'])
})

test('fussPruefen hält die Logobreite im Rahmen und fällt sonst auf den Standard zurück', () => {
  assert.equal(fussPruefen({ logoBreite: 160 }).wert.logoBreite, 160)
  assert.equal(fussPruefen({ logoBreite: 5000 }).wert.logoBreite, LOGO_BREITE_FUSS)
  assert.equal(fussPruefen({ logoBreite: 'viel' }).wert.logoBreite, LOGO_BREITE_FUSS)
})

test('fussPruefen kürzt den Abmeldetext und wirft Zeilenumbrüche weg', () => {
  assert.equal(fussPruefen({ abmeldeText: ' Abmelden\nbitte ' }).wert.abmeldeText, 'Abmelden bitte')
  assert.equal(fussPruefen({ abmeldeText: 'x'.repeat(80) }).wert.abmeldeText.length, 40)
  assert.equal(fussPruefen({}).wert.abmeldeText, undefined, 'leer heißt: Standard')
  assert.equal(fussTeileAus({ fuss: {} }).abmeldeText, ABMELDE_TEXT)
})

test('fussPruefen kennt jedes Netzwerk und jeden Pflichtlink aus den Listen', () => {
  const eingabe = {}
  for (const l of RECHTSLINKS) eingabe[l.id] = `https://beispiel.de/${l.id}`
  for (const n of NETZWERKE) {
    eingabe[n.id] = `https://beispiel.de/${n.id}`
    eingabe[`${n.id}Icon`] = `https://beispiel.de/${n.id}.png`
  }
  const r = fussPruefen(eingabe)
  assert.deepEqual(r.verworfen, [])
  for (const l of RECHTSLINKS) assert.equal(r.wert[l.id], `https://beispiel.de/${l.id}`)
  for (const n of NETZWERKE) assert.equal(r.wert[`${n.id}Icon`], `https://beispiel.de/${n.id}.png`)
})

test('ein Fußtext mit Klammern bricht das Markup nicht auf', () => {
  const html = bauen({ ...MARKE, fuss: { ...FUSS, abmeldeText: '<b>weg</b>' } })
  assert.doesNotMatch(html, /<b>weg<\/b>/)
  assert.match(html, /&lt;b&gt;weg/)
})

test('eine javascript:-Adresse im Fuß wird auch beim Bauen nicht zum Link', () => {
  // fussPruefen lässt sie nicht durch; käme sie auf anderem Weg in die Daten, hält `url` dagegen
  const html = bauen({ ...MARKE, fuss: { impressumUrl: 'javascript:alert(1)', instagram: 'javascript:alert(1)' } })
  assert.doesNotMatch(html, /javascript:/i)
  assert.doesNotMatch(html, />Impressum</)
})

// ── HTML-Modus ──

test('im HTML-Modus mit Vendo-Rahmen ist der ganze Fuß dabei', () => {
  const r = mailAusHtml('<p>Hallo</p>', { marke: MARKE, abmeldeAdresse: ABMELDUNG, rahmen: true })
  assert.match(r.html, /\/datenschutz/)
  assert.match(r.html, /icons\/ig\.png/)
  assert.match(r.html, /ABMELDEN/)
})

test('im HTML-Modus ohne Rahmen hängt der Fuß vor </body> und ist vollständig', () => {
  const fremd = '<html><body><table><tr><td>Fremdes Mailing</td></tr></table></body></html>'
  const r = mailAusHtml(fremd, { marke: MARKE, abmeldeAdresse: ABMELDUNG, rahmen: false })
  const abmelden = r.html.indexOf('subject=Abmeldung')
  assert.ok(abmelden > 0 && abmelden < r.html.lastIndexOf('</body>'), 'der Fuß steht im Rumpf')
  assert.match(r.html, /\/agb/)
  assert.match(r.html, /facebook\.com/)
  assert.match(r.html, /fuss-logo\.png/)
})

test('der Textteil der Mail nennt die Pflichtlinks mit Adresse', () => {
  const html = bauen()
  const text = textAusHtml(html)
  assert.match(text, /Impressum \(https:\/\/beispiel\.de\/impressum\)/)
  assert.match(text, /ABMELDEN \(abmelden@beispiel\.de\?subject=Abmeldung\)/)
})

test('eine Kampagnenmail mit dem neuen Fuß wird gebaut und trägt den Abmelde-Header', () => {
  const gebaut = mailBauen({
    art: 'kampagne',
    an: 'kunde@beispiel.de',
    betreff: 'Neu im Shop',
    html: bauen(),
    zugang: ZUGANG,
    abmeldeAdresse: ABMELDUNG
  })
  assert.equal(gebaut.ok, true, gebaut.fehler?.join(' '))
  assert.match(gebaut.mail.headers['List-Unsubscribe'], /abmelden@beispiel\.de/)
})

// ── Speichern und Lesen in haupt.js ──
// Der Hintergrundteil läuft mit erfundenen Daten im Speicher: kein Electron, keine Datei,
// kein Netz.

function hauptStarten(start = {}) {
  let daten = {
    zugang: { benutzer: 'info@beispiel.de' },
    marke: { titel: 'Beispielshop', impressum: MARKE.impressum, abmeldeAdresse: ABMELDUNG },
    kontakte: [],
    kampagnen: [],
    vorlagen: [],
    automationen: [],
    laeufe: [],
    warteschlange: [],
    ...start
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
    eingangOrdner: false // nie den echten Eingangskorb der Bots anfassen
  })
  return fn
}

test('markeLesen liefert die Listen, aus denen die Oberfläche ihre Felder baut', () => {
  const gelesen = hauptStarten().markeLesen()
  assert.deepEqual(
    gelesen.rechtslinks.map((l) => l.name),
    ['Impressum', 'Datenschutzerklärung', 'AGB']
  )
  assert.equal(gelesen.netzwerke.length, NETZWERKE.length)
  assert.equal(gelesen.netzwerke[0].id, 'instagram')
  assert.equal(gelesen.abmeldeTextStandard, ABMELDE_TEXT)
  assert.deepEqual(gelesen.fuss, {})
})

test('markeSpeichern legt die Fußangaben ab und meldet verworfene Adressen', () => {
  const fn = hauptStarten()
  const r = fn.markeSpeichern({
    titel: 'Beispielshop',
    impressum: MARKE.impressum,
    abmeldeAdresse: ABMELDUNG,
    fuss: { impressumUrl: 'https://beispiel.de/impressum', agbUrl: 'http://beispiel.de/agb', instagram: 'https://instagram.com/beispielshop' }
  })
  assert.equal(r.ok, true)
  assert.deepEqual(r.verworfen, ['AGB'])
  const gelesen = fn.markeLesen()
  assert.equal(gelesen.fuss.impressumUrl, 'https://beispiel.de/impressum')
  assert.equal(gelesen.fuss.agbUrl, undefined)
  assert.equal(gelesen.fuss.instagram, 'https://instagram.com/beispielshop')
})

test('ein Speichern ohne Fußangaben lässt die gespeicherten stehen', () => {
  const fn = hauptStarten()
  fn.markeSpeichern({ titel: 'Beispielshop', impressum: MARKE.impressum, abmeldeAdresse: ABMELDUNG, fuss: FUSS })
  // So ruft die Bot-Aktion „marke_aendern“ auf: ohne `fuss`
  fn.markeSpeichern({ titel: 'Neuer Name', impressum: MARKE.impressum, abmeldeAdresse: ABMELDUNG })
  const gelesen = fn.markeLesen()
  assert.equal(gelesen.titel, 'Neuer Name')
  assert.equal(gelesen.fuss.impressumUrl, FUSS.impressumUrl)
  assert.equal(gelesen.fuss.instagramIcon, FUSS.instagramIcon)
})

test('Überschrift, Zusatzzeile und Fußfarben kommen gespeichert zurück', () => {
  const fn = hauptStarten()
  fn.markeSpeichern({
    titel: 'Beispielshop',
    impressum: MARKE.impressum,
    abmeldeAdresse: ABMELDUNG,
    fuss: { socialTitel: 'Folge uns', zusatz: 'Alle Preise inkl. MwSt.', hintergrund: '#17304f', akzent: '#e8622a' }
  })
  const f = fn.markeLesen().fuss
  assert.equal(f.socialTitel, 'Folge uns')
  assert.equal(f.zusatz, 'Alle Preise inkl. MwSt.')
  assert.equal(f.hintergrund, '#17304f')
  assert.equal(f.akzent, '#e8622a')
})

test('der gespeicherte Fuß steht in der Vorschau jeder Kampagne', () => {
  const fn = hauptStarten()
  fn.markeSpeichern({ titel: 'Beispielshop', impressum: MARKE.impressum, abmeldeAdresse: ABMELDUNG, fuss: FUSS })
  const id = fn.kampagneAnlegen('Rauchtest').id
  fn.kampagneSpeichern({ id, betreff: 'Hallo', modus: 'html', html: '<p>Hallo</p>' })
  const v = fn.kampagneVorschau(id)
  assert.equal(v.ok, true)
  assert.match(v.html, /\/datenschutz/)
  assert.match(v.html, /icons\/ig\.png/)
  assert.match(v.html, /ABMELDEN/)
})

test('keine Vorschau gibt cid an die Oberfläche weiter — dort zeigt nur data etwas', () => {
  const fn = hauptStarten()
  fn.markeSpeichern({ titel: 'Beispielshop', impressum: MARKE.impressum, abmeldeAdresse: ABMELDUNG, fuss: FUSS })

  const kId = fn.kampagneAnlegen('Rauchtest').id
  fn.kampagneSpeichern({ kId, id: kId, betreff: 'Hallo', html: '<p>Hallo</p>' })
  const vId = fn.vorlageAnlegen({ name: 'Rauchtest' }).id
  const aId = fn.automationAnlegen({ art: 'willkommen', name: 'Rauchtest' })?.id

  const ansichten = [
    ['kampagneVorschau', fn.kampagneVorschau(kId)],
    ['mailVorschau', fn.mailVorschau({ id: kId, html: '<p>Hallo</p>', betreff: 'Hallo' })],
    ['vorlageVorschau', fn.vorlageVorschau(vId)],
    ['vorlagenLesen', { html: fn.vorlagenLesen().liste[0]?.vorschau }],
    ...(aId ? [['automationVorschau', fn.automationVorschau({ id: aId, schritt: 0 })]] : [])
  ]

  for (const [name, a] of ansichten) {
    assert.ok(a && typeof a.html === 'string' && a.html, `${name} liefert kein HTML`)
    assert.doesNotMatch(a.html, /cid:/, `${name} gibt cid an die Oberfläche weiter`)
    assert.match(a.html, /src="data:image\/png;base64,/, `${name} hat kein eingesetztes Icon`)
  }
})
