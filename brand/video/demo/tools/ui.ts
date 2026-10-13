import { readFileSync, writeFileSync } from "node:fs"
const [live, out] = process.argv.slice(2)
const read = (name: string) =>
  readFileSync(`${live}/${name}.html`, "utf8")
    .replace(/https:\/\/avatars\.githubusercontent\.com\/u\/122117267[^"]*|https:\/\/avatars\.githubusercontent\.com\/AVGVSTVS96[^"]*/g, "/repos/avgvstvs96.png")
    .replace(/https:\/\/avatars\.githubusercontent\.com\/[^"]*/g, "/repos/t3code.png")
    .replace(/^<div id="root">|<\/div>$/g, "")

const element = (html: string, open: string) => {
  const start = html.indexOf(open)
  let depth = 0
  for (const m of html.slice(start).matchAll(/<(\/?)div\b[^>]*>/g)) {
    depth += m[1] ? -1 : 1
    if (!depth) return html.slice(start, start + m.index! + m[0].length)
  }
  throw new Error(`unclosed ${open}`)
}

const doc = (states: Record<string, string>, extra = "") => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<link rel="stylesheet" href="app.css">
<link rel="stylesheet" href="frame.css">
</head><body${extra}>
<div id="root"></div>
${Object.entries(states).map(([id, html]) => `<template id="${id}">${html}</template>`).join("\n")}
<script src="frame.js"></script>
</body></html>
`

writeFileSync(`${out}/site.html`, doc(Object.fromEntries(["hero", "making", "plan", "claude", "pasted"].map(n => [n, read(n)]))))
writeFileSync(`${out}/fork.html`, doc(Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map(n => [n === 7 ? "kept" : `run${n}`, read(`run${n}`)]))))
writeFileSync(`${out}/t3.html`, doc({ t3: `<main class="solo">${element(read("hero"), '<div class="t3"')}</main>` }))
