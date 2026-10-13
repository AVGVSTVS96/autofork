const RATE = 48000

const feed = document.querySelector(".feed-view")
const intro = { from: JSON.parse(feed.dataset.stops).at(-1)[0], to: +feed.closest(".scene").dataset.e }
const quarter = (intro.to - intro.from) / 4

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

const noise = (ctx, seconds, random, channels = 1, decay = 0) => {
  const buffer = ctx.createBuffer(channels, seconds * ctx.sampleRate, ctx.sampleRate)
  for (let c = 0; c < channels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < data.length; i++) data[i] = (random() * 2 - 1) * (decay ? Math.exp(-i / ctx.sampleRate / decay) : 1)
  }
  return buffer
}

function envelope(param, t, peak, attack, release) {
  param.setValueAtTime(0, t)
  param.linearRampToValueAtTime(peak, t + attack)
  param.exponentialRampToValueAtTime(0.0001, t + attack + release)
}

const E5 = 659.25, F5 = 698.46, A5 = 880, C6 = 1046.5, F6 = 1396.91

function voices(ctx, out) {
  const room = ctx.createConvolver()
  room.buffer = noise(ctx, 2.4, seeded(7), 2, 0.45)
  const wet = ctx.createGain()
  wet.gain.value = 0.2
  room.connect(wet).connect(out)
  const lowcut = ctx.createBiquadFilter()
  lowcut.type = "highpass"
  lowcut.frequency.value = 180
  lowcut.connect(out)
  lowcut.connect(room)

  const hiss = noise(ctx, 2, seeded(1))
  const bus = pan => {
    const p = ctx.createStereoPanner()
    p.pan.value = pan
    p.connect(lowcut)
    return p
  }
  const click = (t, pan, random, level, frequency, q, release) => {
    const source = ctx.createBufferSource()
    source.buffer = hiss
    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.frequency.value = frequency
    filter.Q.value = q
    const gain = ctx.createGain()
    envelope(gain.gain, t, level, 0.001, release)
    source.connect(filter).connect(gain).connect(bus(pan))
    source.start(t, random() * 1.5)
    source.stop(t + release + 0.05)
  }
  const tone = (t, pan, notes, level, release, type = "sine") => {
    const to = bus(pan)
    for (const [hz, amount, delay = 0] of notes) {
      const osc = ctx.createOscillator()
      osc.type = type
      osc.frequency.value = hz
      const gain = ctx.createGain()
      envelope(gain.gain, t + delay, level * amount, 0.004, release)
      osc.connect(gain).connect(to)
      osc.start(t + delay)
      osc.stop(t + delay + release + 0.1)
    }
  }
  const riser = (t, pan, length, level) => {
    const source = ctx.createBufferSource()
    source.buffer = hiss
    const filter = ctx.createBiquadFilter()
    filter.type = "bandpass"
    filter.Q.value = 2.2
    filter.frequency.setValueAtTime(500, t)
    filter.frequency.exponentialRampToValueAtTime(5000, t + length)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.003, t)
    gain.gain.exponentialRampToValueAtTime(level, t + length - 0.02)
    gain.gain.linearRampToValueAtTime(0, t + length)
    source.connect(filter).connect(gain).connect(bus(pan))
    source.start(t)
    source.stop(t + length + 0.02)
  }
  return {
    key: (t, pan, r) => click(t, pan, r, 0.07 + r() * 0.03, 2600 + r() * 1200, 1.4, 0.02),
    tap: (t, pan, r) => (click(t, pan, r, 0.22, 1300, 1.1, 0.05), tone(t, pan, [[F6, 1]], 0.04, 0.25)),
    land: (t, pan) => tone(t, pan, [[A5, 1], [A5 * 2, 0.2]], 0.12, 0.5),
    land2: (t, pan) => tone(t, pan, [[C6, 1], [C6 * 2, 0.2]], 0.12, 0.5),
    broke: (t, pan, r) => (click(t, pan, r, 0.12, 900, 1.2, 0.06), tone(t, pan, [[E5, 1], [F5, 0.9]], 0.07, 0.3, "triangle")),
    mend: (t, pan) => tone(t, pan, [[C6, 1], [F6, 0.6, 0.09]], 0.11, 0.9),
    intro: (t, pan) => riser(t, pan, intro.to - t, 0.3),
    hero: (t, pan) => tone(t, pan, [[F5, 1], [A5, 0.7], [C6, 0.6], [F6, 0.35]], 0.12, 2.2),
    end: (t, pan) => tone(t, pan, [[F5, 0.6], [A5, 0.5], [C6, 0.5], [F6, 0.3]], 0.11, 3.2),
  }
}

async function cues() {
  const ctx = new OfflineAudioContext(2, Math.ceil((window.END + 1) * RATE), RATE)
  const v = voices(ctx, ctx.destination)
  window.CUES.forEach((cue, i) => v[cue.kind]?.(cue.t, cue.pan, seeded(i + 1)))
  v.intro(intro.from + quarter, 0)
  return ctx.startRendering()
}

async function music() {
  const ctx = new OfflineAudioContext(2, Math.ceil((window.END + 1) * RATE), RATE)
  const buffer = await ctx.decodeAudioData(await (await fetch("music.m4a")).arrayBuffer())
  const source = ctx.createBufferSource()
  source.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = "lowpass"
  filter.Q.value = 4
  const open = RATE / 2
  filter.frequency.setValueAtTime(open, 0)
  filter.frequency.setValueAtTime(open, intro.from)
  filter.frequency.exponentialRampToValueAtTime(380, intro.from + quarter)
  filter.frequency.setValueAtTime(380, intro.to - quarter)
  filter.frequency.exponentialRampToValueAtTime(open, intro.to)
  source.connect(filter).connect(ctx.destination)
  source.start(0)
  return ctx.startRendering()
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
    for (let c = 0; c < 2; c++) bytes.setInt16(44 + i * 4 + c * 2, Math.max(-1, Math.min(1, channels[c][i])) * 32767, true)
  return new Uint8Array(bytes.buffer).toBase64()
}

window.soundtrack = async () => ({ music: wav(await music()), cues: wav(await cues()) })
