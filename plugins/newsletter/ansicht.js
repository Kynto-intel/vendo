// Newsletter-Plugin: Kampagnen und Automationen über das eigene IONOS-Postfach.
// Daten in daten/plugins/newsletter.json, Stand und Bauplan siehe README.md im Plugin-Ordner.
//
// Stand: Postfach, Testmail, Protokoll, Drossel, Warteschlange, Kontakte aus Shopify und
// per CSV, Kampagnen aus Bausteinen mit Entwurf von Luzzy. Noch keine Automationen.
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
  { id: 'protokoll', name: 'Protokoll' },
  { id: 'zugang', name: 'Zugang' }
]

const GEPLANT = {}

const STUNDE = 3600000

const TEST_VORLAGE = '<p>Hallo,</p>\n<p>das ist eine Testmail aus Vendo.</p>\n<p>Gruß</p>'
const CSV_BEISPIEL = 'email;vorname;nachname;zustimmungam\nmax@beispiel.de;Max;Muster;2026-01-15'

// Welche Felder im Baustein-Editor mehrzeilig sind
const LANG = new Set(['text', 'beschreibung', 'impressum'])

const ZUSTAND_TEXT = { entwurf: 'Entwurf', geplant: 'geplant', laeuft: 'läuft', fertig: 'fertig', abgebrochen: 'abgebrochen' }

