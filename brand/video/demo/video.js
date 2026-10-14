const W = 1680, H = 756, BASE = W / 1440
const CHAR = 0.045

const settle = (x, d = 0.6) => (x <= 0 ? 0 : x >= 2 * d ? 1 : 1 - (1 + (5.83 / d) * x) * Math.exp((-5.83 / d) * x))
const glide = x => (x <= 0 ? 0 : x >= 1 ? 1 : x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2)
const typed = (lt, t0, text) => text.slice(0, Math.max(0, Math.floor((lt - t0) / CHAR + 1e-6)))
const lerp = (a, b, k) => a + (b - a) * k

const press = (el, lt, at) => {
  const k = lt < at ? 0 : Math.min(1, (lt - at) / 0.18)
  el.style.transform = `scale(${1 - 0.05 * Math.sin(Math.PI * k)})`
}

const pulse = (doc, lt) => {
  const k = (lt % 1.6) / 1.6
  const spread = 4 + 3 * Math.sin(Math.PI * k)
  const alpha = 1 - Math.sin(Math.PI * k)
  for (const dot of doc.querySelectorAll(".item.now > i")) dot.style.boxShadow = `0 0 0 ${spread}px rgb(237 235 255 / ${alpha})`
}

const composer = (doc, lt, app, icon, change, from) => {
  const badge = doc.querySelector(".badge")
  badge.style.width = "auto"
  const reel = badge.querySelector(".reel")
  reel.style.transform = "none"
  reel.innerHTML = `<span><img src="/repos/${icon}" alt="">${app}</span>`
  const text = typed(lt, from, change)
  doc.querySelector(".typed").textContent = text
  const typing = text.length > 0 && text.length < change.length
  doc.querySelector(".caret").style.opacity = typing || lt % 1 < 0.5 ? 1 : 0
}

const BEAT = 60 / 129.85
const CODE = "Hq3VtZ8nRkW2pLx7cYfB0mJdTs5gNaE4uQyKoXiv1Ce#Ua9Lr2FzPw6kTnS3hDqB7mVxYj0cGtR8sLe5NfKpW4"
const b = n => n * BEAT

