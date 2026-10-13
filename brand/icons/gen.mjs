import { mkdirSync, rmSync, writeFileSync } from "node:fs"
import { branch, paint, rails, stack, svg, tones } from "../logo/icon.mjs"

const out = `${import.meta.dirname}/out`
rmSync(out, { recursive: true, force: true })
mkdirSync(out)

const icons = {
  rails: { tone: "blue", 32: rails(32), 16: rails(16) },
  branch: { tone: "trunk", 32: branch(32), 16: branch(16) },
  stack: { tone: "paper", 32: stack() },
  "stack-blue": { tone: "blue", 32: stack() },
}
for (const [name, icon] of Object.entries(icons))
  for (const n of [32, 16])
    for (const theme of ["light", "dark"])
      if (icon[n]) writeFileSync(`${out}/${name}${n === 16 ? "-16" : ""}${theme === "dark" ? "-dark" : ""}.svg`, svg(n, icon[n], paint(tones[icon.tone][theme])))
console.log(Object.keys(icons).join(" "))
