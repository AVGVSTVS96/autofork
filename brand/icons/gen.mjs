import opentype from "opentype.js"
import { mkdirSync, rmSync, writeFileSync } from "node:fs"

const here = import.meta.dirname
const font = opentype.loadSync(`${here}/../fonts/src/Host-800.ttf`)
const out = `${here}/out`
rmSync(out, { recursive: true, force: true })
mkdirSync(out)
const f = (n) => +n.toFixed(2)

const set = (str, size, x, y) => {
  const k = size / font.unitsPerEm
  const gs = font.stringToGlyphs(str)
  let cx = x
  const parts = gs.map((g, i) => {
    const b = g.getBoundingBox()
    const part = { d: g.getPath(cx, y, size).toPathData(2), x1: cx + b.x1 * k, x2: cx + b.x2 * k, top: y - b.y2 * k }
    cx += g.advanceWidth * k - 0.025 * size + (gs[i + 1] ? font.getKerningValue(g, gs[i + 1]) * k : 0)
    return part
  })
  return { d: parts.map((p) => p.d).join(""), x1: parts[0].x1, x2: parts.at(-1).x2, top: Math.min(...parts.map((p) => p.top)), parts }
}

const peelX = (x1, y1, x2, y2) => `C${f((x1 + x2) / 2)} ${f(y1)} ${f((x1 + x2) / 2)} ${f(y2)} ${f(x2)} ${f(y2)}`
const peelY = (x1, y1, x2, y2) => `C${f(x1)} ${f((y1 + y2) / 2)} ${f(x2)} ${f((y1 + y2) / 2)} ${f(x2)} ${f(y2)}`

// The wordmark's rule for every lane change: your line leaves from beneath the app's line,
// its node is 1.8 lines wide, and the node keeps a full line's width of clear space from the app's line.
const lane = (w) => ({ r: w * 0.9, drop: w * 1.5 + w * 0.9 })

const line = (cls, w, d) => `<path class="${cls}" fill="none" stroke-width="${f(w)}" d="${d}"/>`
const dot = (cls, cx, cy, r) => `<circle class="${cls}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`
const tile = (n, rx) => `<rect class="tile" width="${n}" height="${n}" rx="${rx}"/>`
const clipped = (n, rx, body) => `<clipPath id="c"><rect width="${n}" height="${n}" rx="${rx}"/></clipPath><g clip-path="url(#c)">${tile(n, rx)}${body}</g>`

// 1 · The rails: the site's own rail in a tile. The app's rail runs through top to bottom; at the ring
// (the release you forked) yours leaves from beneath it, moves one lane over and keeps going.
const rails = (n) => {
  const k = n / 32, w = n === 16 ? 2 : 3
  const a = n === 16 ? 5 : 10.5, b = n === 16 ? 11 : 21.5
  const ring = n === 16 ? { y: 4.5, r: 2.25, s: 1.6 } : { y: 9, r: 3.6, s: 3 }
  const y0 = ring.y, y1 = n === 16 ? 6 : 12, y2 = n === 16 ? 12.5 : 23
  return clipped(n, 7.5 * k,
    line("you", w, `M${a} ${y0}V${y1}${peelY(a, y1, b, y2)}V${n}`) +
    line("app", w, `M${a} 0V${n}`) +
    `<circle class="ring" cx="${a}" cy="${ring.y}" r="${ring.r}" stroke-width="${ring.s}"/>`)
}

