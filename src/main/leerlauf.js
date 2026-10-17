const { powerMonitor } = require('electron')

const INAKTIV_NACH = 30 * 60
const PRUEFEN_ALLE = 15000

let inaktiv = false
let uhr = null
let beiAenderung = () => {}

function pruefen() {
  const neu = process.platform === 'win32' && powerMonitor.getSystemIdleTime() >= INAKTIV_NACH
  if (neu === inaktiv) return
  inaktiv = neu
  beiAenderung(inaktiv)
}

function beobachten(rueckruf = () => {}) {
  beiAenderung = rueckruf
  pruefen()
  uhr = setInterval(pruefen, PRUEFEN_ALLE)
  return () => {
    clearInterval(uhr)
    uhr = null
  }
}

function status() {
  return inaktiv
}

module.exports = { beobachten, status }