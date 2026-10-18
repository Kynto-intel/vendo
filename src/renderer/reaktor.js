// Luzzys "Gesicht": leuchtende Datenkugel (Erde), per Maus/Finger drehbar.
// Zustände: bereit | denkt | antwortet | spricht | getrennt
// Schnittstelle unverändert: reaktorErstellen(behaelter) -> { zustand(z) }, welleErstellen(...)

// ---------- Farben (R,G,B) ----------
// Werden live aus dem Design gelesen (--gold / --gold-hell), die Werte hier sind nur der Notanker.
let HELL = '245,208,120'
let MITTEL = '214,162,60'

function rgbAus(css, fallback) {
  const s = (css || '').trim()
  let m
  if ((m = s.match(/^#([0-9a-f]{3})$/i))) return [...m[1]].map(c => parseInt(c + c, 16)).join(',')
  if ((m = s.match(/^#([0-9a-f]{6})/i))) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16)).join(',')
  if ((m = s.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/i))) return `${m[1]},${m[2]},${m[3]}`
  return fallback
}

// ---------- Kontinente als grobe Umrisse [Länge, Breite] ----------
const LAND = [
  // Nordamerika
  [[-168,65],[-157,71],[-141,69],[-125,70],[-110,68],[-95,68],[-85,66],[-82,58],[-92,57],[-80,52],[-78,62],[-70,60],[-62,57],[-56,52],[-66,45],[-70,42],[-76,36],[-81,31],[-80,26],[-82,28],[-85,30],[-90,29],[-97,27],[-97,21],[-94,18],[-88,21],[-87,16],[-83,15],[-83,10],[-79,9],[-78,8],[-80,7],[-84,9],[-87,13],[-92,14],[-96,16],[-105,20],[-109,25],[-112,31],[-115,32],[-118,34],[-121,37],[-124,41],[-124,47],[-128,51],[-134,57],[-140,60],[-148,60],[-153,57],[-160,56],[-165,60]],
  // Südamerika
  [[-78,8],[-72,12],[-62,10],[-52,5],[-50,0],[-44,-2],[-35,-6],[-39,-14],[-41,-22],[-48,-26],[-53,-34],[-58,-38],[-65,-41],[-65,-47],[-69,-52],[-72,-54],[-75,-48],[-73,-38],[-71,-30],[-70,-18],[-76,-14],[-81,-6],[-80,-2],[-78,2]],
  // Grönland
  [[-73,78],[-60,82],[-35,83],[-20,80],[-20,72],[-30,68],[-43,60],[-50,64],[-55,70],[-68,76]],
  // Eurasien
  [[-9,37],[-9,43],[-4,48],[2,51],[8,54],[8,58],[5,60],[5,62],[14,67],[20,70],[28,71],[40,67],[44,68],[60,69],[70,73],[80,73],[100,77],[112,74],[130,72],[140,72],[160,70],[170,70],[180,66],[180,64],[170,60],[163,58],[156,51],[155,59],[142,59],[137,54],[141,48],[135,43],[130,42],[129,35],[126,35],[125,40],[121,40],[122,37],[120,32],[122,30],[119,25],[110,21],[108,17],[106,10],[104,9],[101,13],[100,8],[103,1],[100,3],[98,8],[98,16],[94,17],[92,22],[89,22],[86,20],[80,15],[78,8],[76,10],[73,17],[72,21],[67,24],[62,25],[57,26],[56,27],[52,28],[48,30],[50,26],[56,26],[59,22],[55,17],[44,12],[42,16],[38,22],[35,28],[34,31],[36,36],[30,36],[27,37],[26,40],[24,38],[22,37],[20,40],[19,42],[14,45],[12,44],[16,40],[16,38],[12,41],[9,44],[3,43],[0,39],[-2,37],[-6,36]],
  // Afrika
  [[-17,21],[-13,28],[-10,30],[-6,36],[10,37],[11,33],[20,31],[32,31],[34,28],[37,22],[43,12],[51,12],[47,5],[40,-3],[40,-11],[35,-20],[33,-26],[28,-33],[20,-35],[18,-32],[12,-17],[14,-10],[9,-1],[9,4],[4,6],[-8,4],[-13,8],[-17,14]],
  // Australien
  [[114,-22],[122,-18],[130,-12],[136,-12],[137,-16],[142,-11],[146,-19],[153,-26],[150,-37],[141,-38],[135,-34],[131,-31],[124,-34],[115,-34],[113,-26]],
  // Antarktis
  [[-180,-72],[180,-72],[180,-90],[-180,-90]],
  // Inseln
  [[-5,50],[1,51],[2,53],[-2,56],[-2,58],[-5,58],[-6,56],[-3,54],[-5,52]],          // Großbritannien
  [[130,32],[135,34],[140,35],[142,39],[141,45],[139,41],[135,36],[131,34]],          // Japan
  [[95,5],[106,-6],[104,-6],[96,2]],                                                  // Sumatra
  [[109,1],[117,7],[119,1],[116,-4],[110,-3]],                                        // Borneo
  [[44,-25],[47,-25],[50,-15],[49,-12],[44,-17]],                                     // Madagaskar
  [[-24,65],[-14,66],[-14,64],[-22,63]],                                              // Island
  [[172,-34],[178,-38],[175,-41],[172,-41]],                                          // Neuseeland Nord
  [[172,-41],[174,-42],[170,-46],[167,-46]],                                          // Neuseeland Süd
  [[-84,22],[-74,20],[-75,21],[-80,23]]                                               // Kuba
]
// Wasserflächen, die aus dem Land herausgeschnitten werden
const WASSER = [
  [[47,45],[53,45],[54,37],[50,37],[49,40]],                                          // Kaspisches Meer
  [[28,42],[28,45],[33,46],[37,47],[41,42],[36,41]]                                   // Schwarzes Meer
]

// ---------- Städte = Knoten im Netz ----------
const STAEDTE = [
  [52.5,13.4],[40.7,-74],[-23.5,-46.6],[51.5,-0.1],[6.5,3.4],[-33.9,18.4],[25.2,55.3],[19,72.8],
  [1.3,103.8],[35.7,139.7],[-33.9,151.2],[34,-118],[19.4,-99.1],[55.7,37.6],[39.9,116.4],[-1.3,36.8],
  [30,31.2],[-34.6,-58.4],[61,-150],[64,-22]
]

// ---------- Zustände ----------
const MODI = {
  bereit:    { spin: 0.0014, puls: 0.03, daten: 0.25, licht: 0.85 },
  hoert:     { spin: 0.0020, puls: 0.12, daten: 0.60, licht: 1.05 },
  denkt:     { spin: 0.0060, puls: 0.08, daten: 1.40, licht: 1.00 },
  antwortet: { spin: 0.0030, puls: 0.10, daten: 1.00, licht: 1.00 },
  spricht:   { spin: 0.0030, puls: 0.14, daten: 0.90, licht: 1.05 },
  getrennt:  { spin: 0.0000, puls: 0.00, daten: 0.00, licht: 0.35 }
}

const RAD = Math.PI / 180
const GELB = '255,226,70' // Standort-Punkt

// ---------- Standort über die Zeitzone des PCs (keine Abfrage, kein Internet nötig) ----------
const ZONEN = {
  'Europe/Berlin': [52.5, 13.4], 'Europe/Vienna': [48.2, 16.4], 'Europe/Zurich': [47.4, 8.5], 'Europe/London': [51.5, -0.1],
  'Europe/Paris': [48.9, 2.35], 'Europe/Madrid': [40.4, -3.7], 'Europe/Rome': [41.9, 12.5], 'Europe/Amsterdam': [52.4, 4.9],
  'Europe/Brussels': [50.85, 4.35], 'Europe/Stockholm': [59.3, 18.1], 'Europe/Oslo': [59.9, 10.75], 'Europe/Copenhagen': [55.7, 12.6],
  'Europe/Helsinki': [60.2, 24.9], 'Europe/Warsaw': [52.2, 21], 'Europe/Prague': [50.1, 14.4], 'Europe/Budapest': [47.5, 19],
  'Europe/Athens': [38, 23.7], 'Europe/Istanbul': [41, 29], 'Europe/Moscow': [55.75, 37.6], 'Europe/Kiev': [50.45, 30.5],
  'Europe/Kyiv': [50.45, 30.5], 'Europe/Lisbon': [38.7, -9.1], 'Europe/Dublin': [53.35, -6.26], 'Europe/Bucharest': [44.4, 26.1],
  'America/New_York': [40.7, -74], 'America/Detroit': [42.3, -83], 'America/Chicago': [41.9, -87.6], 'America/Denver': [39.7, -105],
  'America/Boise': [43.6, -116.2], 'America/Phoenix': [33.4, -112], 'America/Los_Angeles': [34, -118.2], 'America/Anchorage': [61.2, -149.9],
  'America/Toronto': [43.65, -79.4], 'America/Vancouver': [49.3, -123.1], 'America/Halifax': [44.6, -63.6], 'America/Mexico_City': [19.4, -99.1],
  'America/Sao_Paulo': [-23.5, -46.6], 'America/Argentina/Buenos_Aires': [-34.6, -58.4], 'America/Bogota': [4.7, -74.1],
  'America/Lima': [-12, -77], 'America/Santiago': [-33.4, -70.7], 'Pacific/Honolulu': [21.3, -157.9],
  'Asia/Tokyo': [35.7, 139.7], 'Asia/Seoul': [37.6, 127], 'Asia/Shanghai': [31.2, 121.5], 'Asia/Hong_Kong': [22.3, 114.2],
  'Asia/Singapore': [1.35, 103.8], 'Asia/Bangkok': [13.75, 100.5], 'Asia/Kolkata': [28.6, 77.2], 'Asia/Calcutta': [28.6, 77.2],
  'Asia/Dubai': [25.2, 55.3], 'Asia/Tehran': [35.7, 51.4], 'Asia/Jerusalem': [31.8, 35.2], 'Asia/Riyadh': [24.7, 46.7],
  'Asia/Karachi': [24.9, 67], 'Asia/Jakarta': [-6.2, 106.8], 'Asia/Manila': [14.6, 121], 'Asia/Taipei': [25, 121.5], 'Asia/Dhaka': [23.8, 90.4],
  'Africa/Cairo': [30, 31.2], 'Africa/Lagos': [6.5, 3.4], 'Africa/Johannesburg': [-26.2, 28], 'Africa/Nairobi': [-1.3, 36.8],
  'Africa/Casablanca': [33.6, -7.6], 'Africa/Algiers': [36.7, 3.1],
  'Australia/Sydney': [-33.9, 151.2], 'Australia/Melbourne': [-37.8, 145], 'Australia/Brisbane': [-27.5, 153],
  'Australia/Perth': [-32, 115.9], 'Australia/Adelaide': [-34.9, 138.6], 'Pacific/Auckland': [-36.85, 174.8]
}
const BREITE_NACH_REGION = { Europe: 48, America: 38, Asia: 30, Africa: 5, Australia: -28, Pacific: -10, Atlantic: 30, Indian: -10 }

function ortErmitteln() {
  let zone = ''
  try { zone = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch { /* egal */ }
  if (ZONEN[zone]) return ZONEN[zone]
  // unbekannte Zone: Länge grob aus dem UTC-Versatz, Breite aus der Weltregion
  const lon = Math.max(-170, Math.min(170, (-new Date().getTimezoneOffset() / 60) * 15))
  return [BREITE_NACH_REGION[zone.split('/')[0]] ?? 35, lon]
}

function imPolygon(lon, lat, poly) {
  let innen = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) innen = !innen
  }
  return innen
}

function istLand(lon, lat) {
  if (!LAND.some(p => imPolygon(lon, lat, p))) return false
  return !WASSER.some(p => imPolygon(lon, lat, p))
}

// Punkte gleichmäßig über die Kugel verteilen, nur auf Land behalten
function landPunkte(schritt = 2.3) {
  const pts = []
  for (let lat = -88; lat <= 88; lat += schritt) {
    const dl = Math.min(40, schritt / Math.max(0.05, Math.cos(lat * RAD)))
    for (let lon = -180; lon < 180; lon += dl) {
      if (istLand(lon, lat)) pts.push({ lat: lat * RAD, lon: lon * RAD, cl: Math.cos(lat * RAD), sl: Math.sin(lat * RAD) })
    }
  }
  return pts
}
let landPunkteCache

function weltVektor(latGrad, lonGrad) {
  const la = latGrad * RAD, lo = lonGrad * RAD
  return [Math.cos(la) * Math.sin(lo), Math.sin(la), Math.cos(la) * Math.cos(lo)]
}

function bogen(a, b, teile = 28) {
  const d = Math.acos(Math.min(1, Math.max(-1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2])))
  const s = Math.sin(d) || 1
  const pts = []
  for (let i = 0; i <= teile; i++) {
    const t = i / teile
    const f1 = Math.sin((1 - t) * d) / s, f2 = Math.sin(t * d) / s
    const lift = 1 + 0.14 * d * Math.sin(Math.PI * t)
    pts.push([(a[0] * f1 + b[0] * f2) * lift, (a[1] * f1 + b[1] * f2) * lift, (a[2] * f1 + b[2] * f2) * lift])
  }
  return { pts, d }
}

// optionen.ort = [Breite, Länge] überschreibt die automatische Erkennung, z. B. { ort: [48.1, 10.9] }
export function reaktorErstellen(behaelter, optionen = {}) {
  const canvas = document.createElement('canvas')
  canvas.className = 'reaktor'
  canvas.setAttribute('data-zustand', 'getrennt')
  canvas.setAttribute('aria-hidden', 'true')
  // Alte Stile der Klasse .reaktor (Rahmen, Hintergrund, Rundung, Schatten, Filter …) bewusst überstimmen
  canvas.style.cssText = [
    'width:100%', 'height:auto', 'aspect-ratio:1', 'display:block', 'touch-action:none', 'cursor:grab', 'user-select:none',
    'background:none !important', 'border:0 !important', 'border-radius:0 !important', 'box-shadow:none !important',
    'outline:0 !important', 'animation:none !important', 'padding:0 !important', 'overflow:visible'
  ].join(';')
  behaelter.replaceChildren(canvas)
  const ctx = canvas.getContext('2d')

  // --- Daten vorbereiten ---
  const punkte = landPunkteCache || (landPunkteCache = landPunkte())
  const knoten = STAEDTE.map(([la, lo]) => ({ v: weltVektor(la, lo), phase: Math.random() * 6.28 }))
  const verbindungen = []
  const gesehen = new Set()
  knoten.forEach((k, i) => {
    knoten
      .map((m, j) => ({ j, d: Math.acos(Math.min(1, k.v[0] * m.v[0] + k.v[1] * m.v[1] + k.v[2] * m.v[2])) }))
      .filter(x => x.j !== i)
      .sort((p, q) => p.d - q.d)
      .slice(0, 3)
      .forEach(x => {
        const key = i < x.j ? `${i}-${x.j}` : `${x.j}-${i}`
        if (gesehen.has(key)) return
        gesehen.add(key)
        verbindungen.push({ ...bogen(k.v, knoten[x.j].v), pakete: [Math.random(), Math.random()], tempo: 0.12 + Math.random() * 0.1 })
      })
  })
  const zeichen = Array.from({ length: 46 }, () => ({
    a: Math.random() * 6.283,
    r: 1.02 + Math.random() * 0.55,
    v: (Math.random() - 0.5) * 0.0006,
    text: Array.from({ length: 2 + Math.floor(Math.random() * 5) }, () => (Math.random() < 0.5 ? '0' : '1')).join(''),
    alpha: 0.12 + Math.random() * 0.28
  }))

  // --- Zustand ---
  let ziel = MODI.getrennt
  let akt = { ...MODI.getrennt }
  let pegel = 0, apiPegel = 0
  let rot = 0, tilt = 0.3, zoom = 1
  let letzteEingabe = -1e9, schwenk = 0

  // --- Standort: Kugel zeigt ihn immer wieder vorne ---
  const heim = { lat: 0, lon: 0, v: [0, 0, 1], tilt: 0.3 }
  function heimSetzen(lat, lon, sofort = false) {
    heim.lat = lat; heim.lon = lon
    heim.v = weltVektor(lat, lon)
    heim.tilt = Math.max(-0.9, Math.min(0.9, lat * RAD * 0.55))
    // Verbindungen vom Standort zu den nächsten Städten
    for (let i = verbindungen.length - 1; i >= 0; i--) if (verbindungen[i].heim) verbindungen.splice(i, 1)
    knoten
      .map(kn => ({ kn, d: Math.acos(Math.min(1, Math.max(-1, kn.v[0] * heim.v[0] + kn.v[1] * heim.v[1] + kn.v[2] * heim.v[2]))) }))
      .filter(x => x.d > 0.05)
      .sort((p, q) => p.d - q.d)
      .slice(0, 4)
      .forEach(x => verbindungen.push({ ...bogen(heim.v, x.kn.v), heim: true, pakete: [Math.random(), Math.random()], tempo: 0.14 + Math.random() * 0.1 }))
    if (sofort) { rot = -lon * RAD; tilt = heim.tilt }
    letzteEingabe = -1e9
  }
  const [lat0, lon0] = optionen.ort || ortErmitteln()
  heimSetzen(lat0, lon0, true)
  let vRot = 0, vTilt = 0
  let ziehen = false, letzteX = 0, letzteY = 0
  let breite = 200, hoehe = 200, dpr = 1
  let laeuft = true, aktiv = true, frameId = 0, zeit0 = performance.now(), letzte = zeit0

  function farbenLesen() {
    const cs = getComputedStyle(behaelter)
    MITTEL = rgbAus(cs.getPropertyValue('--gold'), MITTEL)
    HELL = rgbAus(cs.getPropertyValue('--gold-hell'), HELL)
  }
  farbenLesen()
  let farbenZeit = 0

  function groesse() {
    dpr = Math.min(2, window.devicePixelRatio || 1)
    const seite = Math.max(40, canvas.clientWidth || behaelter.clientWidth || 200)
    breite = hoehe = seite
    canvas.width = Math.round(seite * dpr)
    canvas.height = Math.round(seite * dpr)
  }
  groesse()
  const ro = new ResizeObserver(groesse)
  ro.observe(canvas)

  // --- Bedienung ---
  canvas.addEventListener('pointerdown', e => {
    ziehen = true
    letzteX = e.clientX; letzteY = e.clientY
    canvas.setPointerCapture(e.pointerId)
    canvas.style.cursor = 'grabbing'
  })
  canvas.addEventListener('pointermove', e => {
    if (!ziehen) return
    const dx = e.clientX - letzteX, dy = e.clientY - letzteY
    letzteX = e.clientX; letzteY = e.clientY
    vRot = dx * 0.006
    vTilt = dy * 0.004
    rot += vRot
    tilt = Math.max(-1.2, Math.min(1.2, tilt + vTilt))
  })
  const loslassen = () => { ziehen = false; letzteEingabe = performance.now(); canvas.style.cursor = 'grab' }
  canvas.addEventListener('pointerup', loslassen)
  canvas.addEventListener('pointercancel', loslassen)
  canvas.addEventListener('wheel', e => {
    e.preventDefault()
    zoom = Math.max(0.7, Math.min(1.5, zoom * (e.deltaY < 0 ? 1.06 : 0.94)))
  }, { passive: false })
  canvas.addEventListener('dblclick', () => { zoom = 1; letzteEingabe = -1e9 })

  // --- Zeichnen ---
  const buckets = Array.from({ length: 8 }, () => [])

  function frame(jetzt) {
    frameId = 0
    if (!laeuft || !aktiv) return
    if (!canvas.isConnected) { ro.disconnect(); laeuft = false; return }
    frameId = requestAnimationFrame(frame)

    // Sicherheitsnetz: cockpit.js verschiebt den Behälter zwischen Zentrale und rechter Spalte (Größe ändert sich)
    if (canvas.clientWidth && Math.abs(canvas.clientWidth - breite) > 1) groesse()

    const dt = Math.min(0.05, (jetzt - letzte) / 1000)
    letzte = jetzt
    const t = (jetzt - zeit0) / 1000

    // Lautstärke aus app.js (--pegel auf <html>) und Schalter „Reaktor dreht sich“ (body.anim-reaktor)
    const cssPegel = parseFloat(document.documentElement.style.getPropertyValue('--pegel')) || 0
    pegel += (Math.max(cssPegel, apiPegel) - pegel) * Math.min(1, dt * 12)
    const animiert = document.body.classList.contains('anim-reaktor')
    const spin = animiert ? akt.spin : 0

    // weich zum Zielzustand
    const k = Math.min(1, dt * 3)
    for (const key of Object.keys(ziel)) akt[key] += (ziel[key] - akt[key]) * k

    // Drehung: Trägheit nach dem Loslassen, danach Autodrehung
    if (!ziehen) {
      const ruhig = Math.abs(vRot) < 0.0005 && Math.abs(vTilt) < 0.0005 && jetzt - letzteEingabe > 5000
      if (ruhig) {
        // Standort bleibt im Blick: Kugel schwenkt nur sanft hin und her
        schwenk += dt * (0.3 * Math.min(1, spin / 0.0014) + spin * 60)
        const rotZiel = -heim.lon * RAD + Math.sin(schwenk) * 0.55
        const diff = Math.atan2(Math.sin(rotZiel - rot), Math.cos(rotZiel - rot))
        rot += diff * Math.min(1, dt * 1.5)
        tilt += (heim.tilt - tilt) * Math.min(1, dt * 1.5)
      } else {
        rot += vRot + spin
        tilt += vTilt
      }
      vRot *= 0.95
      vTilt *= 0.9
      tilt = Math.max(-1.2, Math.min(1.2, tilt))
    }

    const cx = breite / 2, cy = hoehe / 2
    const R = Math.min(breite, hoehe) * 0.38 * zoom
    const ct = Math.cos(tilt), st = Math.sin(tilt)
    const cr = Math.cos(rot), sr = Math.sin(rot)
    const puls = 1 + Math.sin(t * 2.4) * akt.puls + pegel * 0.3

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, breite, hoehe)

    // Weltvektor -> Bildschirm (x, y, tiefe)
    const dreh = v => {
      const x1 = v[0] * cr + v[2] * sr
      const z1 = v[2] * cr - v[0] * sr
      return [x1, v[1] * ct - z1 * st, v[1] * st + z1 * ct]
    }

    if (jetzt - farbenZeit > 1000) { farbenZeit = jetzt; farbenLesen() }

    // Weiches Glühen direkt um die Kugel – endet sicher innerhalb der Zeichenfläche (kein Kasten)
    const glowR = Math.min(R * 1.25 * puls, Math.min(breite, hoehe) / 2 - 1)
    let g = ctx.createRadialGradient(cx, cy, R * 0.7, cx, cy, glowR)
    g.addColorStop(0, `rgba(${MITTEL},${0.10 * akt.licht})`)
    g.addColorStop(1, `rgba(${MITTEL},0)`)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, glowR, 0, 6.2832); ctx.fill()

    // Breiten-/Längenkreise
    ctx.lineWidth = 0.6
    const linie = (fn, n) => {
      let offen = false
      ctx.beginPath()
      for (let i = 0; i <= n; i++) {
        const p = dreh(fn(i / n))
        if (p[2] > 0) {
          const X = cx + p[0] * R, Y = cy - p[1] * R
          offen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)
          offen = true
        } else offen = false
      }
      ctx.stroke()
    }
    ctx.strokeStyle = `rgba(${HELL},${0.14 * akt.licht})`
    for (let la = -60; la <= 60; la += 30) linie(f => weltVektor(la, f * 360 - 180), 72)
    for (let lo = 0; lo < 180; lo += 30) {
      linie(f => weltVektor(f * 360 - 180, lo), 72)
      linie(f => weltVektor(f * 360 - 180, lo + 180), 72)
    }

    // Land-Punkte in Alpha-Stufen sammeln
    for (const b of buckets) b.length = 0
    for (const p of punkte) {
      const l = p.lon + rot
      const x = p.cl * Math.sin(l)
      const z0 = p.cl * Math.cos(l)
      const y = p.sl * ct - z0 * st
      const z = p.sl * st + z0 * ct
      const stufe = z > 0 ? 2 + Math.min(5, Math.floor(z * 6)) : z > -0.35 ? 0 : -1
      if (stufe < 0) continue
      const bucket = z > 0 ? stufe : 0
      buckets[bucket].push(cx + x * R, cy - y * R)
    }
    const rechteck = 1.5 * (R / 90)
    for (let i = 0; i < buckets.length; i++) {
      const b = buckets[i]
      if (!b.length) continue
      const a = (i === 0 ? 0.12 : 0.3 + (i - 2) * 0.13) * akt.licht
      ctx.fillStyle = `rgba(${i >= 5 ? HELL : MITTEL},${Math.min(1, a)})`
      const s = i === 0 ? rechteck * 0.7 : rechteck
      for (let j = 0; j < b.length; j += 2) ctx.fillRect(b[j] - s / 2, b[j + 1] - s / 2, s, s)
    }

    // Netzwerk: Verbindungen und Datenpakete
    ctx.lineWidth = 0.9
    for (const v of verbindungen) {
      const proj = v.pts.map(dreh)
      ctx.beginPath()
      let offen = false
      for (const p of proj) {
        if (p[2] > 0.02) {
          const X = cx + p[0] * R, Y = cy - p[1] * R
          offen ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y)
          offen = true
        } else offen = false
      }
      ctx.strokeStyle = `rgba(${HELL},${0.28 * akt.licht})`
      ctx.stroke()

      if (akt.daten > 0.01) {
        for (let n = 0; n < v.pakete.length; n++) {
          v.pakete[n] = (v.pakete[n] + dt * v.tempo * akt.daten * (animiert ? 1 : 0)) % 1
          const idx = Math.min(proj.length - 1, Math.floor(v.pakete[n] * (proj.length - 1)))
          const p = proj[idx]
          if (p[2] > 0.05) {
            ctx.fillStyle = `rgba(${HELL},${0.95 * akt.licht})`
            ctx.beginPath(); ctx.arc(cx + p[0] * R, cy - p[1] * R, 1.6 * (R / 90), 0, 6.2832); ctx.fill()
          }
        }
      }
    }

    // Knoten
    for (const n of knoten) {
      const p = dreh(n.v)
      if (p[2] <= 0.02) continue
      const X = cx + p[0] * R, Y = cy - p[1] * R
      const w = (0.5 + 0.5 * Math.sin(t * 2 + n.phase)) * akt.licht
      ctx.fillStyle = `rgba(${HELL},${0.25 * w})`
      ctx.beginPath(); ctx.arc(X, Y, (3.5 + 3 * w) * (R / 90), 0, 6.2832); ctx.fill()
      ctx.fillStyle = `rgba(255,255,255,${0.9 * akt.licht})`
      ctx.beginPath(); ctx.arc(X, Y, 1.4 * (R / 90), 0, 6.2832); ctx.fill()
    }

    // Standort-Punkt (gelb, pulsierend)
    {
      const p = dreh(heim.v)
      if (p[2] > 0) {
        const X = cx + p[0] * R, Y = cy - p[1] * R
        const sk = R / 90
        const fade = Math.min(1, p[2] * 4) * Math.max(0.5, akt.licht)
        const w = (t * 0.9) % 1
        ctx.strokeStyle = `rgba(${GELB},${(1 - w) * 0.85 * fade})`
        ctx.lineWidth = 1.3
        ctx.beginPath(); ctx.arc(X, Y, (3 + w * 15) * sk, 0, 6.2832); ctx.stroke()
        ctx.fillStyle = `rgba(${GELB},${0.28 * fade})`
        ctx.beginPath(); ctx.arc(X, Y, 7 * sk, 0, 6.2832); ctx.fill()
        ctx.fillStyle = `rgba(${GELB},${fade})`
        ctx.beginPath(); ctx.arc(X, Y, 3.2 * sk, 0, 6.2832); ctx.fill()
        ctx.fillStyle = `rgba(255,255,255,${0.9 * fade})`
        ctx.beginPath(); ctx.arc(X, Y, 1.2 * sk, 0, 6.2832); ctx.fill()
      }
    }

    // Atmosphäre / Rand
    g = ctx.createRadialGradient(cx, cy, R * 0.82, cx, cy, R * 1.06)
    g.addColorStop(0, `rgba(${HELL},0)`)
    g.addColorStop(0.7, `rgba(${HELL},${0.28 * akt.licht * puls})`)
    g.addColorStop(1, `rgba(${HELL},0)`)
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, R * 1.06, 0, 6.2832); ctx.fill()

    // Treibende Binärzeichen rund um die Kugel
    ctx.font = `${Math.max(8, R * 0.09)}px ui-monospace, Consolas, monospace`
    ctx.textBaseline = 'middle'
    for (const z of zeichen) {
      z.a += z.v * (1 + akt.daten * 2)
      const rr = Math.min(R * (1.08 + (z.r - 1.02) * 0.3), Math.min(breite, hoehe) / 2 - R * 0.14)
      const X = cx + Math.cos(z.a) * rr
      const Y = cy + Math.sin(z.a) * rr
      ctx.fillStyle = `rgba(${HELL},${z.alpha * akt.licht * (0.7 + 0.3 * Math.sin(t + z.a * 5))})`
      ctx.fillText(z.text, X, Y)
    }
  }
  frameId = requestAnimationFrame(frame)

  return {
    zustand(z) {
      canvas.setAttribute('data-zustand', z)
      ziel = MODI[z] || MODI.bereit
    },
    // optional: Lautstärke 0..1 aus der Sprachausgabe lässt die Kugel mitpulsieren
    pegel(wert) {
      apiPegel = Math.max(0, Math.min(1, wert || 0))
    },
    // Standort von Hand setzen, z. B. ortSetzen(48.1, 10.9)
    ortSetzen(lat, lon) {
      heimSetzen(lat, lon)
    },
    // Echten Standort per Browser-Abfrage holen (fragt den Nutzer um Erlaubnis); liefert true/false
    ortPerStandort() {
      return new Promise(fertig => {
        if (!navigator.geolocation) return fertig(false)
        navigator.geolocation.getCurrentPosition(
          pos => { heimSetzen(pos.coords.latitude, pos.coords.longitude); fertig(true) },
          () => fertig(false),
          { timeout: 8000 }
        )
      })
    },
    pause() {
      aktiv = false
      if (frameId) cancelAnimationFrame(frameId)
      frameId = 0
    },
    fortsetzen() {
      if (!laeuft || aktiv) return
      aktiv = true
      letzte = performance.now()
      frameId = requestAnimationFrame(frame)
    },
    zerstoeren() {
      laeuft = false
      if (frameId) cancelAnimationFrame(frameId)
      frameId = 0
      ro.disconnect()
    }
  }
}

export function welleErstellen(behaelter, anzahl = 24) {
  const balken = Array.from({ length: anzahl }, (_, i) => {
    const b = document.createElement('span')
    b.style.animationDelay = `${((i * 137) % 900) / 1000}s`
    behaelter.appendChild(b)
    return b
  })
  return {
    // pegel 0..1 aus der Sprachausgabe; null = Balken ruhen
    pegel(werte) {
      balken.forEach((b, i) => {
        b.style.transform = werte ? `scaleY(${Math.max(0.15, werte[i % werte.length])})` : ''
      })
    }
  }
}