import { MUSIC, at, spb } from "./music.js"

const scenes = [...document.querySelectorAll(".scene")]
const count = document.querySelector(".rail.count")
const END_BEAT = +document.body.dataset.end
const END = at(END_BEAT) + MUSIC.tail
const TOTAL = Math.max(...scenes.map(s => +s.dataset.n || 0))
const pad = n => String(n).padStart(2, "0")
const KEY = 0.045

scenes.forEach((s, i) => {
  s.start = at(+s.dataset.b)
  s.end = scenes[i + 1] ? at(+scenes[i + 1].dataset.b) : END
})

const springs = { stamp: [0.32, 0], rise: [0.5, 0], pop: [0.42, 0.32], draw: [0.6, 0], settle: [0.45, 0], snap: [0.22, 0], zoom: [0.4, 0] }

function spring(visualDuration, bounce, t) {
  if (t <= 0) return 0
  const w = (2 * Math.PI) / (visualDuration * 1.2)
  const z = Math.min(1, 1 - bounce)
  if (z >= 1) return 1 - (1 + w * t) * Math.exp(-w * t)
  const wd = w * Math.sqrt(1 - z * z)
  return 1 - Math.exp(-z * w * t) * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t))
}

for (const el of document.querySelectorAll("[data-words]")) {
  const [first, step] = el.dataset.words.split(" ").map(Number)
  let i = 0
  const split = node => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType !== Node.TEXT_NODE) {
        split(child)
        continue
      }
      child.replaceWith(...child.textContent.split(/(\s+)/).filter(Boolean).map(part => {
        if (/^\s+$/.test(part)) return part
        const word = document.createElement("span")
        word.textContent = part
        word.dataset.k = "stamp"
        word.dataset.in = first + step * i++
        return word
      }))
    }
  }
  split(el)
}

const beatOf = el => +el.closest(".scene").dataset.b
const start = el => at(beatOf(el) + +(el.dataset.in ?? 0))

const animated = [...document.querySelectorAll("[data-k]")].map(el => ({ el, t: start(el), s: springs[el.dataset.k] }))

const typers = [...document.querySelectorAll("[data-type]")].map(el => ({ el, t: start(el), text: el.dataset.type }))

const reels = [...document.querySelectorAll(".badge[data-steps]")].map(badge => {
  const reel = badge.querySelector(".reel")
  const items = [...reel.children]
  const steps = badge.dataset.steps.split(" ").map(b => at(beatOf(badge) + +b))
  return { badge, reel, items, steps, widths: null }
})

const cues = [...document.querySelectorAll("[data-cue]")].map(el => ({ t: start(el), kind: el.dataset.cue }))

const blur = document.querySelector("#vblur feGaussianBlur")

const presses = [...document.querySelectorAll("[data-press]")].map(el => ({ el, t: at(beatOf(el) + +el.dataset.press) }))

function seek(t) {
  let current = 0
  scenes.forEach((s, i) => {
    const on = t >= s.start && t < s.end
    s.classList.toggle("on", on)
    if (on) current = i
  })
  const scene = scenes[current]
  document.body.classList.toggle("bare", scene.hasAttribute("data-bare"))
  document.body.classList.toggle("notag", scene.hasAttribute("data-notag"))
  document.body.classList.toggle("blink", Math.floor(t / spb) % 2 === 1)
  if (count) count.textContent = `${pad(+scene.dataset.n || 0)} / ${pad(TOTAL)}`

  for (const { el, t: t0, s } of animated) {
    el.style.setProperty("--p", spring(s[0], s[1], t - t0).toFixed(4))
    el.classList.toggle("in", t >= t0)
  }

  for (const { el, t: t0, text } of typers) {
    const n = Math.max(0, Math.min(text.length, Math.floor((t - t0) / KEY) + 1))
    el.textContent = t < t0 ? "" : text.slice(0, n)
    el.closest(".typer")?.classList.toggle("typing", t >= t0 && n < text.length)
  }

  for (const r of reels) {
    if (!r.badge.closest(".scene").classList.contains("on")) continue
    if (!r.widths?.[0]) r.widths = r.items.map(item => item.offsetWidth + 17)
    const travel = at => r.steps.reduce((sum, ts) => sum + spring(...springs.snap, at - ts), 0)
    const pos = travel(t)
    blur?.setAttribute("stdDeviation", `0 ${Math.min(6, Math.abs(pos - travel(t - 1 / 120)) * 40).toFixed(2)}`)
    const i = Math.min(Math.floor(pos), r.items.length - 1)
    const f = pos - i
    r.reel.style.transform = `translateY(${-pos * 100 / r.items.length}%)`
    r.badge.style.width = `${r.widths[i] + (r.widths[Math.min(i + 1, r.items.length - 1)] - r.widths[i]) * f}px`
  }

  for (const { el, t: t0 } of presses) {
    const d = t - t0
    el.style.setProperty("--press", d < 0 ? 0 : d < 0.08 ? d / 0.08 : Math.max(0, 1 - spring(...springs.settle, d - 0.08)))
  }
}

window.END = END
window.seek = seek
window.TIMELINE = { typers, presses, cues, key: KEY }

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
  document.fonts.ready.then(() => requestAnimationFrame(tick))
}