const SCENES = [
  {
    id: "ask", s: 0, e: 7,
    states: [[0, "hero"]],
    apply(lt, doc) {
      composer(doc, lt, "T3 Code", "t3code.png", "but always show context usage", b(1.5))
      press(doc.querySelector(".ask button"), lt, b(5.75))
    },
    cam: [
      { t: 0, at: { x: 790, y: 442 }, z: 1.15 },
      { t: b(1), at: ".ask", z: 2.85, d: 0.5, left: 166, dy: 48 },
      { t: b(4.75), at: ".ask button", z: 2.85, d: 0.45, dx: -150, dy: 48 },
    ],
  },
  {
    id: "fork", s: 7, e: 12,
    states: [[0, "making"], [b(2), "plan"]],
    apply(lt, doc) { pulse(doc, lt) },
    cam: [{ t: 0, at: ".steps li:nth-child(2)", z: 2.1, left: 20, dy: 20 }, { t: b(2), at: ".steps li:nth-child(2)", z: 2.1, d: 0.45, left: 20, dy: 20 }],
  },
  {
    id: "claude", s: 12, e: 18,
    states: [[0, "plan"], [b(1.25), "claude"], [b(2.5), "pasted"]],
    apply(lt, doc) {
      pulse(doc, lt)
      if (lt < b(1.25)) press(doc.querySelectorAll(".choices .btn")[1], lt, b(0.75))
      const input = doc.querySelector(".paste input")
      if (input && lt >= b(2.5)) input.value = CODE
      const start = doc.querySelector(".paste button")
      if (start && lt >= b(2.5)) press(start, lt, b(4))
    },
    cam: [{ t: 0, at: ".steps li:nth-child(3)", z: 2.1, left: 120, dy: 30 }, { t: b(1.5), at: ".device", z: 2.1, d: 0.45, left: 120, dy: 10 }],
  },
  {
    id: "run", s: 18, e: 28,
    states: [[0, "run1"], [b(1), "run2"], [b(2), "run3"], [b(3), "run4"], [b(5), "run5"], [b(7), "run6"]],
    apply(lt, doc) { pulse(doc, lt) },
    cam: [{ t: 0, at: ".run", z: 2.5, left: 30, dy: 40 }, { t: b(7), at: ".run", z: 2.5, d: 0.5, left: 30, dy: 70 }],
  },
  {
    id: "t3", s: 28, e: 35,
    states: [[0, "t3"]],
    apply(lt, doc) {
      const k = settle(lt - b(3), 0.4)
      const wrap = doc.querySelector(".ctx-wrap")
      wrap.style.opacity = k
      wrap.style.transformOrigin = "50% 70%"
      wrap.style.transform = `scale(${lerp(0.5, 1, k)})`
    },
    cam: [{ t: 0, at: ".t3", z: 1.15 }, { t: b(1.25), at: ".ctx-wrap", z: 3.9, d: 0.55, dx: -23, dy: -52 }],
  },
  {
    id: "patch", s: 35, e: 41,
    cam: [{ t: 0, at: { x: 277, y: 430 }, z: 2.6 }, { t: b(2), at: { x: 667, y: 540 }, z: 2.25, d: 0.5 }],
  },
  {
    id: "time", s: 41, e: 50,
    apply(lt, el) {
      const ring = el.querySelector(".ring")
      const k = settle(lt - b(6.5), 0.4)
      Object.assign(ring.style, { left: "36px", top: "38px", width: "1238px", height: "76px", opacity: k, transform: `scale(${lerp(1.04, 1, k)})` })
    },
    scroll: { from: 10777 - 330, to: 330, t0: 0, d: b(6) },
    cam: [{ t: 0, at: { x: 640, y: 0 }, z: 1.1 }],
  },
  {
    id: "still", s: 50, e: 55,
    states: [[0, "kept"]],
    cam: [{ t: 0, at: ".changes", z: 2.05, dy: 0 }],
  },
  {
    id: "kept", s: 55, e: 61,
    states: [[0, "kept"]],
    cam: [{ t: 0, at: ".changes", z: 2.05, dy: 0 }],
  },
  {
    id: "xtool", s: 61, e: 66,
    states: [[0, "hero"]],
    apply(lt, doc) { composer(doc, lt, "xtool", "xtool.png", "but free teams keep their App Groups", b(0.5)) },
    cam: [{ t: 0, at: ".ask", z: 2.85, left: 166, dy: 48 }],
  },
  {
    id: "xfork", s: 66, e: 72,
    cam: [{ t: 0, at: { x: 600, y: 272 }, z: 2.6 }, { t: b(2), at: { x: 670, y: 498 }, z: 2.25, d: 0.5 }],
  },
  {
    id: "end", s: 72, e: 84,
    apply(lt, el) {
      const items = [[el.querySelector("h1 span:first-child"), b(1)], [el.querySelector("h1 .you"), b(2)], [el.querySelector(".url"), b(3)]]
      for (const [item, at] of items) {
        const k = settle(lt - at, 0.55)
        item.style.opacity = k
        item.style.transform = `translateY(${lerp(36, 0, k)}px)`
      }
    },
  },
].map(scene => ({ ...scene, s: b(scene.s), e: b(scene.e) }))

const MUSIC = { src: "sound/music.m4a", from: 23.0 - b(41), stop: [22.25, 23.0] }
const FINAL = 40.3 - MUSIC.from

