import puppeteer from "puppeteer-core"
import { writeFileSync, mkdirSync } from "node:fs"
const out = process.argv[2]
mkdirSync(out, { recursive: true })
const base = "https://autofork.dev"
const offsets = [0, 4, 6, 19, 23, 95, 134]
let phase = 0
let holdForks = true
const started = () => new Date(Date.now() - offsets[phase] * 1000 - 1500).toISOString()
const me = { login: "AVGVSTVS96", avatar: "https://avatars.githubusercontent.com/AVGVSTVS96" }
const steps = (n: number) => ["Set up job", "Run actions/checkout@v7", "Run pnpm/action-setup@v6", "Run AVGVSTVS96/autofork@v1"].slice(0, n + 1).map((name, i) => ({
  name, status: i < n ? "completed" : "in_progress", conclusion: i < n ? "success" : null,
}))
const done = () => phase >= 6
const stepOf = [0, 0, 1, 2, 3, 3, 4]
const kept = [
  { id: "context-usage", text: "Always show the thread's context usage in the composer." },
  { id: "fork-readme", text: "Anyone landing on this repo should see right away that it's a fork, what keeps it current, and where its changes are." },
  { id: "window-title", text: "The window (and browser tab) title shows the thread you're looking at, as `<thread title> · <project name>`, or just the thread title when there's no project." },
].map(change => ({ ...change, state: "built", upstream: null, issue: null }))
const fork = () => phase === 7 ? { owner: "AVGVSTVS96", name: "t3code", upstream: "pingdotgg/t3code", agent: "claude", yours: true, changes: kept, run: null } : ({
  owner: "AVGVSTVS96", name: "t3code", upstream: "pingdotgg/t3code", agent: "claude", yours: true,
  changes: [{ id: "context-usage", text: "Always show the thread's context usage in the composer.", state: done() ? "built" : "building", upstream: null, issue: null }],
  run: {
    url: "https://github.com/AVGVSTVS96/t3code/actions/runs/38320148192",
    status: done() ? "completed" : "in_progress", conclusion: done() ? "success" : null,
    startedAt: started(), updatedAt: new Date(Date.parse(started()) + 134_000).toISOString(),
    steps: done() ? steps(4).map(s => ({ ...s, status: "completed", conclusion: "success" })) : steps(stepOf[phase]), log: done() ? ['Built "Always show the thread\'s context usage in the composer."'] : [], moved: false,
  },
})
const routes: [RegExp, string, () => unknown][] = [
  [/\/api\/me$/, "GET", () => me],
  [/\/api\/forks$/, "POST", () => ({ owner: "AVGVSTVS96", name: "t3code", status: "ready", link: null, places: ["AVGVSTVS96"] })],
  [/\/api\/claude$/, "POST", () => ({ url: "https://claude.ai/oauth/authorize" })],
  [/\/api\/forks\/AVGVSTVS96\/t3code\/claude$/, "POST", () => ({ owner: "AVGVSTVS96", name: "t3code" })],
  [/\/api\/forks\/AVGVSTVS96\/t3code$/, "GET", fork],
]
const browser = await puppeteer.launch({ channel: "chrome", headless: true, args: ["--force-color-profile=srgb", "--hide-scrollbars"] })
const page = await browser.newPage()
await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }])
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 })
await page.setRequestInterception(true)
page.on("request", req => {
  const url = req.url().split("?")[0]
  const hit = routes.find(([re, m]) => re.test(url) && m === req.method())
  if (hit && hit[0].source === "\\/api\\/forks$" && holdForks) return
  if (hit) return req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(hit[2]()) })
  req.continue()
})
const wait = (ms: number) => new Promise(r => setTimeout(r, ms))
const snap = async (name: string) => {
  await wait(1500)
  await page.screenshot({ path: `${out}/${name}.png` })
  writeFileSync(`${out}/${name}.html`, await page.evaluate(() => document.querySelector("#root")!.outerHTML))
  console.log(name)
}
await page.goto(base + "/", { waitUntil: "networkidle2" })
await wait(9000)
await snap("hero")
await page.goto(base + "/?q=" + encodeURIComponent("T3 Code, but always show context usage"), { waitUntil: "domcontentloaded" })
await wait(4000)
await snap("making")
holdForks = false
await page.goto(base + "/?q=" + encodeURIComponent("T3 Code, but always show context usage"), { waitUntil: "networkidle2" })
await snap("plan")
const claude = await page.$$("button.btn")
for (const b of claude) if ((await b.evaluate(e => e.textContent))?.includes("Claude")) await b.click()
await snap("claude")
await page.type(".paste input", "a7Fq2-c9Lm…", { delay: 20 })
await snap("pasted")
phase = 0
await page.click(".paste button")
await snap("waiting")
for (phase = 1; phase <= 7; phase++) {
  await page.goto(`${base}/AVGVSTVS96/t3code?since=2026-01-01T00:00:00.000Z`, { waitUntil: "networkidle2" })
  await snap(`run${phase}`)
}
await browser.close()
