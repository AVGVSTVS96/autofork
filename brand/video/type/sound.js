import { MUSIC } from "./music.js"

const RATE = 48000
const { typers, presses, cues, key } = window.TIMELINE

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function envelope(param, t, peak, attack, release) {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + attack)
  param.exponentialRampToValueAtTime(0.0001, t + attack + release)
}

async function music(ctx, destination) {
  const out = ctx.createGain()
  out.gain.setValueAtTime(1, window.END - 0.4)
  out.gain.linearRampToValueAtTime(0, window.END)
  out.connect(destination)
  const file = await ctx.decodeAudioData(await (await fetch(MUSIC.src)).arrayBuffer())
  const edge = 0.012
  MUSIC.segments.forEach((segment, i) => {
    const next = MUSIC.segments[i + 1]
    const start = Math.max(0, segment.start - edge)
    const offset = segment.offset - (segment.start - start)
    const stop = next ? next.start - edge : file.duration - offset + start
    const source = ctx.createBufferSource()
    source.buffer = file
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(i ? 0 : 1, start)
    gain.gain.linearRampToValueAtTime(1, start + edge)
    gain.gain.setValueAtTime(1, stop - edge)
    gain.gain.linearRampToValueAtTime(next ? 0 : 1, stop)
    source.connect(gain).connect(out)
    source.start(start, Math.max(0, offset), stop - start)
  })
}

function effects(ctx, out) {
  const hiss = ctx.createBuffer(1, RATE, RATE)
  const random = seeded(7)
  hiss.getChannelData(0).forEach((_, i, data) => (data[i] = random() * 2 - 1))
  const lowcut = ctx.createBiquadFilter()
  lowcut.type = "highpass"
  lowcut.frequency.value = 400
  lowcut.connect(out)

  const click = (t, level, frequency, q, release, rand) => {
    const source = ctx.createBufferSource()
    source.buffer = hiss
    const band = ctx.createBiquadFilter()
    band.type = "bandpass"
    band.frequency.value = frequency
    band.Q.value = q
    const gain = ctx.createGain()
    envelope(gain.gain, t, level, 0.001, release)
    source.connect(band).connect(gain).connect(lowcut)
    source.start(t, rand() * 0.8)
    source.stop(t + release + 0.03)
  }

  typers.forEach(({ t, text }, n) => {
    const rand = seeded(100 + n)
    for (let i = 0; i < text.length; i++) click(t + i * key, 0.22 + rand() * 0.08, 2600 + rand() * 1400, 1.4, 0.022, rand)
  })
  const tone = (t, notes, level, release) => {
    for (const [hz, amount] of notes) {
      const osc = ctx.createOscillator()
      osc.frequency.value = hz
      const gain = ctx.createGain()
      envelope(gain.gain, t, level * amount, 0.004, release)
      osc.connect(gain).connect(lowcut)
      osc.start(t)
      osc.stop(t + release + 0.05)
    }
  }
  const tones = {
    ping: t => tone(t, [[1046.5, 1], [1568, 0.5], [2093, 0.15]], 0.22, 0.7),
    chord: t => tone(t, [[523.25, 1], [784, 0.7], [1046.5, 0.5], [1318.5, 0.3]], 0.26, 1.6),
  }
  cues.forEach(({ t, kind }) => tones[kind]?.(t))

  presses.forEach(({ t }, n) => {
    const rand = seeded(200 + n)
    click(t, 0.55, 1500, 1.1, 0.05, rand)
    click(t + 0.09, 0.3, 2400, 1.3, 0.03, rand)
  })
}

function wav(buffer) {
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)]
  const frames = buffer.length
  const bytes = new DataView(new ArrayBuffer(44 + frames * 4))
  const text = (offset, s) => [...s].forEach((c, i) => bytes.setUint8(offset + i, c.charCodeAt(0)))
  text(0, "RIFF")
  bytes.setUint32(4, 36 + frames * 4, true)
  text(8, "WAVEfmt ")
  bytes.setUint32(16, 16, true)
  bytes.setUint16(20, 1, true)
  bytes.setUint16(22, 2, true)
  bytes.setUint32(24, RATE, true)
  bytes.setUint32(28, RATE * 4, true)
  bytes.setUint16(32, 4, true)
  bytes.setUint16(34, 16, true)
  text(36, "data")
  bytes.setUint32(40, frames * 4, true)
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < 2; c++) bytes.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, channels[c][i])) * 0x7fff, true)
  return new Uint8Array(bytes.buffer).toBase64()
}

async function stem(build) {
  const ctx = new OfflineAudioContext(2, Math.ceil(window.END * RATE), RATE)
  await build(ctx, ctx.destination)
  return wav(await ctx.startRendering())
}

window.soundtrack = async () => ({ music: await stem(music), fx: await stem(effects) })
