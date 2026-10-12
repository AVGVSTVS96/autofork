import { mkdirSync } from "node:fs"
import { serve, chrome, watch, reportMisses } from "/home/bassim/.agents/skills/brand-it/scripts/lib.mjs"

const here = import.meta.dirname
const pages = process.argv[2] ? process.argv[2].split(",") : ["a", "b", "c"]
const sizes = process.argv[3] === "all" ? [[1440, 900, 1], [1035, 760, 2], [390, 844, 2]] : [[1440, 900, 1]]
mkdirSync(`${here}/shots`, { recursive: true })
const { url, close } = await serve(here)
const browser = await chrome()

for (const page of pages) for (const scheme of ["light", "dark"]) for (const [w, h, scale] of sizes) {
  const tab = watch(await browser.newPage())
  tab.on("pageerror", (e) => console.error(`${page}: ${e.message}`))
  await tab.setViewport({ width: w, height: h, deviceScaleFactor: scale })
  await tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: "reduce" }])
  await tab.goto(`${url}${page}.html`, { waitUntil: "networkidle0" })
  await tab.waitForSelector("html[data-ready]", { timeout: 5000 }).catch(() => {})
  await tab.evaluate(() => document.fonts.ready)
  await new Promise((r) => setTimeout(r, 250))
  const out = `shots/${page}-${w}-${scheme}.png`
  await tab.screenshot({ path: `${here}/${out}`, fullPage: w !== 1440 })
  console.log(out)
  await tab.close()
}
await browser.close()
reportMisses()
close()
