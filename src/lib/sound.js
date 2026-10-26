// Utilidad de audio y vibración sin dependencias externas (Web Audio API)
// Diseñado para sonar como la campana clásica de recepción/bar (ding-dong metálico agradable)

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Toca un timbre de campana de bar / restaurante (doble tono armónico nítido)
 */
export function playBellSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Tono 1: Campana alta brillante (~1568 Hz - Sol6)
    const osc1 = ctx.createOscillator()
    const gain1 = ctx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(1567.98, now)
    gain1.gain.setValueAtTime(0.35, now)
    gain1.gain.exponentialRampToValueAtTime(0.0001, now + 0.8)
    osc1.connect(gain1)
    gain1.connect(ctx.destination)
    osc1.start(now)
    osc1.stop(now + 0.8)

    // Tono 2: Armónico de resonancia metálica (~2093 Hz - Do7)
    const osc2 = ctx.createOscillator()
    const gain2 = ctx.createGain()
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(2093.0, now + 0.08)
    gain2.gain.setValueAtTime(0.25, now + 0.08)
    gain2.gain.exponentialRampToValueAtTime(0.0001, now + 1.1)
    osc2.connect(gain2)
    gain2.connect(ctx.destination)
    osc2.start(now + 0.08)
    osc2.stop(now + 1.1)

    // Tono 3: Eco cálido final (~1046 Hz - Do6)
    const osc3 = ctx.createOscillator()
    const gain3 = ctx.createGain()
    osc3.type = 'sine'
    osc3.frequency.setValueAtTime(1046.5, now + 0.22)
    gain3.gain.setValueAtTime(0.2, now + 0.22)
    gain3.gain.exponentialRampToValueAtTime(0.0001, now + 1.3)
    osc3.connect(gain3)
    gain3.connect(ctx.destination)
    osc3.start(now + 0.22)
    osc3.stop(now + 1.3)
  } catch (err) {
    console.warn('No se pudo reproducir el sonido de campana:', err)
  }
}

/**
 * Hace vibrar el dispositivo del mesero/personal si está en móvil
 */
export function vibrateDevice(pattern = [200, 100, 200, 100, 300]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(pattern)
    }
  } catch {
    // Ignorar si no está soportado
  }
}

/**
 * Alerta completa (campana + vibración)
 */
export function triggerWaiterAlert() {
  playBellSound()
  vibrateDevice()
}
