const root = document.getElementById("root")
let current
window.show = name => {
  if (name !== current) {
    root.innerHTML = document.getElementById(name).innerHTML
    current = name
  }
  return root
}
window.box = selector => {
  const el = root.querySelector(selector)
  if (!el) throw new Error(`no ${selector} in ${current}`)
  const r = el.getBoundingClientRect()
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }
}
show(document.querySelector("template").id)
for (const font of ['400 16px "Host Grotesk"', '700 16px "Host Grotesk"', '400 16px "Fragment Mono"']) document.fonts.load(font)
