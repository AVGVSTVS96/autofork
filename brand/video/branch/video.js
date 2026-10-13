import { logo } from "./logo.js"

const { spring } = Motion
const SVG = "http://www.w3.org/2000/svg"
const CHAR = 0.045

export const END = 62
export const cues = []

const stage = document.getElementById("stage")
const world = document.getElementById("world")
const cam = document.getElementById("cam")
const scenes = [...document.querySelectorAll(".scene")]
const WORLD_SCENES = new Set([0, 1, 5, 6, 7, 8, 9])
const DARK_SCENES = new Set([6])

const gens = new Map()
const sp = (dt, dur = 0.5, bounce = 0) => {
  if (dt <= 0) return 0
  const key = `${dur}:${bounce}`
  if (!gens.has(key)) gens.set(key, spring({ keyframes: [0, 1], visualDuration: dur, bounce }))
  const s = gens.get(key).next(dt * 1000)
  return s.done ? 1 : s.value
}
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
const lerp = (a, b, p) => a + (b - a) * p

const el = (parent, tag, attrs = {}) => {
  const n = document.createElementNS(SVG, tag)
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v)
  parent.append(n)
  return n
}

// a piecewise-linear head: where a line has drawn to at time t, and when it first reaches x
const head = keys => ({
  at: t => {
    if (t <= keys[0][0]) return keys[0][1]
    for (let i = 1; i < keys.length; i++) {
      const [t1, x1] = keys[i]
      const [t0, x0] = keys[i - 1]
      if (t < t1) return lerp(x0, x1, (t - t0) / (t1 - t0))
    }
    return keys.at(-1)[1]
  },
  when: x => {
    if (x <= keys[0][1]) return -10
    for (let i = 1; i < keys.length; i++) {
      const [t1, x1] = keys[i]
      const [t0, x0] = keys[i - 1]
      if (x <= x1 && x1 > x0) return t0 + ((x - x0) / (x1 - x0)) * (t1 - t0)
    }
    return Infinity
  },
})

/* ------------------------------------------------------------------ the graph, from the real T3 Code fork */

const G = 220
const DX = 200
const MERGE = x => `M${x} 0C${x + DX / 2} 0 ${x + DX / 2} ${G} ${x + DX} ${G}`

// when each beat of the story starts: the break, underneath, the ride, the proof, the pause
const B = 21
const U = 26
const R = 34
const P = 42
const Q = 48

const RELEASES = [[-1000, "v0.0.42"], [-720, "v0.0.43"], [-580, "v0.0.44"], [-360, "v0.0.45"]]
const FORK = 0
const HEAL = 1720
const SYNCS = [
  { sha: "74dfbb6", n: 2 },
  { sha: "ed0f7b9", n: 67 },
  { sha: "d45d1a1", n: 61 },
  { sha: "abc80c8", n: 23 },
  { sha: "8f25cf9", n: 3 },
]
let x = HEAL
for (const [i, s] of SYNCS.entries()) {
  s.T = R + 1 + i
  s.from = x
  s.x = x += Math.max(230, s.n * 15)
}
const LAST = SYNCS.at(-1)
const README = { x: LAST.x + DX + 400, T: R + 6 }
const THEIRS = README.x + 300
const WIDE = 1500 / (README.x - HEAL + 360)

const trunk = head([
  [0, -560], [1.5, -360], [3.5, -10], [5.5, -10], [7.5, HEAL],
  ...SYNCS.flatMap((s, i) => [[s.T - 0.6, i ? SYNCS[i - 1].x : HEAL], [s.T - 0.1, s.x]]),
  [Q + 0.3, LAST.x], [Q + 1, THEIRS], [Q + 1.6, THEIRS + 600],
])
const yours = head([
  [4.5, DX], [5, 360], [B + 0.5, 360], [B + 1, HEAL + DX],
  ...SYNCS.flatMap((s, i) => [[s.T - 0.1, (i ? SYNCS[i - 1].x : HEAL) + DX], [s.T + 0.25, s.x + DX]]),
  [README.T - 0.1, LAST.x + DX], [README.T + 0.25, README.x],
  [Q + 1.2, README.x], [Q + 1.6, THEIRS + DX],
])