const CUES = [
  { t: b(5.75), kind: "tap", x: 0.62 },
  { t: b(9), kind: "tick", x: 0.45 },
  { t: b(12.75), kind: "tap", x: 0.5 },
  { t: b(16), kind: "tap", x: 0.42 },
  { t: b(25), kind: "done", x: 0.5 },
  { t: b(31), kind: "mine", x: 0.6 },
  { t: b(41), kind: "whoosh", x: 0.5, d: b(6) },
  { t: b(47.5), kind: "land", x: 0.4 },
  { t: b(66), kind: "tick", x: 0.35 },
  { t: FINAL, kind: "end", x: 0.4 },
]

const END = SCENES.at(-1).e
window.END = END
window.CUES = CUES
window.MUSIC = MUSIC

for (const scene of SCENES) {
  scene.el = document.getElementById(scene.id)
  scene.cam_ = scene.el.querySelector(".cam")
  scene.frame = scene.el.querySelector("iframe")
  scene.img = scene.el.querySelector(".cam img")
}

const stateAt = (scene, lt) => scene.states?.findLast(([t]) => t <= lt + 1e-6)?.[1]

const target = (scene, key) => {
  if (key.box) return key.box
  let box
  if (typeof key.at === "string") {
    const win = scene.frame.contentWindow
    win.show(stateAt(scene, key.t))
    box = win.box(key.at)
  } else box = key.at
  const s = BASE * key.z
  const x = key.left !== undefined ? box.x - (box.w ?? 0) / 2 + (W / 2 - key.left) / s : box.x
  return (key.box = { x: x + (key.dx ?? 0), y: box.y + (key.dy ?? 0) })
}

const camera = (scene, lt) => {
  const keys = scene.cam
  let pos = { ...target(scene, keys[0]), z: keys[0].z }
  for (const key of keys.slice(1)) {
    const k = settle(lt - key.t, key.d ?? 0.6)
    if (k <= 0) break
    const to = target(scene, key)
    pos = { x: lerp(pos.x, to.x, k), y: lerp(pos.y, to.y, k), z: lerp(pos.z, key.z, k) }
  }
  if (scene.scroll) {
    const { from, to, t0, d } = scene.scroll
    pos.y = lerp(from, to, glide((lt - t0) / d))
  }
  const s = BASE * pos.z
  const content = scene.img ? { w: scene.img.width, h: scene.img.height } : { w: 1440, h: scene.frame.offsetHeight }
  const clamp = (v, size, view) => (size * s <= view ? (view - size * s) / 2 : Math.min(0, Math.max(view - size * s, v)))
  const tx = clamp(W / 2 - pos.x * s, content.w, W)
  const ty = clamp(H / 2 - pos.y * s, content.h, H)
  scene.cam_.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`
}

let active
const seek = t => {
  t = Math.max(0, Math.min(END - 1e-6, t))
  const index = SCENES.findIndex(scene => t >= scene.s && t < scene.e)
  const scene = SCENES[index]
  const lt = t - scene.s
  if (active !== scene) {
    active?.el.classList.remove("on")
    scene.el.classList.add("on")
    active = scene
  }
  document.body.classList.toggle("final", scene.id === "end")
  document.getElementById("count").textContent = `${String(index + 1).padStart(2, "0")} / ${SCENES.length}`
  document.getElementById("tag").style.visibility = index === 0 ? "hidden" : "visible"
  if (scene.frame) {
    scene.cam && camera(scene, lt)
    scene.apply?.(lt, scene.frame.contentWindow.show(stateAt(scene, lt)))
  } else {
    scene.cam && camera(scene, lt)
    scene.apply?.(lt, scene.el)
  }
}
window.seek = seek

if (!navigator.webdriver) {
  const from = +new URLSearchParams(location.search).get("t") || 0
  const audio = new Audio("out/soundtrack.wav")
  let t0 = performance.now() - from * 1000
  addEventListener("click", () => {
    audio.currentTime = 0
    audio.play()
  })
  const tick = now => {
    seek(audio.paused ? ((now - t0) / 1000) % END : audio.currentTime)
    requestAnimationFrame(tick)
  }
  addEventListener("load", () => requestAnimationFrame(tick))
}
