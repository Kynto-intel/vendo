'use strict'
// Newsletter: Shopify-Zugang aus den Hermes-Einstellungen (zentral im System-Tab erneuert), wie im Buchhaltungs-Plugin.
// Nur ein erfundener Token in einem Temp-Ordner; die echten Hermes-Einstellungen werden nie gelesen.
//   node --test tests/newsletter-hermes-zugang.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const shopify = require('../plugins/newsletter/shopify.js')

test('hermesZugang: Token und Shop aus Profil oder Hauptordner, sonst null', (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'vendo-hermes-'))
  t.after(() => { fs.rmSync(home, { recursive: true, force: true }); process.env.VENDO_TEST_HERMES_HOME = alt })
  const alt = process.env.VENDO_TEST_HERMES_HOME
  process.env.VENDO_TEST_HERMES_HOME = home
  assert.equal(shopify.hermesZugang(), null)
  fs.writeFileSync(path.join(home, '.env'), 'SHOPIFY_STORE=https://beispiel-shop.myshopify.com/\n')
  assert.equal(shopify.hermesZugang(), null, 'ohne Token kein Zugang')
  fs.mkdirSync(path.join(home, 'profiles', 'donnerwolf'), { recursive: true })
  fs.writeFileSync(path.join(home, 'profiles', 'donnerwolf', 'config.yaml'), "  SHOPIFY_ACCESS_TOKEN: 'shpat_ERFUNDEN0123456789abcdef'\n")
  assert.deepEqual(shopify.hermesZugang(), { token: 'shpat_ERFUNDEN0123456789abcdef', shop: 'beispiel-shop.myshopify.com' })
})
