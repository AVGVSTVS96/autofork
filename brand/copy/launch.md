# autofork launch

The launch is an 8-tweet X thread, each tweet with its video or image, the link in the last one. The pitch is the site's: "Customized forks that maintain themselves." over "Every release, your changes are reapplied intelligently. When they ship the same feature, autofork stops applying yours." (`copy/MESSAGING.md`). Bassim's voice: lowercase, problem first, greentext. Every number comes from `copy/facts.json`.

## The thread

The type video (6/) and the demo video (2/) use the same music track. Swap one before posting, or keep it on purpose.

```
1/ [video: video/saves/out/video.mp4]
t3 code's readme says big features won't be merged. it also says they want you to have everything you need to fork it

but keep a fork with your changes and you're rebasing it on every release they ship

so i made autofork: customized forks that maintain themselves

2/ [video: video/demo/out/video.mp4]
> name an open source app and what you'd change. sign in with chatgpt or claude
> it runs codex or claude code on the plan you already pay for, no api key
> your fork lives in your github and runs in your own github actions, free on public repos
> every release, your changes go back on top

3/ [image: PATCH.md on GitHub, or films/autofork film]
when a release breaks your change, an agent rebuilds it from what you asked for

your change is saved as a PATCH.md in plain words, not a diff. so it survives their refactors

if they ship their own version of your change, yours pauses until you pick

4/ [video: video/branch/out/video.mp4]
my t3 code fork took 156 upstream commits in its first 2 days

one change broke on day one and the agent rebuilt it from what i asked for

5/ [image: needs a retake. launch-kit/screenshots/home-1440-light.png still has the old t3 icon. better: hex-voice on a phone]
it's not a t3 code trick

> hex-voice, the iphone app i call my assistant from, is a fork of an expo template i took over. it's on autofork too
> before autofork, an older version of the same idea ran my forks of herdr (315 upstream commits since july), buzz (58 commits, 7 changes on top) and claude code's plugins

6/ [video: video/type/out/video.mp4]
coming soon: autofork runs and watches your forks for you, and tells you when one needs you to pick

7/ [image: github.com/AVGVSTVS96/autofork]
rather run it yourself? the engine is open source: a cli and a github action, one file, zero dependencies, works with your own agent

npx skills add AVGVSTVS96/autofork

8/
what would you change? reply with an app and one sentence, i'll fork the best ones

autofork.com

music in 1/: Tech Live by Kevin MacLeod (incompetech.com), CC BY 4.0
```

Why each line is safe to say:

- 1/ is T3 Code's README: "Big features will not be." and "we want you to have everything you need to fork and build the editor that you want." A stranger who uses T3 Code (27k stars) gets it without knowing Bassim. It ends on the site's headline, word for word.
- 2/ "it runs codex or claude code on the plan you already pay for": both sign-ins are live, and the agent runs in the fork's own GitHub Actions. Said plainly so nobody wonders if it gets their account banned. Actions are free on public repos (GitHub's docs).
- 3/ each change is a `PATCH.md` (the request in plain words) plus its diff. On a release the diff goes on with git; only when it no longer applies does the agent rebuild it from the `PATCH.md`. "yours pauses until you pick": the engine stops applying it, the fork takes their version, and an issue opens (`context-usage: upstream does this now`). Deleting the folder keeps theirs; editing `PATCH.md` brings yours back.
- 4/ is the T3 Code fork in `facts.json`. Its first sync (Oct 10, `85b3a1c`, "healed window-title") jumped 383 upstream commits and `window-title` no longer applied, so the agent rebuilt it from its `PATCH.md` (`heals: 1`). From that sync to the last one (`9afde1c` to `8f25cf9`, Oct 10 to Oct 12) upstream moved 156 commits (`upstreamCommitsAbsorbed`) and every change stayed on.
- 5/ hex-voice (AVGVSTVS96/hex-voice, a fork of an Expo template Bassim took over) is on autofork. herdr, buzz and Claude Code's plugins are not: they run the older sync-upstream setup autofork grew out of, so the tweet says "before autofork". Don't call them autofork forks or say they're green (herdr has failed since Sep 16, the plugins fork since Oct 11 on a flaky test). The image needs a retake: `launch-kit/screenshots/home-1440-light.png` still has the old T3 Code icon.
- 6/ is the one "coming soon" `MESSAGING.md` allows: the managed platform. The living-examples job only rewrites the example text on the site from open feature requests; it doesn't fork or build anything, so the thread doesn't mention it.
- 7/ `npx skills add AVGVSTVS96/autofork` works (checked Oct 13).

## The visual

The recording and screenshots are in `launch-kit/`. `brand/launch-visual.png` is the old autopatch one; don't post it.

- `launch-kit/autofork-fork-clip.mp4` (19 s, 1600x1000, dark): a real fork on Oct 13, sped up and labeled so: type `fzf, but the prompt shows ❯ instead of >`, Continue with ChatGPT, fork it on GitHub, add it to autofork's repos, enter the ChatGPT code, the run (1m 41s in real time), built, then the agent's one-line diff in `src/options.go`. The fork is https://github.com/AVGVSTVS96/fzf.
- `launch-kit/autofork-fork-full.mp4` (4 min 18 s): the same run, unedited, every segment at real speed. The last ~30 s of the run's progress were lost to the recorder, so the built page is a still screenshot of the real page.
- `launch-kit/screenshots/`: the landing and the fork page at 1440 and 390, light and dark (`-full` is the whole page); `patch-md-{light,dark}.png`, the T3 Code fork's `context-usage/PATCH.md` on GitHub (thread tweet 3); `fzf-built` and `fzf-diff` from the run.

An 8 to 15 second screen recording of the real site, phone legible: type `T3 Code, but always show context usage`, press Fork it, continue with Claude, the run's progress, then T3 Code with the context usage button in its composer. It has to be a real run. If there's no time for one, post the site's hero shot instead, never a mock.

## Before posting

- [x] Continue with ChatGPT and Continue with Claude both work end to end on autofork.dev (Claude: AVGVSTVS96/Spoon-Knife, built in 27 s; ChatGPT: AVGVSTVS96/fzf, built in 1m 41s, both Oct 13), and the fork lands in the user's GitHub. Since the switch to autofork.com (autofork.dev now 308s to it, GitHub App callback autofork.com first), GitHub sign-in works there end to end and both agent sign-ins start there (Oct 13). If one isn't live, the first greentext line changes first.
- [ ] `node copy/facts.mjs` rerun right before posting; if the T3 Code fork's 156 or its heal count moved, update 4/.
- [x] `npx skills add AVGVSTVS96/autofork` works (checked Oct 13: finds the autofork skill).
- [ ] Each tweet has its video or image attached, 5/ retaken, and the link only in 8/.
- [ ] No em dashes: `rg '\x{2014}' copy/` prints nothing.