const layers = { lines: el(cam, "g"), dots: el(cam, "g"), nodes: el(cam, "g"), labels: el(cam, "g") }
const trunkPath = el(layers.lines, "path", { class: "trunk", d: `M-1700 0H${THEIRS + 600}` })
const yoursPath = el(layers.lines, "path", { class: "yours", d: `M${DX} ${G}H${THEIRS + 600}` })
const draws = []
const draw = (d, cls, t0, dur = 0.4) => draws.push({ el: el(layers.lines, "path", { class: cls, d, pathLength: 1 }), t0, dur })
const pops = []
const pop = (cls, cx, cy, r, t0, extra = {}) => {
  const c = el(layers[cls === "c" ? "dots" : "nodes"], "circle", { class: cls, cx, cy, r: 0 })
  pops.push({ el: c, r, t0, dur: 0.35, ...extra })
  return c
}
const labels = []
const label = (cls, text, ax, ay, off, t0, extra = {}) => {
  const g = el(layers.labels, "g", { class: cls })
  const rect = el(g, "rect")
  const image = extra.icon && el(g, "image", { href: extra.icon, width: 32, height: 32, y: -16 })
  const t = el(g, "text", { "text-anchor": image ? "start" : "middle", "dominant-baseline": "central" })
  t.textContent = text
  const item = { g, rect, text: t, ax, ay, off, t0, t1: Infinity, h: cls.startsWith("chip") || image ? 50 : 44, pulses: [], ...extra, image }
  labels.push(item)
  return item
}

// their line: T3 Code's real releases, commits between them
label("lane", "T3 Code", -1150, 0, 0, -10, { icon: "img/t3code.png" })
for (const [rx, tag] of RELEASES) {
  pop("ring", rx, 0, 13, trunk.when(rx))
  label("tag", tag, rx, 0, -56, trunk.when(rx))
}
for (let cx = -1660; cx < FORK - 20; cx += 34) if (!RELEASES.some(([rx]) => Math.abs(cx - rx) < 30)) pop("c", cx, 0, 6.5, trunk.when(cx))

// you fork it on Oct 6: your line peels off, carrying your change, and four days of theirs run past it
pop("ring", FORK, 0, 13, 4)
label("tag", "9503155", FORK, 0, -56, 4, { t1: 8 })
draw(MERGE(FORK), "yours", 4, 0.5)
pop("node", DX, G, 12, 4.5)
label("chip", "window-title", DX, G, 62, 4.7)
label("tag date", "Oct 6", 360, G, 0, 5.2, { dx: 40, t1: 8 })
label("tag date", "Oct 10", HEAL, 0, -52, 7.5, { t1: 8 })

// the first update: it lands, your change doesn't apply, the agent rebuilds it
pop("ring", HEAL, 0, 13, B + 0.5)
label("tag", "9afde1c", HEAL, 0, -56, B + 0.5, { t1: U })
label("tag", "9afde1c", HEAL, 0, -56, R, { t1: P, instant: true })
draw(MERGE(HEAL), "merge", B + 0.5, 0.45)
pop("broke", HEAL + DX, G, 17, B + 0.95, { t1: U + 4 })
label("chip bad", "window-title", HEAL + DX, G, 62, B + 1, { t1: U + 4 })
pop("node", HEAL + DX, G, 12, U + 4, { dur: 0.45, bounce: 0.3 })
const healed = label("chip", "window-title", HEAL + DX, G, 62, U + 4, { instant: true, pulses: [U + 4] })

// every update after: their commits, one dot each, merged into yours
for (const s of SYNCS) {
  const w = s.x - s.from
  for (let j = 1; j < s.n; j++) pop("c", s.from + (w * j) / s.n, 0, 6.5, trunk.when(s.from + (w * j) / s.n))
  pop("ring", s.x, 0, 13, s.T - 0.1)
  label("tag", s.sha, s.x, 0, -56, s.T - 0.1, { t1: P })
  draw(MERGE(s.x), "merge", s.T - 0.1, 0.35)
  pop("node", s.x + DX, G, 12, s.T + 0.25)
}
label("chip", "context-usage", SYNCS[3].x + DX, G, 62, SYNCS[3].T + 0.35)
pop("node", README.x, G, 12, README.T + 0.25)
label("chip", "fork-readme", README.x, G, 62, README.T + 0.35)
cues.push({ t: SYNCS[3].T + 0.35, name: "ready", options: { volume: 0.35 }, at: () => SYNCS[3].x + DX })

