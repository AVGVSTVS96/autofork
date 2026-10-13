const RATE = 48000

const feed = document.querySelector(".feed-view")
const intro = { from: JSON.parse(feed.dataset.stops).at(-1)[0], to: +feed.closest(".scene").dataset.e }
const quarter = (intro.to - intro.from) / 4

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

window.soundtrack = async () => ({ music: wav(await music()) })
