import { meldungAbfangen, meldungVorlesen } from './meldungen.js'

function rueckkehrText(meldungen) {
  const gruppen = new Map()
  for (const meldung of meldungen) gruppen.set(meldung.art, (gruppen.get(meldung.art) || 0) + 1)
  const teile = []
  const bestellungen = gruppen.get('bestellung') || 0
  const mails = gruppen.get('mail') || 0
  const jobs = gruppen.get('job') || 0
  const bekannt = bestellungen + mails + jobs

  if (bestellungen) teile.push(bestellungen === 1 ? 'eine neue Bestellung' : `${bestellungen} neue Bestellungen`)
  if (mails === 1) {
    const absender = String(meldungen.find((meldung) => meldung.art === 'mail')?.titel || '').match(/^Mail von (.+)$/i)?.[1]
    teile.push(absender ? `eine Mail von ${absender}` : 'eine neue Mail')
  } else if (mails > 1) {
    const absender = String(meldungen.find((meldung) => meldung.art === 'mail')?.titel || '').match(/^Mail von (.+)$/i)?.[1]
    teile.push(`${mails} neue Mails${absender ? `, unter anderem von ${absender}` : ''}`)
  }
  if (jobs) teile.push(jobs === 1 ? 'ein fehlgeschlagener Job' : `${jobs} fehlgeschlagene Jobs`)
  if (meldungen.length > bekannt) {
    const weitere = meldungen.length - bekannt
    teile.push(weitere === 1 ? 'eine weitere Meldung' : `${weitere} weitere Meldungen`)
  }

  return `Willkommen zurück. In der Zwischenzeit: ${teile.join(', ')}.`
}

export function leerlaufEinrichten(api, systemNachricht) {
  let aktiv = false
  let gesammelt = []
  let statusEreignisErhalten = false

  const meldungAbmelden = meldungAbfangen((meldung) => {
    if (!aktiv) return false
    gesammelt.push(meldung)
    if (gesammelt.length > 100) gesammelt.shift()
    return true
  })

  function statusSetzen(an) {
    const neu = Boolean(an)
    if (neu === aktiv) return
    aktiv = neu
    if (neu) {
      gesammelt = []
      return
    }
    if (!gesammelt.length) return
    const text = rueckkehrText(gesammelt)
    systemNachricht(text)
    meldungVorlesen(text)
    gesammelt = []
  }

  const statusAbmelden = api.system.beiLeerlauf((an) => {
    statusEreignisErhalten = true
    statusSetzen(an)
  })
  api.system.leerlauf().then((an) => {
    if (!statusEreignisErhalten) statusSetzen(an)
  }).catch(() => {})

  return () => {
    meldungAbmelden()
    statusAbmelden?.()
  }
}