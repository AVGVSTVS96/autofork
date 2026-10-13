# autofork launch

The X post, its link reply and the visual. Bassim's voice: lowercase, problem first, greentext, link in the first reply. Every number comes from `copy/facts.json`. The post scored 0 ("no tells") in delvish.

## The post

```
t3 code's readme says big features won't be merged. it also says you should have everything you need to fork it

but a fork with your changes falls behind every release they ship. so i made autofork

> name an open source app and what you'd change. sign in with chatgpt or claude and your plan does the work
> your fork lives in your github and runs in your own github actions, free on public repos
> every release, your changes go back on top. when one breaks, an agent rebuilds it from what you asked for
> if they ship their own version of your change, yours pauses until you pick

my t3 code fork took 156 upstream commits in its first 2 days. one change broke on day one and the agent rebuilt it

link in replies
```

Why each line is safe to say:

- Line one is T3 Code's README: "Big features will not be." and "we want you to have everything you need to fork and build the editor that you want." A stranger who uses T3 Code (27k stars) gets it without knowing Bassim.
- Line two is the reason it exists, in Bassim's terms: a fork always keeps your changes; what it loses is their updates.
- "sign in with chatgpt or claude": both are live, and the agent runs in the user's own GitHub Actions. Actions are free on public repos (GitHub's docs).
- "rebuilds it from what you asked for": the agent rebuilds a broken change from its `PATCH.md`, which holds the request in plain words.
- "yours pauses until you pick": the engine stops applying it, the fork takes their version, and an issue opens (`context-usage: upstream does this now`). Deleting the folder keeps theirs; editing `PATCH.md` brings yours back.
- The last line is the T3 Code fork in `facts.json`. Its first sync (Oct 10, `85b3a1c`, "healed window-title") jumped 383 upstream commits and `window-title` no longer applied, so the agent rebuilt it from its `PATCH.md` (`heals: 1`). From that sync to the last one (`9afde1c` to `8f25cf9`, Oct 10 to Oct 12) upstream moved 156 commits (`upstreamCommitsAbsorbed`) and every change stayed on. The earlier "kept all 3 changes" was out: `context-usage` only went in on Oct 12 and rode through the last 3 of those 156 commits, and the fork holds 4 changes now (`app-name` landed Oct 13).

## First reply

```
autofork.com

rather run it yourself? the engine is open source: a cli and a github action that work with your own agent
npx skills add AVGVSTVS96/autofork
```

## The visual

The recording and screenshots are in `launch-kit/`. `brand/launch-visual.png` is the old autopatch one; don't post it.

- `launch-kit/autofork-fork-clip.mp4` (19 s, 1600x1000, dark): a real fork on Oct 13, sped up and labeled so: type `fzf, but the prompt shows ❯ instead of >`, Continue with ChatGPT, fork it on GitHub, add it to autofork's repos, enter the ChatGPT code, the run (1m 41s in real time), built, then the agent's one-line diff in `src/options.go`. The fork is https://github.com/AVGVSTVS96/fzf.
- `launch-kit/autofork-fork-full.mp4` (4 min 18 s): the same run, unedited, every segment at real speed. The last ~30 s of the run's progress were lost to the recorder, so the built page is a still screenshot of the real page.
- `launch-kit/screenshots/`: the landing and the fork page at 1440 and 390, light and dark (`-full` is the whole page); `patch-md-{light,dark}.png`, the T3 Code fork's `context-usage/PATCH.md` on GitHub (thread tweet 3); `fzf-built` and `fzf-diff` from the run.

An 8 to 15 second screen recording of the real site, phone legible: type `T3 Code, but always show context usage`, press Fork it, continue with Claude, the run's progress, then T3 Code with the context usage button in its composer. It has to be a real run. If there's no time for one, post the site's hero shot instead, never a mock.

## Before posting

- [x] Continue with ChatGPT and Continue with Claude both work end to end on autofork.dev (Claude: AVGVSTVS96/Spoon-Knife, built in 27 s; ChatGPT: AVGVSTVS96/fzf, built in 1m 41s, both Oct 13), and the fork lands in the user's GitHub. Since the switch to autofork.com (autofork.dev now 308s to it, GitHub App callback autofork.com first), GitHub sign-in works there end to end and both agent sign-ins start there (Oct 13). If one isn't live, the first greentext line changes first.
- [ ] `node copy/facts.mjs` rerun right before posting; if the T3 Code fork's 156 or its heal count moved, update the post.
- [x] `npx skills add AVGVSTVS96/autofork` works (checked Oct 13: finds the autofork skill).
- [ ] Visual attached (`launch-kit/autofork-fork-clip.mp4`), link only in the reply.
- [ ] No em dashes: `rg '\x{2014}' copy/` prints nothing.
