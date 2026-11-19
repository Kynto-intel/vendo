'use strict'
// Newsletter-Plugin: Zustellung beobachten.
//
// Ob eine Mail bei jemandem im Spam-Ordner landet, sieht kein Absender. Was man sieht, sind
// die Vorzeichen: tote Adressen, Ablehnungen wegen Spamverdacht, Beschwerden und
// Abmeldungen. Hier werden sie je Kampagne gezählt, ins Verhältnis zu den verschickten Mails
// gesetzt und zu einer Ampel zusammengefasst:
//   - grün: nichts Auffälliges;
//   - gelb: beobachten, die Oberfläche sagt, was zu tun ist;
//   - rot: Vendo hält eine laufende Kampagne an (haupt.js), bis Felix sie fortsetzt.
//
// Die Grenzen folgen verbreiteten Richtwerten: Gmail verlangt eine Beschwerdequote unter
// 0,3 % und empfiehlt unter 0,1 %; mehr als 2 % tote Adressen gelten als veraltete Liste.
// Angehalten wird erst ab `MIN_GESENDET` verschickten Mails und `MIN_FUER_ROT` Ereignissen
// derselben Art, damit ein einzelner Ausreißer am Anfang keinen Versand stoppt.
//
// Zugeordnet wird über die Zeit: ein Ereignis gehört zu der zuletzt davor gestarteten
// Kampagne, solange es bis 48 Stunden nach deren Ende eintrifft (wie die Abmeldungen in
// ergebnisse.js). Ein Rückläufer einer Automationsmail im selben Zeitraum zählt deshalb mit;
// bei Vendos Mengen ist das ein kleiner Fehler in die vorsichtige Richtung.
//
// Alle Funktionen sind rein.

const STUNDE = 3600000
const FENSTER = 48 * STUNDE
const MIN_GESENDET = 50
const MIN_FUER_ROT = 3

const ARTEN = {
  hart: {
    gelb: 0.02,
    rot: 0.05,
    name: 'tote Adressen',
    rat: 'Die Liste enthält veraltete Adressen. Vendo hat sie schon gesperrt. Prüfe, woher sie kamen (etwa ein alter CSV-Import), und setze die Kampagne danach fort.'
  },
  abgelehnt: {
    gelb: 0.01,
    rot: 0.03,
    name: 'Ablehnungen wegen Spamverdacht',
    rat: 'Mailanbieter halten die Mail für Spam. Lass die Kampagne angehalten und prüfe den Inhalt: nicht nur Bilder, ein ehrlicher Betreff, Links nur zum eigenen Shop. Schick eine Testmail an mail-tester.com und schau in Gmail unter „Original anzeigen“, ob SPF, DKIM und DMARC PASS zeigen. Häufen sich die Ablehnungen bei einem Anbieter, einen Tag warten; hilft das nicht, bei IONOS nachfragen, ob das Postfach auf einer Sperrliste steht.'
  },
  beschwerde: {
    gelb: 0.001,
    rot: 0.003,
    name: 'Beschwerden',
    rat: 'Empfänger melden die Mail als Spam. Seltener senden, im Betreff klar sagen, worum es geht, und den Abmeldelink gut sichtbar lassen. Ab 0,3 % sortiert Gmail spürbar aus.'
  },
  abmeldung: {
    gelb: 0.01,
    rot: null,
    name: 'Abmeldungen',
    rat: 'Mehr Abmeldungen als üblich: Inhalt oder Häufigkeit passen nicht ganz. Kein Grund zum Anhalten, aber beim nächsten Mal darauf achten.'
  }
}
const REIHE = ['abgelehnt', 'beschwerde', 'hart', 'abmeldung'] // wichtigster Grund zuerst
const RANG = { gruen: 0, gelb: 1, rot: 2 }
const ZAEHLBAR = new Set(['hart', 'abgelehnt', 'beschwerde', 'weich'])

const alsListe = (liste) => (Array.isArray(liste) ? liste.filter((x) => x && typeof x === 'object') : [])
const zeitVon = (wert) => {
  if (wert == null || wert === '') return NaN
  const zahl = Number(wert)
  return Number.isFinite(zahl) ? zahl : Date.parse(wert)
}
const prozent = (quote) => `${(Math.round(quote * 1000) / 10).toLocaleString('de-DE')} %`

