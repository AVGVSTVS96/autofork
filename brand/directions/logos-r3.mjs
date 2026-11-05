import opentype from "opentype.js"
import { writeFileSync } from "node:fs"

const here = import.meta.dirname
const font = opentype.loadSync(`${here}/../fonts/src/Host-800.ttf`)
const S = 100
const u = (n) => (n / font.unitsPerEm) * S
const f = (n) => +n.toFixed(2)
const STEM = u(140)
const CAP = u(font.tables.os2.sCapHeight)
const TRACK = -0.025 * S

const set = (str, x, y = S) => {
  let cx = x
  const parts = []
  const glyphs = font.stringToGlyphs(str)
  glyphs.forEach((g, i) => {
    parts.push({ ch: str[i], x: cx, g, d: g.getPath(cx, y, S).toPathData(2) })
    cx += u(g.advanceWidth) + TRACK
    if (glyphs[i + 1]) cx += u(font.getKerningValue(g, glyphs[i + 1]))
  })
  const last = parts.at(-1)
  return { d: parts.map((p) => p.d).join(""), end: cx - TRACK, ink: last.x + u(last.g.getBoundingBox().x2), parts }
}
const ink = (d) => `<path class="ink" fill="#0E0E12" d="${d}"/>`
const svg = (x0, y0, w, h, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f(x0)} ${f(y0)} ${f(w)} ${f(h)}" role="img" aria-label="autofork">${body}</svg>\n`
const stroke = (cls, color, w, d) => `<path class="${cls}" fill="none" stroke="${color}" stroke-width="${f(w)}" d="${d}"/>`
const app = (w, d) => stroke("app", "#0E0E12", w, d)
const yours = (w, d) => stroke("you", "#3B2BFF", w, d)
const node = (cx, cy, r) => `<circle class="node" fill="#3B2BFF" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`

// A smooth lane change from (x1,y1) to (x2,y2): horizontal tangents at both ends, so the line peels off instead of turning.
const peel = (x1, y1, x2, y2) => `C${f((x1 + x2) / 2)} ${f(y1)} ${f((x1 + x2) / 2)} ${f(y2)} ${f(x2)} ${f(y2)}`

const out = {}

// 1 · the branch, refined: both lines start together at the left edge, so there's no black stub; yours peels off and runs beside the app's line to a node.
const branchMark = (x, y, s) => {
  const k = s / 32, w = 4.6 * k
  const Y1 = y + 25 * k, Y2 = y + 10 * k
  return app(w, `M${f(x)} ${f(Y1)}H${f(x + 32 * k)}`) +
    yours(w, `M${f(x)} ${f(Y1)}H${f(x + 3 * k)}${peel(x + 3 * k, Y1, x + 15 * k, Y2)}H${f(x + 25 * k)}`) +
    node(x + 26.5 * k, Y2, 4.6 * k)
}
{
  const ms = CAP * 1.18
  const word = set("autofork", ms + ms * 0.3)
  const top = S - CAP - (ms - CAP) * 0.62
  out[1] = { lockup: svg(0, top - 1, word.end + 2, S - top + 6, branchMark(0, top, ms) + ink(word.d)), mark: svg(0, 0, 32, 32, branchMark(0, 0, 32)) }
}

// 2 · the rails: round 2's tile, kept as Bassim liked it (ring and all), redrawn to Host Grotesk's weight.
const railsMark = (x, y, s) => {
  const k = s / 32, w = 3.4 * k
  return `<rect class="tile" fill="#3B2BFF" x="${f(x)}" y="${f(y)}" width="${f(32 * k)}" height="${f(32 * k)}" rx="${f(7.5 * k)}"/>` +
    stroke("rail-app", "#9C93FF", w, `M${f(x + 11 * k)} ${f(y)}V${f(y + 32 * k)}`) +
    stroke("rail-you", "#FFFFFF", w, `M${f(x + 11 * k)} ${f(y + 10 * k)}C${f(x + 11 * k)} ${f(y + 16 * k)} ${f(x + 21 * k)} ${f(y + 14 * k)} ${f(x + 21 * k)} ${f(y + 20 * k)}V${f(y + 32 * k)}`) +
    `<circle class="ring" fill="#3B2BFF" stroke="#FFFFFF" stroke-width="${f(w * 0.9)}" cx="${f(x + 11 * k)}" cy="${f(y + 9 * k)}" r="${f(3.6 * k)}"/>`
}
{
  const ms = CAP * 1.24
  const word = set("autofork", ms * 1.3)
  const top = S - CAP - (ms - CAP) * 0.5
  out[2] = { lockup: svg(0, top - 1, word.end + 2, S - top + 6, railsMark(0, top, ms) + ink(word.d)), mark: svg(0, 0, 32, 32, railsMark(0, 0, 32)) }
}

// 3 · the forked underline, refined: the app's line runs under the whole word. Yours peels off under the f and ends in a node centred on its own line, flush with the k.
{
  const word = set("autofork", 0)
  const fx = word.parts.find((p) => p.ch === "f").x + u(font.charToGlyph("f").getBoundingBox().x1)
  const w = STEM * 0.5, y1 = S + 14, drop = w * 2.1, y2 = y1 + drop
  const r = w * 1.05
  const endX = word.ink - r
  const body = ink(word.d) +
    app(w, `M0 ${f(y1)}H${f(word.ink)}`) +
    yours(w, `M${f(fx - 6)} ${f(y1)}${peel(fx - 6, y1, fx + 12, y2)}H${f(endX)}`) +
    node(endX, y2, r)
  out[3] = { lockup: svg(-1, S - CAP - 2, word.ink + 3, CAP + 2 + y2 + r - S + 3, body), mark: out[2].mark }
}

for (const [id, o] of Object.entries(out)) {
  writeFileSync(`${here}/logos/r3-${id}-lockup.svg`, o.lockup)
  writeFileSync(`${here}/logos/r3-${id}-mark.svg`, o.mark)
}
console.log(Object.keys(out).join(" "))
