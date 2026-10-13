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

my t3 code fork took 156 upstream commits in its first 2 days and kept all 3 changes

link in replies
```

Why each line is safe to say:

- Line one is T3 Code's README: "Big features will not be." and "we want you to have everything you need to fork and build the editor that you want." A stranger who uses T3 Code (27k stars) gets it without knowing Bassim.
- Line two is the reason it exists, in Bassim's terms: a fork always keeps your changes; what it loses is their updates.
- "sign in with chatgpt or claude": both are live, and the agent runs in the user's own GitHub Actions. Actions are free on public repos (GitHub's docs).
- "rebuilds it from what you asked for": the agent rebuilds a broken change from its `PATCH.md`, which holds the request in plain words.
- "yours pauses until you pick": the engine stops applying it, the fork takes their version, and an issue opens (`context-usage: upstream does this now`). Deleting the folder keeps theirs; editing `PATCH.md` brings yours back.
- "156" and "all 3": the T3 Code fork in `facts.json` (`upstreamCommitsAbsorbed`, `patches`, 0 heals), Oct 10 to Oct 12.

## First reply

```
autofork.com

rather run it yourself? the engine is open source: a cli and a github action that work with your own agent
npx skills add AVGVSTVS96/autofork
```

## The visual

An 8 to 15 second screen recording of the real site, phone legible: type `T3 Code, but always show context usage`, press Fork it, continue with Claude, the run's progress, then T3 Code with the context usage button in its composer. It has to be a real run. If there's no time for one, post the site's hero shot instead, never a mock.

## Before posting

- [ ] Continue with ChatGPT and Continue with Claude both work end to end on autofork.com, and the fork lands in the user's GitHub. If one isn't live, the first greentext line changes first.
- [ ] `node copy/facts.mjs` rerun right before posting; if 156 or 3 moved, update the post.
- [ ] `npx skills add AVGVSTVS96/autofork` works (the repo rename is done).
- [ ] Visual attached, link only in the reply.
- [ ] No em dashes: `rg '\x{2014}' copy/` prints nothing.
