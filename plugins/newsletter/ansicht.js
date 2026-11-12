// Newsletter-Plugin: Kampagnen und Automationen über das eigene IONOS-Postfach.
// Daten in daten/plugins/newsletter.json, Stand und Bauplan siehe README.md im Plugin-Ordner.
//
// Stand: Postfach, Testmail, Protokoll, Drossel, Warteschlange, Kontakte aus Shopify und
// per CSV, Kampagnen und Vorlagen als Mail-HTML mit Entwurf von Luzzy, Automationen.
//
// Passwort und Shopify-Token werden nur zum Speichern an haupt.js übergeben und kommen von
// dort nie zurück.

const LEER = {
  zugang: {},
  shopify: {},
  marke: {},
  einstellungen: {},
  drossel: {},
  warteschlange: [],
  kontakte: [],
  vorlagen: [],
  kampagnen: [],
  automationen: [],
  laeufe: []
}

const BEREICHE = [
  { id: 'uebersicht', name: 'Übersicht' },
  { id: 'kontakte', name: 'Kontakte' },
  { id: 'kampagnen', name: 'Kampagnen' },
  { id: 'automationen', name: 'Automationen' },
  { id: 'vorlagen', name: 'Vorlagen' },
  { id: 'protokoll', name: 'Protokoll' },
  { id: 'zugang', name: 'Zugang' }
]

const GEPLANT = {}

const STUNDE = 3600000

const TEST_VORLAGE = '<p>Hallo,</p>\n<p>das ist eine Testmail aus Vendo.</p>\n<p>Gruß</p>'
const CSV_BEISPIEL = 'email;vorname;nachname;zustimmungam\nmax@beispiel.de;Max;Muster;2026-01-15'

const ZUSTAND_TEXT = { entwurf: 'Entwurf', freigabe: 'wartet auf Freigabe', geplant: 'geplant', laeuft: 'läuft', fertig: 'fertig', abgebrochen: 'abgebrochen' }