// 2 · The branch: the wordmark's underline lifted out, the app's line in the site rail's gray. It runs off both edges, so nothing
// starts or stops abruptly; yours leaves from beneath it and ends in your node.
const branch = (n) => {
  const k = n / 32, w = n === 16 ? 2 : 3
  const { r, drop } = n === 16 ? { r: 2, drop: 5 } : { r: 2.7, drop: 7 }
  const y1 = n === 16 ? 5 : 11.5
  const y2 = y1 + drop
  const p0 = n === 16 ? 1.5 : 5, p1 = p0 + drop * 1.25
  const end = n === 16 ? 11.5 : 24
  return clipped(n, 7.5 * k,
    line("you", w, `M${f(p0 - w)} ${f(y1)}H${f(p0)}${peelX(p0, y1, p1, y2)}H${f(end)}`) +
    line("app", w, `M0 ${f(y1)}H${n}`) +
    dot("node", end, y2, r))
}

// 3 and 4 · auto over fork: the wordmark stacked into a square, its underline drawn by the wordmark's rule:
// flush with the ink at both ends, yours peeling off under the f of fork to a node flush with the k.
const stack = () => {
  const size = 11.6
  const a = set("auto", size, 0, 0), b = set("fork", size, 0, 0)
  const stem = (140 / font.unitsPerEm) * size
  const w = stem * 0.78, { r, drop } = lane(w)
  const lead = size * 0.9, gap = w * 0.5 + stem * 0.62
  const x0 = Math.min(a.x1, b.x1), width = Math.max(a.x2, b.x2) - x0
  const height = -a.top + lead + gap + drop + r
  const x = 16 - width / 2 - x0
  const top = (32 - height) / 2 - a.top - 0.3
  const auto = set("auto", size, x, top), fork = set("fork", size, x, top + lead)
  const y1 = top + lead + gap, y2 = y1 + drop
  const start = Math.min(auto.x1, fork.x1), endX = fork.x2 - r
  const p0 = fork.parts[0].x1 - w * 0.6, p1 = p0 + drop * 1.25
  return clipped(32, 7.5,
    `<path class="ink" d="${auto.d}${fork.d}"/>` +
    line("you", w, `M${f(p0)} ${f(y1)}${peelX(p0, y1, p1, y2)}H${f(endX)}`) +
    line("app", w, `M${f(start)} ${f(y1)}H${f(fork.x2)}`) +
    dot("node", endX, y2, r))
}

const tones = {
  blue: {
    light: { tile: "#3B2BFF", ink: "#FFFFFF", app: "#9C93FF", you: "#FFFFFF" },
    dark: { tile: "#8F84FF", ink: "#0C0C0F", app: "#4B42B8", you: "#0C0C0F" },
  },
  trunk: {
    light: { tile: "#FFFFFF", ink: "#0E0E12", app: "#B0B0BA", you: "#3B2BFF" },
    dark: { tile: "#18181D", ink: "#EEEEF2", app: "#4A4A55", you: "#8F84FF" },
  },
  paper: {
    light: { tile: "#FFFFFF", ink: "#0E0E12", app: "#0E0E12", you: "#3B2BFF" },
    dark: { tile: "#18181D", ink: "#EEEEF2", app: "#EEEEF2", you: "#8F84FF" },
  },
}
const paint = (c) =>
  `<style>.tile{fill:${c.tile}}.ink{fill:${c.ink}}.app{stroke:${c.app}}.you{stroke:${c.you}}.node{fill:${c.you}}.ring{fill:${c.tile};stroke:${c.you}}</style>`
const svg = (n, body, c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" role="img" aria-label="autofork">${paint(c)}${body}</svg>\n`

const icons = {
  rails: { tone: "blue", 32: rails(32), 16: rails(16) },
  branch: { tone: "trunk", 32: branch(32), 16: branch(16) },
  stack: { tone: "paper", 32: stack() },
  "stack-blue": { tone: "blue", 32: stack() },
}
for (const [name, icon] of Object.entries(icons))
  for (const n of [32, 16])
    for (const theme of ["light", "dark"])
      if (icon[n]) writeFileSync(`${out}/${name}${n === 16 ? "-16" : ""}${theme === "dark" ? "-dark" : ""}.svg`, svg(n, icon[n], tones[icon.tone][theme]))
console.log(Object.keys(icons).join(" "))
