import puppeteer from "puppeteer-core"
const [out, first = "818e2be"] = process.argv.slice(2)
const browser = await puppeteer.launch({ channel: "chrome", headless: true, args: ["--force-color-profile=srgb", "--hide-scrollbars"] })
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }])
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
const pages: string[] = []
let url = "https://github.com/AVGVSTVS96/t3code/commits/main/"
for (let i = 0; i < 8 && url; i++) {
  await page.goto(url, { waitUntil: "networkidle2" })
  const { html, next, done } = await page.evaluate((first) => {
    const ol = document.querySelector("ol[class*='Timeline-Timeline']")!
    const next = [...document.querySelectorAll("a")].find(a => a.textContent?.trim() === "Next")?.href ?? ""
    return { html: ol.innerHTML, next, done: ol.textContent!.includes(first) }
  }, first)
  pages.push(html)
  url = done ? "" : next
}
await page.goto("https://github.com/AVGVSTVS96/t3code/commits/main/", { waitUntil: "networkidle2" })
const height = await page.evaluate((pages, first) => {
  const ol = document.querySelector("ol[class*='Timeline-Timeline']")!
  ol.innerHTML = pages.join("")
  const items = [...ol.children] as HTMLElement[]
  const head = (el: Element) => el.querySelector("h3, h2")?.textContent?.trim() ?? el.textContent!.slice(0, 30)
  for (let i = items.length - 1; i > 0; i--) {
    if (head(items[i]) === head(items[i - 1])) {
      const into = items[i - 1].querySelector("ul")!
      items[i].querySelectorAll("ul > li").forEach(li => into.appendChild(li))
      items[i].remove()
    }
  }
  let past = false
  for (const li of [...ol.querySelectorAll("ul > li")] as HTMLElement[]) {
    const text = li.textContent ?? ""
    if (past) { li.remove(); continue }
    if (text.includes(first)) past = true
    if (/^\s*autopatch/.test(text) || /AVGVSTVS96(\s*and\s*\w+)?\s*(committed|authored)/.test(text)) li.remove()
  }
  ol.querySelectorAll(":scope > *").forEach(item => { if (!item.querySelector("ul > li")) item.remove() })
  document.querySelectorAll("nav[aria-label*='agination'], [class*='Pagination']").forEach(e => e.remove())
  const r = ol.getBoundingClientRect()
  return { x: r.x + scrollX, y: r.y + scrollY, w: r.width, h: r.height, rows: ol.querySelectorAll("ul > li").length }
}, pages, first)
console.log(height)
const el = await page.$("ol[class*='Timeline-Timeline']")
await el!.screenshot({ path: out })
await browser.close()
