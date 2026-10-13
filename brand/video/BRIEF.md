# autofork launch video: shared brief

Bassim's ask, verbatim: "I want a high quality, high energy, yet clean, minimal and simple launch video for autofork, based on my X saves and activity. There's so much cool stuff I've saved on X over a long time. The server has more RAM now, so we can go in different directions and make a few different options for me. Run several more agents to go in the different directions."

Four agents each build one direction, in its own folder here: branch/, demo/, saves/, type/. (Run 2, Oct 13: the first run died before any video; its downloads in <dir>/data, media and .scratch/refs are yours to reuse.) Each folder is self-contained (its own index.html, css, sound, README.md, out/).

## The product
autofork: name an open source app and what you'd change; it forks it into your GitHub and keeps your changes on every new release. When a release breaks a change, an agent rebuilds it from what you asked for (PATCH.md, plain words). If upstream ships their own version, yours pauses until you pick.
- Site https://autofork-blond.vercel.app (source ../site), fork flow https://autofork-app.vercel.app, engine github AVGVSTVS96/autofork.
- Words: ../copy/MESSAGING.md is the source of truth (hero "Make it yours. / Keep their updates."; what it isn't: never "nightly", never "maintains itself"). Numbers only from ../copy/facts.json (e.g. his T3 Code fork took 156 upstream commits in its first 2 days and kept all 3 changes). ../copy/launch.md is the X post the video ships with.
- His words on the product: ~/scratch/autofork/brief.md.

## The brand (current, Oct 13)
- Live tokens are in ../site/src/style.css: Host Grotesk (sans) + Fragment Mono, ultramarine "you" #3B2BFF (dark #8F84FF), gray trunk #CACAD2, field #FBFBFC / #0C0C0F. ../brand/BRAND.md is partly stale (still says autopatch, Commit Mono, diff red/green); the site CSS wins.
- Motif: the git graph. Their line (gray) with releases; yours branches off in ultramarine and every release merges into yours. The wordmark has the branch as its underline.
- Icon: #4 "auto over fork, ultramarine" in ~/scratch/autofork/shots/paper/icons.png (source ../brand/icons/gen.mjs, outputs ../brand/icons/out, logo SVGs in ../brand/logo).
- Paper file with the brand: https://app.paper.design/file/01M4T258RCEJ51GHK2AC7M05BN (open on his Mac).
- The site has T3 Code's UI transcribed from its source (../site/src/t3.ts) with the context-usage button in the composer; reuse it for real-looking product shots.

## Real footage to draw on
His T3 Code fork (github AVGVSTVS96/t3code, upstream pingdotgg/t3code) and xtool fork (github AVGVSTVS96/xtool), both kept by autofork. `gh` is logged in. Their commits, releases, PATCH.md files and Actions runs are real.

## His X saves and activity
- Copy of me.db: ~/scratch/autofork/me.db. Fresh pull: ~/scratch/autofork/x/ (bookmarks.jsonl, likes.jsonl, posts.jsonl, folders.json, folder-posts.jsonl). Bookmark folders include inspiration, Workflow Tips, cool projects, how to do biznis, designers, Components, CSS Tips.
- Summaries: ~/scratch/autofork/research/x-pulse.md and folders.md (section 3 lists launch videos he saved: Anatomy, Clicky, Spear, Showrunner, nikitabier's "perfect launch video", leomeethewoo's Apple-style product video article, Varcyyyy, etc.). Watch the real videos (download-web-video skill / yt-dlp) when a direction leans on them.

## How Bassim makes launch videos (read first)
- ~/Developer/brand-it/SKILL.md and ~/Developer/brand-it/video.md: the contract (window.END, window.seek(t), one clock, local fonts), pacing, look, motion, sound, process.
- Kits to start from: hex ~/Developer/hex-media/media (README; kit/stage.js springs, sound.js cues, launch/ with music.m4a) and commonplace ~/Developer/commonplace-site/video (README, LEARNED.md = everything the hex video taught, in his words).
- Render and master with `bun ~/.agents/skills/brand-it/scripts/video.mjs <dir> stills|sheet|audio|video`.

## Music
One music agent makes Suno takes for everyone into music/ (music/README.md lists each take: file, tempo, duration, prompt, Suno link). The first run's Suno agent already started takes titled "autofork branch A/B" in his library. Build your visuals first, then pick a take from music/ when it's there and cut to it. If no take suits you by the time you need one, ~/Developer/hex-media/media/launch/music.m4a is the fallback.

## Machine
- Server: 16 cores, 30 GB RAM; hex.service (every agent here) is capped at 16G. The first run died at 01:50 when two Suno Chromes (~2G each) plus ffmpeg hit the old cap. So: one render at a time per agent, close every headless Chrome you start, and leave Suno to the music agent.
- /tmp is RAM: `export TMPDIR=$PWD/.scratch` (gitignored) for renders.
- The landing page and fork flow are now one site: https://autofork.dev (source ~/Developer/autofork-app/src: Home.tsx, Sections.tsx, landing.ts, style.css, logo src/svg/autofork.svg), with the fork flow inside its hero. autofork-blond.vercel.app redirects there and ../site no longer serves anything. Screenshot UI from autofork.dev; read-only, don't touch or deploy either repo.
- Repo ~/Developer/autofork-site is Bassim's own; other agents are polishing site/, brand/ and the fork flow in it right now. Touch only your own video/<dir>/. Commit signed, one line, prefixed `Video:`, with `git commit -- video/<dir>` (only your paths), and push to main.