export async function starten(ctx) {
  const m = ctx.maskieren
  let daten = { ...LEER }
  let zugang = null
  let drossel = null
  let schlange = null
  let kontakte = null
  let shopify = null
  let abmeldungen = null
  let marke = null
  let renner = null
  let kampagnen = null
  let vorschauDaten = null
  let vorschauBreite = 'mobil' // jeder Editor startet mit der Handy-Vorschau
  let vorschauTakt = null // Zeitgeber: nicht bei jedem Tastendruck neu bauen
  let sicherungTakt = null // Zeitgeber: Tippen speichert von selbst
  let letzteVorschau = '' // zuletzt gezeigtes HTML, damit der Rahmen nicht grundlos neu lädt
  let meldung = null // Zugang-Reiter
  let testMeldung = null
  let testNameMeldung = null
  let testName = null // Eingaben im Namensformular, solange nicht gemerkt
  let kontaktMeldung = null
  let kampagneMeldung = null
  let vorschau = null // Textteil der Testmail
  let protokoll = []
  let testmail = { an: '', betreff: 'Testmail aus Vendo', inhalt: TEST_VORLAGE }
  let csvText = ''
  let suche = ''
  let gewaehlt = null // id der offenen Kampagne
  let ki = { thema: '', ton: '' }
  let autos = null
  let laeufe = null
  let vorlagen = null
  let gewaehlteVorlage = null
  let vorlageMeldung = null
  let vorlageVorschau = null
  let vorlageKi = { zweck: '', ton: '' }
  let autoMeldung = null
  let autoVorschau = null
  let bereich = 'uebersicht'

  ctx.element.innerHTML = `
    <div class="nl-raster">
      <nav class="nl-reiter" data-reiter>
        ${BEREICHE.map((b) => `<button class="nl-reiter-knopf" data-bereich="${b.id}" type="button">${m(b.name)}</button>`).join('')}
      </nav>
      <div class="nl-inhalt hud" data-inhalt></div>
    </div>`
  const $ = (sel) => ctx.element.querySelector(sel)

  const holen = async (name, ...args) => {
    try {
      return await ctx.aufrufen(name, ...args)
    } catch (fehler) {
      return { ok: false, text: fehler.message, fehler: [fehler.message] }
    }
  }
  const stillHolen = async (name, ...args) => {
    try {
      return await ctx.aufrufen(name, ...args)
    } catch {
      return null
    }
  }

  const zugangHolen = async () => (zugang = await stillHolen('zugangLesen'))
  const drosselHolen = async () => (drossel = await stillHolen('drosselLesen'))
  const schlangeHolen = async () => (schlange = await stillHolen('warteschlangeLesen'))
  const shopifyHolen = async () => (shopify = await stillHolen('shopifyLesen'))
  const markeHolen = async () => (marke = await stillHolen('markeLesen'))
  const kontakteHolen = async () => (kontakte = await stillHolen('kontakteLesen', { suche, anzahl: 100 }))
  const abmeldungenHolen = async () => (abmeldungen = await stillHolen('abmeldungenLesen'))
  const rennerHolen = async () => (renner = await stillHolen('rennerLesen'))
  const kampagnenHolen = async () => (kampagnen = await stillHolen('kampagnenLesen'))
  const autosHolen = async () => (autos = await stillHolen('automationenLesen'))
  const vorlagenHolen = async () => (vorlagen = await stillHolen('vorlagenLesen'))
  const laeufeHolen = async () => (laeufe = await stillHolen('laeufeLesen'))
  const protokollHolen = async () => (protokoll = (await stillHolen('protokollLesen', { anzahl: 50 })) || [])

  async function laden() {
    const d = await ctx.daten.laden()
    const fehlt = Object.keys(LEER).filter((k) => d[k] === undefined)
    daten = { ...LEER, ...d }
    if (fehlt.length) await ctx.daten.speichern(daten)
    await Promise.all([zugangHolen(), drosselHolen(), schlangeHolen()])
    if (bereich === 'uebersicht') await rennerHolen()
    if (bereich === 'kontakte') await Promise.all([shopifyHolen(), kontakteHolen(), abmeldungenHolen()])
    if (bereich === 'kampagnen') await Promise.all([kampagnenHolen(), markeHolen(), vorlagenHolen()])
    if (bereich === 'automationen') await Promise.all([autosHolen(), laeufeHolen(), vorlagenHolen()])
    if (bereich === 'vorlagen') await Promise.all([vorlagenHolen(), markeHolen()])
    if (bereich === 'zugang') await markeHolen()
    if (bereich === 'protokoll') await protokollHolen()
    // Vendo ruft laden() jede Minute auf, solange der Bereich offen ist. Bei offenem Editor
    // nicht neu zeichnen: das würde das Code-Feld neu aufbauen, Cursor und Scrollstelle
    // wären weg — mitten im Tippen. Gespeichert wird dort ohnehin von selbst.
    if (offenerEditor()) return
    zeichnen()
  }

  const zeit = (wert) => {
    const d = new Date(Number(wert) || wert)
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  const datum = (wert) => {
    if (!wert) return ''
    const d = new Date(wert)
    return Number.isNaN(d.getTime()) ? String(wert).slice(0, 10) : d.toLocaleDateString('de-DE')
  }
  const zahl = (wert) => `<span class="nl-zahl">${Array.isArray(wert) ? wert.length : Number(wert) || 0}</span>`

  // Eine Kachel der Übersicht. Alle werden hier gebaut, damit sie gleich aussehen: Name,
  // ein Wert, eine Zeile darunter. Alle drei Teile bleiben einzeilig — was nicht passt,
  // schneidet die CSS ab und steht vollständig im Titel beim Darüberfahren. Deshalb nimmt
  // `zeile` reinen Text und kein Markup: ein <br /> oder <strong> darin würde die
  // Kacheln wieder unterschiedlich hoch machen.
  // `titel` ist der volle Satz beim Darüberfahren, wenn die Zeile knapp gehalten ist.
  const kachel = (name, wert, zeile, { betont = false, titel = '' } = {}) =>
    `<div class="nl-kachel"><span class="nl-kachel-name">${m(name)}</span>${wert}` +
    `<small class="nl-kachel-zeile${betont ? ' nl-kachel-betont' : ''}" title="${m(titel || zeile)}">${m(zeile)}</small></div>`

  // Der Wert einer Kachel, wenn es keine Zahl ist (Postfach-Adresse, „pausiert“)
  const stand = (text, klasse = '') => `<span class="nl-stand ${klasse}" title="${m(text)}">${m(text)}</span>`
  const meldungsZeile = (eintrag) => (eintrag ? `<div class="nl-meldung ${eintrag.ok ? 'nl-ok' : 'nl-fehler'}">${m(eintrag.text)}</div>` : '')

  // ── Übersicht ──

  function postfachStand() {
    if (!zugang) return { text: 'unbekannt', klasse: 'nl-aus', hinweis: 'Hintergrundteil nicht erreichbar — Vendo neu starten.' }
    if (!zugang.benutzer || !zugang.passwortGesetzt) return { text: 'nicht eingerichtet', klasse: 'nl-aus', hinweis: 'Im Reiter „Zugang“ eintragen.' }
    return { text: zugang.benutzer, klasse: 'nl-an', hinweis: `${zugang.host}:${zugang.port}` }
  }

  function versandKachel() {
    if (!drossel) return kachel('Versand', stand('unbekannt', 'nl-aus'), 'nicht erreichbar', { titel: 'Hintergrundteil nicht erreichbar — Vendo neu starten' })
    if (drossel.pausiert) {
      const minuten = Math.max(Math.ceil((drossel.pauseBis - Date.now()) / 60000), 1)
      return kachel('Versand', stand('pausiert', 'nl-rot'), `noch etwa ${minuten} Min.`, { betont: true, titel: `Das Postfach meldete ein Limit, noch etwa ${minuten} Minuten Pause` })
    }
    return kachel('Versand', zahl(drossel.gesendet), `von ${drossel.budget} pro Stunde`)
  }

  // Zwei Ranglisten unter den Kacheln, damit Felix und Luzzy nicht raten müssen, was in
  // die nächste Mail gehört: was sich verkauft und was liegen bleibt. Beide Zahlen kommen
  // aus Shopify und werden höchstens einmal am Tag geholt (siehe rennerSichern in haupt.js).
  const RENNER_ARTEN = [
    { art: 'bestseller', titel: 'Meistverkauft', quelle: 'Bestellungen', leer: 'Noch keine Verkäufe gezählt.' },
    { art: 'warenkorb', titel: 'Liegt im Warenkorb', quelle: 'Körbe', leer: 'Noch keine abgebrochenen Warenkörbe gezählt.' }
  ]

  function rennerBloecke() {
    if (!renner) return ''
    return `<div class="nl-renner-paar">${RENNER_ARTEN.map(rennerBlock).join('')}</div>`
  }

  function rennerBlock({ art, titel, quelle, leer }) {
    const stand = renner[art] || {}
    // Was aus dem Shop genommen wurde, bleibt sichtbar — nur so fällt es auf.
    const liste = stand.liste || []
    const knopf = `<button class="knopf-flach" data-nl="renner-holen" data-art="${m(art)}" type="button">Neu holen</button>`
    const kopf = `<div class="nl-renner-kopf">
        <span class="nl-kachel-name">${m(titel)} · ${Number(stand.tage) || 30} Tage</span>
        ${knopf}
      </div>`

    if (!liste.length) {
      return `<div class="nl-renner">${kopf}
        <p class="nl-form-text">${m(leer)} Die Zahlen kommen aus Shopify — dafür muss im Reiter
        „Kontakte“ ein Token mit <code>read_orders</code> stehen.</p>
      </div>`
    }

    const zeilen = liste
      .map(
        (e, i) => `
        <li class="nl-renner-zeile${e.imShop ? '' : ' nl-renner-fort'}">
          <span class="nl-renner-platz">${i + 1}</span>
          ${e.bild ? `<img src="${m(e.bild)}" alt="" loading="lazy" />` : '<span class="nl-renner-leer"></span>'}
          <span class="nl-renner-name" title="${m(e.titel)}${e.imShop ? '' : ' — nicht mehr im Shop'}">${m(e.titel)}</span>
          <span class="nl-renner-preis">${m(e.preis)}</span>
          <span class="nl-renner-menge">${Number(e.menge) || 0}×</span>
        </li>`
      )
      .join('')

    return `<div class="nl-renner">${kopf}
      <ol class="nl-renner-liste">${zeilen}</ol>
      <p class="nl-renner-stand">${stand.geholtAm ? `Stand ${datum(stand.geholtAm)}` : 'ohne Stand'} · ${Number(stand.quellen) || 0} ${m(quelle)}</p>
    </div>`
  }

  // Fünf Kacheln, bewusst nicht mehr: so bleiben sie in einer Reihe, statt dass eine
  // allein darunter rutscht. Die Empfängerzahl steht im Reiter „Kontakte“, dort mit den
  // Zahlen daneben, die sie erklären (gesperrt, ohne Nachweis, gesamt).
  function uebersicht() {
    const aktiv = daten.automationen.filter((a) => a.aktiv).length
    const laufen = daten.kampagnen.filter((k) => k.zustand === 'laeuft' || k.zustand === 'geplant').length
    const freigaben = daten.kampagnen.filter((k) => k.zustand === 'freigabe').length
    const p = postfachStand()
    return `
      <div class="nl-kacheln">
        ${kachel(
          'Kampagnen',
          zahl(daten.kampagnen),
          // Wartet etwas auf Freigabe, ist das die wichtigere Zeile — eine zweite wäre
          // eine zweite Zeile, und dann wären die Kacheln wieder ungleich hoch.
          freigaben ? `${freigaben} warten auf Freigabe` : `${laufen} geplant oder laufend`,
          { betont: Boolean(freigaben) }
        )}
        ${kachel('Automationen', zahl(aktiv), 'davon aktiv')}
        ${kachel('Postfach', stand(p.text, p.klasse), p.hinweis)}
        ${versandKachel()}
        ${schlange ? kachel('Warteschlange', zahl(schlange.offen), schlange.fehler ? `${schlange.faellig} fällig, ${schlange.fehler} mit Fehler` : `${schlange.faellig} fällig, ${schlange.wartend} wartet`, { betont: Boolean(schlange.fehler) }) : ''}
      </div>
      ${rennerBloecke()}
      <div class="nl-hinweis">
        <div class="nl-hinweis-titel">Im Aufbau</div>
        <p>Was schon steht, was als Nächstes kommt und der Bauplan dahinter stehen in
        <code>README.md</code> im Plugin-Ordner.</p>
        <p class="leise">Postfach, Drossel, Warteschlange, Kontakte und Kampagnen stehen. Als
        Nächstes kommen die Automationen: Willkommensserie und Warenkorbabbruch.</p>
      </div>`
  }

  // ── Kampagnen ──

  function kampagnenListe() {
    if (!kampagnen?.liste?.length) return '<p class="nl-form-text leise">Noch keine Kampagne.</p>'
    return kampagnen.liste
      .map(
        (k) => `
        <button class="nl-karte${k.id === gewaehlt ? ' gewaehlt' : ''}" data-nl="kampagne-auf" data-id="${m(k.id)}" type="button">
          <span class="nl-karte-name">${m(k.name)}</span>
          <span class="nl-karte-info">${m(ZUSTAND_TEXT[k.zustand] || k.zustand)}${k.geplantAm ? ` · ${m(zeit(k.geplantAm))}` : ''}${k.eingereiht ? ` · ${k.eingereiht} eingereiht` : ''}</span>
          <span class="nl-karte-betreff">${m(k.betreff || 'ohne Betreff')}</span>
        </button>`
      )
      .join('')
  }

  // Die linke Fläche: das Code-Feld. Gleich für Kampagnen und Vorlagen — beide haben
  // denselben Inhalt, nur ein anderes Drumherum.
  function inhaltFlaeche(art, obj, laeuft = false) {
    const werkzeuge = `
      <label class="nl-haken nl-klein"><input type="checkbox" name="htmlRahmen" ${obj.htmlRahmen !== false ? 'checked' : ''} ${laeuft ? 'disabled' : ''} /> Vendo-Rahmen</label>
      <button class="knopf-mini" data-nl="html-beispiel" type="button" ${laeuft ? 'disabled' : ''} title="Eine schlichte Startmail einsetzen">Beispiel</button>`

    return `
      <section class="nl-flaeche nl-links">
        <div class="nl-flaeche-kopf">
          <span class="nl-flaeche-titel">Code</span>
          <span class="nl-flaeche-werkzeuge">${werkzeuge}</span>
        </div>
        ${art === 'kampagne' && !laeuft ? `<div class="nl-flaeche-leiste">${vorlageWahl('kampagne', obj.id)}</div>` : ''}
        <div class="nl-code-feld" data-code-feld>
          <pre class="nl-code-zeilen" data-code-zeilen aria-hidden="true">1</pre>
          <textarea class="nl-code" data-html-code name="html" spellcheck="false" wrap="off" ${laeuft ? 'disabled' : ''} placeholder="&lt;!-- Dein Mail-HTML. Tabellen und Inline-CSS halten in Outlook, Flexbox und Grid nicht. --&gt;">${m(obj.html || '')}</textarea>
        </div>
        <p class="nl-flaeche-fuss">{{vorname}}, {{nachname}}, {{name}} und {{email}} werden pro
        Empfänger ersetzt und dabei maskiert. Skripte, Rahmen und Formulare entfernt Vendo beim
        Versand; Abmeldelink und Impressum kommen immer dazu.</p>
      </section>`
  }

  // Die Angaben rechts über der Vorschau: Empfänger, Betreff, Vorschautext, Absender.
  // Dieselben Felder wie vorher, nur als ruhige Zeilen statt als Formularblock — sie
  // stehen neben der Mail, nicht über dem Code.
  function detailKarte(k, laeuft) {
    const absender = zugang?.benutzer
      ? `${zugang.absenderName ? `${m(zugang.absenderName)} · ` : ''}<span class="nl-detail-adresse">${m(zugang.benutzer)}</span>`
      : '<span class="leise">noch kein Postfach eingetragen</span>'
    const geplant = k.geplantAm ? new Date(k.geplantAm - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''
    return `
      <details class="nl-detail-karte" data-detail-karte>
        <summary><span>E-Mail-Details</span></summary>
        <div class="nl-detail-zeilen">
          <div class="nl-detail-zeile">
            <span class="nl-detail-name">An</span>
            <span class="nl-detail-wert">${Number(kampagnen.empfaenger) || 0} Empfänger mit Zustimmung</span>
          </div>
          <label class="nl-detail-zeile">
            <span class="nl-detail-name">Betreff</span>
            <input name="betreff" maxlength="200" value="${m(k.betreff)}" ${laeuft ? 'disabled' : ''} placeholder="z. B. Neu im Shop: {{vorname}}, schau mal" />
          </label>
          <label class="nl-detail-zeile">
            <span class="nl-detail-name">Vorschautext</span>
            <input name="vorschauText" maxlength="200" value="${m(k.vorschauText)}" ${laeuft ? 'disabled' : ''} placeholder="steht im Postfach neben dem Betreff" />
          </label>
          <label class="nl-detail-zeile">
            <span class="nl-detail-name">Name</span>
            <input name="name" maxlength="80" value="${m(k.name)}" ${laeuft ? 'disabled' : ''} />
          </label>
          <div class="nl-detail-zeile">
            <span class="nl-detail-name">Von</span>
            <span class="nl-detail-wert">${absender}</span>
          </div>
          <div class="nl-detail-zeile nl-detail-zeitplan">
            <span class="nl-detail-name">Versandzeitpunkt</span>
            <div class="nl-detail-zeitplan-inhalt">
              <input name="geplantDatum" type="date" value="${geplant.slice(0, 10)}" aria-label="Versanddatum" title="Versanddatum" ${laeuft ? 'disabled' : ''} />
              <input name="geplantUhrzeit" type="time" value="${geplant.slice(11, 16)}" aria-label="Versanduhrzeit" title="Versanduhrzeit" ${laeuft ? 'disabled' : ''} />
              <button class="knopf-flach" data-nl="kampagne-planen" type="button" ${laeuft ? 'disabled' : ''}>Planen</button>
              <span class="leise">Läuft nur, solange Vendo an ist; ein verstrichener Zeitpunkt wird bis zu 24 Stunden nachgeholt.</span>
            </div>
          </div>
        </div>
      </details>`
  }

  // Alles, was nicht ständig gebraucht wird: Luzzy und Löschen. Unter den beiden Flächen.
  function kampagneFuss(k, laeuft) {
    return `
      <div class="nl-kampagne-fuss">
        ${kiBlock(k, laeuft)}
        <div class="nl-knoepfe">
          <button class="knopf-flach gefahr" data-nl="kampagne-weg" type="button" ${laeuft ? 'disabled' : ''}>Kampagne löschen</button>
        </div>
      </div>`
  }

  // Ein Bot hat die Kampagne zur Freigabe gegeben. Gesendet wird erst, wenn Felix hier
  // bestätigt — der Bot selbst kann weder planen noch senden (siehe bots.js).
  function freigabeKasten(k) {
    const f = k.freigabe || {}
    const lokal = (ms) => (ms ? new Date(ms - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '')
    const testmail = f.testmail?.ok
      ? 'Die Testmail ist in deinem Postfach — sieh sie dir dort an.'
      : `Die Testmail kam nicht raus${f.testmail?.text ? `: ${m(f.testmail.text)}` : ''}. Schick dir oben eine „Testmail an mich“.`
    return `
      <div class="nl-freigabe">
        <div class="nl-freigabe-text">
          <strong>${m(f.von || 'Ein Bot')} hat diese Kampagne zur Freigabe geschickt</strong>${f.angefragtAm ? ` (${m(zeit(f.angefragtAm))})` : ''}.
          ${testmail}
          ${f.gewuenschtAm ? `Gewünschter Termin: <strong>${m(zeit(f.gewuenschtAm))}</strong>.` : 'Einen Termin hat der Bot nicht vorgeschlagen.'}
          Ohne deine Bestätigung geht nichts raus.
        </div>
        <div class="nl-zeile nl-freigabe-knoepfe">
          <input type="date" data-freigabe-datum value="${lokal(f.gewuenschtAm).slice(0, 10)}" aria-label="Versanddatum" title="Versanddatum" />
          <input type="time" data-freigabe-uhrzeit value="${lokal(f.gewuenschtAm).slice(11, 16)}" aria-label="Versanduhrzeit" title="Versanduhrzeit" />
          <button class="knopf-gold" data-nl="kampagne-freigeben" type="button">Freigeben und planen</button>
          <button class="knopf-flach" data-nl="kampagne-entwurf" type="button">Zurück in den Entwurf</button>
        </div>
      </div>`
  }

  function kampagneEditor() {
    const k = kampagnen.liste.find((x) => x.id === gewaehlt)
    if (!k) return ''
    const laeuft = k.zustand === 'laeuft'
    return `
      <div class="nl-kampagne">
        <div class="nl-kampagne-kopf">
          <span class="nl-kampagne-titel">
            <button class="knopf-flach" data-nl="kampagne-zu" type="button" title="Zurück zur Liste">← Kampagnen</button>
            <strong>${m(k.name)}</strong>
            <span class="nl-marke-klein">${m(ZUSTAND_TEXT[k.zustand] || k.zustand)}</span>
            <span class="nl-stand-anzeige" data-stand></span>
          </span>
          <span class="nl-knoepfe">
            <button class="knopf-flach" type="submit" form="kampagne-form" ${laeuft ? 'disabled' : ''}>Speichern</button>
            <button class="knopf-flach" data-nl="kampagne-test" type="button" ${zugang?.passwortGesetzt ? '' : 'disabled'}>Testmail an mich</button>
            <button class="knopf-gold" data-nl="kampagne-start" type="button" ${laeuft ? 'disabled' : ''}>Jetzt an alle senden</button>
            ${k.zustand === 'laeuft' || k.zustand === 'geplant' ? '<button class="knopf-flach gefahr" data-nl="kampagne-stop" type="button">Abbrechen</button>' : ''}
            ${k.zustand === 'fertig' || k.zustand === 'abgebrochen' ? '<button class="knopf-flach" data-nl="kampagne-entwurf" type="button">Zurück zum Entwurf</button>' : ''}
          </span>
        </div>

        ${laeuft ? '<div class="nl-warnung">Die Kampagne läuft. Zum Ändern erst abbrechen.</div>' : ''}
        ${k.zustand === 'freigabe' ? freigabeKasten(k) : ''}
        ${meldungsZeile(kampagneMeldung)}

        <form class="nl-kampagne-flaechen" id="kampagne-form" data-kampagne-form data-id="${m(k.id)}">
          ${detailKarte(k, laeuft)}
          ${inhaltFlaeche('kampagne', k, laeuft)}
          <aside class="nl-rechts">
            ${vorschauSpalte()}
          </aside>
        </form>

        ${kampagneFuss(k, laeuft)}
      </div>`
  }

  function kiBlock(k, laeuft) {
    return `
      <form class="nl-form nl-abschnitt" data-ki-form data-id="${m(k.id)}">
        <div class="nl-form-kopf"><h3>Von Luzzy entwerfen lassen</h3></div>
        <p class="nl-form-text">Luzzy schreibt kein Markup: sie bekommt geprüfte Bausteine
        beschrieben und antwortet mit Inhalt, Vendo macht daraus Tabellen-HTML. Übernommen
        werden Betreff, Vorschautext und der Inhalt — <strong>das bisherige HTML wird dabei
        ersetzt</strong>. Danach selbst prüfen und eine Testmail schicken.</p>
        <div class="nl-form-paar">
          <label>Thema <input name="thema" maxlength="200" value="${m(ki.thema)}" placeholder="z. B. Herbstaktion, drei neue Motive" ${laeuft ? 'disabled' : ''} /></label>
          <label>Tonfall (optional) <input name="ton" maxlength="120" value="${m(ki.ton)}" placeholder="z. B. kurz, direkt, kein Werbesprech" ${laeuft ? 'disabled' : ''} /></label>
        </div>
        <div class="nl-knoepfe"><button class="knopf-gold" type="submit" ${laeuft ? 'disabled' : ''}>Luzzy fragen</button></div>
      </form>`
  }

  // Die mitlaufende Vorschau rechts neben dem Editor. Der Rahmen bleibt beim Tippen stehen
  // und wird nur noch gefüllt (siehe vorschauFuellen) — ein Neuzeichnen würde den Fokus im
  // Textfeld verlieren und die Scrollstelle verwerfen.
  function vorschauSpalte() {
    const art = offenerEditor()
    if (!art) return ''
    const d = art === 'vorlage' ? vorlageVorschau : vorschauDaten
    return `
      <section class="nl-flaeche nl-vorschau-spalte" data-vorschau-spalte>
        <div class="nl-flaeche-kopf">
          <span class="nl-flaeche-titel">Vorschau</span>
          <span class="nl-flaeche-werkzeuge">
            <span class="nl-umschalter">
              <button class="nl-umschalt-knopf${vorschauBreite === 'desktop' ? ' gewaehlt' : ''}" data-nl="vorschau-breite" data-breite="desktop" type="button">Rechner</button>
              <button class="nl-umschalt-knopf${vorschauBreite === 'mobil' ? ' gewaehlt' : ''}" data-nl="vorschau-breite" data-breite="mobil" type="button">Handy</button>
            </span>
          </span>
        </div>
        <p class="nl-vorschau-zeile" data-vorschau-kopf>${d?.ok ? `Beispielkontakt: ${m(d.beispielAdresse || '')}` : 'Wird aufgebaut …'}</p>
        <div class="nl-vorschau-warnung" data-vorschau-hinweise>${d?.ok && d.hinweise?.length ? `<div class="nl-warnung">${m(d.hinweise.join(' '))}</div>` : ''}${d?.ok && d.gesaeubert ? `<div class="nl-vorschau-gesaeubert">${m(d.gesaeubert)}</div>` : ''}</div>
        <div class="nl-vorschau-buehne${vorschauBreite === 'mobil' ? ' mobil' : ''}" data-vorschau-buehne>
          <iframe class="nl-vorschau-rahmen" sandbox="" data-vorschau-rahmen srcdoc="${m(d?.ok ? d.html : '')}" title="Vorschau der Mail"></iframe>
        </div>
        <details class="nl-vorschau-text">
          <summary>Textteil für Programme ohne HTML</summary>
          <pre data-vorschau-text>${m(d?.ok ? d.text || '' : '')}</pre>
        </details>
      </section>`
  }

  function kampagnenAnsicht() {
    if (!kampagnen) {
      return '<div class="nl-leer"><p>Der Hintergrundteil ist nicht erreichbar.</p><p class="leise">Vendo einmal neu starten.</p></div>'
    }
    // Ist eine Kampagne offen, gehört der Platz ihr: Code links, Mail rechts. Die Liste
    // steht dann hinter „← Kampagnen".
    if (gewaehlt && kampagnen.liste.some((k) => k.id === gewaehlt)) return kampagneEditor()
    return `
      <div class="nl-kampagnen-liste">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Kampagnen</h3>
          <button class="knopf-gold" data-nl="kampagne-neu" type="button">+ Neue Kampagne</button>
        </div>
        ${meldungsZeile(kampagneMeldung)}
        <div class="nl-karten">${kampagnenListe()}</div>
      </div>`
  }

  // ── Vorlagen ──

  // Auswahlfeld, das überall dort steht, wo eine Vorlage angewendet werden kann
  function vorlageWahl(ziel, id, schritt = null) {
    if (!vorlagen?.liste?.length) {
      return `<p class="nl-form-text leise">Noch keine Vorlage. Im Reiter „Vorlagen“ eine anlegen oder von Luzzy entwerfen lassen.</p>`
    }
    const kennung = `${ziel}:${id}${schritt === null ? '' : `:${schritt}`}`
    return `
      <div class="nl-zeile">
        <select data-vorlage-wahl="${m(kennung)}">
          <option value="">Vorlage wählen …</option>
          ${vorlagen.liste.map((v) => `<option value="${m(v.id)}">${m(v.name)}</option>`).join('')}
        </select>
        <button class="knopf-flach" data-nl="vorlage-anwenden" data-ziel="${m(ziel)}" data-id="${m(id)}"${schritt === null ? '' : ` data-nummer="${schritt}"`} type="button">Übernehmen</button>
        <button class="knopf-flach" data-nl="vorlage-sichern" data-ziel="${m(ziel)}" data-id="${m(id)}"${schritt === null ? '' : ` data-nummer="${schritt}"`} type="button">Als Vorlage sichern</button>
      </div>`
  }

  function vorlagenListe() {
    if (!vorlagen?.liste?.length) return '<p class="nl-form-text leise">Noch keine Vorlage.</p>'
    // Jede Karte zeigt oben einen Ausschnitt der fertigen Mail: die echte Mail, verkleinert,
    // nur der obere Teil sichtbar. Ein Element mit Rolle „button“ statt <button>, weil ein
    // Rahmen in einem Knopf nicht vorgesehen ist; der Rahmen selbst nimmt keine Klicks an.
    return vorlagen.liste
      .map(
        (v) => `
        <div class="nl-karte nl-vorlage-karte${v.id === gewaehlteVorlage ? ' gewaehlt' : ''}" data-nl="vorlage-auf" data-id="${m(v.id)}" role="button" tabindex="0" aria-label="Vorlage ${m(v.name)} öffnen">
          <span class="nl-mini" aria-hidden="true">
            ${v.vorschau ? `<iframe sandbox="" tabindex="-1" loading="lazy" title="" srcdoc="${m(v.vorschau)}"></iframe>` : ''}
          </span>
          <span class="nl-karte-name">${m(v.name)}</span>
          <span class="nl-karte-info">${v.felder?.length ? `${v.felder.length} Felder` : 'ohne Felder'} · ${v.geaendertAm ? zeit(v.geaendertAm) : 'neu'}${v.hinweise?.length ? ' · unvollständig' : ''}</span>
          <span class="nl-karte-betreff">${m(v.beschreibung || '')}</span>
        </div>`
      )
      .join('')
  }

  // Rechts neben dem Code: wofür die Vorlage da ist. Eine Vorlage hat keinen Betreff und
  // keine Empfänger — deshalb stehen hier Name, Zweck und der Weg in die Kampagne.
  function vorlageDetailKarte(v) {
    return `
      <details class="nl-detail-karte">
        <summary><span>Vorlagen-Details</span></summary>
        <div class="nl-detail-zeilen">
          <label class="nl-detail-zeile">
            <span class="nl-detail-name">Name</span>
            <input name="name" maxlength="80" value="${m(v.name)}" />
          </label>
          <label class="nl-detail-zeile">
            <span class="nl-detail-name">Wofür</span>
            <input name="beschreibung" maxlength="200" value="${m(v.beschreibung)}" placeholder="z. B. Produktvorstellung mit Bild" />
          </label>
          <div class="nl-detail-zeile">
            <span class="nl-detail-name">Felder</span>
            <span class="nl-detail-wert">${
              v.felder?.length
                ? v.felder.map((f) => `<span class="nl-feld" title="${m(f.hinweis || '')}">${m(f.name)}</span>`).join(' ')
                : '<span class="nl-rot">Keine markiert — ohne data-feld ist das eine fertige Mail, keine Vorlage.</span>'
            }</span>
          </div>
          <div class="nl-detail-zeile">
            <span class="nl-detail-name">Anwenden</span>
            <span class="nl-detail-wert leise">In einer Kampagne über „Vorlage wählen“, und auf jeden einzelnen Automationsschritt.</span>
          </div>
        </div>
      </details>`
  }

  function vorlageEditor() {
    const v = vorlagen.liste.find((x) => x.id === gewaehlteVorlage)
    if (!v) return ''
    return `
      <div class="nl-kampagne">
        <div class="nl-kampagne-kopf">
          <span class="nl-kampagne-titel">
            <button class="knopf-flach" data-nl="vorlage-zu" type="button" title="Zurück zur Liste">← Vorlagen</button>
            <strong>${m(v.name)}</strong>
            <span class="nl-stand-anzeige" data-stand></span>
          </span>
          <span class="nl-knoepfe">
            <button class="knopf-flach" type="submit" form="vorlage-form">Speichern</button>
            <button class="knopf-flach" data-nl="vorlage-test" type="button" ${zugang?.passwortGesetzt ? '' : 'disabled'}>Testmail an mich</button>
            <button class="knopf-flach gefahr" data-nl="vorlage-weg" type="button">Löschen</button>
          </span>
        </div>

        ${v.hinweise?.length ? `<div class="nl-warnung">${m(v.hinweise.join(' '))}</div>` : ''}
        ${meldungsZeile(vorlageMeldung)}

        <form class="nl-kampagne-flaechen" id="vorlage-form" data-vorlage-form data-id="${m(v.id)}">
          ${vorlageDetailKarte(v)}
          ${inhaltFlaeche('vorlage', v)}
          <aside class="nl-rechts">
            ${vorschauSpalte()}
          </aside>
        </form>

        <div class="nl-kampagne-fuss">${vorlageKiBlock(v)}</div>
      </div>`
  }

  function vorlageKiBlock(v) {
    return `
      <form class="nl-form nl-abschnitt" data-vorlage-ki-form data-id="${m(v ? v.id : '')}">
        <div class="nl-form-kopf"><h3>Von Luzzy entwerfen lassen</h3></div>
        <p class="nl-form-text">Luzzy entwirft die Form, nicht den fertigen Text: Aufbau mit
        Beispielinhalt, jede Stelle, die pro Kampagne neu geschrieben wird, als Feld markiert. ${v ? 'Übernommen wird in die offene Vorlage.' : 'Es entsteht eine neue Vorlage.'}</p>
        <div class="nl-form-paar">
          <label>Wofür ist die Vorlage? <input name="zweck" maxlength="200" value="${m(vorlageKi.zweck)}" placeholder="z. B. neues Produkt mit Bild und Knopf" /></label>
          <label>Tonfall (optional) <input name="ton" maxlength="120" value="${m(vorlageKi.ton)}" placeholder="z. B. kurz, direkt" /></label>
        </div>
        <div class="nl-knoepfe">
          <button class="knopf-gold" type="submit">Luzzy fragen</button>
          ${v ? '<button class="knopf-flach" data-nl="vorlage-ki-neu" type="button">Als neue Vorlage</button>' : ''}
        </div>
      </form>`
  }

  function vorlagenAnsicht() {
    if (!vorlagen) return '<div class="nl-leer"><p>Der Hintergrundteil ist nicht erreichbar.</p><p class="leise">Vendo einmal neu starten.</p></div>'
    if (gewaehlteVorlage && vorlagen.liste.some((v) => v.id === gewaehlteVorlage)) return vorlageEditor()
    return `
      <div class="nl-kampagnen-liste">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Vorlagen</h3>
          <button class="knopf-gold" data-nl="vorlage-neu" type="button">+ Neue Vorlage</button>
        </div>
        ${meldungsZeile(vorlageMeldung)}
        <p class="nl-form-text leise">Vorlagen legen fest, wie eine Mail aufgebaut ist.
        In Kampagnen und in jedem Automationsschritt lässt sich eine auswählen.</p>
        <div class="nl-karten">${vorlagenListe()}</div>
        ${vorlageKiBlock(null)}
      </div>`
  }

  // ── Automationen ──

  function automationSchritt(automation, schritt, nummer) {
    const stunden = Math.round((Number(schritt.nach) || 0) / STUNDE)
    const verfall = Math.round((Number(schritt.verfallNach) || 48 * STUNDE) / STUNDE)
    return `
      <div class="nl-abschnitt" data-schritt="${nummer}">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Schritt ${nummer + 1}</h3>
          <span class="nl-knoepfe">
            <button class="knopf-mini" data-nl="auto-vorschau" data-id="${m(automation.id)}" data-nummer="${nummer}" type="button">Vorschau</button>
            <button class="knopf-mini" data-nl="auto-test" data-id="${m(automation.id)}" data-nummer="${nummer}" type="button" ${zugang?.passwortGesetzt ? '' : 'disabled'}>Testmail</button>
          </span>
        </div>
        <div class="nl-form-paar">
          <label>Senden nach (Stunden)
            <input data-schrittfeld="nach" type="number" min="0" max="2160" value="${stunden}" />
            <small>${nummer === 0 ? 'Zeit zwischen Auslöser und erster Mail.' : 'Zeit nach der vorigen Mail.'}</small></label>
          <label>Verfällt nach (Stunden)
            <input data-schrittfeld="verfallNach" type="number" min="1" max="2160" value="${verfall}" />
            <small>Später nicht mehr senden — besser gar nicht als zu spät.</small></label>
        </div>
        <label>Betreff <input data-schrittfeld="betreff" maxlength="200" value="${m(schritt.betreff || '')}" /></label>
        ${vorlageWahl('automation', automation.id, nummer)}
        <label class="nl-haken nl-klein"><input type="checkbox" data-schrittfeld="htmlRahmen" ${schritt.htmlRahmen !== false ? 'checked' : ''} /> Vendo-Rahmen (600 px, Markenfarben)</label>
        <div class="nl-code-feld nl-code-schritt">
          <textarea class="nl-code" data-schrittfeld="html" spellcheck="false" wrap="off" placeholder="&lt;!-- Mail-HTML für diesen Schritt --&gt;">${m(schritt.html || '')}</textarea>
        </div>
        <small>Abmeldelink und Impressum kommen beim Versand dazu. Mit „Vorschau“ ansehen,
        mit „Testmail“ an dich selbst schicken.</small>
      </div>`
  }

  function automationKarte(automation) {
    const art = autos.arten.find((a) => a.art === automation.art)
    const platzhalter = automation.art === 'warenkorb' ? ' Zusätzlich: {{warenkorb}}, {{warenkorbLink}}, {{summe}}.' : ''
    return `
      <form class="nl-form nl-abschnitt" data-auto-form data-id="${m(automation.id)}">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>${m(automation.name)} — ${automation.aktiv ? '<span class="nl-an">aktiv</span>' : '<span class="nl-aus">aus</span>'}</h3>
          <span class="nl-knoepfe">
            <button class="knopf-flach" data-nl="auto-schalten" data-id="${m(automation.id)}" data-an="${automation.aktiv ? '0' : '1'}" type="button">${automation.aktiv ? 'Abschalten' : 'Einschalten'}</button>
            <button class="knopf-flach gefahr" data-nl="auto-weg" data-id="${m(automation.id)}" type="button">Löschen</button>
          </span>
        </div>
        <p class="nl-form-text">${m(art?.beschreibung || '')} Bricht ab bei: ${m((art?.abbruchBei || []).join(', ') || 'nichts')}.
        Platzhalter: {{vorname}}, {{name}}.${platzhalter}</p>

        ${automation.hinweise?.length ? `<div class="nl-warnung">Noch nicht sendefertig: ${m(automation.hinweise.join(' '))}</div>` : ''}
        ${automation.art === 'warenkorb' && !autos.shopifyBereit ? '<div class="nl-warnung">Für den Warenkorbabbruch fehlt der Shopify-Zugang (Reiter „Kontakte“).</div>' : ''}

        <div class="nl-form-paar">
          <label>Name <input name="name" maxlength="80" value="${m(automation.name)}" /></label>
          <label>Läufe
            <input value="${automation.stand.laufen} laufen, ${automation.stand.fertig} fertig, ${automation.stand.abgebrochen} abgebrochen" readonly /></label>
        </div>
        <label class="nl-haken">
          <input type="checkbox" name="nurMitZustimmung" ${automation.nurMitZustimmung ? 'checked' : ''} />
          Nur an Kontakte mit Marketing-Zustimmung
        </label>
        <p class="nl-form-text leise">Ohne Zustimmung ist eine Warenkorb-Mail rechtlich heikel:
        ein abgebrochener Warenkorb ist kein Kauf und greift nicht unter die
        Bestandskunden-Ausnahme in § 7 Abs. 3 UWG. Das ist kein Rechtsrat — im Zweifel
        angehakt lassen.</p>

        ${(automation.schritte || []).map((s, i) => automationSchritt(automation, s, i)).join('')}

        <div class="nl-knoepfe nl-abschnitt">
          <button class="knopf-gold" type="submit">Speichern</button>
        </div>
      </form>`
  }

  function automationenAnsicht() {
    if (!autos) return '<div class="nl-leer"><p>Der Hintergrundteil ist nicht erreichbar.</p><p class="leise">Vendo einmal neu starten.</p></div>'
    const fehlende = autos.arten.filter((a) => !autos.liste.some((x) => x.art === a.art))
    return `
      <div class="nl-kacheln nl-kacheln-schmal">
        ${kachel('Automationen', zahl(autos.liste.filter((a) => a.aktiv).length), `von ${autos.liste.length} eingeschaltet`)}
        ${kachel('Laufende Serien', zahl(laeufe?.laufen), 'Personen in Serie', { titel: 'Personen mitten in einer Serie' })}
        ${kachel('Fertig', zahl(laeufe?.fertig), 'durchgelaufen', { titel: 'Serien durchgelaufen' })}
        ${kachel('Abgebrochen', zahl(laeufe?.abgebrochen), 'Kauf oder Abmeldung', { titel: 'Bestellung, Abmeldung oder zu spät' })}
      </div>
      ${meldungsZeile(autoMeldung)}
      ${
        fehlende.length
          ? `<div class="nl-hinweis">
              <div class="nl-hinweis-titel">Anlegen</div>
              ${fehlende.map((a) => `<p>${m(a.name)} — ${m(a.beschreibung)} <button class="knopf-flach" data-nl="auto-neu" data-art="${m(a.art)}" type="button">Anlegen</button></p>`).join('')}
            </div>`
          : ''
      }
      ${autos.liste.map((a) => automationKarte(a)).join('')}
      ${autoVorschauBlock()}
      ${laufListe()}`
  }

  function autoVorschauBlock() {
    if (!autoVorschau) return ''
    if (!autoVorschau.ok) return `<div class="nl-abschnitt">${meldungsZeile({ ok: false, text: autoVorschau.text || 'Vorschau nicht möglich.' })}</div>`
    return `
      <div class="nl-abschnitt">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Vorschau</h3>
          <button class="knopf-flach" data-nl="auto-vorschau-zu" type="button">Schließen</button>
        </div>
        <p class="nl-form-text">Betreff: <strong>${m(autoVorschau.betreff || '')}</strong> · mit Beispieldaten für den Warenkorb</p>
        <iframe class="nl-vorschau-rahmen" sandbox="" srcdoc="${m(autoVorschau.html)}" title="Vorschau der Automationsmail"></iframe>
        <div class="nl-vorschau"><div class="nl-vorschau-titel">Textteil</div><pre>${m(autoVorschau.text || '')}</pre></div>
      </div>`
  }

  function laufListe() {
    if (!laeufe?.liste?.length) return ''
    return `
      <div class="nl-abschnitt">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Laufende Serien</h3>
          <button class="knopf-flach" data-nl="auto-neu-laden" type="button">Neu laden</button>
        </div>
        <table class="nl-tabelle">
          <thead><tr><th>An</th><th>Schritt</th><th>Nächste Mail</th><th>Verfällt</th></tr></thead>
          <tbody>${laeufe.liste
            .map((l) => `<tr><td class="nl-mono">${m(l.an)}</td><td class="nl-mono">${l.schritt}</td><td class="nl-mono">${m(zeit(l.faelligAb))}</td><td class="nl-mono">${m(zeit(l.verfaelltAm))}</td></tr>`)
            .join('')}</tbody>
        </table>
      </div>`
  }

  // ── Kontakte ──

  function shopifyBlock() {
    if (!shopify) return ''
    return `
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Shopify</span></summary>
        <form class="nl-form" data-shopify-form>
          <p class="nl-form-text">Geholt werden nur Kunden mit Marketing-Zustimmung
          (<code>accepts_marketing:true</code>). Der Token braucht <code>read_customers</code>,
          zum Zurückschreiben einer Abmeldung außerdem <code>write_customers</code>.</p>
          <div class="nl-form-paar">
            <label>Shop-Adresse
              <input name="shop" maxlength="120" value="${m(shopify.shop)}" placeholder="meinshop.myshopify.com" />
              <small>Die myshopify.com-Adresse, nicht die eigene Domain.</small></label>
            <label>Zugriffstoken
              <input name="token" type="password" maxlength="200" value="" placeholder="${shopify.tokenGesetzt ? 'gespeichert — leer lassen, um ihn zu behalten' : 'shpat_…'}" autocomplete="new-password" />
              <small>Wird von Windows verschlüsselt abgelegt.</small></label>
          </div>
          ${shopify.letzterSync ? `<p class="nl-form-text leise">Letzter Sync: ${m(zeit(shopify.letzterSync))} — ${m(shopify.letzterSyncText || '')}</p>` : ''}
          <div class="nl-knoepfe">
            <button class="knopf-gold" type="submit">Zugang speichern</button>
            <button class="knopf-flach" data-nl="sync" type="button" ${shopify.tokenGesetzt ? '' : 'disabled'}>Kontakte jetzt holen</button>
            <button class="knopf-flach gefahr" data-nl="shopify-weg" type="button" ${shopify.shop ? '' : 'disabled'}>Zugang löschen</button>
          </div>
        </form>
      </details>`
  }

  function abmeldeBlock() {
    if (!abmeldungen) return ''
    const a = abmeldungen
    const inbox = String(a.ordner || '').toUpperCase() === 'INBOX'
    return `
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Abmeldungen per Mail</span></summary>
        <form class="nl-form" data-abmelde-form>
          <p class="nl-form-text">Der Abmeldelink in jeder Kampagne ist eine Mail an
          <strong>${m(a.abmeldeAdresse || '(noch keine Adresse)')}</strong>. Vendo liest sie hier aus
          und sperrt die Adresse — lokal und bei Shopify. Ohne das müsstest du jede Abmeldung von
          Hand in der Liste sperren.</p>
          <p class="nl-form-text leise">Richte dazu bei IONOS eine Filterregel ein, die solche
          Mails in einen eigenen Ordner legt. Vendo liest nur diesen Ordner, markiert Verarbeitetes
          als gelesen und löscht nichts — so kommen die Mails auch deinem Kundenservice nicht in
          die Quere.</p>

          <label class="nl-haken">
            <input type="checkbox" name="aktiv" ${a.aktiv ? 'checked' : ''} ${a.postfachBereit ? '' : 'disabled'} />
            Abmeldungen alle zehn Minuten einlesen
          </label>
          ${a.postfachBereit ? '' : '<div class="nl-warnung">Dafür müssen erst die Zugangsdaten des Postfachs eingetragen sein (Reiter „Zugang“).</div>'}

          <div class="nl-form-paar">
            <label>Ordner im Postfach
              <input name="ordner" maxlength="120" value="${m(a.ordner)}" placeholder="${m(a.standardOrdner)}" />
              <small>Genau wie im Postfach geschrieben.</small></label>
            <label>Posteingangsserver
              <input name="host" maxlength="120" value="${m(a.host)}" placeholder="${m(a.standardHost)}" />
              <small>Port ${Number(a.port)} mit SSL/TLS.</small></label>
          </div>
          ${inbox ? '<div class="nl-warnung">INBOX ist dein normales Postfach — dort liegen auch die Kundenmails, die Hermes beobachtet. Vendo wertet dann nur Mails aus, deren Betreff nach einer Abmeldung aussieht. Ein eigener Ordner ist sicherer.</div>' : ''}
          ${a.letzterLauf ? `<p class="nl-form-text leise">Zuletzt geprüft: ${m(zeit(a.letzterLauf))} — ${m(a.letzterText || '')}</p>` : ''}

          <div class="nl-knoepfe">
            <button class="knopf-gold" type="submit">Speichern</button>
            <button class="knopf-flach" data-nl="abmelde-pruefen" type="button" ${a.postfachBereit ? '' : 'disabled'}>Verbindung prüfen</button>
            <button class="knopf-flach" data-nl="abmelde-jetzt" type="button" ${a.postfachBereit ? '' : 'disabled'}>Jetzt einlesen</button>
          </div>
        </form>
      </details>`
  }

  function kontaktZeilen() {
    if (!kontakte?.liste?.length) {
      return `<div class="nl-leer"><p class="leise">${suche ? 'Keine Adresse passt zur Suche.' : 'Noch keine Kontakte. Oben bei Shopify holen oder eine CSV einfügen.'}</p></div>`
    }
    return `
      <table class="nl-tabelle">
        <thead><tr><th>Adresse</th><th>Name</th><th>Quelle</th><th>Zustand</th><th>Zustimmung</th><th>Status</th><th></th></tr></thead>
        <tbody>${kontakte.liste
          .map(
            (k) => `
          <tr class="${k.gesperrt ? 'nl-zeile-fehler' : ''}">
            <td class="nl-mono">${m(k.email)}</td>
            <td>${m(`${k.vorname} ${k.nachname}`.trim())}</td>
            <td class="nl-mono">${m(k.quelle || '')}</td>
            <td class="nl-mono">${k.zustand ? (k.zustand === 'SUBSCRIBED' ? `<span class="nl-an">${m(k.zustand)}</span>` : `<span class="nl-rot">${m(k.zustand)}</span>`) : '<span class="leise">—</span>'}</td>
            <td class="nl-mono">${k.zustimmungAm ? m(datum(k.zustimmungAm)) : '<span class="nl-rot">fehlt</span>'}</td>
            <td class="nl-mono">${k.gesperrt ? '<span class="nl-rot">gesperrt</span>' : '<span class="nl-an">aktiv</span>'}</td>
            <td class="nl-aktionen">
              ${k.gesperrt ? `<button class="knopf-mini" data-nl="frei" data-email="${m(k.email)}" type="button">Freigeben</button>` : `<button class="knopf-mini" data-nl="sperren" data-email="${m(k.email)}" type="button">Abmelden</button>`}
              <button class="knopf-mini" data-nl="weg" data-email="${m(k.email)}" type="button">Löschen</button>
            </td>
          </tr>`
          )
          .join('')}</tbody>
      </table>
      ${kontakte.gefunden > kontakte.liste.length ? `<p class="nl-form-text leise">${kontakte.gefunden} passen zur Suche, gezeigt werden ${kontakte.liste.length}.</p>` : ''}`
  }

  function kontakteAnsicht() {
    if (!kontakte) return '<div class="nl-leer"><p>Der Hintergrundteil ist nicht erreichbar.</p><p class="leise">Vendo einmal neu starten.</p></div>'
    return `
      <div class="nl-kacheln nl-kacheln-schmal">
        ${kachel('Empfänger', zahl(kontakte.empfaenger), 'dürfen Kampagnen', { titel: 'dürfen Kampagnen bekommen' })}
        ${kachel('Bestätigung offen', zahl(kontakte.offeneBestaetigung), 'Shopify PENDING', { titel: 'Shopify: PENDING — bekommen nichts' })}
        ${kachel('Gesperrt', zahl(kontakte.gesperrt), 'abgemeldet')}
        ${kachel('Ohne Nachweis', zahl(kontakte.ohneZustimmung), 'ohne Datum', { titel: 'kein Zustimmungsdatum' })}
        ${kachel('Gesamt', zahl(kontakte.gesamt), `${kontakte.ausShopify} Shopify, ${kontakte.ausImport} Import`, { titel: `${kontakte.ausShopify} aus Shopify, ${kontakte.ausImport} importiert` })}
      </div>
      ${meldungsZeile(kontaktMeldung)}
      ${shopifyBlock()}
      ${abmeldeBlock()}
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Adressen einfügen (CSV)</span></summary>
        <form class="nl-form" data-import-form>
          <p class="nl-form-text">Erste Zeile ist die Kopfzeile, Trennzeichen wird erkannt. Ohne
          Spalte <code>zustimmungam</code> wird eine Adresse aufgenommen, aber <strong>nicht</strong>
          als Empfänger geführt — ohne Nachweis kein Versand.</p>
          <label>Inhalt der CSV-Datei <textarea name="csv" rows="6" placeholder="${m(CSV_BEISPIEL)}">${m(csvText)}</textarea></label>
          <div class="nl-knoepfe"><button class="knopf-gold" type="submit">Einfügen</button></div>
        </form>
      </details>
      <div class="nl-abschnitt">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Liste</h3>
          <form class="nl-suche" data-suche-form><input name="suche" value="${m(suche)}" placeholder="Adresse oder Name suchen" /><button class="knopf-flach" type="submit">Suchen</button></form>
        </div>
        ${kontaktZeilen()}
      </div>`
  }

  // ── Zugang, Marke, Drossel, Testmail ──

  function zugangMaske() {
    if (!zugang) {
      return `
        <div class="nl-leer">
          <p>Der Hintergrundteil des Plugins ist nicht erreichbar.</p>
          <p class="leise">Das ist normal, wenn <code>haupt.js</code> neu dazugekommen ist: Vendo
          einmal neu starten, dann erscheint hier das Formular.</p>
        </div>`
    }
    const z = zugang
    const ports = (z.ports || [465, 587]).map((p) => `<option value="${p}" ${Number(z.port) === p ? 'selected' : ''}>${p}${p === 465 ? ' (SSL/TLS)' : ' (STARTTLS)'}</option>`).join('')
    return `
      ${meldungsZeile(meldung)}
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Postfach für den Versand</span></summary>
        <form class="nl-form" data-zugang-form>
          <p class="nl-form-text">Dieses Plugin spricht selbst mit IONOS und lässt Hermes unberührt.
          Beide senden über dasselbe Postfach und teilen sich dessen Stundenlimit — dafür gibt es
          die Drossel weiter unten.</p>
        <label>Postfach-Adresse
          <input name="benutzer" type="email" required maxlength="120" value="${m(z.benutzer)}" placeholder="z. B. info@beispiel.de" autocomplete="off" />
          <small>Die vollständige Adresse ist bei IONOS gleichzeitig der Benutzername.</small></label>
        <label>Postfach-Passwort
          <input name="passwort" type="password" maxlength="200" value="" placeholder="${z.passwortGesetzt ? 'gespeichert — leer lassen, um es zu behalten' : 'Passwort aus dem IONOS-Panel'}" autocomplete="new-password" />
          <small>Das Postfach-Passwort aus dem IONOS-Panel, nicht das Passwort deines Kundenkontos.
          Es wird von Windows verschlüsselt abgelegt und nie wieder angezeigt.</small></label>
        <div class="nl-form-paar">
          <label>Postausgangsserver <input name="host" required maxlength="120" value="${m(z.host)}" /></label>
          <label>Port <select name="port">${ports}</select></label>
        </div>
        <div class="nl-form-paar">
          <label>Absendername
            <input name="absenderName" maxlength="80" value="${m(z.absenderName)}" placeholder="z. B. Donnerwolf" />
            <small>Steht im Postfach des Empfängers vor der Adresse.</small></label>
          <label>Antwortadresse (optional)
            <input name="antwortAn" type="email" maxlength="120" value="${m(z.antwortAn)}" placeholder="leer = Postfach-Adresse" />
            <small>Wohin Antworten auf den Newsletter gehen sollen.</small></label>
        </div>

        ${z.tresorVerfuegbar ? '' : '<div class="nl-warnung">Windows kann gerade nichts verschlüsseln. Solange das so ist, wird kein Passwort gespeichert.</div>'}
        <div class="nl-knoepfe">
          <button class="knopf-gold" type="submit">Speichern</button>
          <button class="knopf-flach" data-nl="testen" type="button" ${z.passwortGesetzt ? '' : 'disabled'}>Anmeldung prüfen</button>
          <button class="knopf-flach gefahr" data-nl="loeschen" type="button" ${z.benutzer ? '' : 'disabled'}>Zugangsdaten löschen</button>
        </div>
        </form>
      </details>
      ${markeBlock()}
      ${drosselBlock()}
      ${testmailBlock()}`
  }

  function markeBlock() {
    if (!marke) return ''
    return `
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Marke und Pflichtangaben</span></summary>
        <form class="nl-form" data-marke-form>
          <p class="nl-form-text">Kopf und Fuß jeder Kampagne entstehen daraus. <strong>Ohne
          Impressum und Abmeldeweg lässt sich keine Kampagne starten</strong> — beides ist in
          Werbemails Pflicht.</p>
        <div class="nl-form-paar">
          <label>Name im Kopf <input name="titel" maxlength="80" value="${m(marke.titel)}" placeholder="z. B. Donnerwolf" /></label>
          <label>Logo-Adresse (optional)
            <input name="logo" maxlength="300" value="${m(marke.logo)}" placeholder="https://…/logo.png" />
            <small>Muss öffentlich erreichbar sein, sonst zeigt es im Postfach nichts.</small></label>
        </div>
        <label>Abmeldeadresse
          <input name="abmeldeAdresse" type="email" maxlength="120" value="${m(marke.abmeldeAdresse)}" placeholder="leer = Postfach-Adresse" />
          <small>Dorthin geht der Abmeldelink als Mail. Diese Mails am besten per Filterregel in einen eigenen Ordner sortieren.</small></label>
        <label>Impressum im Fuß
          <textarea name="impressum" rows="4" placeholder="Firma, Straße, Ort, Vertretung, Kontakt">${m(marke.impressum)}</textarea>
          <small>Jede Zeile wird ein Teil; im Fuß stehen sie mit „ | “ hintereinander und
          brechen von selbst um. Eine freie Zeile dazwischen erzwingt einen festen Umbruch.</small></label>
        ${kopfFelder()}
        ${fussFelder()}
        <div class="nl-knoepfe">
          <button class="knopf-gold" type="submit">Marke speichern</button>
          <button class="knopf-flach" data-nl="marke-test" type="button" ${zugang?.passwortGesetzt ? '' : 'disabled'}>Beispielmail mit Logo an mich</button>
        </div>
        <p class="nl-form-text leise">Die Beispielmail zeigt Kopf, Logo und Fuß so, wie sie in
        jeder Kampagne aussehen. Die freie Testmail weiter unten schickt dagegen genau das, was
        in ihrem Feld steht — ohne Rahmen und ohne Logo.</p>
        </form>
      </details>`
  }

  // Ein Farbfeld, wie es Kopf und Fuß beide brauchen
  function farbfeld(bereich, name, beschriftung, standard, hinweis) {
    const wert = (marke[bereich] || {})[name] || ''
    return `
          <label>${m(beschriftung)}
            <input name="${m(bereich)}_${m(name)}" maxlength="9" value="${m(wert)}" placeholder="${m(standard)}" />
            <small>${m(hinweis)}</small></label>`
  }

  // Die Felder für den Kopf: Vendo setzt ihn vor jede Mail, damit im Editor und in der
  // KI-Antwort nur noch der Inhalt steht. Das Logo kommt aus der Marke, lässt sich hier
  // aber überschreiben und in der Größe stellen.
  function kopfFelder() {
    const k = marke.kopf || {}
    return `
        <p class="nl-fuss-titel">Kopf jeder Mail</p>
        <p class="nl-form-text">Vendo setzt den Kopf <strong>vor jede Mail</strong> — genau
        wie den Fuß dahinter. Kampagnen, Vorlagen und Luzzy brauchen das Logo deshalb nicht
        mehr mitzuliefern, sie schreiben nur noch den Inhalt. Ohne eigene Adresse nimmt der
        Kopf das Logo von oben; ohne Logo steht der Name als Schriftzug da.</p>
        <label class="nl-haken nl-klein"><input type="checkbox" name="kopf_zeigen" ${k.zeigen === false ? '' : 'checked'} /> Kopf vor jede Mail setzen</label>
        <div class="nl-form-paar">
          <label>Logo-Adresse im Kopf
            <input name="kopf_logo" maxlength="300" value="${m(k.logo || '')}" placeholder="leer = Logo von oben" /></label>
          <label>Breite in Pixel
            <input name="kopf_logoBreite" type="number" min="40" max="560" step="10" value="${Number(k.logoBreite) || marke.logoBreiteKopfStandard || 180}" />
            <small>Höchstens 560 — so breit ist die Mail.</small></label>
        </div>
        <div class="nl-fuss-farben">
          ${farbfeld('kopf', 'hintergrund', 'Grund im Kopf', 'wie die Mail', 'z. B. #17304f')}
          ${farbfeld('kopf', 'text', 'Schriftzug', 'wie die Mail', 'nur ohne Logo')}
        </div>
        <p class="nl-form-text leise">Hat eine ältere Vorlage noch ein Logo im Inhalt, steht
        es jetzt doppelt da — nimm es dort heraus oder schalte den Kopf hier ab.</p>`
  }

  // Die Felder für den Fuß: Pflichtlinks, Social-Icons, Logo und der Abmeldetext. Alles
  // Adressen — einmal eingetragen, stehen sie in jeder Mail. Die Listen kommen aus
  // bausteine.js (über markeLesen), damit die Reihenfolge nur an einer Stelle steht.
  function fussFelder() {
    const f = marke.fuss || {}
    const wert = (name) => m(f[name] || '')
    const breite = Number(f.logoBreite) || marke.logoBreiteFussStandard || 120

    const rechtslinks = (marke.rechtslinks || [])
      .map(
        (l) => `
          <label>${m(l.name)}-Adresse
            <input name="fuss_${m(l.id)}" maxlength="300" value="${wert(l.id)}" placeholder="https://…" /></label>`
      )
      .join('')

    const social = (marke.netzwerke || [])
      .map(
        (n) => `
          <div class="nl-fuss-netz">
            <span>${m(n.name)}</span>
            <input name="fuss_${m(n.id)}" maxlength="300" value="${wert(n.id)}" placeholder="https://… (Profil-Adresse)" />
            <input name="fuss_${m(n.id)}Icon" maxlength="300" value="${wert(`${n.id}Icon`)}" placeholder="${n.mitBild ? 'anderes Icon-Bild (https://…)' : 'https://… (Icon-Bild fehlt)'}" />
          </div>`
      )
      .join('')

    return `
        <p class="nl-fuss-titel">Fuß jeder Mail</p>
        <p class="nl-form-text">Hier nur Adressen eintragen — Vendo baut daraus den Fuß und
        hängt ihn an <strong>jede</strong> Mail: Logo, Social-Icons, die Pflichtlinks und
        darunter mittig den Abmeldelink. Leere Felder bleiben im Fuß weg. Alle Adressen
        müssen mit <code>https://</code> beginnen.</p>
        ${rechtslinks}
        <p class="nl-fuss-titel">Social-Media-Icons</p>
        <p class="nl-form-text">Nur die Profil-Adresse eintragen — das Icon nimmt Vendo aus
        <code>plugins/newsletter/social media icons</code>, verkleinert es und
        <strong>schickt es mit der Mail mit</strong>. Du musst nichts hochladen. Weiße
        Silhouetten bekommen dabei die Schriftfarbe des Fußes. Das zweite Feld ist nur für
        den Fall, dass du für ein Netzwerk ein anderes Bild aus dem Netz einsetzen willst.</p>
        ${social}
        <div class="nl-form-paar">
          <label>Überschrift über den Icons
            <input name="fuss_socialTitel" maxlength="40" value="${wert('socialTitel')}" placeholder="${m(marke.socialTitelStandard || 'FOLGE UNS HIER')}" />
            <small>Leer lassen und speichern heißt: keine Überschrift.</small></label>
          <label>Icon-Größe in Pixel
            <input name="fuss_iconBreite" type="number" min="${Number(marke.iconBreiteMin) || 14}" max="${Number(marke.iconBreiteMax) || 40}" step="1" value="${Number(f.iconBreite) || marke.iconBreiteStandard || 22}" />
            <small>${Number(marke.iconBreiteMin) || 14} bis ${Number(marke.iconBreiteMax) || 40}.</small></label>
        </div>
        <p class="nl-fuss-titel">Logo, Text und Farben im Fuß</p>
        <div class="nl-form-paar">
          <label>Logo-Adresse im Fuß
            <input name="fuss_logo" maxlength="300" value="${wert('logo')}" placeholder="leer = Logo aus dem Kopf" /></label>
          <label>Breite in Pixel
            <input name="fuss_logoBreite" type="number" min="40" max="300" step="10" value="${breite}" /></label>
        </div>
        <label class="nl-haken nl-klein"><input type="checkbox" name="fuss_logoZeigen" ${f.logoZeigen === false ? '' : 'checked'} /> Logo im Fuß zeigen</label>
        <label>Zeile unter dem Impressum
          <input name="fuss_zusatz" maxlength="160" value="${wert('zusatz')}" placeholder="Preisangabe, z. B. zzgl. Versandkosten" />
          <small>Für den Preishinweis. Als Kleinunternehmer nach § 19 UStG gehört hier der
          Hinweis hin, dass keine Umsatzsteuer ausgewiesen wird.</small></label>
        <label>Text des Abmeldelinks
          <input name="fuss_abmeldeText" maxlength="40" value="${wert('abmeldeText')}" placeholder="${m(marke.abmeldeTextStandard || 'ABMELDEN')}" />
          <small>Steht ganz unten, mittig. Leer heißt „${m(marke.abmeldeTextStandard || 'ABMELDEN')}“.</small></label>
        <div class="nl-fuss-farben">
          ${farbfeld('fuss', 'hintergrund', 'Grund im Fuß', 'wie die Mail', 'z. B. #17304f')}
          ${farbfeld('fuss', 'text', 'Schrift und Icons', 'gedämpft', 'auch für die Icons')}
          ${farbfeld('fuss', 'akzent', 'Abmeldelink', 'wie die Schrift', 'z. B. #e8622a')}
        </div>`
  }

  function drosselBlock() {
    if (!drossel) return ''
    const abstand = Math.round(drossel.abstand / 1000)
    const pauseZeile = drossel.pausiert
      ? `<div class="nl-warnung">Der Versand pausiert noch etwa ${Math.max(Math.ceil((drossel.pauseBis - Date.now()) / 60000), 1)} Minuten, weil das Postfach ein Limit gemeldet hat.
         <button class="knopf-flach" data-nl="pause-aus" type="button">Pause beenden</button></div>`
      : ''
    return `
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Drossel</span></summary>
        <form class="nl-form" data-drossel-form>
          <p class="nl-form-text">IONOS erlaubt bei Mail Basic und Business 500 Mails pro Stunde,
          und dieses Limit teilt sich der Newsletter mit deinem Kundenservice. Was hier steht, ist
          die Obergrenze für den Newsletter.</p>
        <div class="nl-form-paar">
          <label>Mails pro Stunde
            <input name="budget" type="number" min="1" max="${drossel.budgetMax}" value="${Number(drossel.budget)}" />
            <small>Höchstens ${drossel.budgetMax}, empfohlen ${drossel.budgetStandard}. Daraus folgt ein
            Mindestabstand von ${abstand} Sekunden zwischen zwei Mails.</small></label>
          <label>In der letzten Stunde
            <input value="${Number(drossel.gesendet)} von ${Number(drossel.budget)}" readonly />
            <small>${drossel.frei} noch frei. Gezählt wird rollierend, nicht pro Stundenblock.</small></label>
        </div>
        ${pauseZeile}
        <div class="nl-knoepfe">
          <button class="knopf-gold" type="submit">Budget speichern</button>
          <button class="knopf-flach" data-nl="drossel-neu" type="button">Stand neu laden</button>
        </div>
        </form>
      </details>`
  }

  function testmailBlock() {
    if (!zugang?.passwortGesetzt) return ''
    const an = testmail.an || zugang.testAdresseWirksam || zugang.benutzer
    const name = testName || { vorname: zugang.testVorname || '', nachname: zugang.testNachname || '' }
    return `
      ${meldungsZeile(testNameMeldung)}
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Name in Testmails</span></summary>
        <form class="nl-form" data-testname-form>
          <p class="nl-form-text">Damit Testmails dich so anreden wie später deine Kunden: Vendo setzt
          diesen Namen für {{vorname}}, {{nachname}} und {{name}} ein. Leer steht dort „Vorname“.
          Gilt für alle Testmails, auch die zur Freigabe.</p>
        <div class="nl-form-paar">
          <label>Vorname <input name="vorname" maxlength="60" value="${m(name.vorname)}" placeholder="Vorname" /></label>
          <label>Nachname <input name="nachname" maxlength="60" value="${m(name.nachname)}" placeholder="Nachname" /></label>
        </div>
        <div class="nl-knoepfe"><button class="knopf-gold" type="submit">Namen merken</button></div>
        </form>
      </details>
      ${meldungsZeile(testMeldung)}
      <details class="nl-detail-karte nl-kontakt-klapp">
        <summary><span>Testmail (freier Inhalt)</span></summary>
        <form class="nl-form" data-test-form>
          <p class="nl-form-text">Eine einzelne Mail, um Absender und Zustellung zu prüfen. Sie trägt
          keinen Abmeldelink, weil sie keine Werbung ist — bei Kampagnen ist er Pflicht.</p>
        <div class="nl-form-paar">
          <label>An
            <input name="an" type="email" required maxlength="120" value="${m(an)}" />
            <small>Wird gemerkt und gilt dann für alle Testmails: die Beispielmail mit Logo und
            „Testmail an mich“ bei Kampagnen und Automationen. Leeren und senden setzt sie
            zurück auf das Postfach.</small></label>
          <label>Betreff <input name="betreff" required maxlength="200" value="${m(testmail.betreff)}" /></label>
        </div>
        <label>Inhalt (HTML erlaubt) <textarea name="inhalt" rows="6" required>${m(testmail.inhalt)}</textarea></label>
        <div class="nl-knoepfe">
          <button class="knopf-gold" type="submit">Testmail senden</button>
          <button class="knopf-flach" data-nl="vorschau" type="button">Textteil ansehen</button>
        </div>
        </form>
      </details>
      ${vorschau != null ? `<div class="nl-vorschau nl-abschnitt"><div class="nl-vorschau-titel">So sieht der Textteil aus</div><pre>${m(vorschau)}</pre></div>` : ''}`
  }

  // ── Protokoll und Warteschlange ──

  function protokollAnsicht() {
    const schlangeTeil = schlange
      ? `
      <div class="nl-form-kopf nl-protokoll-kopf">
        <h3>Warteschlange</h3>
        <span class="nl-knoepfe">
          <button class="knopf-flach" data-nl="schlange-neu" type="button">Neu laden</button>
          <button class="knopf-flach gefahr" data-nl="schlange-stop" type="button" ${schlange.offen ? '' : 'disabled'}>Offene abbrechen</button>
        </span>
      </div>
      <p class="nl-form-text">${schlange.offen} offen (${schlange.faellig} fällig, ${schlange.wartend} wartet),
      ${schlange.gesendet} gesendet, ${schlange.fehler} mit Fehler, ${schlange.abgelaufen} verfallen.
      Der Hintergrundteil arbeitet sie alle 15 Sekunden ab, so weit die Drossel es zulässt.</p>
      ${
        schlange.naechste?.length
          ? `<table class="nl-tabelle"><thead><tr><th>Fällig</th><th>An</th><th>Betreff</th><th>Versuche</th></tr></thead><tbody>${schlange.naechste
              .map((e) => `<tr><td class="nl-mono">${m(zeit(e.faelligAb))}</td><td class="nl-mono">${m(e.an)}</td><td>${m(e.betreff || '(aus Kampagne)')}</td><td class="nl-mono">${e.versuche}${e.letzterFehler ? ` · ${m(String(e.letzterFehler).slice(0, 40))}` : ''}</td></tr>`)
              .join('')}</tbody></table>`
          : '<p class="nl-form-text leise">Die Warteschlange ist leer.</p>'
      }`
      : ''

    const tabelle = protokoll.length
      ? `<table class="nl-tabelle">
          <thead><tr><th>Zeit</th><th>An</th><th>Betreff</th><th>Art</th><th>Ergebnis</th></tr></thead>
          <tbody>${protokoll
            .map(
              (e) => `
            <tr class="${e.ok ? '' : 'nl-zeile-fehler'}">
              <td class="nl-mono">${m(zeit(e.zeit))}</td>
              <td class="nl-mono">${m(e.an || '')}</td>
              <td>${m(e.betreff || '')}</td>
              <td class="nl-mono">${m(e.art || '')}</td>
              <td class="nl-mono">${e.ok ? '<span class="nl-an">ok</span>' : `<span class="nl-rot">${m(e.fehler || 'Fehler')}</span>`}</td>
            </tr>`
            )
            .join('')}</tbody>
         </table>`
      : '<div class="nl-leer"><p class="leise">Noch nichts versendet.</p></div>'

    return `
      <div class="nl-abschnitt-erst">${schlangeTeil}</div>
      <div class="nl-abschnitt">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Versandprotokoll</h3>
          <button class="knopf-flach" data-nl="protokoll-neu" type="button">Neu laden</button>
        </div>
        <p class="nl-form-text">Eine Zeile je Mail, Monatsdateien unter
        <code>daten/plugins/newsletter/</code>. Empfänger stehen gekürzt darin, der Mailtext gar nicht.</p>
        ${tabelle}
      </div>`
  }

  function geplant(id) {
    const g = GEPLANT[id]
    if (!g) return '<div class="leise nl-leer">Unbekannter Bereich.</div>'
    return `<div class="nl-leer"><div class="nl-marke">${m(g.phase)}</div><p>${m(g.text)}</p><p class="leise">Noch nicht gebaut.</p></div>`
  }

  function zeichnen() {
    for (const knopf of ctx.element.querySelectorAll('[data-bereich]')) {
      knopf.classList.toggle('gewaehlt', knopf.dataset.bereich === bereich)
    }
    const inhalt =
      bereich === 'uebersicht'
        ? uebersicht()
        : bereich === 'zugang'
          ? zugangMaske()
          : bereich === 'kontakte'
            ? kontakteAnsicht()
            : bereich === 'kampagnen'
              ? kampagnenAnsicht()
              : bereich === 'vorlagen'
                ? vorlagenAnsicht()
                : bereich === 'automationen'
                ? automationenAnsicht()
                : bereich === 'protokoll'
                  ? protokollAnsicht()
                  : geplant(bereich)
    $('[data-inhalt]').innerHTML = inhalt
    if (offenerEditor()) {
      zeilennummern()
      // Die Spalte ist eben neu entstanden und leer: den Rahmen auch dann füllen,
      // wenn dasselbe HTML herauskommt wie vorher.
      letzteVorschau = ''
      vorschauAuffrischen({ sofort: true })
    }
  }

  // Eingaben festhalten, damit sie ein Neuzeichnen überleben
  function eingabenMerken() {
    const test = $('[data-test-form]')
    if (test) testmail = { an: test.an.value, betreff: test.betreff.value, inhalt: test.inhalt.value }
    const nameForm = $('[data-testname-form]')
    if (nameForm) testName = { vorname: nameForm.elements.namedItem('vorname').value, nachname: nameForm.elements.namedItem('nachname').value }
    const imp = $('[data-import-form]')
    if (imp) csvText = imp.csv.value
    const kiForm = $('[data-ki-form]')
    if (kiForm) ki = { thema: kiForm.thema.value, ton: kiForm.ton.value }
  }

  // Schritte einer Automation aus ihrem Formular einsammeln
  function schritteAusForm(id) {
    const form = ctx.element.querySelector(`[data-auto-form][data-id="${id}"]`)
    if (!form) return null
    return [...form.querySelectorAll('[data-schritt]')].map((block) => ({
      nach: Number(block.querySelector('[data-schrittfeld="nach"]')?.value || 0) * STUNDE,
      verfallNach: Number(block.querySelector('[data-schrittfeld="verfallNach"]')?.value || 48) * STUNDE,
      betreff: block.querySelector('[data-schrittfeld="betreff"]')?.value || '',
      html: block.querySelector('[data-schrittfeld="html"]')?.value || '',
      htmlRahmen: block.querySelector('[data-schrittfeld="htmlRahmen"]')?.checked !== false
    }))
  }

  // Vorlage speichern, bevor etwas anderes damit passiert
  async function vorlageSichern() {
    const form = $('[data-vorlage-form]')
    if (!form || !gewaehlteVorlage) return true
    clearTimeout(sicherungTakt)
    const ergebnis = await holen('vorlageSpeichern', { id: gewaehlteVorlage, ...vorlageAusForm() })
    if (!ergebnis?.ok) {
      vorlageMeldung = { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      return false
    }
    await vorlagenHolen()
    return true
  }

  // Automation speichern, bevor etwas anderes damit passiert
  async function autoSichern(id) {
    const form = ctx.element.querySelector(`[data-auto-form][data-id="${id}"]`)
    if (!form) return true
    const ergebnis = await holen('automationSpeichern', {
      id,
      name: form.name?.value,
      nurMitZustimmung: form.nurMitZustimmung?.checked !== false,
      schritte: schritteAusForm(id)
    })
    if (!ergebnis?.ok) {
      autoMeldung = { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      return false
    }
    await autosHolen()
    return true
  }

  // Welcher Editor ist offen? Kampagnen und Vorlagen teilen sich Code-Feld, Vorschau und
  // Autospeichern — nur das Ziel ist ein anderes.
  function offenerEditor() {
    if (bereich === 'kampagnen' && gewaehlt) return 'kampagne'
    if (bereich === 'vorlagen' && gewaehlteVorlage) return 'vorlage'
    return null
  }

  // Was gerade im Vorlagen-Editor steht
  function vorlageAusForm() {
    const form = $('[data-vorlage-form]')
    if (!form) return null
    const feld = (wie) => form.elements.namedItem(wie)
    const rahmen = feld('htmlRahmen')
    return {
      art: 'vorlage',
      name: feld('name')?.value,
      beschreibung: feld('beschreibung')?.value,
      html: form.querySelector('[data-html-code]')?.value ?? undefined,
      htmlRahmen: rahmen ? rahmen.checked : undefined
    }
  }

  // Was gerade im Kampagnen-Editor steht — die Vorlage für Speichern und für die Vorschau.
  function kampagneAusForm() {
    const form = $('[data-kampagne-form]')
    if (!form) return null
    // Über namedItem, nicht über form.name: ein Formular hat selbst eine Eigenschaft `name`,
    // die das gleichnamige Feld verdeckt — der neue Name käme sonst nie an.
    const feld = (wie) => form.elements.namedItem(wie)
    const rahmen = feld('htmlRahmen')
    return {
      name: feld('name')?.value,
      betreff: feld('betreff')?.value,
      vorschauText: feld('vorschauText')?.value,
      html: form.querySelector('[data-html-code]')?.value ?? undefined,
      htmlRahmen: rahmen ? rahmen.checked : undefined
    }
  }

  // Kleine Anzeige im Kopf des Editors: ungespeichert / speichert / gespeichert.
  // Wird unmittelbar gesetzt, ohne Neuzeichnen — sonst springt der Fokus aus dem Feld.
  function standAnzeigen(text, klasse = '') {
    for (const stelle of ctx.element.querySelectorAll('[data-stand]')) {
      stelle.textContent = text
      stelle.className = `nl-stand-anzeige ${klasse}`
    }
  }

  // Tippen speichert von selbst. Ohne das geht im HTML-Feld bei jedem Reiterwechsel
  // Arbeit verloren, und genau dort steckt die meiste.
  function sicherungAnstossen() {
    const art = offenerEditor()
    if (!art) return
    clearTimeout(sicherungTakt)
    standAnzeigen('ungespeichert')
    sicherungTakt = setTimeout(async () => {
      if (offenerEditor() !== art) return
      const vorher = art === 'vorlage' ? gewaehlteVorlage : gewaehlt
      const ok = art === 'vorlage' ? await vorlageSichern() : await kampagneSichern()
      // inzwischen eine andere Kampagne oder Vorlage offen: dann gilt deren Stand
      if ((art === 'vorlage' ? gewaehlteVorlage : gewaehlt) !== vorher) return
      standAnzeigen(ok ? 'gespeichert' : 'nicht gespeichert', ok ? '' : 'nl-rot')
    }, 1200)
  }

  // Vorschau neu bauen — aus dem, was im Editor steht, ohne vorher zu speichern.
  function vorschauAuffrischen({ sofort = false } = {}) {
    const art = offenerEditor()
    if (!art) return
    clearTimeout(vorschauTakt)
    const bauen = async () => {
      const entwurf = art === 'vorlage' ? vorlageAusForm() : kampagneAusForm()
      if (!entwurf) return
      const ergebnis = await holen('mailVorschau', entwurf)
      if (offenerEditor() !== art) return
      if (art === 'vorlage') vorlageVorschau = ergebnis
      else vorschauDaten = ergebnis
      vorschauFuellen(ergebnis)
    }
    if (sofort) return bauen()
    vorschauTakt = setTimeout(bauen, 350)
  }

  // Zeilennummern neben dem Code-Feld. Eigenes <pre> statt eines Editors von außen: es
  // braucht nur die Zahlen, und die Höhe je Zeile ist dieselbe wie im Textfeld.
  function zeilennummern() {
    const feld = $('[data-html-code]')
    const leiste = $('[data-code-zeilen]')
    if (!feld || !leiste) return
    const anzahl = feld.value.split('\n').length
    const sollte = `${anzahl}`
    if (leiste.dataset.anzahl !== sollte) {
      leiste.textContent = Array.from({ length: anzahl }, (_, i) => i + 1).join('\n')
      leiste.dataset.anzahl = sollte
    }
    leiste.scrollTop = feld.scrollTop
  }

  // Nur die Vorschauspalte füllen, nicht die Ansicht neu zeichnen
  function vorschauFuellen(d) {
    const spalte = $('[data-vorschau-spalte]')
    if (!spalte || !d) return
    const kopf = spalte.querySelector('[data-vorschau-kopf]')
    const hinweise = spalte.querySelector('[data-vorschau-hinweise]')
    const rahmen = spalte.querySelector('[data-vorschau-rahmen]')
    const text = spalte.querySelector('[data-vorschau-text]')
    if (!d.ok) {
      if (kopf) kopf.textContent = d.text || 'Vorschau nicht möglich.'
      return
    }
    if (kopf) kopf.textContent = `Beispielkontakt: ${d.beispielAdresse || ''}`
    if (hinweise) {
      hinweise.innerHTML =
        (d.hinweise?.length ? `<div class="nl-warnung">${m(d.hinweise.join(' '))}</div>` : '') +
        (d.gesaeubert ? `<div class="nl-vorschau-gesaeubert">${m(d.gesaeubert)}</div>` : '')
    }
    // Nur erneuern, wenn sich wirklich etwas geändert hat — ein frischer Rahmen fängt oben
    // an, und die Scrollstelle in der Vorschau wäre sonst bei jedem Tastendruck weg.
    //
    // Und zwar ersetzt statt beschrieben: einem Rahmen, der mit leerem `srcdoc` entstanden
    // ist, später ein neues zuzuweisen lädt nichts nach — er bleibt weiß. Beim Einsetzen
    // aus Markup zieht derselbe Inhalt. Nachgestellt und geprüft im Browser.
    if (rahmen && d.html !== letzteVorschau) {
      rahmen.insertAdjacentHTML('afterend', `<iframe class="nl-vorschau-rahmen" sandbox="" data-vorschau-rahmen srcdoc="${m(d.html)}" title="Vorschau der Mail"></iframe>`)
      rahmen.remove()
      letzteVorschau = d.html
    }
    if (text) text.textContent = d.text || ''
  }

  // Kampagne speichern und neu laden. Gibt zurück, ob es geklappt hat.
  async function kampagneSichern() {
    const form = $('[data-kampagne-form]')
    if (!form || !gewaehlt) return true
    clearTimeout(sicherungTakt)
    const ergebnis = await holen('kampagneSpeichern', { id: gewaehlt, ...kampagneAusForm() })
    if (!ergebnis?.ok) {
      kampagneMeldung = { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      return false
    }
    await kampagnenHolen()
    return true
  }

  // ── Bedienung ──

  ctx.element.addEventListener('click', async (e) => {
    const reiter = e.target.closest('[data-bereich]')
    if (reiter) {
      eingabenMerken()
      if ((reiter.dataset.bereich === 'kampagnen' && gewaehlt) || (reiter.dataset.bereich === 'vorlagen' && gewaehlteVorlage)) {
        vorschauBreite = 'mobil'
      }
      // Erst sichern, dann weg: im HTML-Feld steckt zu viel Arbeit für ein stilles Vergessen.
      if (bereich === 'kampagnen' && gewaehlt) await kampagneSichern()
      if (bereich === 'vorlagen' && gewaehlteVorlage) await vorlageSichern()
      bereich = reiter.dataset.bereich
      meldung = testMeldung = testNameMeldung = kontaktMeldung = kampagneMeldung = autoMeldung = null
      vorschau = null
      vorschauDaten = null
      autoVorschau = null
      if (bereich === 'zugang' || bereich === 'uebersicht') await Promise.all([zugangHolen(), drosselHolen(), schlangeHolen(), markeHolen()])
      if (bereich === 'uebersicht') await rennerHolen()
      if (bereich === 'kontakte') await Promise.all([shopifyHolen(), kontakteHolen(), abmeldungenHolen()])
      if (bereich === 'kampagnen') await Promise.all([kampagnenHolen(), markeHolen(), vorlagenHolen()])
      if (bereich === 'vorlagen') await Promise.all([vorlagenHolen(), markeHolen()])
      if (bereich === 'automationen') await Promise.all([autosHolen(), laeufeHolen(), kampagnenHolen(), vorlagenHolen()])
      if (bereich === 'protokoll') await Promise.all([protokollHolen(), schlangeHolen()])
      return zeichnen()
    }

    const knopf = e.target.closest('[data-nl]')
    if (!knopf) return
    const aktion = knopf.dataset.nl
    const email = knopf.dataset.email
    const stelle = Number(knopf.dataset.stelle)
    eingabenMerken()

    // ── Zugang ──
    if (aktion === 'testen') {
      meldung = { ok: true, text: 'Prüfe die Anmeldung …' }
      zeichnen()
      const ergebnis = await holen('zugangTesten')
      meldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Prüfung nicht möglich.' }
      return zeichnen()
    }
    if (aktion === 'loeschen') {
      const ja = await ctx.bestaetigen('Zugangsdaten für das Postfach löschen? Danach kann nichts mehr versendet werden.', { titel: 'Zugang löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      await holen('zugangLoeschen')
      meldung = { ok: true, text: 'Zugangsdaten gelöscht.' }
      await zugangHolen()
      return zeichnen()
    }
    if (aktion === 'vorschau') {
      vorschau = (await stillHolen('textVorschau', testmail.inhalt)) ?? 'Vorschau nicht möglich.'
      return zeichnen()
    }
    if (aktion === 'renner-holen') {
      const art = knopf?.dataset.art === 'warenkorb' ? 'warenkorb' : 'bestseller'
      meldung = { ok: true, text: art === 'warenkorb' ? 'Frage Shopify nach den Warenkörben …' : 'Frage Shopify nach den Bestellungen …' }
      zeichnen()
      const ergebnis = await holen('rennerHolen', { art })
      meldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await rennerHolen()
      return zeichnen()
    }

    if (aktion === 'marke-test') {
      meldung = { ok: true, text: 'Sende die Beispielmail …' }
      zeichnen()
      const ergebnis = await holen('markeTesten')
      meldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await drosselHolen()
      return zeichnen()
    }

    if (aktion === 'drossel-neu') {
      await drosselHolen()
      return zeichnen()
    }
    if (aktion === 'pause-aus') {
      const ja = await ctx.bestaetigen('Pause beenden? Das Postfach hat ein Limit gemeldet — zu früh weiterzusenden kann die nächste Ablehnung bringen.', { titel: 'Pause beenden', ja: 'Beenden' })
      if (!ja) return
      await holen('pauseBeenden')
      await drosselHolen()
      return zeichnen()
    }

    // ── Protokoll und Warteschlange ──
    if (aktion === 'protokoll-neu') {
      await protokollHolen()
      return zeichnen()
    }
    if (aktion === 'schlange-neu') {
      await schlangeHolen()
      return zeichnen()
    }
    if (aktion === 'schlange-stop') {
      const ja = await ctx.bestaetigen(`${schlange?.offen || 0} offene Einträge abbrechen? Sie gehen dann nicht mehr raus.`, { titel: 'Warteschlange abbrechen', ja: 'Abbrechen', gefahr: true })
      if (!ja) return
      await holen('warteschlangeAbbrechen')
      await schlangeHolen()
      return zeichnen()
    }

    // ── Kontakte ──
    if (aktion === 'sync') {
      kontaktMeldung = { ok: true, text: 'Hole die Abonnenten bei Shopify …' }
      zeichnen()
      const ergebnis = await holen('kontakteSynchronisieren')
      kontaktMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Sync nicht möglich.' }
      await Promise.all([shopifyHolen(), kontakteHolen(), abmeldungenHolen()])
      return zeichnen()
    }
    if (aktion === 'shopify-weg') {
      const ja = await ctx.bestaetigen('Shopify-Zugang löschen? Danach können keine Kontakte geholt und keine Abmeldungen zurückgeschrieben werden.', { titel: 'Shopify-Zugang löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      await holen('shopifyLoeschen')
      kontaktMeldung = { ok: true, text: 'Shopify-Zugang gelöscht.' }
      await shopifyHolen()
      return zeichnen()
    }
    if (aktion === 'abmelde-pruefen') {
      kontaktMeldung = { ok: true, text: 'Prüfe die Verbindung zum Postfach …' }
      zeichnen()
      const ergebnis = await holen('abmeldungenVerbindungPruefen')
      kontaktMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Prüfung nicht möglich.' }
      return zeichnen()
    }
    if (aktion === 'abmelde-jetzt') {
      kontaktMeldung = { ok: true, text: 'Lese Abmeldungen …' }
      zeichnen()
      const ergebnis = await holen('abmeldungenPruefen')
      kontaktMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await Promise.all([kontakteHolen(), abmeldungenHolen()])
      return zeichnen()
    }

    if (aktion === 'sperren' && email) {
      const ja = await ctx.bestaetigen(`${email} abmelden? Die Adresse bleibt gesperrt in der Liste und wird bei Shopify auf „nicht abonniert“ gesetzt.`, { titel: 'Abmelden', ja: 'Abmelden' })
      if (!ja) return
      const ergebnis = await holen('kontaktSperren', { email, grund: 'von Hand abgemeldet' })
      kontaktMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await kontakteHolen()
      return zeichnen()
    }
    if (aktion === 'frei' && email) {
      const ergebnis = await holen('kontaktFreigeben', { email })
      kontaktMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await kontakteHolen()
      return zeichnen()
    }
    if (aktion === 'weg' && email) {
      const ja = await ctx.bestaetigen(`${email} vollständig löschen? Für eine Abmeldung ist „Abmelden“ richtig — gelöschte Adressen holt der nächste Shopify-Sync wieder herein, wenn sie dort weiter zustimmen.`, { titel: 'Kontakt löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      const ergebnis = await holen('kontaktLoeschen', { email })
      kontaktMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await kontakteHolen()
      return zeichnen()
    }

    // ── Kampagnen ──
    if (aktion === 'kampagne-neu') {
      const ergebnis = await holen('kampagneAnlegen', 'Neue Kampagne')
      if (ergebnis?.ok) {
        gewaehlt = ergebnis.id
        vorschauBreite = 'mobil'
      }
      kampagneMeldung = null
      vorschauDaten = null
      await kampagnenHolen()
      return zeichnen()
    }
    if (aktion === 'kampagne-auf') {
      if (gewaehlt && gewaehlt !== knopf.dataset.id) await kampagneSichern()
      gewaehlt = knopf.dataset.id
      vorschauBreite = 'mobil'
      kampagneMeldung = null
      vorschauDaten = null
      await kampagnenHolen()
      return zeichnen()
    }
    if (aktion === 'kampagne-weg') {
      const ja = await ctx.bestaetigen('Diese Kampagne löschen?', { titel: 'Kampagne löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      const ergebnis = await holen('kampagneLoeschen', gewaehlt)
      gewaehlt = ergebnis?.ok ? null : gewaehlt
      kampagneMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      vorschauDaten = null
      await kampagnenHolen()
      return zeichnen()
    }
    if (aktion === 'kampagne-zu') {
      await kampagneSichern()
      gewaehlt = null
      kampagneMeldung = null
      vorschauDaten = null
      await kampagnenHolen()
      return zeichnen()
    }
    if (aktion === 'vorschau-breite') {
      vorschauBreite = knopf.dataset.breite === 'mobil' ? 'mobil' : 'desktop'
      const buehne = $('[data-vorschau-buehne]')
      if (buehne) buehne.classList.toggle('mobil', vorschauBreite === 'mobil')
      for (const b of ctx.element.querySelectorAll('[data-nl="vorschau-breite"]')) {
        b.classList.toggle('gewaehlt', b.dataset.breite === vorschauBreite)
      }
      return
    }
    // Eine schlichte Startmail ins Code-Feld setzen
    if (aktion === 'html-beispiel') {
      const art = offenerEditor()
      const feld = $('[data-html-code]')
      if (!feld || !art) return
      const melden = (text) => {
        if (art === 'vorlage') vorlageMeldung = { ok: false, text }
        else kampagneMeldung = { ok: false, text }
        return zeichnen()
      }
      const neu = (art === 'vorlage' ? vorlagen?.beispielHtml : kampagnen?.beispielHtml) || ''
      if (!neu) return melden('Dafür gibt es nichts zu übernehmen.')
      if (feld.value.trim()) {
        const ja = await ctx.bestaetigen('Das HTML-Feld überschreiben? Was darin steht, geht verloren.', { titel: 'HTML ersetzen', ja: 'Überschreiben', gefahr: true })
        if (!ja) return
      }
      feld.value = neu
      zeilennummern()
      vorschauAuffrischen({ sofort: true })
      sicherungAnstossen()
      return
    }
    if (aktion === 'kampagne-test') {
      if (!(await kampagneSichern())) return zeichnen()
      kampagneMeldung = { ok: true, text: 'Sende die Testmail …' }
      zeichnen()
      const ergebnis = await holen('kampagneTesten', gewaehlt)
      kampagneMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Testmail nicht möglich.' }
      await Promise.all([kampagnenHolen(), drosselHolen()])
      return zeichnen()
    }
    if (aktion === 'kampagne-start') {
      if (!(await kampagneSichern())) return zeichnen()
      const anzahl = Number(kampagnen?.empfaenger) || 0
      const ja = await ctx.bestaetigen(
        `Kampagne an ${anzahl} Empfänger senden? Sie wandern in die Warteschlange und gehen gedrosselt raus — bei ${drossel?.budget || 300} Mails pro Stunde dauert das etwa ${Math.max(Math.ceil(anzahl / (drossel?.budget || 300)), 1)} Stunde(n).`,
        { titel: 'Kampagne senden', ja: 'Senden' }
      )
      if (!ja) return
      const ergebnis = await holen('kampagneStarten', gewaehlt)
      kampagneMeldung = ergebnis?.ok
        ? { ok: true, text: `${ergebnis.eingereiht} Empfänger eingereiht${ergebnis.uebersprungen ? `, ${ergebnis.uebersprungen} übersprungen (schon bedient)` : ''}. Der Versand läuft jetzt im Hintergrund.` }
        : { ok: false, text: (ergebnis?.fehler || ['Start nicht möglich.']).join(' ') }
      await Promise.all([kampagnenHolen(), schlangeHolen()])
      return zeichnen()
    }
    if (aktion === 'kampagne-planen') {
      if (!(await kampagneSichern())) return zeichnen()
      const form = $('[data-kampagne-form]')
      const datum = form?.elements.namedItem('geplantDatum')?.value
      const uhrzeit = form?.elements.namedItem('geplantUhrzeit')?.value
      const wert = datum && uhrzeit ? `${datum}T${uhrzeit}` : ''
      if (!wert) {
        kampagneMeldung = { ok: false, text: 'Bitte Versanddatum und Uhrzeit auswählen.' }
        return zeichnen()
      }
      const zeitpunkt = new Date(wert).getTime()
      if (Number.isNaN(zeitpunkt)) {
        kampagneMeldung = { ok: false, text: 'Der gewählte Zeitpunkt ist ungültig.' }
        return zeichnen()
      }
      const ergebnis = await holen('kampagnePlanen', { id: gewaehlt, geplantAm: zeitpunkt })
      kampagneMeldung = ergebnis?.ok ? { ok: true, text: `Geplant für ${zeit(zeitpunkt)}. Vendo muss dann laufen.` } : { ok: false, text: (ergebnis?.fehler || ['Planen nicht möglich.']).join(' ') }
      await kampagnenHolen()
      return zeichnen()
    }
    // Den Stand übernehmen, den ein Bot gerade gespeichert hat
    if (aktion === 'editor-neu-laden') {
      clearTimeout(sicherungTakt) // nicht mit dem alten Stand drüberspeichern
      await Promise.all([kampagnenHolen(), vorlagenHolen()])
      return zeichnen()
    }
    // Felix bestätigt, was ein Bot zur Freigabe gegeben hat: erst jetzt wird geplant
    if (aktion === 'kampagne-freigeben') {
      if (!(await kampagneSichern())) return zeichnen()
      const datum = $('[data-freigabe-datum]')?.value
      const uhrzeit = $('[data-freigabe-uhrzeit]')?.value
      const wert = datum && uhrzeit ? `${datum}T${uhrzeit}` : ''
      if (!wert) {
        kampagneMeldung = { ok: false, text: 'Wähl Datum und Uhrzeit — oder schick sie mit „Jetzt an alle senden“ sofort.' }
        return zeichnen()
      }
      const zeitpunkt = new Date(wert).getTime()
      if (Number.isNaN(zeitpunkt)) {
        kampagneMeldung = { ok: false, text: 'Der gewählte Zeitpunkt ist ungültig.' }
        return zeichnen()
      }
      const anzahl = Number(kampagnen?.empfaenger) || 0
      const ja = await ctx.bestaetigen(`Kampagne freigeben? Sie geht am ${zeit(zeitpunkt)} an ${anzahl} Empfänger. Bis dahin kannst du sie noch abbrechen.`, { titel: 'Freigeben und planen', ja: 'Freigeben' })
      if (!ja) return
      const ergebnis = await holen('kampagnePlanen', { id: gewaehlt, geplantAm: zeitpunkt })
      kampagneMeldung = ergebnis?.ok ? { ok: true, text: `Freigegeben und geplant für ${zeit(zeitpunkt)}. Vendo muss dann laufen.` } : { ok: false, text: (ergebnis?.fehler || ['Freigeben nicht möglich.']).join(' ') }
      await kampagnenHolen()
      return zeichnen()
    }
    if (aktion === 'kampagne-stop') {
      const ja = await ctx.bestaetigen('Kampagne abbrechen? Offene Einträge in der Warteschlange werden verworfen, bereits versendete Mails bleiben versendet.', { titel: 'Kampagne abbrechen', ja: 'Abbrechen', gefahr: true })
      if (!ja) return
      const ergebnis = await holen('kampagneAbbrechen', gewaehlt)
      kampagneMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await Promise.all([kampagnenHolen(), schlangeHolen()])
      return zeichnen()
    }
    if (aktion === 'kampagne-entwurf') {
      const ergebnis = await holen('kampagneZurueckZumEntwurf', gewaehlt)
      kampagneMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await kampagnenHolen()
      return zeichnen()
    }

    // ── Vorlagen ──
    if (aktion === 'vorlage-neu') {
      const ergebnis = await holen('vorlageAnlegen', { name: 'Neue Vorlage' })
      if (ergebnis?.ok) {
        gewaehlteVorlage = ergebnis.id
        vorschauBreite = 'mobil'
      }
      vorlageMeldung = ergebnis?.ok ? null : { ok: false, text: ergebnis?.text || 'Nicht möglich.' }
      vorlageVorschau = null
      await vorlagenHolen()
      return zeichnen()
    }
    if (aktion === 'vorlage-auf') {
      if (gewaehlteVorlage && gewaehlteVorlage !== knopf.dataset.id) await vorlageSichern()
      gewaehlteVorlage = knopf.dataset.id
      vorschauBreite = 'mobil'
      vorlageMeldung = null
      vorlageVorschau = null
      await vorlagenHolen()
      return zeichnen()
    }
    if (aktion === 'vorlage-weg') {
      const ja = await ctx.bestaetigen('Diese Vorlage löschen? Kampagnen, die sie schon übernommen haben, bleiben unverändert.', { titel: 'Vorlage löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      const ergebnis = await holen('vorlageLoeschen', gewaehlteVorlage)
      if (ergebnis?.ok) gewaehlteVorlage = null
      vorlageMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      vorlageVorschau = null
      await vorlagenHolen()
      return zeichnen()
    }
    if (aktion === 'vorlage-zu') {
      await vorlageSichern()
      gewaehlteVorlage = null
      vorlageMeldung = null
      vorlageVorschau = null
      await vorlagenHolen()
      return zeichnen()
    }
    if (aktion === 'vorlage-ki-neu') {
      // Derselbe Weg wie das Formular, nur ohne Ziel: es entsteht eine neue Vorlage
      const form = $('[data-vorlage-ki-form]')
      if (form) {
        form.dataset.id = ''
        form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
      }
      return
    }
    if (aktion === 'vorlage-test') {
      if (!(await vorlageSichern())) return zeichnen()
      vorlageMeldung = { ok: true, text: 'Sende die Testmail …' }
      zeichnen()
      const ergebnis = await holen('vorlageTesten', gewaehlteVorlage)
      vorlageMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Testmail nicht möglich.' }
      await drosselHolen()
      return zeichnen()
    }
    if (aktion === 'vorlage-anwenden') {
      const ziel = knopf.dataset.ziel
      const id = knopf.dataset.id
      const nummer = knopf.dataset.nummer === undefined ? null : Number(knopf.dataset.nummer)
      const kennung = `${ziel}:${id}${nummer === null ? '' : `:${nummer}`}`
      const wahl = ctx.element.querySelector(`[data-vorlage-wahl="${kennung}"]`)?.value
      if (!wahl) {
        const text = { ok: false, text: 'Erst eine Vorlage auswählen.' }
        if (ziel === 'kampagne') kampagneMeldung = text
        else autoMeldung = text
        return zeichnen()
      }
      const ja = await ctx.bestaetigen('Vorlage übernehmen? Das HTML an dieser Stelle wird dabei ersetzt.', { titel: 'Vorlage übernehmen', ja: 'Übernehmen' })
      if (!ja) return
      const ergebnis = await holen('vorlageAnwenden', { vorlageId: wahl, ziel, id, schritt: nummer })
      const meldungstext = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      if (ziel === 'kampagne') {
        kampagneMeldung = meldungstext
        await kampagnenHolen()
      } else {
        autoMeldung = meldungstext
        await autosHolen()
      }
      return zeichnen()
    }
    if (aktion === 'vorlage-sichern') {
      const ziel = knopf.dataset.ziel
      const id = knopf.dataset.id
      const nummer = knopf.dataset.nummer === undefined ? null : Number(knopf.dataset.nummer)
      // Gesichert wird, was im Feld steht: aus der Kampagne ihr HTML, aus einem
      // Automationsschritt dessen HTML.
      const ausKampagne = ziel === 'kampagne' ? kampagneAusForm() : null
      const ausSchritt = ausKampagne ? null : (schritteAusForm(id) || [])[nummer]
      const ergebnis = await holen('vorlageAusBausteinen', {
        name: ausKampagne ? ausKampagne.name : `${autos?.liste?.find((a) => a.id === id)?.name || 'Automation'} – Schritt ${(nummer || 0) + 1}`,
        html: ausKampagne ? ausKampagne.html : ausSchritt?.html,
        htmlRahmen: ausKampagne ? ausKampagne.htmlRahmen : ausSchritt?.htmlRahmen
      })
      const meldungstext = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      if (ziel === 'kampagne') kampagneMeldung = meldungstext
      else autoMeldung = meldungstext
      await vorlagenHolen()
      return zeichnen()
    }

    // ── Automationen ──
    if (aktion === 'auto-neu') {
      const ergebnis = await holen('automationAnlegen', knopf.dataset.art)
      autoMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.ok ? 'Angelegt. Texte schreiben, Testmail prüfen, dann einschalten.' : ergebnis?.text || 'Nicht möglich.' }
      await Promise.all([autosHolen(), laeufeHolen(), vorlagenHolen()])
      return zeichnen()
    }
    if (aktion === 'auto-schalten') {
      const an = knopf.dataset.an === '1'
      if (an && !(await autoSichern(knopf.dataset.id))) return zeichnen()
      if (!an) {
        const ja = await ctx.bestaetigen('Automation abschalten? Laufende Serien werden beendet — angefangene Folgemails gehen dann nicht mehr raus.', { titel: 'Abschalten', ja: 'Abschalten' })
        if (!ja) return
      }
      const ergebnis = await holen('automationSchalten', { id: knopf.dataset.id, aktiv: an })
      autoMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      await Promise.all([autosHolen(), laeufeHolen(), vorlagenHolen()])
      return zeichnen()
    }
    if (aktion === 'auto-weg') {
      const ja = await ctx.bestaetigen('Automation löschen? Laufende Serien werden beendet.', { titel: 'Automation löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      const ergebnis = await holen('automationLoeschen', knopf.dataset.id)
      autoMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      autoVorschau = null
      await Promise.all([autosHolen(), laeufeHolen(), vorlagenHolen()])
      return zeichnen()
    }
    if (aktion === 'auto-vorschau') {
      if (!(await autoSichern(knopf.dataset.id))) return zeichnen()
      autoVorschau = await holen('automationVorschau', { id: knopf.dataset.id, schritt: Number(knopf.dataset.nummer) || 0 })
      return zeichnen()
    }
    if (aktion === 'auto-vorschau-zu') {
      autoVorschau = null
      return zeichnen()
    }
    if (aktion === 'auto-test') {
      if (!(await autoSichern(knopf.dataset.id))) return zeichnen()
      autoMeldung = { ok: true, text: 'Sende die Testmail …' }
      zeichnen()
      const ergebnis = await holen('automationTesten', { id: knopf.dataset.id, schritt: Number(knopf.dataset.nummer) || 0 })
      autoMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Testmail nicht möglich.' }
      await drosselHolen()
      return zeichnen()
    }
    if (aktion === 'auto-neu-laden') {
      await Promise.all([autosHolen(), laeufeHolen(), vorlagenHolen()])
      return zeichnen()
    }
  })

  // Tippen im Kampagnen-Editor: Vorschau folgt, und gespeichert wird von selbst.
  ctx.element.addEventListener('input', (e) => {
    if (!offenerEditor()) return
    if (!e.target.closest?.('[data-kampagne-form], [data-vorlage-form]')) return
    if (e.target.matches?.('[data-html-code]')) zeilennummern()
    vorschauAuffrischen()
    sicherungAnstossen()
  })

  // Die Zahlenleiste muss mit dem Textfeld mitlaufen. Scrollen steigt nicht auf, deshalb
  // in der Erfassungsphase.
  ctx.element.addEventListener(
    'scroll',
    (e) => {
      if (!e.target.matches?.('[data-html-code]')) return
      const leiste = $('[data-code-zeilen]')
      if (leiste) leiste.scrollTop = e.target.scrollTop
    },
    true
  )

  // Karten, die kein <button> sind (Vorlagen mit Vorschaubild), mit Enter und Leertaste öffnen
  ctx.element.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return
    const karte = e.target.closest?.('[role="button"][data-nl]')
    if (!karte || karte !== e.target) return
    e.preventDefault()
    karte.click()
  })

  // Im HTML-Feld soll die Tabulatortaste einrücken, statt aus dem Feld zu springen.
  // Mit Umschalt oder Escape davor kommt man weiterhin heraus.
  ctx.element.addEventListener('keydown', (e) => {
    const feld = e.target.closest?.('[data-html-code]')
    if (!feld || e.key !== 'Tab' || e.shiftKey || e.ctrlKey || e.altKey) return
    e.preventDefault()
    const { selectionStart: von, selectionEnd: bis, value } = feld
    feld.value = `${value.slice(0, von)}  ${value.slice(bis)}`
    feld.selectionStart = feld.selectionEnd = von + 2
    zeilennummern()
    vorschauAuffrischen()
    sicherungAnstossen()
  })

  ctx.element.addEventListener('submit', async (e) => {
    const form = e.target
    e.preventDefault()
    eingabenMerken()

    if (form.matches('[data-zugang-form]')) {
      const ergebnis = await holen('zugangSpeichern', {
        benutzer: form.benutzer.value,
        passwort: form.passwort.value,
        host: form.host.value,
        port: Number(form.port.value),
        absenderName: form.absenderName.value,
        antwortAn: form.antwortAn.value
      })
      meldung = ergebnis?.ok
        ? { ok: true, text: ergebnis.passwortGesetzt ? 'Gespeichert. Mit „Anmeldung prüfen“ testen.' : 'Gespeichert, aber noch ohne Passwort.' }
        : { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      await zugangHolen()
      return zeichnen()
    }

    if (form.matches('[data-marke-form]')) {
      // Alle Felder mit dem Vorsatz „fuss_“ gehen gesammelt als Fußangaben mit, damit ein
      // neues Netzwerk in bausteine.js hier nichts nach sich zieht.
      const fuss = {}
      const kopf = {}
      for (const [vorsatz, ziel] of [['fuss_', fuss], ['kopf_', kopf]]) {
        for (const feld of form.querySelectorAll(`[name^="${vorsatz}"]`)) {
          ziel[feld.name.slice(vorsatz.length)] = feld.type === 'checkbox' ? feld.checked : feld.value
        }
      }
      const ergebnis = await holen('markeSpeichern', {
        titel: form.titel.value,
        logo: form.logo.value,
        abmeldeAdresse: form.abmeldeAdresse.value,
        impressum: form.impressum.value,
        fuss,
        kopf
      })
      const verworfen = ergebnis?.verworfen || []
      meldung = ergebnis?.ok
        ? {
            ok: verworfen.length === 0,
            text: verworfen.length
              ? `Gespeichert. Ohne https-Adresse und darum nicht übernommen: ${verworfen.join(', ')}.`
              : 'Markenangaben gespeichert.'
          }
        : { ok: false, text: 'Nicht gespeichert.' }
      await markeHolen()
      return zeichnen()
    }

    if (form.matches('[data-drossel-form]')) {
      const ergebnis = await holen('budgetSpeichern', Number(form.budget.value))
      meldung = ergebnis?.ok ? { ok: true, text: `Stundenbudget auf ${ergebnis.budget} Mails gesetzt.` } : { ok: false, text: 'Budget nicht gespeichert.' }
      await drosselHolen()
      return zeichnen()
    }

    if (form.matches('[data-shopify-form]')) {
      const ergebnis = await holen('shopifySpeichern', { shop: form.shop.value, token: form.token.value })
      kontaktMeldung = ergebnis?.ok
        ? { ok: true, text: ergebnis.tokenGesetzt ? 'Gespeichert. Mit „Kontakte jetzt holen“ den ersten Sync starten.' : 'Gespeichert, aber noch ohne Token.' }
        : { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      await shopifyHolen()
      return zeichnen()
    }

    if (form.matches('[data-abmelde-form]')) {
      const ergebnis = await holen('abmeldungenEinstellen', {
        aktiv: form.aktiv.checked,
        ordner: form.ordner.value,
        host: form.host.value
      })
      kontaktMeldung = ergebnis?.ok
        ? { ok: true, text: form.aktiv.checked ? 'Gespeichert. Vendo liest die Abmeldungen alle zehn Minuten.' : 'Gespeichert, Einlesen ist aus.' }
        : { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      await abmeldungenHolen()
      return zeichnen()
    }

    if (form.matches('[data-import-form]')) {
      const ergebnis = await holen('csvImportieren', csvText)
      if (ergebnis?.ok) {
        const teile = [`${ergebnis.angelegt} neu, ${ergebnis.aktualisiert} aktualisiert.`]
        if (ergebnis.uebersprungen) teile.push(`${ergebnis.uebersprungen} übersprungen.`)
        if (ergebnis.gesperrtGelassen) teile.push(`${ergebnis.gesperrtGelassen} bleiben gesperrt.`)
        if (ergebnis.hinweise?.length) teile.push(`Hinweise: ${ergebnis.hinweise.slice(0, 3).join(' ')}`)
        kontaktMeldung = { ok: true, text: teile.join(' ') }
        csvText = ''
      } else {
        kontaktMeldung = { ok: false, text: (ergebnis?.fehler || ['Import nicht möglich.']).join(' ') }
      }
      await kontakteHolen()
      return zeichnen()
    }

    if (form.matches('[data-suche-form]')) {
      suche = form.suche.value
      await kontakteHolen()
      return zeichnen()
    }

    if (form.matches('[data-vorlage-form]')) {
      clearTimeout(sicherungTakt)
      const ergebnis = await holen('vorlageSpeichern', { id: form.dataset.id, ...vorlageAusForm() })
      vorlageMeldung = ergebnis?.ok
        ? { ok: true, text: ergebnis.hinweise?.length ? `Gespeichert. Hinweis: ${ergebnis.hinweise.join(' ')}` : 'Gespeichert.' }
        : { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      await vorlagenHolen()
      return zeichnen()
    }

    if (form.matches('[data-vorlage-ki-form]')) {
      vorlageKi = { zweck: form.zweck.value, ton: form.ton.value }
      if (!vorlageKi.zweck.trim()) {
        vorlageMeldung = { ok: false, text: 'Ohne Zweck weiß Luzzy nicht, wofür die Vorlage sein soll.' }
        return zeichnen()
      }
      if (gewaehlteVorlage && !(await vorlageSichern())) return zeichnen()
      vorlageMeldung = { ok: true, text: 'Luzzy entwirft … das kann eine Minute dauern.' }
      zeichnen()
      const auftrag = await holen('vorlageKiAuftrag', { zweck: vorlageKi.zweck, ton: vorlageKi.ton })
      if (!auftrag?.ok) {
        vorlageMeldung = { ok: false, text: 'Auftrag konnte nicht gebaut werden.' }
        return zeichnen()
      }
      let antwort
      try {
        antwort = await ctx.fragen(auftrag.auftrag)
      } catch (fehler) {
        vorlageMeldung = { ok: false, text: `Luzzy hat nicht geantwortet: ${fehler.message}` }
        return zeichnen()
      }
      const ziel = form.dataset.id || null
      const uebernommen = await holen('vorlageKiUebernehmen', { id: ziel, text: antwort })
      if (uebernommen?.ok && uebernommen.id) gewaehlteVorlage = uebernommen.id
      vorlageMeldung = { ok: Boolean(uebernommen?.ok), text: uebernommen?.text || 'Antwort nicht verwertbar.' }
      vorlageVorschau = null
      await vorlagenHolen()
      return zeichnen()
    }

    if (form.matches('[data-auto-form]')) {
      const id = form.dataset.id
      const ergebnis = await holen('automationSpeichern', {
        id,
        name: form.name?.value,
        nurMitZustimmung: form.nurMitZustimmung?.checked !== false,
        schritte: schritteAusForm(id)
      })
      autoMeldung = ergebnis?.ok
        ? { ok: true, text: ergebnis.hinweise?.length ? `Gespeichert. Zum Einschalten fehlt noch: ${ergebnis.hinweise.join(' ')}` : 'Gespeichert.' }
        : { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      await autosHolen()
      return zeichnen()
    }

    if (form.matches('[data-kampagne-form]')) {
      clearTimeout(sicherungTakt)
      const ergebnis = await holen('kampagneSpeichern', { id: gewaehlt, ...kampagneAusForm() })
      kampagneMeldung = ergebnis?.ok
        ? { ok: true, text: ergebnis.hinweise?.length ? `Gespeichert. Vor dem Versand fehlt noch: ${ergebnis.hinweise.join(' ')}` : 'Gespeichert.' }
        : { ok: false, text: (ergebnis?.fehler || ['Speichern nicht möglich.']).join(' ') }
      await kampagnenHolen()
      return zeichnen()
    }

    // Luzzy um einen Entwurf bitten: Auftrag vom Hintergrundteil, Frage über ctx.fragen,
    // Antwort zurück an den Hintergrundteil. Das kann eine Minute dauern.
    if (form.matches('[data-ki-form]')) {
      if (!ki.thema.trim()) {
        kampagneMeldung = { ok: false, text: 'Ohne Thema weiß Luzzy nicht, worüber sie schreiben soll.' }
        return zeichnen()
      }
      if (!(await kampagneSichern())) return zeichnen()
      kampagneMeldung = { ok: true, text: 'Luzzy schreibt … das kann eine Minute dauern.' }
      zeichnen()
      const auftrag = await holen('kiAuftragHolen', { thema: ki.thema, ton: ki.ton })
      if (!auftrag?.ok) {
        kampagneMeldung = { ok: false, text: 'Auftrag konnte nicht gebaut werden.' }
        return zeichnen()
      }
      let antwort
      try {
        antwort = await ctx.fragen(auftrag.auftrag)
      } catch (fehler) {
        kampagneMeldung = { ok: false, text: `Luzzy hat nicht geantwortet: ${fehler.message}` }
        return zeichnen()
      }
      const uebernommen = await holen('kiAntwortUebernehmen', { id: gewaehlt, text: antwort })
      kampagneMeldung = { ok: Boolean(uebernommen?.ok), text: uebernommen?.text || 'Antwort nicht verwertbar.' }
      vorschauDaten = null
      await kampagnenHolen()
      return zeichnen()
    }

    if (form.matches('[data-testname-form]')) {
      const gemerkt = await holen('testNameMerken', testName || {})
      if (!gemerkt?.ok) {
        testNameMeldung = { ok: false, text: (gemerkt?.fehler || ['Der Name ließ sich nicht merken.']).join(' ') }
        return zeichnen()
      }
      testName = null
      await zugangHolen()
      testNameMeldung = { ok: true, text: gemerkt.testVorname ? `Testmails reden dich jetzt mit „${gemerkt.testVorname}“ an.` : 'Kein Name eingetragen: in Testmails steht „Vorname“.' }
      return zeichnen()
    }

    if (form.matches('[data-test-form]')) {
      // Nachfragen nur, wenn die Adresse weder das Postfach noch die eingetragene
      // Testadresse ist — eine Mail dorthin ist ja genau das Gewollte.
      const bekannt = [zugang?.benutzer, zugang?.testAdresseWirksam].filter(Boolean).map((x) => String(x).toLowerCase())
      const an = String(testmail.an || '').trim().toLowerCase()
      if (an && !bekannt.includes(an)) {
        const ja = await ctx.bestaetigen(`Testmail an ${an} schicken? Das ist nicht dein eigenes Postfach.`, { titel: 'Testmail senden', ja: 'Senden' })
        if (!ja) return
      }
      // Die eingetippte Adresse merken, bevor gesendet wird: auch bei einem Fehlschlag soll
      // sie beim nächsten Mal wieder dastehen.
      const gemerkt = await holen('testAdresseMerken', testmail.an)
      if (gemerkt && gemerkt.ok === false) {
        testMeldung = { ok: false, text: (gemerkt.fehler || ['Die Adresse ist unbrauchbar.']).join(' ') }
        return zeichnen()
      }

      testMeldung = { ok: true, text: 'Sende …' }
      vorschau = null
      zeichnen()
      const ergebnis = await holen('mailSenden', { art: 'test', an: testmail.an, betreff: testmail.betreff, html: testmail.inhalt })
      testMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Versand nicht möglich.' }
      await Promise.all([drosselHolen(), zugangHolen()])
      return zeichnen()
    }
  })

  await laden()

  // Freigaben im Blick behalten, auch wenn der Bereich nicht offen ist: schickt ein Bot eine
  // Kampagne zur Freigabe, sagt Vendo Bescheid. Was beim Start schon wartet, wird einmal
  // gemeldet, danach nur Neues.
  const gemeldeteFreigaben = new Set()
  const freigabenPruefen = async () => {
    const liste = await stillHolen('freigabenLesen')
    if (!Array.isArray(liste)) return
    const neu = liste.filter((f) => !gemeldeteFreigaben.has(`${f.id}:${f.angefragtAm}`))
    for (const f of liste) gemeldeteFreigaben.add(`${f.id}:${f.angefragtAm}`)
    if (!neu.length) return
    const text =
      neu.length === 1
        ? `${neu[0].von} hat die Kampagne „${neu[0].name}“ zur Freigabe geschickt. Die Testmail ist in deinem Postfach.`
        : `${neu.length} Kampagnen warten auf deine Freigabe.`
    ctx.melden({ titel: 'Newsletter', text, anzeige: `${text} Freigeben unter Newsletter → Kampagnen.` })
  }
  freigabenPruefen()
  setInterval(freigabenPruefen, 60000)

  // Was ein Bot im Hintergrund ändert, sofort zeigen — nicht erst beim nächsten Klick.
  // Neu gezeichnet wird nur, wenn Felix gerade nichts bearbeitet: sonst verlöre er Cursor
  // und Getipptes. Betrifft die Änderung genau das, was offen ist, kommt ein Hinweis.
  let botStandBekannt = null
  const botAenderungenPruefen = async () => {
    const s = await stillHolen('standLesen')
    if (!s || typeof s.stand !== 'number') return
    if (botStandBekannt === null || s.stand === botStandBekannt) {
      botStandBekannt = s.stand
      return
    }
    botStandBekannt = s.stand
    const zuletzt = s.zuletzt || []
    await Promise.all([kampagnenHolen(), vorlagenHolen(), autosHolen()])
    daten = { ...LEER, ...(await ctx.daten.laden()) }

    const offen = offenerEditor()
    const offenId = offen === 'kampagne' ? gewaehlt : offen === 'vorlage' ? gewaehlteVorlage : null
    const fokus = ctx.element.ownerDocument.activeElement
    const tippt = Boolean(fokus && ctx.element.contains(fokus) && fokus.matches('input, textarea, select'))
    const betroffen = zuletzt.find((z) => z.id && z.id === offenId)
    if (betroffen) return botHinweisZeigen(`${betroffen.von || 'Ein Bot'} hat das gerade geändert.`)
    if (offen || tippt) return // Listen sind aktuell, gezeichnet wird beim nächsten Wechsel
    zeichnen()
  }
  // Sofort den Ausgangsstand nehmen, nicht erst nach drei Sekunden: sonst hielte der Wächter
  // eine Änderung aus diesen ersten Sekunden für den Ausgangsstand und zeigte sie nie.
  botAenderungenPruefen()
  setInterval(botAenderungenPruefen, 3000)

  // Hinweis oben im offenen Editor, ohne ihn neu zu zeichnen
  function botHinweisZeigen(text) {
    const editor = $('.nl-kampagne')
    if (!editor) return
    editor.querySelector('[data-bot-hinweis]')?.remove()
    editor.insertAdjacentHTML(
      'afterbegin',
      `<div class="nl-freigabe" data-bot-hinweis><div class="nl-zeile nl-freigabe-knoepfe"><span class="nl-freigabe-text">${m(text)} Neu laden zeigt den neuen Stand — was du seitdem getippt hast, ist dann weg.</span><button class="knopf-gold" data-nl="editor-neu-laden" type="button">Neu laden</button></div></div>`
    )
  }

  return { laden, takt: 60000 }
}
