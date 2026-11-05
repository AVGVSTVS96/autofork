import { serve, chrome, watch, reportMisses } from "/home/bassim/.agents/skills/brand-it/scripts/lib.mjs"
const here = import.meta.dirname
const { url, close } = await serve(here)
const browser = await chrome()
const labels = ["1 · Fork anything. / Still get every update.", "2 · Fork anything. / Never fall behind.", "3 · Fork anything. / Keep getting updates.", "4 · Make it yours. / Keep their updates."]
for (const scheme of ["light", "dark"]) {
  for (const h of [1, 2, 3, 4]) {
    const tab = watch(await browser.newPage())
    await tab.setViewport({ width: 1440, height: 900 })
    await tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: scheme }])
    await tab.goto(`${url}b.html?h=${h}`, { waitUntil: "networkidle0" })
    await tab.evaluate(() => document.fonts.ready)
    await new Promise((r) => setTimeout(r, 300))
    await tab.screenshot({ path: `${here}/shots/head-${h}-${scheme}.png` })
    await tab.close()
  }
  const tab = await browser.newPage()
  await tab.setViewport({ width: 1440 * 2 + 40 * 3, height: 1000 })
  const bg = scheme === "light" ? "#E9E9E6" : "#1B1B1B", fg = scheme === "light" ? "#111" : "#EEE"
  await tab.goto(`${url}index.html`)
  await tab.setContent(`<body style="margin:0;background:${bg};color:${fg};font:600 28px system-ui;display:grid;grid-template-columns:repeat(2,1440px);gap:40px;padding:40px">${labels
    .map((l, i) => `<div><div style="height:44px">${l}</div><img src="${url}shots/head-${i + 1}-${scheme}.png" width="1440" height="900" style="display:block"></div>`).join("")}</body>`, { waitUntil: "networkidle0" })
  await tab.screenshot({ path: `${here}/shots/heads-${scheme}.png`, fullPage: true })
  console.log(`shots/heads-${scheme}.png`)
}
await browser.close()
reportMisses()
close()
