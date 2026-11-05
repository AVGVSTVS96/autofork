import { END, cues, screenX } from "./video.js"

export const RATE = 48000

// Suno take A2 ("autofork branch A"), stretched from 121.56 to 120 BPM so its bars land on the film's even seconds.
// Each cut is [film time, take time, length], all on downbeats: the intro under the problem, the drop on the name,
// the breakdown under the agent, the lift under the ride, full groove for the numbers, the last two bars and the ring-out for the end.
const MUSIC = "sound/a2-120.wav"
const CUTS = [
  [0, 9.662, 26],
  [26, 75.662, 8],
  [34, 83.662, 8],
  [42, 51.662, 12],
  [54, 103.662, 8],
]
const FADE = 0.012
const STOP = [9.5, 10]

const seeded = seed => () => {
  seed = (seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), seed | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

function hall(ctx, seconds, predelay, random) {
  const rate = ctx.sampleRate
  const buffer = ctx.createBuffer(2, seconds * rate, rate)
  for (let c = 0; c < 2; c++) {
    const data = buffer.getChannelData(c)
    let low = 0
    let energy = 0
    for (let i = 0; i < data.length; i++) {
      const t = i / rate - predelay
      if (t < 0) continue
      low += (0.06 + 0.9 * Math.exp(-t * 2.2)) * (random() * 2 - 1 - low)
      data[i] = low * Math.exp((-6.9 * t) / (seconds - predelay))
      energy += data[i] ** 2
    }
    for (let i = 0; i < data.length; i++) data[i] /= Math.sqrt(energy)
  }
  return buffer
}

const WIDTH = 0.4
const pan = (cue, t) => Math.max(-1, Math.min(1, screenX(cue, t) / 960 - 1)) * WIDTH

async function renderCue({ name, options }, i) {
  const ctx = new OfflineAudioContext(2, 3 * RATE, RATE)
  Object.defineProperty(ctx, "state", { get: () => "running" })
  window.AudioContext = function () {
    return ctx
  }
  // cuelume keeps one AudioContext and its own randomness for the life of its module, so every cue imports a fresh copy on a seeded Math.random
  Math.random = seeded(i + 1)
  const { play } = await import(`./node_modules/cuelume/dist/audio/engine.js?cue=${i}`)
  play(name, options)
  return ctx.startRendering()
}

async function renderCues() {
  const list = cues.map(cue => ({ ...cue, from: pan(cue, cue.t), to: pan(cue, cue.t + 0.6) }))
  const ctx = new OfflineAudioContext(2, Math.ceil(END * RATE), RATE)
  // cuelume's cues render about 14 dB under the music's peaks; this lifts the bus so volume=1 lands level with them
  const bus = new GainNode(ctx, { gain: 5 })
  bus.connect(ctx.destination)
  const clear = new BiquadFilterNode(ctx, { type: "highpass", frequency: 250, Q: 0.6 })
  clear.connect(bus)
  const room = new ConvolverNode(ctx, { buffer: hall(ctx, 1.6, 0.025, seeded(7)), disableNormalization: true })
  clear.connect(new GainNode(ctx, { gain: 0.07 })).connect(room).connect(bus)
  for (const [i, cue] of list.entries()) {
    const source = new AudioBufferSourceNode(ctx, { buffer: await renderCue(cue, i) })
    const panner = new StereoPannerNode(ctx)
    panner.pan.setValueAtTime(cue.from, cue.t)
    panner.pan.linearRampToValueAtTime(cue.to, cue.t + 0.6)
    source.connect(panner).connect(clear)
    source.start(cue.t)
  }
  return ctx.startRendering()
}

async function renderMusic() {
  const ctx = new OfflineAudioContext(2, Math.ceil(END * RATE), RATE)
  const take = await ctx.decodeAudioData(await (await fetch(MUSIC)).arrayBuffer())
  const out = new GainNode(ctx)
  out.connect(ctx.destination)
  out.gain.setValueAtTime(1, STOP[0] - 0.03)
  out.gain.linearRampToValueAtTime(0, STOP[0])
  out.gain.setValueAtTime(0, STOP[1] - 0.004)
  out.gain.linearRampToValueAtTime(1, STOP[1])
  for (const [i, [at, from, length]] of CUTS.entries()) {
    const source = new AudioBufferSourceNode(ctx, { buffer: take })
    const first = i === 0
    const last = i === CUTS.length - 1
    const gain = new GainNode(ctx, { gain: first ? 1 : 0 })
    if (!first) {
      gain.gain.setValueAtTime(0, at - FADE)
      gain.gain.linearRampToValueAtTime(1, at + FADE)
    }
    if (!last) {
      gain.gain.setValueAtTime(1, at + length - FADE)
      gain.gain.linearRampToValueAtTime(0, at + length + FADE)
    }
    source.connect(gain).connect(out)
    source.start(Math.max(0, at - FADE), from - (first ? 0 : FADE), length + 2 * FADE)
  }
  return ctx.startRendering()
}

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
  for (let i = 0; i < frames; i++)
    for (let c = 0; c < 2; c++) bytes.setFloat32(44 + i * 8 + c * 4, channels[c][i], true)
  return new Uint8Array(bytes.buffer).toBase64()
}

window.cueList = () => cues.map(({ t, name, options }) => ({ t: +t.toFixed(3), name, ...options })).sort((a, b) => a.t - b.t)
window.soundtrack = async () => {
  const random = Math.random
  try {
    return { cues: wav(await renderCues()), music: wav(await renderMusic()) }
  } finally {
    Math.random = random
  }
}
