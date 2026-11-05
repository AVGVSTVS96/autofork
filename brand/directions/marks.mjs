import opentype from "opentype.js"
import { mkdirSync, writeFileSync } from "node:fs"

const here = import.meta.dirname
const out = `${here}/logos`
mkdirSync(out, { recursive: true })
const load = (p) => opentype.loadSync(`${here}/../${p}`)
const fonts = {
  commit: load("logo/ttf/CommitMono-700-Regular.ttf"),
  bricolage: load("fonts/src/Bricolage-720-96.ttf"),
  hubot: load("fonts/src/Hubot-800-125.ttf"),
}
const f = (n) => +n.toFixed(2)

const set = (font, str, x, y, size, track = 0) => {
  let cx = x
  const d = []
  const glyphs = font.stringToGlyphs(str)
  glyphs.forEach((g, i) => {
    d.push(g.getPath(cx, y, size).toPathData(2))
    cx += (g.advanceWidth / font.unitsPerEm) * size + track * size
    if (glyphs[i + 1]) cx += (font.getKerningValue(g, glyphs[i + 1]) / font.unitsPerEm) * size
  })
  return { d: d.join(""), end: cx }
}

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(w)} ${f(h)}" role="img" aria-label="autofork">${body}</svg>\n`

// A, the added line: a diff row with its plus and a line of text, the smallest "yours" there is.
const addedLine = (x, y, s) => {
  const u = s / 32
  const r = (cls, rx, ry, w, h) => `<rect class="${cls}" x="${f(x + rx * u)}" y="${f(y + ry * u)}" width="${f(w * u)}" height="${f(h * u)}"/>`
  return [r("tint", 0, 6, 32, 20), r("accent", 4, 14.25, 9, 3.5), r("accent", 6.75, 11.5, 3.5, 9), r("ink", 15, 14.25, 13, 3.5)].join("")
}

// B, the branch: the app's line keeps going; yours leaves it, runs beside it, and ends in a node.
const branch = (x, y, s, stem) => {
  const u = s / 32
  const X = (n) => f(x + n * u), Y = (n) => f(y + n * u)
  const w = f(stem * u)
  const trunk = `<path class="ink-stroke" fill="none" stroke-width="${w}" d="M${X(0)} ${Y(25)}H${X(32)}"/>`
  const yours = `<path class="accent-stroke" fill="none" stroke-width="${w}" d="M${X(3)} ${Y(25)}C${X(11)} ${Y(25)} ${X(9)} ${Y(9)} ${X(17)} ${Y(9)}H${X(20)}"/>`
  const node = `<circle class="accent" cx="${X(25.5)}" cy="${Y(9)}" r="${f(6 * u)}"/>`
  return trunk + yours + node
}

// C, the highlight: the part that's yours, marked the way a diff marks a changed word.
const highlight = (x, y, s) => {
  const g = set(fonts.hubot, "f", 0, 0, s * 1.18)
  const bb = fonts.hubot.charToGlyph("f").getPath(0, 0, s * 1.18).getBoundingBox()
  const gx = x + (s - (bb.x2 - bb.x1)) / 2 - bb.x1
  const gy = y + s * 0.5 + (-(bb.y1 + bb.y2) / 2)
  const glyph = fonts.hubot.charToGlyph("f").getPath(gx, gy, s * 1.18).toPathData(2)
  return `<rect class="hl" x="${f(x)}" y="${f(y + s * 0.14)}" width="${f(s)}" height="${f(s * 0.72)}"/><path class="ink" d="${glyph}"/>`
}

const directions = {
  a: { font: fonts.commit, track: -0.045, mark: (x, y, s) => addedLine(x, y, s), markScale: 1.6 },
  b: { font: fonts.bricolage, track: -0.02, mark: (x, y, s) => branch(x, y, s, 5), markScale: 1.4 },
  c: { font: fonts.hubot, track: -0.02, mark: (x, y, s) => highlight(x, y, s), markScale: 1.1, wordOnly: true },
}

const accent = { a: "#1C9A50", b: "#3B2BFF", c: "#111" }
const painted = (body, id) => {
  const paint = { ink: 'fill="#111"', "on-hl": 'fill="#111"', accent: `fill="${accent[id]}"`, tint: 'fill="#E1F5E7"', hl: 'fill="#FFE14A"', "ink-stroke": 'stroke="#0E0E12"', "accent-stroke": `stroke="${accent[id]}"` }
  return body.replace(/class="([a-z-]+)"/g, (m, c) => `${m} ${paint[c] ?? ""}`)
}

for (const [id, d] of Object.entries(directions)) {
  const size = 100
  const cap = (d.font.tables.os2.sCapHeight / d.font.unitsPerEm) * size
  const desc = (-d.font.tables.os2.sTypoDescender / d.font.unitsPerEm) * size
  const m = cap * d.markScale
  const top = 100 - cap - (m - cap) / 2
  const gap = d.wordOnly ? -m : m * 0.32
  let word
  let extra = ""
  if (id === "c") {
    const auto = set(d.font, "auto", m + gap, 100, size, d.track)
    const fork = set(d.font, "fork", auto.end, 100, size, d.track)
    const xh = (d.font.tables.os2.sxHeight / d.font.unitsPerEm) * size
    extra = `<rect class="hl" x="${f(auto.end - size * 0.04)}" y="${f(100 - xh - size * 0.12)}" width="${f(fork.end - auto.end + size * 0.08)}" height="${f(xh + size * 0.24)}"/>`
    extra += `<path class="on-hl" d="${fork.d}"/>`
    word = { d: auto.d, end: fork.end + size * 0.04 }
  } else word = set(d.font, "autofork", m + gap, 100, size, d.track)
  const h = 100 + desc * 0.5
  writeFileSync(`${out}/lockup-${id}.svg`, svg(word.end + 4, h, painted(`${d.wordOnly ? "" : d.mark(0, top, m)}${extra}<path class="ink" d="${word.d}"/>`, id)))
  writeFileSync(`${out}/mark-${id}.svg`, svg(32, 32, painted(d.mark(0, 0, 32), id)))
  console.log(id)
}
