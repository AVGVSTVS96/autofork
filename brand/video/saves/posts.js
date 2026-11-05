const icon = {
  verified: `<svg viewBox="0 0 24 24" class="badge"><path fill="#1d9bf0" fill-rule="evenodd" d="M12 1.75c1.4 0 2.62.87 3.34 2.19 1.44-.43 2.92-.17 3.91.81s1.24 2.47.81 3.91c1.32.72 2.2 1.94 2.2 3.34s-.88 2.62-2.2 3.34c.43 1.44.18 2.92-.81 3.9-.99 1-2.47 1.25-3.91.82-.72 1.32-1.94 2.19-3.34 2.19s-2.62-.87-3.34-2.2c-1.44.44-2.92.18-3.9-.8-1-.99-1.24-2.47-.82-3.91-1.32-.72-2.19-1.95-2.19-3.34 0-1.4.87-2.62 2.2-3.34-.43-1.44-.18-2.92.8-3.9.99-1 2.47-1.25 3.91-.82.72-1.32 1.95-2.19 3.34-2.19M10.45 13.3l-2.23-2.25-1.42 1.4 3.7 3.75 6.24-6.77-1.47-1.36z" clip-rule="evenodd"/></svg>`,
  more: `<svg viewBox="0 0 24 24" class="more" fill="currentColor"><path d="M3 12c0-1.1.9-2 2-2s2 .9 2 2-.9 2-2 2-2-.9-2-2zm9 2c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm7 0c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2z"/></svg>`,
  reply: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M1.751 10c0-4.42 3.584-8 8.005-8h4.366c4.49 0 8.129 3.64 8.129 8.13 0 2.96-1.607 5.68-4.196 7.11l-8.054 4.46v-3.69h-.067c-4.49.1-8.183-3.51-8.183-8.01zm8.005-6c-3.317 0-6.005 2.69-6.005 6 0 3.37 2.77 6.08 6.138 6.01l.351-.01h1.761v2.3l5.087-2.81c1.951-1.08 3.163-3.13 3.163-5.36 0-3.39-2.744-6.13-6.129-6.13H9.756z"/></svg>`,
  repost: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>`,
  like: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.697 5.5c-1.222-.06-2.679.51-3.89 2.16l-.805 1.09-.806-1.09C9.984 6.01 8.526 5.44 7.304 5.5c-1.243.07-2.349.78-2.91 1.91-.552 1.12-.633 2.78.479 4.82 1.074 1.97 3.257 4.27 7.129 6.61 3.87-2.34 6.052-4.64 7.126-6.61 1.111-2.04 1.03-3.7.477-4.82-.561-1.13-1.666-1.84-2.908-1.91zm4.187 7.69c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.41-4.86-.514-6.67.887-1.79 2.647-2.91 4.601-3.01 1.651-.09 3.368.56 4.798 2.01 1.429-1.45 3.146-2.1 4.796-2.01 1.954.1 3.714 1.22 4.601 3.01.896 1.81.846 4.17-.514 6.67z"/></svg>`,
  views: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8.75 21V3h2v18h-2zM18 21V8.5h2V21h-2zM4 21l.004-10h2L6 21H4zm9.248 0v-7h2v7h-2z"/></svg>`,
  bookmark: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 4.5C4 3.12 5.119 2 6.5 2h11C18.881 2 20 3.12 20 4.5v18.44l-8-5.71-8 5.71V4.5zM6.5 4c-.276 0-.5.22-.5.5v14.56l6-4.29 6 4.29V4.5c0-.28-.224-.5-.5-.5h-11z"/></svg>`,
  share: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.59l5.7 5.7-1.41 1.42L13 6.41V16h-2V6.41l-3.3 3.3-1.41-1.42L12 2.59zM21 15l-.02 3.51c0 1.38-1.12 2.49-2.5 2.49H5.5C4.11 21 3 19.88 3 18.5V15h2v3.5c0 .28.22.5.5.5h12.98c.28 0 .5-.22.5-.5L19 15h2z"/></svg>`,
}

const count = n => {
  if (!n) return ""
  if (n < 1000) return String(n)
  const k = n < 1e6 ? [n / 1e3, "K"] : [n / 1e6, "M"]
  return (k[0] < 10 ? Math.floor(k[0] * 10) / 10 : Math.floor(k[0])) + k[1]
}

const l = s => `<span class="l">${s}</span>`
const hl = (s, at) => `<mark class="a" style="--d:${at}">${s}</mark>`
const emoji = code => `<img class="emoji" src="media/emoji-${code}.svg" alt="">`

