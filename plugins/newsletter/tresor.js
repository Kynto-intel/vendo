'use strict'
// Newsletter-Plugin: Passwort verschlüsselt ablegen.
//
// Dünne Schicht um Electrons safeStorage (Windows-DPAPI). Zwei Gründe für die Schicht:
//   - Der Versandteil soll später ohne Electron laufen (Serverbetrieb), dann wird hier ein
//     anderer Speicher eingesetzt.
//   - Tests brauchen einen Ersatz, ohne Electron zu laden.
//
// Ohne verfügbare Verschlüsselung wird nichts abgelegt. Es gibt keinen Klartext-Rückfall.

function tresorMachen(speicher = null) {
  const holen = () => {
    if (speicher) return speicher
    try {
      return require('electron').safeStorage
    } catch {
      return null
    }
  }
  return {
    verfuegbar() {
      const s = holen()
      try {
        return Boolean(s && s.isEncryptionAvailable())
      } catch {
        return false
      }
    },
    // Klartext → Base64. Null, wenn keine Verschlüsselung da ist: dann wird nichts gespeichert.
    verschluesseln(text) {
      const s = holen()
      if (!s || !this.verfuegbar() || !text) return null
      try {
        return Buffer.from(s.encryptString(String(text))).toString('base64')
      } catch {
        return null
      }
    },
    entschluesseln(base64) {
      const s = holen()
      if (!s || !base64) return null
      try {
        return s.decryptString(Buffer.from(String(base64), 'base64'))
      } catch {
        return null
      }
    }
  }
}

module.exports = { tresorMachen }