// the two days, start to end, and the change the agent rebuilt on the first
label("tag date", "Oct 10", HEAL, 0, -56, P + 0.4, { t1: Q })
label("tag date", "Oct 12", LAST.x, 0, -56, P + 0.4, { t1: Q })
healed.pulses.push(P + 1.5)

// they ship their own: the update still lands, your version of it pauses, and an issue asks you to pick
for (let cx = LAST.x + 40; cx < THEIRS - 20; cx += 40) pop("c", cx, 0, 6.5, trunk.when(cx))
for (let cx = THEIRS + 40; cx < THEIRS + 600; cx += 40) pop("c", cx, 0, 6.5, trunk.when(cx))
pop("ring", THEIRS, 0, 13, Q + 1)
label("chip theirs", "they ship context usage", THEIRS, 0, -60, Q + 1)
draw(MERGE(THEIRS), "merge", Q + 1.2, 0.4)
pop("node", THEIRS + DX, G, 12, Q + 1.6)
label("chip paused", "context-usage · paused", THEIRS + DX, G, 62, Q + 1.8)
label("chip issue", "issue: context-usage: upstream does this now", THEIRS + DX, G, 122, Q + 2.3)
cues.push({ t: Q + 1.8, name: "warning", options: { volume: 0.35, emphasis: "subtle" }, at: () => THEIRS + DX })
cues.push({ t: 4, name: "navigate", options: { volume: 0.35 }, at: () => FORK })
cues.push({ t: 5.5, name: "count", options: { volume: 0.3, duration: 2000 }, at: () => HEAL })
cues.push({ t: B + 0.95, name: "error", options: { volume: 0.45 }, at: () => HEAL + DX })
cues.push({ t: U + 4, name: "success", options: { volume: 0.9 }, at: () => HEAL + DX })

const headRing = el(layers.nodes, "circle", { class: "head", cy: G, r: 0 })
layers.nodes.prepend(headRing)

/* ------------------------------------------------------------------ the camera: holds, and travels on the beat */

const shots = [
  { t: 0, cx: -420, cy: 160, z: 1 },
  { t: 4, cx: 300, cy: 160, z: 1, dur: 0.7 },
  { t: 5.5, cx: 930, cy: 175, z: 0.78, dur: 0.9 },
  { t: U, cx: HEAL + DX + 290, cy: 190, z: 2 },
  { t: R, cx: HEAL + DX + 660, cy: 160, z: 1 },
  ...SYNCS.slice(2).map(s => ({ t: s.T - 0.6, cx: s.x + DX - 440, cy: 160, z: 1, dur: 0.55 })),
  { t: README.T - 0.6, cx: README.x - 440, cy: 160, z: 1, dur: 0.55 },
  { t: P, cx: (HEAL + DX + README.x) / 2, cy: 220 - 60 / WIDE, z: WIDE, dur: 0.9 },
  { t: Q, cx: THEIRS + DX - 400, cy: 160, z: 1, dur: 0.8 },
]
const camAt = t => {
  let from = shots[0]
  let state = shots[0]
  for (let i = 1; i < shots.length; i++) {
    const s = shots[i]
    if (t < s.t) break
    from = camAtMove(state, from, s.t)
    state = s
  }
  return camAtMove(state, from, t)
}
function camAtMove(target, from, t) {
  if (!target.dur) return target
  const p = sp(t - target.t, target.dur)
  return { cx: lerp(from.cx, target.cx, p), cy: lerp(from.cy, target.cy, p), z: Math.exp(lerp(Math.log(from.z), Math.log(target.z), p)) }
}

/* ------------------------------------------------------------------ the overlays */

for (const s of scenes) s.style.setProperty("--s", s.dataset.s)
const sceneOf = n => +n.closest(".scene").dataset.s

for (const svg of document.querySelectorAll("[data-logo]")) logo(svg)

