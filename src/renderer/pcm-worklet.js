// Läuft im Audio-Thread: sammelt Mikrofon-Ton und gibt ihn in 100-ms-Stücken als 16-bit-PCM weiter
// (Format, das Hermes fürs Aktivierungswort erwartet: 16 kHz, mono, int16).

class PcmSammler extends AudioWorkletProcessor {
  constructor() {
    super()
    this.puffer = new Int16Array(sampleRate / 10) // 100 ms
    this.fuellung = 0
  }

  process(eingaenge) {
    const kanal = eingaenge[0]?.[0]
    if (!kanal) return true
    for (let i = 0; i < kanal.length; i++) {
      const s = Math.max(-1, Math.min(1, kanal[i]))
      this.puffer[this.fuellung++] = s < 0 ? s * 0x8000 : s * 0x7fff
      if (this.fuellung === this.puffer.length) {
        this.port.postMessage(this.puffer.buffer.slice(0))
        this.fuellung = 0
      }
    }
    return true
  }
}

registerProcessor('pcm-sammler', PcmSammler)
