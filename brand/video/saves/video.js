import { posts, render } from "./posts.js"

const stage = document.getElementById("stage")
const col = document.querySelector(".col")
col.insertAdjacentHTML("beforeend", posts.map(render).join(""))

const spring = (visual, bounce = 0) => {
  const zeta = 1 - bounce
  const w = 5.8 / visual
  const wd = w * Math.sqrt(Math.max(1 - zeta * zeta, 0))
  const x = t => (zeta >= 1 ? 1 - Math.exp(-w * t) * (1 + w * t) : 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t)))
  let end = visual
  while (Math.abs(1 - x(end)) > 0.0008 || Math.abs(1 - x(end + 0.05)) > 0.0008) end += 0.02
  const points = Array.from({ length: 49 }, (_, i) => +x((end * i) / 48).toFixed(4))
  points[48] = 1
  return { x: t => (t >= end ? 1 : t <= 0 ? 0 : x(t)), css: `${end.toFixed(3)}s linear(${points.join(", ")})` }
}

const springs = { settle: spring(0.55), draw: spring(0.8), pop: spring(0.45, 0.3), snap: spring(0.42) }
for (const [name, s] of Object.entries(springs)) stage.style.setProperty(`--${name}`, s.css)

const scenes = [...document.querySelectorAll(".scene")]
for (const s of scenes) s.style.setProperty("--s", s.dataset.s)
const END = +document.body.dataset.end

for (const path of document.querySelectorAll("[data-len]")) path.style.setProperty("--len", Math.ceil(path.getTotalLength()) + 1)

const stops = JSON.parse(document.querySelector(".feed-view").dataset.stops)
let shots = []
const frame = () => {
  const box = el => ({ top: el.offsetTop, bottom: el.offsetTop + el.offsetHeight })
  shots = stops.map(([t, id, fixed, anchor = "center"]) => {
    const el = col.querySelector(`#${id}`)
    const { top, bottom } = box(el)
    const scale = fixed ?? Math.min(3.1, 1000 / (bottom - top))
    const half = 540 / scale
    const y = anchor === "top" ? top - 40 / scale + half : anchor === "bottom" ? bottom + 40 / scale - half : (top + bottom) / 2
    return { t, y, scale }
  })
}

const camera = t => {
  if (!shots.length) frame()
  let i = shots.findLastIndex(s => t >= s.t)
  if (i < 0) i = 0
  const to = shots[i]
  const from = shots[Math.max(i - 1, 0)]
  const p = i ? springs.snap.x(t - to.t) : 1
  const y = from.y + (to.y - from.y) * p
  const scale = from.scale + (to.scale - from.scale) * p
  col.style.transform = `translate(${960 - 300 * scale}px, ${540 - y * scale}px) scale(${scale})`
}

const typers = [...document.querySelectorAll("[data-type]")].map(el => {
  const at = +el.closest(".scene").dataset.s + +el.dataset.at
  return { el, at, text: el.dataset.type, char: +(el.dataset.char ?? 0.045) }
})

function seek(t) {
  for (const s of scenes) {
    const on = t >= +s.dataset.s && t < +s.dataset.e
    s.classList.toggle("on", on)
    if (on) stage.dataset.theme = s.dataset.theme ?? ""
  }
  camera(t)
  for (const { el, at, text, char } of typers) el.textContent = text.slice(0, Math.max(0, Math.min(text.length, Math.floor((t - at) / char) + 1)))
  for (const a of document.getAnimations()) {
    a.pause()
    a.currentTime = t * 1000
  }
}

const settled = Promise.all([document.fonts.ready, ...[...document.images].map(img => img.decode().catch(() => {}))])

window.END = END
window.seek = t => seek(t)
window.CUES = [
  ...typers.flatMap(({ at, text, char }) => [...text].flatMap((c, i) => (c === " " ? [] : [{ t: at + i * char, kind: "key", pan: -0.1 + (i / text.length) * 0.3 }]))),
  ...[...document.querySelectorAll("[data-cue]")].map(el => {
    const [kind, d = 0] = el.dataset.cue.split(" ")
    const scene = el.closest(".scene")
    const style = getComputedStyle(el)
    const t = +scene.dataset.s + (+(style.getPropertyValue("--d") || 0)) + +d
    const box = el.getBoundingClientRect()
    return { t, kind, pan: Math.max(-1, Math.min(1, (box.left + box.width / 2) / 960 - 1)) * 0.5 }
  }),
].sort((a, b) => a.t - b.t)

await settled
frame()
seek(+new URLSearchParams(location.search).get("t") || 0)
document.body.dataset.ready = ""

if (!navigator.webdriver) {
  const audio = new Audio("out/soundtrack.wav")
  const from = +new URLSearchParams(location.search).get("t") || 0
  let t0 = performance.now() - from * 1000
  addEventListener("click", () => {
    audio.currentTime = 0
    audio.play()
  })
  const tick = now => {
    seek(audio.paused ? ((now - t0) / 1000) % END : audio.currentTime)
    requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}