const enters = [...document.querySelectorAll("[data-in]")].map(n => {
  const t0 = sceneOf(n) + +n.dataset.in
  const exit = n.closest(".cap") ? +n.closest(".scene").dataset.e : Infinity
  const kind = n.dataset.k ?? "up"
  if (n.dataset.cue) cues.push({ t: t0, ...parse(n.dataset.cue), el: n })
  return { el: n, t0, exit, kind, dur: +(n.dataset.dur ?? 0.55), logo: n.hasAttribute("data-logo") }
})
const presses = [...document.querySelectorAll("[data-press]")].map(n => {
  const t0 = sceneOf(n) + +n.dataset.press
  if (n.dataset.cue) cues.push({ t: t0, ...parse(n.dataset.cue), el: n })
  return { el: n, t0 }
})
const typed = [...document.querySelectorAll("[data-type]")].map(n => {
  const start = sceneOf(n) + +n.dataset.at
  const text = n.dataset.type
  for (let i = 0; i < text.length; i++)
    if (text[i] !== " ") cues.push({ t: start + i * CHAR, name: "type", options: { key: "printable", emphasis: "subtle", volume: 0.3 }, el: n })
  return { el: n, start, text, caret: n.parentElement.querySelector(".caret"), stop: presses[0].t0 }
})
const lineDraws = [...document.querySelectorAll("[data-draw]")].map(n => ({ el: n, t0: sceneOf(n) + +n.dataset.draw, dur: +n.dataset.dur }))
const linePops = [...document.querySelectorAll("[data-pop]")].map(n => {
  const t0 = sceneOf(n) + +n.dataset.pop
  if (n.dataset.cue) cues.push({ t: t0, ...parse(n.dataset.cue), el: n })
  return { el: n, t0, r: +n.getAttribute("r") }
})

function parse(cue) {
  const [name, ...pairs] = cue.split(" ")
  return { name, options: Object.fromEntries(pairs.map(p => p.split("=")).map(([k, v]) => [k, Number.isNaN(+v) ? v : +v])) }
}

const enter = ({ el: n, t0, exit, kind, dur, logo: isLogo }, t) => {
  const p = sp(t - t0, dur)
  if (isLogo) return logo.seek(n, t - t0)
  const out = clamp((exit - t) / 0.15)
  if (kind === "fade") n.style.opacity = clamp((t - t0) / dur) * out
  else {
    n.style.opacity = clamp(p / 0.5) * out
    n.style.transform = `translateY(${(1 - p) * 32}px)`
  }
}

/* ------------------------------------------------------------------ one clock */

const count = document.getElementById("count")
const rails = { wm: document.getElementById("rail-wm"), tag: document.getElementById("rail-tag"), url: document.getElementById("rail-url") }
const pad = n => String(n).padStart(2, "0")
let measured = false
const measure = () => {
  if (measured || !document.fonts.check('24px "Fragment Mono"')) return
  measured = true
  for (const l of labels) {
    const text = l.text.getComputedTextLength()
    const w = text + (l.image ? 72 : l.h === 50 ? 40 : 26)
    if (l.image) {
      l.image.setAttribute("x", -w / 2 + 14)
      l.text.setAttribute("x", -w / 2 + 56)
    }
    Object.assign(l, { w })
    l.rect.setAttribute("x", -w / 2)
    l.rect.setAttribute("y", -l.h / 2)
    l.rect.setAttribute("width", w)
    l.rect.setAttribute("height", l.h)
    l.rect.setAttribute("rx", l.h === 50 ? 25 : 10)
    if (l.pulses.length) {
      l.ring = el(l.g, "rect", { class: "pulse", x: -w / 2, y: -l.h / 2, width: w, height: l.h, rx: 25 })
      l.g.prepend(l.ring)
    }
  }
}

