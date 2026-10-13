import opentype from "opentype.js"
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs"
import { branch, paint, rails, stack, svg as tileSvg, tones } from "./icon.mjs"

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
  light: { ink: "#0E0E12", you: "#3B2BFF" },
  dark: { ink: "#EEEEF2", you: "#8F84FF" },
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
const svg = (box, body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.map(f).join(" ")}" role="img" aria-label="autofork">${body}</svg>\n`

// A lane change with flat tangents at both ends, so a line peels off instead of turning.
const peel = (x1, y1, x2, y2) => `C${f((x1 + x2) / 2)} ${f(y1)} ${f((x1 + x2) / 2)} ${f(y2)} ${f(x2)} ${f(y2)}`

// The wordmark: autofork on the app's line, which starts and ends flush with the ink of the a and the k.
// Under the f, your line peels off from beneath it and runs to a node flush with the k.
// The node is 1.8 lines wide and keeps a full line's width of clearance from the app's line.
const wordmark = (c) => {
  const word = set("autofork", 0)
  const start = word.parts[0].x + u(word.parts[0].g.getBoundingBox().x1)
  const fx = word.parts.find((p) => p.ch === "f").x + u(font.charToGlyph("f").getBoundingBox().x1)
  const w = STEM * 0.5, r = w * 0.9, y1 = S + 14, y2 = y1 + w / 2 + w + r
  const p0 = fx - 6, p1 = p0 + (y2 - y1) * 1.25
  const endX = word.ink - r
  const paint = (cls, attr, color) => (c ? `${attr}="${color}"` : `class="${cls}"`)
  const body =
    `<path ${paint("ink", "fill", c?.ink)} d="${word.d}"/>` +
    `<path ${paint("you", "stroke", c?.you)} fill="none" stroke-width="${f(w)}" d="M${f(p0)} ${f(y1)}${peel(p0, y1, p1, y2)}H${f(endX)}"/>` +
    `<path ${paint("app", "stroke", c?.ink)} fill="none" stroke-width="${f(w)}" d="M${f(start)} ${f(y1)}H${f(word.ink)}"/>` +
    `<circle ${paint("node", "fill", c?.you)} cx="${f(endX)}" cy="${f(y2)}" r="${f(r)}"/>`
  return svg([start - 1, S - CAP - 2, word.ink - start + 2, CAP + 2 + y2 + r - S + 1], body)
}

writeFileSync(`${here}/autofork.svg`, wordmark(C.light))
writeFileSync(`${here}/autofork-dark.svg`, wordmark(C.dark))
writeFileSync(`${here}/autofork-classes.svg`, wordmark())

// An icon is two drawings: the name where there's room (icon), and a mark for 32 and 16, which has its own 16px drawing.
// The favicon carries both marks and picks one by the size it's drawn at, in the system's theme.
const iconSet = (dir, { big, bigTone, small, smallTone }) => {
  mkdirSync(dir, { recursive: true })
  const light = (tone) => paint(tones[tone].light)
  const dark = (tone) => paint(tones[tone].dark)
  const files = {
    "icon.svg": tileSvg(32, big(), light(bigTone)),
    "icon-dark.svg": tileSvg(32, big(), dark(bigTone)),
    "app-icon.svg": tileSvg(32, big({ rx: 0 }), light(bigTone)),
    "mark.svg": tileSvg(32, small(32), light(smallTone)),
    "mark-dark.svg": tileSvg(32, small(32), dark(smallTone)),
    "mark-16.svg": tileSvg(16, small(16), light(smallTone)),
    "mark-16-dark.svg": tileSvg(16, small(16), dark(smallTone)),
    "favicon.svg": tileSvg(32,
      `<g class="at32">${small(32, { id: "c32" })}</g><g class="at16" transform="scale(2)">${small(16, { id: "c16" })}</g>`,
      `${light(smallTone)}.at16{display:none}@media (max-width:24px){.at32{display:none}.at16{display:inline}}@media (prefers-color-scheme:dark){${dark(smallTone)}}`),
  }
  for (const [name, body] of Object.entries(files)) writeFileSync(`${dir}/${name}`, body)
}

// 4 · auto over fork in ultramarine, picked Oct 13; the rails at 32 and 16.
iconSet(here, { big: stack, bigTone: "blue", small: rails, smallTone: "blue" })
// GitHub draws an app's logo at 55% of its round badge, so this one fills the tile and the badge takes the tile's color.
writeFileSync(`${here}/github-app.svg`, tileSvg(32, stack({ rx: 0, zoom: 1.25 }), paint(tones.blue.light)))
// The round one is a disk: its ink reaches 14.2 from the center at zoom 1, and keeps the wordmark's line width (1.27) of clear space to the edge.
writeFileSync(`${here}/github-app-round.svg`, tileSvg(32, stack({ rx: 16, zoom: 16 / (14.2 + 1.27) }), paint(tones.blue.light)))
// 3 · auto over fork on paper, handing off to the branch; Bassim, Oct 13: "keep 3 in our back pocket, different colors fit well still."
iconSet(`${here}/alt`, { big: stack, bigTone: "paper", small: branch, smallTone: "trunk" })

copyFileSync(`${here}/favicon.svg`, `${site}/favicon.svg`)
console.log("wordmark, icon set, alt icon set, site/public/favicon.svg")
