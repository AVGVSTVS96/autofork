import opentype from "opentype.js"
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"

const here = import.meta.dirname
const site = new URL("../../site/public/", import.meta.url).pathname
mkdirSync(site, { recursive: true })

const font = opentype.loadSync(`${here}/../fonts/src/Host-800.ttf`)
const S = 100
const u = (n) => (n / font.unitsPerEm) * S
const f = (n) => +n.toFixed(2)
const STEM = u(140)
const CAP = u(font.tables.os2.sCapHeight)
const TRACK = -0.025 * S

const C = {
  light: { ink: "#0E0E12", you: "#3B2BFF", tile: "#3B2BFF", railApp: "#9C93FF", railYou: "#FFFFFF" },
  dark: { ink: "#EEEEF2", you: "#8F84FF", tile: "#8F84FF", railApp: "#4B42B8", railYou: "#0C0C0F" },
}

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
  return { d: parts.map((p) => p.d).join(""), ink: last.x + u(last.g.getBoundingBox().x2), parts }
}
const svg = (box, body, style = "") => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(f).join(" ")}" role="img" aria-label="autofork">${style}${body}</svg>\n`

// A lane change with flat tangents at both ends, so a line peels off instead of turning.
const peel = (x1, y1, x2, y2) => `C${f((x1 + x2) / 2)} ${f(y1)} ${f((x1 + x2) / 2)} ${f(y2)} ${f(x2)} ${f(y2)}`

// The wordmark: autofork on the app's line. Under the f, your line peels off and runs beside it to a node flush with the k.
const wordmark = (c) => {
  const word = set("autofork", 0)
  const fx = word.parts.find((p) => p.ch === "f").x + u(font.charToGlyph("f").getBoundingBox().x1)
  const w = STEM * 0.5, y1 = S + 14, y2 = y1 + w * 2.1, r = w * 1.05
  const endX = word.ink - r
  const paint = (cls, attr, color) => (c ? `${attr}="${color}"` : `class="${cls}"`)
  const body =
    `<path ${paint("ink", "fill", c?.ink)} d="${word.d}"/>` +
    `<path ${paint("app", "stroke", c?.ink)} fill="none" stroke-width="${f(w)}" d="M0 ${f(y1)}H${f(word.ink)}"/>` +
    `<path ${paint("you", "stroke", c?.you)} fill="none" stroke-width="${f(w)}" d="M${f(fx - 6)} ${f(y1)}${peel(fx - 6, y1, fx + 12, y2)}H${f(endX)}"/>` +
    `<circle ${paint("node", "fill", c?.you)} cx="${f(endX)}" cy="${f(y2)}" r="${f(r)}"/>`
  return svg([-1, S - CAP - 2, word.ink + 3, CAP + 2 + y2 + r - S + 3], body)
}

// The icon: the rails in a tile. The app's line runs through; yours leaves it at the ring and runs beside it.
const rails = (c, k = 1, inset = 0) => {
  const w = 3.4 * k
  const X = (n) => f(inset + n * k), Y = X
  return (
    `<rect class="tile" fill="${c.tile}" x="${X(0)}" y="${Y(0)}" width="${f(32 * k)}" height="${f(32 * k)}" rx="${inset ? 0 : f(7.5 * k)}"/>` +
    `<path class="rail-app" fill="none" stroke="${c.railApp}" stroke-width="${f(w)}" d="M${X(11)} ${Y(0)}V${Y(32)}"/>` +
    `<path class="rail-you" fill="none" stroke="${c.railYou}" stroke-width="${f(w)}" d="M${X(11)} ${Y(10)}C${X(11)} ${Y(16)} ${X(21)} ${Y(14)} ${X(21)} ${Y(20)}V${Y(32)}"/>` +
    `<circle class="ring" fill="${c.tile}" stroke="${c.railYou}" stroke-width="${f(w * 0.9)}" cx="${X(11)}" cy="${Y(9)}" r="${f(3.6 * k)}"/>`
  )
}

writeFileSync(`${here}/autofork.svg`, wordmark(C.light))
writeFileSync(`${here}/autofork-dark.svg`, wordmark(C.dark))
writeFileSync(`${here}/autofork-classes.svg`, wordmark())
writeFileSync(`${here}/mark.svg`, svg([0, 0, 32, 32], rails(C.light)))
writeFileSync(`${here}/mark-dark.svg`, svg([0, 0, 32, 32], rails(C.dark)))

const themed = `<style>@media (prefers-color-scheme: dark){.tile{fill:${C.dark.tile}}.rail-app{stroke:${C.dark.railApp}}.rail-you{stroke:${C.dark.railYou}}.ring{fill:${C.dark.tile};stroke:${C.dark.railYou}}}</style>`
writeFileSync(`${here}/favicon.svg`, svg([0, 0, 32, 32], rails(C.light), themed))
writeFileSync(`${here}/app-icon.svg`, svg([0, 0, 32, 32], rails(C.light, 1, 0.001).replace(/rx="[^"]*"/, 'rx="0"')))
copyFileSync(`${here}/favicon.svg`, `${site}/favicon.svg`)
console.log("autofork.svg autofork-dark.svg autofork-classes.svg mark.svg mark-dark.svg favicon.svg app-icon.svg")
