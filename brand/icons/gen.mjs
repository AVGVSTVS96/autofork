import opentype from "opentype.js"
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"

const here = import.meta.dirname
const font = opentype.loadSync(`${here}/../fonts/src/Host-800.ttf`)
const out = `${here}/out`
mkdirSync(out, { recursive: true })
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

const peel = (x1, y1, x2, y2) => `C${f((x1 + x2) / 2)} ${f(y1)} ${f((x1 + x2) / 2)} ${f(y2)} ${f(x2)} ${f(y2)}`

// The wordmark's grammar: the word sits on the app's line; your line peels off under one letter
// and runs to a node whose right edge is flush with the word's.
const fork = ({ word, under, y, w, drop, r, from = 0, to = 32, end = word.x2, span = 2 }) => {
  const y2 = y + drop
  const p0 = word.parts[under].x1 - drop * 0.3, p1 = p0 + drop * span
  end -= r
  return (
    `<path class="ink" d="${word.d}"/>` +
    `<path class="app" fill="none" stroke-width="${f(w)}" d="M${f(from)} ${f(y)}H${f(to)}"/>` +
    `<path class="you" fill="none" stroke-width="${f(w)}" d="M${f(p0)} ${f(y)}${peel(p0, y, p1, y2)}H${f(end)}"/>` +
    `<circle class="node" cx="${f(end)}" cy="${f(y2)}" r="${f(r)}"/>`
  )
}

const tile = `<rect class="tile" width="32" height="32" rx="7.5"/>`
const clip = (body) => `<clipPath id="tile"><rect width="32" height="32" rx="7.5"/></clipPath><g clip-path="url(#tile)">${body}</g>`
const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="autofork">${body}</svg>\n`

// One letter on its line, which runs off both edges; your line runs on past the letter, as the wordmark's runs on to the k.
const letter = ({ ch, size, w, gap, drop, r, run, span, lift = 0.6 }) => {
  const m = set(ch, size, 0, 0)
  const height = -m.top + gap + drop + r
  const base = (32 - height) / 2 - m.top - lift
  const word = set(ch, size, 16 - (m.x2 - m.x1 + run) / 2 - m.x1, base)
  return svg(tile + fork({ word, under: 0, y: base + gap, w, drop, r, span, end: word.x2 + run }))
}

// auto over fork, left-aligned; the app's line comes in off the left edge and stops flush with the k.
const stack = ({ size, lead, w, gap, drop, r }) => {
  const a = set("auto", size, 0, 0), b = set("fork", size, 0, 0)
  const width = Math.max(a.x2, b.x2) - Math.min(a.x1, b.x1)
  const height = -a.top + lead + gap + drop + r
  const x = 16 - width / 2 - Math.min(a.x1, b.x1)
  const top = (32 - height) / 2 - a.top - 0.4
  const word = set("fork", size, x, top + lead)
  return svg(clip(tile + `<path class="ink" d="${set("auto", size, x, top).d}"/>` + fork({ word, under: 0, y: top + lead + gap, w, drop, r, to: word.x2 })))
}

// The 16px favicon on its own 16 grid: no tile, a bigger a, and lines as heavy as its stems.
const tiny = ({ size, w, gap, drop, r, span }) => {
  const m = set("a", size, 0, 0)
  const base = 8 - (-m.top + gap + drop + r) / 2 - m.top
  const word = set("a", size, 0.6 - m.x1, base)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" role="img" aria-label="autofork">${fork({ word, under: 0, y: base + gap, w, drop, r, span, to: 16, end: 15.6 })}</svg>\n`
}

const files = {
  "a-16": tiny({ size: 15, w: 2, gap: 2.4, drop: 4, r: 2, span: 1.6 }),
  "a": letter({ ch: "a", size: 25, w: 2.2, gap: 3.2, drop: 4, r: 2.3, run: 5, span: 3 }),
  "a-small": letter({ ch: "a", size: 24, w: 3, gap: 3.7, drop: 5, r: 3, run: 4, span: 2.4 }),
  "stack": stack({ size: 11.2, lead: 10.35, w: 1.45, gap: 2.2, drop: 3.05, r: 1.55 }),
}
for (const [name, body] of Object.entries(files)) writeFileSync(`${out}/${name}.svg`, body)
copyFileSync(`${here}/../logo/autofork-classes.svg`, `${out}/wordmark.svg`)
console.log(Object.keys(files).join(" "))
