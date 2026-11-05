import { writeFile, mkdir } from "node:fs/promises"
import { spawnSync } from "node:child_process"
const { serve, chrome } = await import(`${process.env.HOME}/.agents/skills/brand-it/scripts/lib.mjs`)

const SNAP_PEAK = 0.42 / 5.8
const DRAW_PEAK = 0.8 / 5.8
const KEYS = ["180974-key-1", "539146-keyboard-typing-001-wav-2", "348238-mech-keyboard-02-wav-1", "539146-keyboard-typing-001-wav-3", "348239-mech-keyboard-01-wav-1", "180974-key-1"].map(id => `key/fs-${id}`)
const SWISH = ["swish/fs-14175-27-wav-2", "swish/fs-14171-23-wav-1", "swish/kenney-rpg-cloth1", "swish/fs-277715-running-across-hard-floor-or-3", "swish/fs-14193-45-wav-1"]
const PAGE_CUES = [
  ["hero", "tap/kenney-impact-impact-wood-heavy-003+boom/fs-13875-23-wav-1+boom/fs-13875-23-wav-1", { weight: "hero", visual: "appear", pitch: -2 }],
  ["tap", "click/kenney-interface-click-001", { visual: "appear" }],
  ["land", "tap/kenney-impact-impact-wood-light-001", { visual: "appear" }],
  ["land", "pop/fs-188381-3-popping-pops-1", { visual: "appear" }],
  ["land2", "pop/fs-206152-bottlepop44-wav-1", { visual: "appear" }],
  ["broke", "hit/fs-452262-metal-hits-clanks-soft-flac-2", { visual: "appear" }],
  ["mend", "ui/kenney-interface-confirmation-001", { visual: "appear" }],
  ["land", "pop/fs-503162-mouth-pops-magic-bottle-cork-3", { visual: "appear" }],
  ["land", "pop/fs-174695-sci-fi-bubble-pop-1", { visual: "appear" }],
  ["end", "thump/fs-389665-thump-close-wav-2+boom/fs-13875-23-wav-1+boom/fs-13875-23-wav-1+chime/fs-185822-single-chime-1", { weight: "hero", visual: "appear", pitch: 2 }],
]

const { url, close } = await serve(".")
const browser = await chrome()
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1080 })
await page.goto(url, { waitUntil: "networkidle0" })
const { cues: placed, stops, end, intro, music } = await page.evaluate(async () => ({
  cues: window.CUES,
  stops: JSON.parse(document.querySelector(".feed-view").dataset.stops).map(s => s[0]),
  end: window.END,
  intro: +document.querySelector(".feed-view").closest(".scene").dataset.e,
  music: (await window.soundtrack()).music,
}))
await browser.close()
close()

const keys = placed.filter(c => c.kind === "key")
const marks = placed.filter(c => c.kind !== "key")
if (marks.length !== PAGE_CUES.length || marks.some((m, i) => m.kind !== PAGE_CUES[i][0])) throw new Error(`page cues changed: ${marks.map(m => m.kind)}`)
const wordmark = marks[0].t

const cues = [
  ...stops.slice(1, -1).map((t, i) => ({ id: `snap${i + 1}`, t: t + SNAP_PEAK, sound: SWISH[[4, 1, 2, 2, 1][i]], pan: i % 2 ? 0.15 : -0.15, visual: "move" })),
  { id: "flick", t: stops.at(-1) + SNAP_PEAK, sound: "transition/fs-444623-swoosh-10-wav-1", visual: "move" },
  { id: "build", t: wordmark, sound: "reverse/fs-503803-reverse-fx-13-wav-1", align: "peak", visual: "appear" },
  { id: "draw1", t: wordmark + 0.1 + DRAW_PEAK, sound: SWISH[1], pan: -0.2, visual: "move" },
  { id: "draw2", t: wordmark + 0.45 + DRAW_PEAK, sound: SWISH[2], pan: 0.2, visual: "move" },
  { id: "node", t: wordmark + 0.95 + 0.03, sound: "pop/fs-174695-sci-fi-bubble-pop-3", pan: 0.3, visual: "appear" },
  ...keys.filter((_, i) => i % 4 === 1).map((k, i) => ({ id: `key${i}`, t: k.t, sound: KEYS[i % KEYS.length], pan: k.pan })),
  ...marks.map((m, i) => {
    const { after = 0, ...rest } = PAGE_CUES[i][2]
    return { id: `${m.kind}${i}`, t: m.t + after, sound: PAGE_CUES[i][1], pan: m.pan, ...rest }
  }),
].sort((a, b) => a.t - b.t)

await mkdir("out", { recursive: true })
await mkdir("audio", { recursive: true })
await writeFile("out/music.wav", Buffer.from(music, "base64"))
await writeFile("audio/cues.json", JSON.stringify({ fps: 60, duration_s: end, energy: "calm", lufs: -14, kit: "sfx", room: { decay_s: 0.5, wet_db: -18 }, music: { file: "out/music.wav", fade_out_s: 0.05 }, cues }, null, 1))
const mix = spawnSync("uv", ["run", process.env.SOUND_LAYER + "/scripts/mix.py", "audio/cues.json", "--out", "audio"], { stdio: "inherit" })
if (mix.status) process.exit(mix.status)
spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", "audio/mix.wav", "-c:a", "pcm_f32le", "out/soundtrack.wav"], { stdio: "inherit" })
