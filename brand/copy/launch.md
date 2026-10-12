# autofork launch

The X post, its link reply and the visual. Bassim's voice: lowercase, problem first, greentext, link in the first reply. Every number comes from `copy/facts.json`. The post scored 0 ("no tells") in delvish.

## The post

```
t3 code's readme says big features won't be merged. it also says you should have everything you need to fork it

forking is the easy part. keeping your changes alive through their releases is the work, so i made autofork

> name an open source app and what you'd change. sign in with chatgpt and your plan does the work
> your fork lands in your github
> every release, your changes go back on top. when one breaks, an agent rebuilds it from what you asked for

my t3 code fork took 156 upstream commits in its first 2 days and kept all 3 changes

claude is next, on a computer i pay for. invites soon

link in replies
```

Why each line is safe to say:

- Line one is T3 Code's README: "Big features will not be." and "we want you to have everything you need to fork and build the editor that you want." A stranger who uses T3 Code (27k stars) gets it without knowing Bassim.
- "rebuilds it from what you asked for": the agent rebuilds a broken change from its `PATCH.md`, which holds the request in plain words.
- "156" and "all 3": the T3 Code fork in `facts.json` (`upstreamCommitsAbsorbed`, `patches`, 0 heals), Oct 10 to Oct 12.
- "on a computer i pay for": Bassim's words ("I'll be paying for their computer").

## First reply

```
autofork.dev

rather run it yourself? the engine is open source: a cli and a github action that work with your own agent
npx skills add AVGVSTVS96/autofork
```

## The visual

An 8 to 15 second screen recording of the real site, phone legible: type `T3 Code, but always show context usage`, press Fork it, sign in with ChatGPT, then T3 Code with the context usage button in its composer. It has to be a real run. If there's no time for one, post the site's hero shot instead, never a mock.

## Before posting

- [ ] Sign in with ChatGPT works end to end on autofork.dev, and the fork lands in the user's GitHub. If either isn't live, the post's second greentext line changes first.
- [ ] Get an invite for Claude collects the address and says what happens next.
- [ ] `node copy/facts.mjs` rerun right before posting; if 156 or 3 moved, update the post.
- [ ] `npx skills add AVGVSTVS96/autofork` works (the repo rename is done).
- [ ] Visual attached, link only in the reply.
- [ ] No em dashes: `rg '\x{2014}' copy/` prints nothing.
