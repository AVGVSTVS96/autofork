import { serve, chrome, watch, reportMisses } from "/home/bassim/.agents/skills/brand-it/scripts/lib.mjs"
const here = import.meta.dirname
const { url, close } = await serve(here)
const browser = await chrome()
for (const scheme of ["light", "dark"]) {
  const tab = watch(await browser.newPage())
  await tab.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
  await tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
  await tab.goto(`${url}logos.html`, { waitUntil: "networkidle0" })
  await tab.waitForSelector("html[data-ready]")
  await tab.evaluate(() => document.fonts.ready)
  await tab.screenshot({ path: `${here}/shots/logos-${scheme}.png`, fullPage: true })
  console.log(`shots/logos-${scheme}.png`)
}
await browser.close()
reportMisses()
close()
