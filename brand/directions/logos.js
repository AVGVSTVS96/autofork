for (const el of document.querySelectorAll("[data-logo]")) {
  el.classList.add("logo")
  el.innerHTML = await (await fetch(`logos/${el.dataset.logo}.svg`)).text()
}
document.documentElement.dataset.ready = ""