const theo = { name: "Theo - t3.gg", handle: "theo", avatar: "theo.jpg" }
const bassim = { name: "bassim", handle: "avgvstvs96", avatar: "avgvstvs96.jpg" }

export const posts = [
  {
    id: "superzed", name: "Max Katz", handle: "maxktz", avatar: "maxktz.jpg", aff: "aff-photon.jpg", date: "Jul 12",
    text: `${hl(`my fork of`, 0.3)} ${l("@zeddotdev")}\n\nbasically ${hl(`zed + herdr + cmux, merged into "superzed"`, 0.8)}`,
    media: { src: "2076331470633816181.jpg", w: 2250, h: 1414 },
    n: [93, 39, 1503, 244045],
  },
  {
    id: "prs", name: "DHH", handle: "dhh", avatar: "dhh.jpg", aff: "aff-37signals.jpg", date: "Sep 12", thread: "parent",
    text: `We're ${hl("2,200 PRs deep", 3.15)} on GH now and getting nearly a hundred new ones every day. I'll never be able to catch up. Agents will help, but we need humans too. If you have DEEP Linux experience, is agent-forward, and want to join the new Omarchy triage team, write ${l("triage@omarchy.org")}.`,
    media: { src: "2098755120540393908.jpg", w: 798, h: 338 },
    n: [88, 76, 1708, 113854],
  },
  {
    id: "t3prs", ...theo, date: "Sep 12", thread: "child",
    text: `I feel you man. ${hl("We’re at like 300 a day for T3 Code", 5.15)} ${emoji("1fae0")}\n\nAgent triaging is the only reason we can survive. Thankfully our surface area is way less risky`,
    n: [4, 0, 209, 15391],
  },
  {
    id: "kanban", ...theo, date: "Sep 14", thread: "parent",
    text: `It's a fucking kanban?? I'm sorry man but ${hl("there is literally no world in which we merge this.", 8.0)} This is one of those workflows that seemed like a good idea in 2025 that just doesn't make sense anymore.\n\nJust ask the agent to build what you want to build. No need for all this.`,
    media: { src: "2099709776896954603.jpg", w: 2974, h: 2104 },
    n: [3, 0, 8, 5734],
  },
  {
    id: "orchestrator", ...theo, date: "Sep 14", thread: "child",
    text: `Take a look at the Orchestrator V2 work, probably closer to what you want and ${hl("would be easier to maintain your fork on top of", 10.38)}`,
    n: [3, 0, 6, 5058],
  },
  {
    id: "mine", ...bassim, date: "Oct 7",
    text: `auto patching/repo-maintenance is game-changing. ${hl("i can fork and customize anything,", 12.66)} ${hl("the agents will autonomously track upstream and re-implement my changes", 13.3)}`,
    quote: { ...bassim, date: "Oct 6", text: `automatic repo maintenance/patching is a cool technique i’ve been using to make forking and modifying existing projects more approachable\n\nbots track upstream and maintain the repo automatically\n…` },
    n: [0, 0, 1, 352],
  },
]

const head = p => `<div class="head"><b>${p.name}</b>${p.verified === false ? "" : icon.verified}${p.aff ? `<img class="aff" src="media/${p.aff}" alt="">` : ""}<span class="who">@${p.handle} · ${p.date}</span>${icon.more}</div>`

export const render = p => `
  <article class="post ${p.thread ?? ""}" id="${p.id}">
    <img class="av" src="media/${p.avatar}" alt="">
    <div>
      ${head(p)}
      <div class="text">${p.text}</div>
      ${p.media ? `<div class="media" style="aspect-ratio:${p.media.w}/${p.media.h}"><img src="media/${p.media.src}" alt="">${p.media.video ? `<span class="dur">${p.media.video}</span>` : ""}</div>` : ""}
      ${p.quote ? `<div class="quote"><div class="head"><img src="media/${p.quote.avatar}" alt=""><b>${p.quote.name}</b>${icon.verified}<span class="who">@${p.quote.handle} · ${p.quote.date}</span></div><div class="text">${p.quote.text}</div></div>` : ""}
      <div class="acts">
        <span>${icon.reply}${count(p.n[0])}</span><span>${icon.repost}${count(p.n[1])}</span><span>${icon.like}${count(p.n[2])}</span><span>${icon.views}${count(p.n[3])}</span>
        <span class="end">${icon.bookmark}${icon.share}</span>
      </div>
    </div>
  </article>`
