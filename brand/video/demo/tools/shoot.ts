import puppeteer from "puppeteer-core"
const [out, ...urls] = process.argv.slice(2)
const browser = await puppeteer.launch({ channel: "chrome", headless: true, args: ["--force-color-profile=srgb", "--hide-scrollbars"] })
try {
  for (const spec of urls) {
    const [name, url, w = "1920", h = "1080", dpr = "2", full = ""] = spec.split("|")
    const page = await browser.newPage()
    await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }])
    await page.setViewport({ width: +w, height: +h, deviceScaleFactor: +dpr })
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60000 })
    await new Promise(r => setTimeout(r, 2500))
    await page.screenshot({ path: `${out}/${name}.png`, fullPage: !!full })
    console.log(name, await page.title())
    await page.close()
  }
} finally { await browser.close() }