export function seek(t) {
  measure()
  let index = 0
  scenes.forEach((s, i) => {
    const on = t >= +s.dataset.s && t < +s.dataset.e
    s.classList.toggle("on", on)
    if (on) index = i
  })
  count.textContent = `${pad(index + 1)} / ${pad(scenes.length)}`
  stage.dataset.theme = DARK_SCENES.has(index) ? "dark" : "light"
  world.classList.toggle("on", WORLD_SCENES.has(index))
  rails.wm.style.opacity = rails.tag.style.opacity = t >= 15 && index !== 10 ? 1 : 0
  rails.url.style.opacity = index === 11 ? 0 : 1

  const { cx, cy, z } = camAt(t)
  cam.setAttribute("transform", `translate(960 540) scale(${z}) translate(${-cx} ${-cy})`)

  const tx = trunk.at(t)
  trunkPath.style.strokeDasharray = `${tx + 1700} 99999`
  const yx = yours.at(t)
  yoursPath.style.strokeDasharray = `${Math.max(0, yx - DX)} 99999`
  yoursPath.style.opacity = t < 4.5 ? 0 : 1
  headRing.setAttribute("cx", yx)
  headRing.setAttribute("r", 14 * sp(t - 4.5, 0.35))

  for (const d of draws) {
    const p = clamp((t - d.t0) / d.dur)
    d.el.style.strokeDasharray = `${1 - (1 - p) ** 3} 2`
    d.el.style.opacity = p > 0.001 ? 1 : 0
  }
  for (const c of pops) {
    const out = c.t1 !== undefined && t >= c.t1
    c.el.setAttribute("r", out ? 0 : c.r * sp(t - c.t0, c.dur, c.bounce ?? 0))
  }
  for (const l of labels) {
    const p = t >= l.t1 ? 0 : l.instant ? +(t >= l.t0) : sp(t - l.t0, 0.4)
    const s = (0.85 + 0.15 * p) / z
    const shift = l.dx === undefined ? 0 : l.dx + (l.w ?? 0) / 2
    l.g.setAttribute("transform", `translate(${l.ax} ${l.ay}) scale(${s}) translate(${shift} ${l.off})`)
    const mid = (l.ax - cx) * z + 960 + shift
    const half = (l.w ?? 0) / 2
    const edge = clamp((mid - half - 100) / 30) * clamp((1820 - mid - half) / 30)
    l.g.style.opacity = clamp(p * 1.5) * edge
    if (l.ring) {
      const at = l.pulses.findLast(q => t >= q) ?? -9
      const q = clamp((t - at) / 0.9)
      l.ring.style.opacity = q > 0 && q < 1 ? 0.9 * (1 - q) : 0
      l.ring.setAttribute("transform", `scale(${1 + 0.18 * (1 - (1 - q) ** 3)})`)
    }
  }

  for (const e of enters) enter(e, t)
  for (const p of presses) {
    const dt = t - p.t0
    const bump = dt > 0 && dt < 0.3 ? Math.sin((dt / 0.3) * Math.PI) : 0
    p.el.style.transform = `scale(${1 - 0.05 * bump})`
  }
  for (const c of typed) {
    const n = t < c.start ? 0 : Math.min(c.text.length, Math.floor((t - c.start) / CHAR + 1e-6) + 1)
    c.el.textContent = c.text.slice(0, n)
    c.caret.style.opacity = t < c.stop ? 1 : 0
  }
  for (const d of lineDraws) {
    const p = sp(t - d.t0, d.dur)
    d.el.style.strokeDasharray = `${p} 2`
    d.el.style.opacity = p > 0.001 ? 1 : 0
  }
  for (const c of linePops) c.el.setAttribute("r", c.r * sp(t - c.t0, 0.35))
}

// sound pans from the screen position; world cues give a world x
export const screenX = (cue, t) => {
  if (cue.el) {
    seek(t)
    const r = cue.el.getBoundingClientRect()
    return r.left + r.width / 2
  }
  const { cx, z } = camAt(t)
  return (cue.at() - cx) * z + 960
}

seek(0)
window.seek = seek
window.END = END

if (!navigator.webdriver) {
  const audio = new Audio("out/soundtrack.wav")
  const from = +new URLSearchParams(location.search).get("t") || 0
  let t0 = performance.now() - from * 1000
  addEventListener("click", () => {
    audio.currentTime = 0
    audio.play()
  })
  audio.addEventListener("ended", () => (t0 = performance.now()))
  const tick = now => {
    seek(audio.paused ? ((now - t0) / 1000) % END : audio.currentTime)
    requestAnimationFrame(tick)
  }
  document.fonts.ready.then(() => requestAnimationFrame(tick))
}
