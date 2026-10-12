import { serve, chrome, watch, reportMisses } from "/home/bassim/.agents/skills/brand-it/scripts/lib.mjs"

const here = import.meta.dirname
const fonts = [["bricolage", "Bricolage Grotesque (now)"], ["hubot", "Hubot Sans"], ["geist", "Geist"], ["satoshi", "Satoshi"], ["host", "Host Grotesk"], ["inter", "Inter Display (safe)"]]
const { url, close } = await serve(here)
const browser = await chrome()

for (const scheme of ["light", "dark"]) {
  for (const [id] of fonts) {
    const tab = watch(await browser.newPage())
    await tab.setViewport({ width: 1440, height: 900 })
    await tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
    await tab.goto(`${url}b.html?font=${id}`, { waitUntil: "networkidle0" })
    await tab.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 300))
    await tab.screenshot({ path: `${here}/shots/font-${id}-${scheme}.png` })
    await tab.close()
  }
  const tab = await browser.newPage()
  await tab.setViewport({ width: 1440 * 3 + 40 * 4, height: 1000 })
  const bg = scheme === "light" ? "#E9E9E6" : "#1B1B1B", fg = scheme === "light" ? "#111" : "#EEE"
  await tab.goto(`${url}index.html`)
  await tab.setContent(`<body style="margin:0;background:${bg};color:${fg};font:600 28px system-ui;display:grid;grid-template-columns:repeat(3,1440px);gap:40px;padding:40px">${fonts
    .map(([id, label]) => `<div><div style="height:44px">${label}</div><img src="${url}shots/font-${id}-${scheme}.png" width="1440" height="900" style="display:block"></div>`)
    .join("")}</body>`, { waitUntil: "networkidle0" })
  await tab.screenshot({ path: `${here}/shots/fonts-${scheme}.png`, fullPage: true })
  console.log(`shots/fonts-${scheme}.png`)
}
await browser.close()
reportMisses()
close()