// Zu welcher Kampagne gehört ein Ereignis zu diesem Zeitpunkt? Null, wenn zu keiner.
function kampagneZu(gestartet, am, { jetzt, fenster }) {
  const k = gestartet.find((x) => x.start <= am)
  if (!k) return null
  const ende = Number.isFinite(k.ende) ? Math.max(k.ende, k.start) : Math.max(jetzt, k.start)
  return am <= ende + fenster ? k.id : null
}

// Ereignisse je Kampagne zählen. `ereignisse` sind die Rückläufer-Einträge (ruecklaeufer.js),
// Abmeldungen kommen aus den Kontakten (gesperrt ohne Sperrart), `gesendet` je Kampagne aus
// dem Protokoll (ergebnisse.gesendetJeKampagne).
function zaehlen({ kampagnen = [], ereignisse = [], kontakte = [], gesendet = {}, jetzt = Date.now(), fenster = FENSTER } = {}) {
  const gestartet = alsListe(kampagnen)
    .map((k) => ({ id: k.id, start: zeitVon(k.gestartetAm), ende: zeitVon(k.fertigAm) }))
    .filter((k) => k.id && Number.isFinite(k.start))
    .sort((a, b) => b.start - a.start)
  const zahlen = {}
  for (const k of gestartet) zahlen[k.id] = { gesendet: Number(gesendet?.[k.id]) || 0, hart: 0, abgelehnt: 0, beschwerde: 0, weich: 0, abmeldung: 0 }

  for (const e of alsListe(ereignisse)) {
    if (!ZAEHLBAR.has(e.art)) continue
    const id = kampagneZu(gestartet, zeitVon(e.am), { jetzt, fenster })
    if (id) zahlen[id][e.art]++
  }
  for (const k of alsListe(kontakte)) {
    // Abmeldungen: gesperrt ohne Sperrart (Rückläufer und Beschwerden zählen oben)
    if (!k.gesperrt || k.sperrArt) continue
    const id = kampagneZu(gestartet, zeitVon(k.gesperrtAm), { jetzt, fenster })
    if (id) zahlen[id].abmeldung++
  }
  return zahlen
}

// Eine Kampagne bewerten. Gibt { stufe, gruende } zurück; jeder Grund nennt Art, Anzahl,
// Quote, eigene Stufe, einen Satz und den Rat, was zu tun ist. Der schwerste Grund steht vorn.
function bewerten(z = {}) {
  const gesendet = Number(z.gesendet) || 0
  const gruende = []
  for (const art of REIHE) {
    const g = ARTEN[art]
    const anzahl = Number(z[art]) || 0
    if (!anzahl) continue
    const quote = gesendet ? anzahl / gesendet : 1
    let stufe = 'gruen'
    if (g.rot != null && gesendet >= MIN_GESENDET && anzahl >= MIN_FUER_ROT && quote >= g.rot) stufe = 'rot'
    else if (quote >= g.gelb) stufe = 'gelb'
    if (stufe === 'gruen') continue
    const text = gesendet ? `${anzahl} ${g.name} bei ${gesendet} verschickten Mails (${prozent(quote)})` : `${anzahl} ${g.name}`
    gruende.push({ art, anzahl, quote: gesendet ? quote : null, stufe, text, rat: g.rat })
  }
  gruende.sort((a, b) => RANG[b.stufe] - RANG[a.stufe])
  const stufe = gruende.reduce((s, g) => (RANG[g.stufe] > RANG[s] ? g.stufe : s), 'gruen')
  return { stufe, gruende }
}

// Die schwerste Stufe einer Liste von Bewertungen
const schwerste = (stufen) => (Array.isArray(stufen) ? stufen : []).reduce((a, s) => (RANG[s] > RANG[a] ? s : a), 'gruen')

module.exports = { zaehlen, bewerten, schwerste, ARTEN, FENSTER, MIN_GESENDET, MIN_FUER_ROT }
