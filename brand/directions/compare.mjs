import { serve, chrome } from "/home/bassim/.agents/skills/brand-it/scripts/lib.mjs"

const here = import.meta.dirname
const { url, close } = await serve(here)
const browser = await chrome()
const labels = { a: "A · the added line", b: "B · the branch (pick)", c: "C · the highlight" }

for (const scheme of ["light", "dark"]) {
  const tab = await browser.newPage()
  await tab.setViewport({ width: 1440 * 3 + 40 * 4, height: 900 + 120, deviceScaleFactor: 1 })
  const bg = scheme === "light" ? "#E9E9E6" : "#1B1B1B", fg = scheme === "light" ? "#111" : "#EEE"
  await tab.goto(`${url}index.html`)
  await tab.setContent(`<body style="margin:0;background:${bg};color:${fg};font:600 28px system-ui;display:flex;gap:40px;padding:40px">${["a", "b", "c"]
    .map((d) => `<div><div style="height:40px">${labels[d]}</div><img src="${url}shots/${d}-1440-${scheme}.png" width="1440" height="900" style="display:block"></div>`)
    .join("")}</body>`, { waitUntil: "networkidle0" })
  await tab.screenshot({ path: `${here}/shots/compare-${scheme}.png`, fullPage: true })
  console.log(`shots/compare-${scheme}.png`)
}
await browser.close()
close()
