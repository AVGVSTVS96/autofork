import opentype from "opentype.js"
import { writeFileSync } from "node:fs"

const here = import.meta.dirname
const font = opentype.loadSync(`${here}/../fonts/src/Hubot-800-100.ttf`)
const S = 100
const u = (n) => (n / font.unitsPerEm) * S
const f = (n) => +n.toFixed(2)
const STEM = u(190)
const CAP = u(729)
const X = u(541)
const TRACK = -0.02 * S

const set = (str, x, y = S) => {
  let cx = x
  const d = []
  const glyphs = font.stringToGlyphs(str)
  glyphs.forEach((g, i) => {
    d.push(g.getPath(cx, y, S).toPathData(2))
    cx += u(g.advanceWidth) + TRACK
    if (glyphs[i + 1]) cx += u(font.getKerningValue(g, glyphs[i + 1]))
  })
  return { d: d.join(""), end: cx }
}
const ink = (d) => `<path class="ink" fill="#0E0E12" d="${d}"/>`
const svg = (w, h, body, y0 = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 ${f(y0)} ${f(w)} ${f(h)}" role="img" aria-label="autofork">${body}</svg>\n`
const line = (cls, w, d) => `<path class="${cls}" fill="none" stroke="${cls === "trunk" ? "#C4C4CC" : cls === "trunk-ink" ? "#0E0E12" : "#3B2BFF"}" stroke-width="${f(w)}" d="${d}"/>`
const dot = (cx, cy, r, cls = "you") => `<circle class="${cls}" fill="${cls === "you" ? "#3B2BFF" : "#0E0E12"}" cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/>`

const out = {}

// 1 · the branch: the draft Bassim liked. Your line leaves the app's line and ends in a node.
{
  const m = (x, y, s) => {
    const k = s / 32, w = 5 * k
    return line("trunk-ink", w, `M${f(x)} ${f(y + 25 * k)}H${f(x + 32 * k)}`) +
      line("you", w, `M${f(x + 3 * k)} ${f(y + 25 * k)}C${f(x + 11 * k)} ${f(y + 25 * k)} ${f(x + 9 * k)} ${f(y + 9 * k)} ${f(x + 17 * k)} ${f(y + 9 * k)}H${f(x + 20 * k)}`) +
      dot(x + 25.5 * k, y + 9 * k, 6 * k)
  }
  const ms = CAP * 1.05, word = set("autofork", ms * 1.28)
  out[1] = { name: "the branch", lockup: svg(word.end + 2, S + 4, m(0, S - CAP + (CAP - ms) / 2 - 2, ms) + ink(word.d), 0), mark: svg(32, 32, m(0, 0, 32)) }
}

// 2 · the rails: the hero's two lines in a tile, the app's and yours, split at a ring.
{
  const m = (x, y, s) => {
    const k = s / 32, w = 3.4 * k
    return `<rect class="tile" fill="#3B2BFF" x="${f(x)}" y="${f(y)}" width="${f(32 * k)}" height="${f(32 * k)}" rx="${f(7.5 * k)}"/>` +
      `<path class="rail-app" fill="none" stroke="#9C93FF" stroke-width="${f(w)}" d="M${f(x + 11 * k)} ${f(y)}V${f(y + 32 * k)}"/>` +
      `<path class="rail-you" fill="none" stroke="#FFFFFF" stroke-width="${f(w)}" d="M${f(x + 11 * k)} ${f(y + 10 * k)}C${f(x + 11 * k)} ${f(y + 16 * k)} ${f(x + 21 * k)} ${f(y + 14 * k)} ${f(x + 21 * k)} ${f(y + 20 * k)}V${f(y + 32 * k)}"/>` +
      `<circle class="ring" fill="#3B2BFF" stroke="#FFFFFF" stroke-width="${f(w * 0.9)}" cx="${f(x + 11 * k)}" cy="${f(y + 9 * k)}" r="${f(3.6 * k)}"/>`
  }
  const ms = CAP * 1.2, word = set("autofork", ms * 1.3)
  out[2] = { name: "the rails", lockup: svg(word.end + 2, S + 6, m(0, S - CAP - (ms - CAP) / 2, ms) + ink(word.d), 0), mark: svg(32, 32, m(0, 0, 32)) }
}

// 3 · the forked underline: the word sits on the app's line; under "fork", yours drops off and runs beside it.
{
  const auto = set("auto", 0), word = set("autofork", 0)
  const y = S + 13, w = STEM * 0.42, drop = 12
  const start = auto.end - 2
  const body = ink(word.d) +
    line("trunk", w, `M0 ${f(y)}H${f(word.end)}`) +
    line("you", w, `M${f(start)} ${f(y)}C${f(start + 10)} ${f(y)} ${f(start + 8)} ${f(y + drop)} ${f(start + 20)} ${f(y + drop)}H${f(word.end - 8)}`) +
    dot(word.end - 6, y + drop, w * 1.25)
  out[3] = { name: "the forked underline", lockup: svg(word.end + 4, S + 30, body, 0), mark: out[1].mark }
}

// 4 · the node: the o in fork is yours, solid, sitting beside the app's line.
{
  const a = set("autof", 0)
  const oG = font.charToGlyph("o"), bb = oG.getBoundingBox()
  const r = u(bb.y2 - bb.y1) / 2 * 1.02
  const cx = a.end + u(bb.x1) + u(bb.x2 - bb.x1) / 2, cy = S - u(bb.y2 + bb.y1) / 2
  const rest = set("rk", a.end + u(oG.advanceWidth) + TRACK)
  const lock = ink(a.d) + dot(cx, cy, r) + ink(rest.d)
  const mark = `<rect class="ink" fill="#0E0E12" x="3" y="3" width="6" height="26"/>` + dot(20.5, 16, 9.5)
  out[4] = { name: "the node", lockup: svg(rest.end + 2, S + 4, lock, 0), mark: svg(32, 32, mark) }
}

// 5 · the k: the last letter forks. Its stem is the app's line, its arm is yours.
{
  const kG = font.charToGlyph("k")
  let clipN = 0
  const k = (x, y = S) => {
    const stemX = x + u(43), top = y - CAP
    const jx = stemX + STEM, jy = y - X * 0.5
    const id = `kleg${clipN++}`
    const leg = `<clipPath id="${id}"><rect x="${f(jx)}" y="${f(jy + 4)}" width="${f(u(kG.advanceWidth))}" height="${f(y - jy)}"/></clipPath>` +
      `<path class="ink" fill="#0E0E12" clip-path="url(#${id})" d="${kG.getPath(x, y, S).toPathData(2)}"/>`
    return `<rect class="ink" fill="#0E0E12" x="${f(stemX)}" y="${f(top)}" width="${f(STEM)}" height="${f(CAP)}"/>` + leg +
      line("you", STEM * 0.8, `M${f(jx - 2)} ${f(jy + 6)}C${f(jx + 10)} ${f(jy + 6)} ${f(jx + 12)} ${f(y - X + 8)} ${f(jx + 24)} ${f(y - X + 8)}`) +
      dot(jx + 29, y - X + 8, STEM * 0.6)
  }
  const head = set("autofor", 0)
  const kx = head.end
  const end = kx + Math.max(u(kG.advanceWidth), u(43) + STEM + 29 + STEM * 0.6) + 2
  const lockup = svg(end, S + 4, ink(head.d) + k(kx), 0)
  const kw = Math.max(u(kG.advanceWidth) - u(43), STEM + 29 + STEM * 0.6)
  const scale = 28 / CAP
  const mark = svg(32, 32, `<g transform="translate(${f((32 - kw * scale) / 2 - u(43) * scale)} ${f(30 - S * scale)}) scale(${f(scale)})">${k(0)}</g>`)
  out[5] = { name: "the k", lockup, mark }
}

for (const [id, o] of Object.entries(out)) {
  writeFileSync(`${here}/logos/b${id}-lockup.svg`, o.lockup)
  writeFileSync(`${here}/logos/b${id}-mark.svg`, o.mark)
  console.log(id, o.name)
}
