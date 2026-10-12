import opentype from "opentype.js"
import { writeFileSync } from "node:fs"

const here = import.meta.dirname
const font = opentype.loadSync(`${here}/../fonts/src/Hubot-800-100.ttf`)
const f = (n) => +n.toFixed(2)
const SIZE = 100
const BASE = 100
const STEM = 0.19
const BAR = 0.138
const XH = font.tables.os2.sxHeight / 1000
const CAP = font.tables.os2.sCapHeight / 1000

const glyphs = (str, x, track = -0.03) => {
  const out = []
  let cx = x
  const gs = font.stringToGlyphs(str)
  gs.forEach((g, i) => {
    out.push({ ch: str[i], g, x: cx, d: g.getPath(cx, BASE, SIZE).toPathData(2) })
    cx += (g.advanceWidth / 1000) * SIZE + track * SIZE
    if (gs[i + 1]) cx += (font.getKerningValue(g, gs[i + 1]) / 1000) * SIZE
  })
  return { list: out, end: cx - track * SIZE }
}
const word = (str, x, cls = "ink") => {
  const g = glyphs(str, x)
  return { svg: `<path class="${cls}" d="${g.list.map((l) => l.d).join("")}"/>`, end: g.end, list: g.list }
}

const svg = (x0, y0, w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" role="img" aria-label="autofork">${body}</svg>\n`

const line = (cls, w, d) => `<path class="${cls}" fill="none" stroke-width="${f(w)}" d="${d}"/>`

// Marks are drawn on a 32 grid at (0,0)
const marks = {
  node: () => line("trunk", 5, "M0 25H32") + line("accent-s", 5, "M3 25C11 25 9 9 17 9H20") + `<circle class="accent" cx="25.5" cy="9" r="6"/>`,
  plus: () => line("trunk", 5, "M0 26H32") + line("accent-s", 5, "M2 26C9 26 8 11 15 11H17") + `<path class="accent" d="M22 4h5v4.5h4.5v5H27V18h-5v-4.5h-4.5v-5H22z"/>`,
  forkedF: () => {
    const s = 32 / 0.78
    const x = 1, y = 30
    const g = font.charToGlyph("f").getPath(x, y, s).toPathData(2)
    const U = (u) => (u / 1000) * s
    const cy = y - U(472)
    const ex = x + U(395)
    const nx = x + U(880), ny = y - U(690)
    return `<path class="ink" d="${g}"/>` + line("accent-s", U(138), `M${f(ex)} ${f(cy)}H${f(ex + U(110))}C${f(ex + U(330))} ${f(cy)} ${f(nx - U(150))} ${f(ny)} ${f(nx - U(60))} ${f(ny)}`) + `<circle class="accent" cx="${f(nx)}" cy="${f(ny)}" r="${f(U(118))}"/>`
  },
  dot: () => `<rect class="ink" x="0" y="0" width="32" height="32" rx="7"/><circle class="accent" cx="16" cy="16" r="7.5"/>`,
  af: () => {
    const s = 32 / 0.74
    const a = font.charToGlyph("a"), fg = font.charToGlyph("f")
    const ax = 0, fx = (a.advanceWidth / 1000) * s - 1.5
    return `<path class="ink" d="${a.getPath(ax, 31, s).toPathData(2)}"/><path class="accent" d="${fg.getPath(fx, 31 - XH * s * 0.42, s).toPathData(2)}"/>`
  },
}

const lockup = (name, markScale = 1.3) => {
  const m = CAP * SIZE * markScale
  const k = m / 32
  const top = BASE - CAP * SIZE - (m - CAP * SIZE) / 2
  const gap = m * 0.3
  const w = word("autofork", m + gap)
  const body = `<g transform="translate(0 ${f(top)}) scale(${f(k)})">${marks[name]()}</g>${w.svg}`
  return { body, w: w.end, top: Math.min(top, BASE - CAP * SIZE), h: BASE + 6 }
}

const out = {}
for (const [name, scale] of [["node", 1.25], ["plus", 1.25], ["forkedF", 1.05]]) {
  const l = lockup(name, scale)
  out[name] = { lockup: svg(0, l.top - 2, l.w + 2, l.h - l.top + 4, l.body), mark: svg(0, 0, 32, 32, marks[name]()) }
}

// The node o: the o of fork is the node your line ends on.
{
  const g = glyphs("autofork", 0)
  const o = g.list.filter((l) => l.ch === "o")[1]
  const bb = o.g.getBoundingBox()
  const cx = o.x + ((bb.x1 + bb.x2) / 2 / 1000) * SIZE
  const r = ((bb.x2 - bb.x1) / 2 / 1000) * SIZE
  const cy = BASE - ((bb.y1 + bb.y2) / 2 / 1000) * SIZE
  const body = `<path class="ink" d="${g.list.filter((l) => l !== o).map((l) => l.d).join("")}"/><circle class="accent" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`
  const top = BASE - CAP * SIZE - 2
  out.dot = { lockup: svg(0, top, g.end + 2, BASE + 6 - top, body), mark: svg(0, 0, 32, 32, marks.dot()) }
}

// The split word: "auto" stays on the app's line, "fork" leaves it and rides its own, a step up.
{
  const auto = word("auto", 0)
  const rise = XH * SIZE * 0.42
  const gap = SIZE * 0.2
  const forkX = auto.end + gap
  const fork = glyphs("fork", forkX)
  const forkSvg = `<path class="accent" transform="translate(0 ${f(-rise)})" d="${fork.list.map((l) => l.d).join("")}"/>`
  const uy = BASE + 14
  const lw = SIZE * 0.07
  const trunk = line("trunk", lw, `M0 ${uy}H${f(fork.end + 4)}`)
  const bx = auto.end - SIZE * 0.06
  const yours = line("accent-s", lw, `M${f(bx)} ${uy}C${f(bx + gap * 0.9)} ${uy} ${f(forkX - gap * 0.6)} ${f(uy - rise)} ${f(forkX + 4)} ${f(uy - rise)}H${f(fork.end + 4)}`)
  const top = BASE - rise - CAP * SIZE - 2
  out.split = { lockup: svg(-2, top, fork.end + 8, uy + lw - top + 2, `${auto.svg}${forkSvg}${trunk}${yours}`), mark: svg(0, 0, 32, 32, marks.af()) }
}

for (const [name, v] of Object.entries(out)) {
  writeFileSync(`${here}/logos/b-${name}.svg`, v.lockup)
  writeFileSync(`${here}/logos/b-${name}-mark.svg`, v.mark)
}
console.log(Object.keys(out).join(" "))