export async function starten(ctx) {
  const m = ctx.maskieren
  let daten = { ...LEER }
  let zugang = null
  let drossel = null
  let schlange = null
  let kontakte = null
  let shopify = null
  let marke = null
  let kampagnen = null
  let vorschauDaten = null
  let meldung = null // Zugang-Reiter
  let testMeldung = null
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
  const kampagnenHolen = async () => (kampagnen = await stillHolen('kampagnenLesen'))
  const autosHolen = async () => (autos = await stillHolen('automationenLesen'))
  const laeufeHolen = async () => (laeufe = await stillHolen('laeufeLesen'))
  const protokollHolen = async () => (protokoll = (await stillHolen('protokollLesen', { anzahl: 50 })) || [])

  async function laden() {
    const d = await ctx.daten.laden()
    const fehlt = Object.keys(LEER).filter((k) => d[k] === undefined)
    daten = { ...LEER, ...d }
    if (fehlt.length) await ctx.daten.speichern(daten)
    await Promise.all([zugangHolen(), drosselHolen(), schlangeHolen()])
    if (bereich === 'kontakte') await Promise.all([shopifyHolen(), kontakteHolen()])
    if (bereich === 'kampagnen') await Promise.all([kampagnenHolen(), markeHolen()])
    if (bereich === 'automationen') await Promise.all([autosHolen(), laeufeHolen()])
    if (bereich === 'zugang') await markeHolen()
    if (bereich === 'protokoll') await protokollHolen()
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
  const meldungsZeile = (eintrag) => (eintrag ? `<div class="nl-meldung ${eintrag.ok ? 'nl-ok' : 'nl-fehler'}">${m(eintrag.text)}</div>` : '')

  // ── Übersicht ──

  function postfachStand() {
    if (!zugang) return { text: 'unbekannt', klasse: 'nl-aus', hinweis: 'Hintergrundteil nicht erreichbar — Vendo neu starten.' }
    if (!zugang.benutzer || !zugang.passwortGesetzt) return { text: 'nicht eingerichtet', klasse: 'nl-aus', hinweis: 'Im Reiter „Zugang“ eintragen.' }
    return { text: zugang.benutzer, klasse: 'nl-an', hinweis: `${zugang.host}:${zugang.port}` }
  }

  function versandKachel() {
    if (!drossel) return '<div class="nl-kachel"><span class="nl-kachel-name">Versand</span><span class="nl-stand nl-aus">unbekannt</span><small>Hintergrundteil nicht erreichbar.</small></div>'
    if (drossel.pausiert) {
      const minuten = Math.max(Math.ceil((drossel.pauseBis - Date.now()) / 60000), 1)
      return `<div class="nl-kachel"><span class="nl-kachel-name">Versand</span><span class="nl-stand nl-rot">pausiert</span><small>noch etwa ${minuten} Min., Postfach meldete ein Limit</small></div>`
    }
    return `<div class="nl-kachel"><span class="nl-kachel-name">Versand</span>${zahl(drossel.gesendet)}<small>von ${drossel.budget} in der letzten Stunde</small></div>`
  }

  function uebersicht() {
    const aktiv = daten.automationen.filter((a) => a.aktiv).length
    const empfaenger = daten.kontakte.filter((k) => !k.gesperrt && k.zustimmungAm).length
    const laufen = daten.kampagnen.filter((k) => k.zustand === 'laeuft' || k.zustand === 'geplant').length
    const p = postfachStand()
    return `
      <div class="nl-kacheln">
        <div class="nl-kachel"><span class="nl-kachel-name">Empfänger</span>${zahl(empfaenger)}<small>mit Zustimmung, nicht gesperrt</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Kampagnen</span>${zahl(daten.kampagnen)}<small>${laufen} geplant oder laufend</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Automationen</span>${zahl(aktiv)}<small>davon aktiv</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Postfach</span><span class="nl-stand ${p.klasse}">${m(p.text)}</span><small>${m(p.hinweis)}</small></div>
        ${versandKachel()}
        ${schlange ? `<div class="nl-kachel"><span class="nl-kachel-name">Warteschlange</span>${zahl(schlange.offen)}<small>${schlange.faellig} fällig, ${schlange.wartend} wartet${schlange.fehler ? `, ${schlange.fehler} mit Fehler` : ''}</small></div>` : ''}
      </div>
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

  // `schrittNummer` ist gesetzt, wenn die Karte zu einem Automationsschritt gehört
  function bausteinKarte(baustein, stelle, felder, schrittNummer = null) {
    const inSchritt = schrittNummer !== null
    const zusatz = inSchritt ? ` data-nummer="${schrittNummer}"` : ''
    const eigene = felder[baustein.art] || []
    const eingaben = eigene
      .map((feld) => {
        const wert = baustein[feld] ?? ''
        return LANG.has(feld)
          ? `<label>${m(feld)}<textarea data-feld="${m(feld)}" rows="4">${m(wert)}</textarea></label>`
          : `<label>${m(feld)}<input data-feld="${m(feld)}" value="${m(wert)}" /></label>`
      })
      .join('')
    const fest = baustein.art === 'kopf' || baustein.art === 'fuss'
    return `
      <div class="nl-baustein" data-baustein data-art="${m(baustein.art)}">
        <div class="nl-baustein-kopf">
          <span class="nl-baustein-art">${m(baustein.art)}${fest ? ' (fest)' : ''}</span>
          <span class="nl-baustein-knoepfe">
            <button class="knopf-mini" data-nl="${inSchritt ? 'auto-baustein-hoch' : 'baustein-hoch'}" data-stelle="${stelle}"${zusatz} type="button" title="nach oben">↑</button>
            <button class="knopf-mini" data-nl="${inSchritt ? 'auto-baustein-runter' : 'baustein-runter'}" data-stelle="${stelle}"${zusatz} type="button" title="nach unten">↓</button>
            <button class="knopf-mini" data-nl="${inSchritt ? 'auto-baustein-weg' : 'baustein-weg'}" data-stelle="${stelle}"${zusatz} type="button" title="entfernen">✕</button>
          </span>
        </div>
        ${eingaben || '<p class="nl-form-text leise">Ohne Angaben.</p>'}
      </div>`
  }

  function kampagneEditor() {
    const k = kampagnen.liste.find((x) => x.id === gewaehlt)
    if (!k) return '<div class="nl-leer"><p class="leise">Links eine Kampagne wählen oder eine neue anlegen.</p></div>'
    const laeuft = k.zustand === 'laeuft'
    const arten = (kampagnen.arten || []).filter((a) => a !== 'kopf' && a !== 'fuss')
    return `
      <form class="nl-form" data-kampagne-form data-id="${m(k.id)}">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>${m(k.name)} — ${m(ZUSTAND_TEXT[k.zustand] || k.zustand)}</h3>
          <span class="nl-knoepfe">
            <button class="knopf-flach" data-nl="kampagne-vorschau" type="button">Vorschau</button>
            <button class="knopf-flach gefahr" data-nl="kampagne-weg" type="button" ${laeuft ? 'disabled' : ''}>Löschen</button>
          </span>
        </div>

        ${laeuft ? '<div class="nl-warnung">Die Kampagne läuft. Zum Ändern erst abbrechen.</div>' : ''}

        <div class="nl-form-paar">
          <label>Name <input name="name" maxlength="80" value="${m(k.name)}" ${laeuft ? 'disabled' : ''} /></label>
          <label>Empfänger <input value="${Number(kampagnen.empfaenger) || 0} mit Zustimmung" readonly /></label>
        </div>
        <label>Betreff
          <input name="betreff" maxlength="200" value="${m(k.betreff)}" ${laeuft ? 'disabled' : ''} placeholder="z. B. Neu im Shop: {{vorname}}, schau mal" />
          <small>{{vorname}}, {{nachname}}, {{name}} und {{email}} werden pro Empfänger ersetzt.</small></label>
        <label>Vorschautext
          <input name="vorschauText" maxlength="200" value="${m(k.vorschauText)}" ${laeuft ? 'disabled' : ''} />
          <small>Steht im Postfach neben dem Betreff, nicht in der Mail selbst.</small></label>

        <div class="nl-form-kopf"><h3>Bausteine</h3></div>
        <p class="nl-form-text">Kopf und Fuß werden automatisch ergänzt — der Fuß trägt
        Abmeldelink und Impressum. Dazwischen bestimmst du (oder Luzzy) den Inhalt.</p>
        <div class="nl-bausteine" data-bausteine>
          ${(k.bausteine || []).map((b, i) => bausteinKarte(b, i, kampagnen.felder || {})).join('')}
        </div>
        <div class="nl-knoepfe">
          <select data-neue-art ${laeuft ? 'disabled' : ''}>${arten.map((a) => `<option value="${m(a)}">${m(a)}</option>`).join('')}</select>
          <button class="knopf-flach" data-nl="baustein-neu" type="button" ${laeuft ? 'disabled' : ''}>Baustein hinzufügen</button>
        </div>

        <div class="nl-knoepfe nl-abschnitt">
          <button class="knopf-gold" type="submit" ${laeuft ? 'disabled' : ''}>Speichern</button>
          <button class="knopf-flach" data-nl="kampagne-test" type="button" ${zugang?.passwortGesetzt ? '' : 'disabled'}>Testmail an mich</button>
          <button class="knopf-flach" data-nl="kampagne-start" type="button" ${laeuft ? 'disabled' : ''}>Jetzt an alle senden</button>
          ${k.zustand === 'laeuft' || k.zustand === 'geplant' ? '<button class="knopf-flach gefahr" data-nl="kampagne-stop" type="button">Abbrechen</button>' : ''}
          ${k.zustand === 'fertig' || k.zustand === 'abgebrochen' ? '<button class="knopf-flach" data-nl="kampagne-entwurf" type="button">Zurück zum Entwurf</button>' : ''}
        </div>
        <label>Oder zu einem Zeitpunkt senden
          <span class="nl-zeile">
            <input name="geplantAm" type="datetime-local" value="${k.geplantAm ? new Date(k.geplantAm - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ''}" ${laeuft ? 'disabled' : ''} />
            <button class="knopf-flach" data-nl="kampagne-planen" type="button" ${laeuft ? 'disabled' : ''}>Planen</button>
          </span>
          <small>Läuft nur, solange Vendo an ist. Ein verstrichener Zeitpunkt wird beim Start
          nachgeholt, aber nur innerhalb von 24 Stunden.</small></label>
        ${meldungsZeile(kampagneMeldung)}
      </form>
      ${kiBlock(k, laeuft)}
      ${vorschauBlock()}`
  }

  function kiBlock(k, laeuft) {
    return `
      <form class="nl-form nl-abschnitt" data-ki-form data-id="${m(k.id)}">
        <div class="nl-form-kopf"><h3>Von Luzzy entwerfen lassen</h3></div>
        <p class="nl-form-text">Luzzy bekommt die erlaubten Bausteine beschrieben und antwortet
        mit Inhalt — kein HTML. Übernommen werden Betreff, Vorschautext und die Bausteine
        zwischen Kopf und Fuß. Danach selbst prüfen und eine Testmail schicken.</p>
        <div class="nl-form-paar">
          <label>Thema <input name="thema" maxlength="200" value="${m(ki.thema)}" placeholder="z. B. Herbstaktion, drei neue Motive" ${laeuft ? 'disabled' : ''} /></label>
          <label>Tonfall (optional) <input name="ton" maxlength="120" value="${m(ki.ton)}" placeholder="z. B. kurz, direkt, kein Werbesprech" ${laeuft ? 'disabled' : ''} /></label>
        </div>
        <div class="nl-knoepfe"><button class="knopf-gold" type="submit" ${laeuft ? 'disabled' : ''}>Luzzy fragen</button></div>
      </form>`
  }

  function vorschauBlock() {
    if (!vorschauDaten) return ''
    if (!vorschauDaten.ok) return `<div class="nl-abschnitt">${meldungsZeile({ ok: false, text: vorschauDaten.text || 'Vorschau nicht möglich.' })}</div>`
    return `
      <div class="nl-abschnitt">
        <div class="nl-form-kopf nl-protokoll-kopf">
          <h3>Vorschau</h3>
          <button class="knopf-flach" data-nl="vorschau-zu" type="button">Schließen</button>
        </div>
        <p class="nl-form-text">Betreff: <strong>${m(vorschauDaten.betreff || '')}</strong> · Beispielkontakt: ${m(vorschauDaten.beispielAdresse || '')}</p>
        ${vorschauDaten.hinweise?.length ? `<div class="nl-warnung">${m(vorschauDaten.hinweise.join(' '))}</div>` : ''}
        <iframe class="nl-vorschau-rahmen" sandbox="" srcdoc="${m(vorschauDaten.html)}" title="Vorschau der Mail"></iframe>
        <div class="nl-vorschau"><div class="nl-vorschau-titel">Textteil für Programme ohne HTML</div><pre>${m(vorschauDaten.text || '')}</pre></div>
      </div>`
  }

  function kampagnenAnsicht() {
    if (!kampagnen) {
      return '<div class="nl-leer"><p>Der Hintergrundteil ist nicht erreichbar.</p><p class="leise">Vendo einmal neu starten.</p></div>'
    }
    return `
      <div class="nl-zwei">
        <div class="nl-spalte">
          <div class="nl-form-kopf nl-protokoll-kopf">
            <h3>Kampagnen</h3>
            <button class="knopf-flach" data-nl="kampagne-neu" type="button">+ Neu</button>
          </div>
          ${kampagnenListe()}
        </div>
        <div class="nl-spalte-breit">${kampagneEditor()}</div>
      </div>`
  }

  // ── Automationen ──

  function automationSchritt(automation, schritt, nummer, felder) {
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
        <div class="nl-bausteine">
          ${(schritt.bausteine || []).map((b, i) => bausteinKarte(b, i, felder, nummer)).join('') || '<p class="nl-form-text leise">Noch kein Inhalt. Unten einen Baustein hinzufügen.</p>'}
        </div>
        <div class="nl-knoepfe">
          <select data-neue-art-schritt="${nummer}">${(kampagnen?.arten || ['titel', 'text', 'knopf', 'bild', 'produkt', 'trenner']).filter((a) => a !== 'kopf' && a !== 'fuss').map((a) => `<option value="${m(a)}">${m(a)}</option>`).join('')}</select>
          <button class="knopf-flach" data-nl="auto-baustein-neu" data-id="${m(automation.id)}" data-nummer="${nummer}" type="button">Baustein hinzufügen</button>
        </div>
      </div>`
  }

  function automationKarte(automation) {
    const art = autos.arten.find((a) => a.art === automation.art)
    const felder = kampagnen?.felder || {}
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

        ${(automation.schritte || []).map((s, i) => automationSchritt(automation, s, i, felder)).join('')}

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
        <div class="nl-kachel"><span class="nl-kachel-name">Automationen</span>${zahl(autos.liste.filter((a) => a.aktiv).length)}<small>von ${autos.liste.length} eingeschaltet</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Laufende Serien</span>${zahl(laeufe?.laufen)}<small>Personen mitten in einer Serie</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Fertig</span>${zahl(laeufe?.fertig)}<small>Serien durchgelaufen</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Abgebrochen</span>${zahl(laeufe?.abgebrochen)}<small>Bestellung, Abmeldung oder zu spät</small></div>
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
      <form class="nl-form" data-shopify-form>
        <div class="nl-form-kopf"><h3>Shopify</h3></div>
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
      </form>`
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
        <div class="nl-kachel"><span class="nl-kachel-name">Empfänger</span>${zahl(kontakte.empfaenger)}<small>dürfen Kampagnen bekommen</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Bestätigung offen</span>${zahl(kontakte.offeneBestaetigung)}<small>Shopify: PENDING — bekommen nichts</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Gesperrt</span>${zahl(kontakte.gesperrt)}<small>abgemeldet</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Ohne Nachweis</span>${zahl(kontakte.ohneZustimmung)}<small>kein Zustimmungsdatum</small></div>
        <div class="nl-kachel"><span class="nl-kachel-name">Gesamt</span>${zahl(kontakte.gesamt)}<small>${kontakte.ausShopify} aus Shopify, ${kontakte.ausImport} importiert</small></div>
      </div>
      ${meldungsZeile(kontaktMeldung)}
      ${shopifyBlock()}
      <form class="nl-form nl-abschnitt" data-import-form>
        <div class="nl-form-kopf"><h3>Adressen einfügen (CSV)</h3></div>
        <p class="nl-form-text">Erste Zeile ist die Kopfzeile, Trennzeichen wird erkannt. Ohne
        Spalte <code>zustimmungam</code> wird eine Adresse aufgenommen, aber <strong>nicht</strong>
        als Empfänger geführt — ohne Nachweis kein Versand.</p>
        <label>Inhalt der CSV-Datei <textarea name="csv" rows="6" placeholder="${m(CSV_BEISPIEL)}">${m(csvText)}</textarea></label>
        <div class="nl-knoepfe"><button class="knopf-gold" type="submit">Einfügen</button></div>
      </form>
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
      <form class="nl-form" data-zugang-form>
        <div class="nl-form-kopf"><h3>Postfach für den Versand</h3></div>
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
        ${meldungsZeile(meldung)}
      </form>
      ${markeBlock()}
      ${drosselBlock()}
      ${testmailBlock()}`
  }

  function markeBlock() {
    if (!marke) return ''
    return `
      <form class="nl-form nl-abschnitt" data-marke-form>
        <div class="nl-form-kopf"><h3>Marke und Pflichtangaben</h3></div>
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
          <textarea name="impressum" rows="4" placeholder="Firma, Straße, Ort, Vertretung, Kontakt">${m(marke.impressum)}</textarea></label>
        <div class="nl-knoepfe">
          <button class="knopf-gold" type="submit">Marke speichern</button>
          <button class="knopf-flach" data-nl="marke-test" type="button" ${zugang?.passwortGesetzt ? '' : 'disabled'}>Beispielmail mit Logo an mich</button>
        </div>
        <p class="nl-form-text leise">Die Beispielmail zeigt Kopf, Logo und Fuß so, wie sie in
        jeder Kampagne aussehen. Die freie Testmail weiter unten schickt dagegen genau das, was
        in ihrem Feld steht — ohne Rahmen und ohne Logo.</p>
      </form>`
  }

  function drosselBlock() {
    if (!drossel) return ''
    const abstand = Math.round(drossel.abstand / 1000)
    const pauseZeile = drossel.pausiert
      ? `<div class="nl-warnung">Der Versand pausiert noch etwa ${Math.max(Math.ceil((drossel.pauseBis - Date.now()) / 60000), 1)} Minuten, weil das Postfach ein Limit gemeldet hat.
         <button class="knopf-flach" data-nl="pause-aus" type="button">Pause beenden</button></div>`
      : ''
    return `
      <form class="nl-form nl-abschnitt" data-drossel-form>
        <div class="nl-form-kopf"><h3>Drossel</h3></div>
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
      </form>`
  }

  function testmailBlock() {
    if (!zugang?.passwortGesetzt) return ''
    const an = testmail.an || zugang.testAdresseWirksam || zugang.benutzer
    return `
      <form class="nl-form nl-abschnitt" data-test-form>
        <div class="nl-form-kopf"><h3>Testmail (freier Inhalt)</h3></div>
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
        ${vorschau != null ? `<div class="nl-vorschau"><div class="nl-vorschau-titel">So sieht der Textteil aus</div><pre>${m(vorschau)}</pre></div>` : ''}
        ${meldungsZeile(testMeldung)}
      </form>`
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
              : bereich === 'automationen'
                ? automationenAnsicht()
                : bereich === 'protokoll'
                  ? protokollAnsicht()
                  : geplant(bereich)
    $('[data-inhalt]').innerHTML = inhalt
  }

  // Eingaben festhalten, damit sie ein Neuzeichnen überleben
  function eingabenMerken() {
    const test = $('[data-test-form]')
    if (test) testmail = { an: test.an.value, betreff: test.betreff.value, inhalt: test.inhalt.value }
    const imp = $('[data-import-form]')
    if (imp) csvText = imp.csv.value
    const kiForm = $('[data-ki-form]')
    if (kiForm) ki = { thema: kiForm.thema.value, ton: kiForm.ton.value }
  }

  const karteLesen = (karte) => {
    const baustein = { art: karte.dataset.art }
    for (const feld of karte.querySelectorAll('[data-feld]')) baustein[feld.dataset.feld] = feld.value
    return baustein
  }

  // Bausteine aus dem Kampagnen-Formular einsammeln
  function bausteineAusForm() {
    const behaelter = $('[data-bausteine]')
    if (!behaelter) return null
    return [...behaelter.querySelectorAll('[data-baustein]')].map(karteLesen)
  }

  // Schritte einer Automation aus ihrem Formular einsammeln
  function schritteAusForm(id) {
    const form = ctx.element.querySelector(`[data-auto-form][data-id="${id}"]`)
    if (!form) return null
    return [...form.querySelectorAll('[data-schritt]')].map((block) => ({
      nach: Number(block.querySelector('[data-schrittfeld="nach"]')?.value || 0) * STUNDE,
      verfallNach: Number(block.querySelector('[data-schrittfeld="verfallNach"]')?.value || 48) * STUNDE,
      betreff: block.querySelector('[data-schrittfeld="betreff"]')?.value || '',
      bausteine: [...block.querySelectorAll('[data-baustein]')].map(karteLesen)
    }))
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

  // Kampagne speichern und neu laden. Gibt zurück, ob es geklappt hat.
  async function kampagneSichern() {
    const form = $('[data-kampagne-form]')
    if (!form || !gewaehlt) return true
    const ergebnis = await holen('kampagneSpeichern', {
      id: gewaehlt,
      name: form.name?.value,
      betreff: form.betreff?.value,
      vorschauText: form.vorschauText?.value,
      bausteine: bausteineAusForm()
    })
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
      bereich = reiter.dataset.bereich
      meldung = testMeldung = kontaktMeldung = kampagneMeldung = autoMeldung = null
      vorschau = null
      vorschauDaten = null
      autoVorschau = null
      if (bereich === 'zugang' || bereich === 'uebersicht') await Promise.all([zugangHolen(), drosselHolen(), schlangeHolen(), markeHolen()])
      if (bereich === 'kontakte') await Promise.all([shopifyHolen(), kontakteHolen()])
      if (bereich === 'kampagnen') await Promise.all([kampagnenHolen(), markeHolen()])
      if (bereich === 'automationen') await Promise.all([autosHolen(), laeufeHolen(), kampagnenHolen()])
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
      await Promise.all([shopifyHolen(), kontakteHolen()])
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
      if (ergebnis?.ok) gewaehlt = ergebnis.id
      kampagneMeldung = null
      vorschauDaten = null
      await kampagnenHolen()
      return zeichnen()
    }
    if (aktion === 'kampagne-auf') {
      if (gewaehlt && gewaehlt !== knopf.dataset.id) await kampagneSichern()
      gewaehlt = knopf.dataset.id
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
    if (aktion === 'kampagne-vorschau') {
      if (!(await kampagneSichern())) return zeichnen()
      vorschauDaten = await holen('kampagneVorschau', gewaehlt)
      return zeichnen()
    }
    if (aktion === 'vorschau-zu') {
      vorschauDaten = null
      return zeichnen()
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
      const wert = form?.geplantAm?.value
      if (!wert) {
        kampagneMeldung = { ok: false, text: 'Kein Zeitpunkt gewählt.' }
        return zeichnen()
      }
      const ergebnis = await holen('kampagnePlanen', { id: gewaehlt, geplantAm: new Date(wert).getTime() })
      kampagneMeldung = ergebnis?.ok ? { ok: true, text: `Geplant für ${zeit(new Date(wert).getTime())}. Vendo muss dann laufen.` } : { ok: false, text: (ergebnis?.fehler || ['Planen nicht möglich.']).join(' ') }
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

    // ── Bausteine ──
    if (aktion === 'baustein-neu') {
      const art = $('[data-neue-art]')?.value
      const liste = bausteineAusForm() || []
      const fussStelle = liste.findIndex((b) => b.art === 'fuss')
      const neu = { art }
      if (fussStelle >= 0) liste.splice(fussStelle, 0, neu)
      else liste.push(neu)
      await holen('kampagneSpeichern', { id: gewaehlt, bausteine: liste, name: $('[data-kampagne-form]')?.name?.value, betreff: $('[data-kampagne-form]')?.betreff?.value, vorschauText: $('[data-kampagne-form]')?.vorschauText?.value })
      await kampagnenHolen()
      return zeichnen()
    }
    // ── Automationen ──
    if (aktion === 'auto-neu') {
      const ergebnis = await holen('automationAnlegen', knopf.dataset.art)
      autoMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.ok ? 'Angelegt. Texte schreiben, Testmail prüfen, dann einschalten.' : ergebnis?.text || 'Nicht möglich.' }
      await Promise.all([autosHolen(), laeufeHolen()])
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
      await Promise.all([autosHolen(), laeufeHolen()])
      return zeichnen()
    }
    if (aktion === 'auto-weg') {
      const ja = await ctx.bestaetigen('Automation löschen? Laufende Serien werden beendet.', { titel: 'Automation löschen', ja: 'Löschen', gefahr: true })
      if (!ja) return
      const ergebnis = await holen('automationLoeschen', knopf.dataset.id)
      autoMeldung = { ok: Boolean(ergebnis?.ok), text: ergebnis?.text || 'Nicht möglich.' }
      autoVorschau = null
      await Promise.all([autosHolen(), laeufeHolen()])
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
      await Promise.all([autosHolen(), laeufeHolen()])
      return zeichnen()
    }
    if (aktion === 'auto-baustein-neu') {
      const nummer = Number(knopf.dataset.nummer) || 0
      const art = ctx.element.querySelector(`[data-neue-art-schritt="${nummer}"]`)?.value
      const schritte = schritteAusForm(knopf.dataset.id) || []
      if (schritte[nummer]) schritte[nummer].bausteine = [...(schritte[nummer].bausteine || []), { art }]
      const form = ctx.element.querySelector(`[data-auto-form][data-id="${knopf.dataset.id}"]`)
      await holen('automationSpeichern', { id: knopf.dataset.id, name: form?.name?.value, nurMitZustimmung: form?.nurMitZustimmung?.checked !== false, schritte })
      await autosHolen()
      return zeichnen()
    }
    if ((aktion === 'auto-baustein-hoch' || aktion === 'auto-baustein-runter' || aktion === 'auto-baustein-weg') && Number.isFinite(stelle)) {
      const nummer = Number(knopf.dataset.nummer) || 0
      const schritte = schritteAusForm(knopf.dataset.id) || []
      const liste = schritte[nummer]?.bausteine || []
      if (aktion === 'auto-baustein-weg') liste.splice(stelle, 1)
      else {
        const ziel = aktion === 'auto-baustein-hoch' ? stelle - 1 : stelle + 1
        if (ziel < 0 || ziel >= liste.length) return
        ;[liste[stelle], liste[ziel]] = [liste[ziel], liste[stelle]]
      }
      const form = ctx.element.querySelector(`[data-auto-form][data-id="${knopf.dataset.id}"]`)
      await holen('automationSpeichern', { id: knopf.dataset.id, name: form?.name?.value, nurMitZustimmung: form?.nurMitZustimmung?.checked !== false, schritte })
      await autosHolen()
      return zeichnen()
    }

    if ((aktion === 'baustein-hoch' || aktion === 'baustein-runter' || aktion === 'baustein-weg') && Number.isFinite(stelle)) {
      const liste = bausteineAusForm() || []
      if (aktion === 'baustein-weg') liste.splice(stelle, 1)
      else {
        const ziel = aktion === 'baustein-hoch' ? stelle - 1 : stelle + 1
        if (ziel < 0 || ziel >= liste.length) return
        ;[liste[stelle], liste[ziel]] = [liste[ziel], liste[stelle]]
      }
      const form = $('[data-kampagne-form]')
      await holen('kampagneSpeichern', { id: gewaehlt, bausteine: liste, name: form?.name?.value, betreff: form?.betreff?.value, vorschauText: form?.vorschauText?.value })
      await kampagnenHolen()
      return zeichnen()
    }
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
      const ergebnis = await holen('markeSpeichern', {
        titel: form.titel.value,
        logo: form.logo.value,
        abmeldeAdresse: form.abmeldeAdresse.value,
        impressum: form.impressum.value
      })
      meldung = ergebnis?.ok ? { ok: true, text: 'Markenangaben gespeichert.' } : { ok: false, text: 'Nicht gespeichert.' }
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
      const ergebnis = await holen('kampagneSpeichern', {
        id: gewaehlt,
        name: form.name?.value,
        betreff: form.betreff?.value,
        vorschauText: form.vorschauText?.value,
        bausteine: bausteineAusForm()
      })
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
  return { laden, takt: 60000 }
}
