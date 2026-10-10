import opentype from "opentype.js"
import { mkdirSync, writeFileSync } from "node:fs"

const out = import.meta.dirname
const site = new URL("../../site/public/", import.meta.url).pathname
mkdirSync(site, { recursive: true })

const mono = opentype.loadSync(new URL("ttf/CommitMono-700-Regular.ttf", import.meta.url).pathname)
const SIZE = 100
const em = (units) => (units / mono.unitsPerEm) * SIZE

const C = {
  light: { ink: "#101312", del: "#D7402C", add: "#1C9A50", on: "#FFFFFF" },
  dark: { ink: "#E9ECEA", del: "#EC5A45", add: "#2DB566", on: "#0B0D0C" },
}

const text = (str, x, y, size = SIZE, spacing = 0) => {
  let cx = x
  const parts = []
  for (const ch of str) {
    const g = mono.charToGlyph(ch)
    parts.push(g.getPath(cx, y, size).toPathData(2))
    cx += (g.advanceWidth / mono.unitsPerEm) * size + spacing
  }
  return { d: parts.join(""), end: cx }
}

const svg = (w, h, body, label, style = "") =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${+w.toFixed(1)} ${+h.toFixed(1)}" role="img" aria-label="${label}">${style}${body}</svg>\n`

const f = (n) => +n.toFixed(2)

// The hunk: the smallest diff there is. A removed row over an added row, the order a diff reads in.
const hunk = (x, y, s, c) => {
  const u = s / 32
  const r = (rx, ry, w, h, fill) => `<rect x="${f(x + rx * u)}" y="${f(y + ry * u)}" width="${f(w * u)}" height="${f(h * u)}" fill="${fill}"/>`
  return [
    r(0, 0, 32, 15, c.del),
    r(0, 17, 32, 15, c.add),
    r(9, 5.5, 14, 4, c.on),
    r(9, 22.5, 14, 4, c.on),
    r(14, 17.5, 4, 14, c.on),
  ].join("")
}

// B: the ∓ sign alone, minus over plus, no box
const minusPlus = (x, y, s, c) => {
  const u = s / 32
  const r = (rx, ry, w, h, fill) => `<rect x="${f(x + rx * u)}" y="${f(y + ry * u)}" width="${f(w * u)}" height="${f(h * u)}" fill="${fill}"/>`
  return [r(3, 1, 26, 5.5, c.del), r(3, 18.5, 26, 5.5, c.add), r(13.25, 10, 5.5, 22, c.add)].join("")
}

// C: the stack: patches laid on an upstream line, the top one healed
const stack = (x, y, s, c) => {
  const u = s / 32
  const r = (rx, ry, w, h, fill) => `<rect x="${f(x + rx * u)}" y="${f(y + ry * u)}" width="${f(w * u)}" height="${f(h * u)}" fill="${fill}"/>`
  return [r(0, 28, 32, 4, c.ink), r(2, 20, 22, 6, c.add), r(8, 12, 22, 6, c.add), r(4, 4, 20, 6, c.del)].join("")
}

const xh = em(mono.tables.os2.sxHeight)
const cap = em(mono.tables.os2.sCapHeight)
const desc = em(-mono.tables.os2.sTypoDescender)
const base = 100
const pad = 4
const word = (x) => text("autopatch", x, base, SIZE, -2)

const lockup = (markFn, c, markSize = cap) => {
  const top = base - markSize
  const gap = markSize * 0.36
  const w = word(pad + markSize + gap)
  return {
    body: `${markFn(pad, top, markSize, c)}<path fill="${c.ink}" d="${w.d}"/>`,
    w: w.end + pad,
    h: base + desc * 0.55,
  }
}

for (const [name, fn] of [["a-hunk", hunk], ["b-minus-plus", minusPlus], ["c-stack", stack]]) {
  const l = lockup(fn, C.light)
  writeFileSync(`${out}/explore-${name}.svg`, svg(l.w, l.h, l.body, "autopatch"))
}

const light = lockup(minusPlus, C.light)
const dark = lockup(minusPlus, C.dark)
writeFileSync(`${out}/autopatch.svg`, svg(light.w, light.h, light.body, "autopatch"))
writeFileSync(`${out}/autopatch-dark.svg`, svg(dark.w, dark.h, dark.body, "autopatch"))
const monoBody = lockup(minusPlus, { ink: "currentColor", del: "currentColor", add: "currentColor" })
writeFileSync(`${out}/autopatch-mono.svg`, svg(monoBody.w, monoBody.h, monoBody.body, "autopatch"))

writeFileSync(`${out}/mark.svg`, svg(32, 32, minusPlus(0, 0, 32, C.light), "autopatch"))
writeFileSync(`${out}/mark-dark.svg`, svg(32, 32, minusPlus(0, 0, 32, C.dark), "autopatch"))

const themed = `<style>.d{fill:${C.light.del}}.a{fill:${C.light.add}}@media (prefers-color-scheme:dark){.d{fill:${C.dark.del}}.a{fill:${C.dark.add}}}</style>`
const favBody = `<rect class="d" x="1" y="1" width="14" height="3"/><rect class="a" x="1" y="9" width="14" height="3"/><rect class="a" x="6.5" y="5.5" width="3" height="10.5"/>`
const favicon = svg(16, 16, favBody, "autopatch", themed)
const tile = (bg, c) => svg(180, 180, `<rect width="180" height="180" fill="${bg}"/>${minusPlus(42, 46, 96, c)}`, "autopatch")
writeFileSync(`${out}/app-icon.svg`, tile(C.light.ink, C.dark))
writeFileSync(`${out}/favicon.svg`, favicon)
writeFileSync(`${site}/favicon.svg`, favicon)

const wordOnly = text("autopatch", 0, base, SIZE, -2)
writeFileSync(
  `${out}/wordmark-paths.json`,
  JSON.stringify({ w: f(light.w), h: f(light.h), word: word(pad + cap + cap * 0.36).d, mark: { x: pad, y: base - cap, s: f(cap) }, plainWordEnd: f(wordOnly.end) }),
)
console.log("wrote", out, { w: light.w.toFixed(1), h: light.h.toFixed(1), xh, cap })
