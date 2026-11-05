import { chrome } from "/home/bassim/.agents/skills/brand-it/scripts/lib.mjs"

const out = new URL("../product/", import.meta.url).pathname
const browser = await chrome()
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }])

const grab = async (selector, name, scale, pad = 0, settle = 5000) => {
  await page.setViewport({ width: 1440, height: 1000, deviceScaleFactor: scale })
  const el = await page.$(selector)
  await el.evaluate(e => e.scrollIntoView({ block: "center" }))
  await new Promise(r => setTimeout(r, settle))
  const box = await el.evaluate(e => {
    const r = e.getBoundingClientRect()
    return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height }
  })
  await page.screenshot({ path: `${out}${name}.png`, clip: { x: box.x - pad, y: box.y - pad, width: box.width + 2 * pad, height: box.height + 2 * pad } })
  console.log(name)
}

await page.goto("https://autofork.com", { waitUntil: "networkidle0" })
await grab(".t3", "t3", 4)
await grab(".story", "story", 2, 24, 12000)
await grab(".gh", "gh", 2)
await page.goto("https://autofork.com/AVGVSTVS96/t3code", { waitUntil: "networkidle0" })
await grab(".fork-head", "fork-head", 2, 8)
await grab(".card.run", "fork-run", 2)
await browser.close()
