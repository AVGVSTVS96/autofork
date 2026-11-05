const RATE = 48000
const C = { c5: 523.25, e5: 659.25, g5: 783.99, c6: 1046.5, e6: 1318.51, g6: 1567.98, c7: 2093 }

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const noise = (ctx, seconds, random) => {
  const buffer = ctx.createBuffer(1, seconds * ctx.sampleRate, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = random() * 2 - 1
  return buffer
}

const room = ctx => {
  const random = seeded(99)
  const buffer = ctx.createBuffer(2, ctx.sampleRate * 1.4, ctx.sampleRate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] = (random() * 2 - 1) * Math.exp((-i / ctx.sampleRate) * 4.2)
  }
  const verb = ctx.createConvolver()
  verb.buffer = buffer
  return verb
}

function voices(ctx, bus) {
  const hiss = noise(ctx, 3, seeded(1))
  const at = x => {
    const pan = ctx.createStereoPanner()
    pan.pan.value = (x - 0.5) * 1.2
    pan.connect(bus)
    return pan
  }
  const env = (param, t, peak, attack, release) => {
    param.setValueAtTime(0, t)
    param.linearRampToValueAtTime(peak, t + attack)
    param.exponentialRampToValueAtTime(0.0001, t + attack + release)
  }
  const click = (t, out, level, frequency, release) => {
    const source = ctx.createBufferSource()
    source.buffer = hiss
    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = frequency
    filter.Q.value = 1.6
    const gain = ctx.createGain()
    env(gain.gain, t, level, 0.001, release)
    source.connect(filter).connect(gain).connect(out)
    source.start(t)
    source.stop(t + release + 0.05)
  }
  const bell = (t, out, notes, level, release) => {
    for (const [hz, amount, delay = 0] of notes) {
      for (const [ratio, part] of [[1, 1], [2, 0.18], [3.01, 0.05]]) {
        const osc = ctx.createOscillator()
        osc.frequency.value = hz * ratio
        const gain = ctx.createGain()
        env(gain.gain, t + delay, level * amount * part, 0.003, release / ratio)
        osc.connect(gain).connect(out)
        osc.start(t + delay)
        osc.stop(t + delay + release + 0.1)
      }
    }
  }
  return {
    tap: ({ t, x }) => {
      const out = at(x)
      click(t, out, 0.5, 2600, 0.03)
      bell(t, out, [[C.c6, 1]], 0.06, 0.18)
    },
    tick: ({ t, x }) => click(t, at(x), 0.32, 3400, 0.025),
    land: ({ t, x }) => {
      const out = at(x)
      click(t, out, 0.45, 2200, 0.04)
      bell(t, out, [[C.g6, 1]], 0.09, 0.5)
    },
    done: ({ t, x }) => bell(t, at(x), [[C.e6, 1], [C.g6, 0.8, 0.09]], 0.16, 1.1),
    mine: ({ t, x }) => bell(t, at(x), [[C.c6, 1], [C.e6, 0.6, 0.07]], 0.12, 0.8),
    end: ({ t, x }) => bell(t, at(x), [[C.c6, 0.8], [C.g6, 0.6], [C.c7, 0.3]], 0.1, 1.8),
    whoosh: ({ t, x, d }) => {
      const source = ctx.createBufferSource()
      source.buffer = hiss
      const filter = ctx.createBiquadFilter()
      filter.type = "bandpass"
      filter.Q.value = 0.9
      filter.frequency.setValueAtTime(500, t)
      filter.frequency.exponentialRampToValueAtTime(4200, t + d)
      const gain = ctx.createGain()
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.16, t + d * 0.55)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + d)
      source.connect(filter).connect(gain).connect(at(x))
      source.start(t)
      source.stop(t + d + 0.05)
    },
  }
}

async function stem(build) {
  const ctx = new OfflineAudioContext(2, Math.ceil(window.END * RATE), RATE)
  await build(ctx)
  return ctx.startRendering()
}

const music = () =>
  stem(async ctx => {
    const data = await (await fetch(window.MUSIC.src)).arrayBuffer()
    const source = ctx.createBufferSource()
    source.buffer = await ctx.decodeAudioData(data)
    const gain = ctx.createGain()
    const [from, to] = window.MUSIC.stop.map(t => t - window.MUSIC.from)
    gain.gain.setValueAtTime(1, from)
    gain.gain.linearRampToValueAtTime(0.06, from + 0.04)
    gain.gain.setValueAtTime(0.06, to - 0.012)
    gain.gain.linearRampToValueAtTime(1, to)
    source.connect(gain).connect(ctx.destination)
    source.start(0, window.MUSIC.from)
  })

const cues = () =>
  stem(ctx => {
    const low = ctx.createBiquadFilter()
    low.type = "highpass"
    low.frequency.value = 320
    const dry = ctx.createGain()
    const wet = ctx.createGain()
    wet.gain.value = 0.2
    const verb = room(ctx)
    low.connect(dry).connect(ctx.destination)
    low.connect(verb).connect(wet).connect(ctx.destination)
    const v = voices(ctx, low)
    for (const cue of window.CUES) v[cue.kind](cue)
  })

function wav(buffer) {
  const channels = [buffer.getChannelData(0), buffer.getChannelData(1)]
  const frames = buffer.length
  const bytes = new DataView(new ArrayBuffer(44 + frames * 8))
  const text = (offset, s) => [...s].forEach((c, i) => bytes.setUint8(offset + i, c.charCodeAt(0)))
  text(0, "RIFF")
  bytes.setUint32(4, 36 + frames * 8, true)
  text(8, "WAVEfmt ")
  bytes.setUint32(16, 16, true)
  bytes.setUint16(20, 3, true)
  bytes.setUint16(22, 2, true)
  bytes.setUint32(24, RATE, true)
  bytes.setUint32(28, RATE * 8, true)
  bytes.setUint16(32, 8, true)
  bytes.setUint16(34, 32, true)
  text(36, "data")
  bytes.setUint32(40, frames * 8, true)
  for (let i = 0; i < frames; i++) for (let c = 0; c < 2; c++) bytes.setFloat32(44 + i * 8 + c * 4, channels[c][i], true)
  return new Uint8Array(bytes.buffer).toBase64()
}

window.soundtrack = async () => ({ music: wav(await music()), cues: wav(await cues()) })
