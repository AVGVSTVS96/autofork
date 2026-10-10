# autopatch launch

The X post, its link reply, a quote-tweet version for @theo's Oct 8 post, and the visual. Bassim's voice: lowercase, plain, greentext for the differentiators, link in the first reply. Every clause is checked against `~/Developer/autopatch` (README, `src/autopatch.ts`, `action.sh`) and every number comes from `copy/facts.json`. All three drafts scored 0 ("no tells") in delvish.

## The post

Problem first, then the name, then what it does that nothing else does. 116 words, about 600 characters, so it needs a long post.

```
fixing shit is easy now. keeping your fix alive every time upstream ships is the hard part

so i packaged the loop behind my patched forks: autopatch

> each change is a git diff + a PATCH.md that says what it's for, in plain words
> every night it rebuilds your fork from upstream's newest green commit and applies your patches with git
> a patch git can't apply gets re-implemented by an agent from its PATCH.md, and your tests have to pass
> all clean = no model call. upstream shipped your fix = patch dropped, reason in the commit

since july that loop has pulled ~400 upstream commits into 3 of my forks, and agents re-implemented patches 11 times

link in replies 👇
```

Why each line is safe to say:

- "fixing shit is easy now" picks up @theo's line from this week ("It's too easy to fix and polish shit nowadays") without quoting it.
- "the loop behind my patched forks": the README's own origin ("autopatch is that loop written once").
- "newest green commit": sync skips upstream commits whose GitHub checks failed or are still running, up to 30 back.
- "your tests have to pass": the `verify` command runs after every rebuild; a failure lands nothing.
- "~400": 394 upstream commits counted by `facts.mjs` across the claude code plugins, buzz and herdr forks, rounded up. "11": distinct syncs where Claude or Codex healed patches. These are the per-fork loops autopatch was packaged from, which is why the post says "that loop", not "autopatch".
- The fork names stay out of the post: a stranger doesn't know herdr or buzz. They're in the README and on the site.

## First reply

```
github.com/AVGVSTVS96/autopatch

start in your fork with one command:
npx github:AVGVSTVS96/autopatch init owner/repo

it grew out of pi-patcher and the PATCH.md spec. claude code heals by default, codex or any cli agent works too
```

Post the site (autopatchmd.vercel.app) as a second reply once it's live, with the OG card showing.

## Quote-tweet version, for @theo's Oct 8 post

Quoting: *"My tolerance for bad software has quickly dropped. It's too easy to fix and polish shit nowadays. No excuse for shipping broken garbage."* (154k views)

```
and once you fix it in your own fork, the fork is the next thing you have to maintain

so i made autopatch. every night it rebuilds your fork from upstream and replays your patches with git. the ones that stop applying, an agent re-implements from a PATCH.md that says what they're for, and your tests have to pass

link in replies 👇
```

Same first reply. It opens differently from the main post on purpose, so both can go out.

**My pick:** post the main one now, on its own, with the visual: the standalone list format is what got better-github-skill its 28.9k. Use the quote-tweet as the second wave, 6+ hours later or tomorrow morning, when it can carry something new (a real heal from a fork that just switched to autopatch, or the site). Posting it first trades a proven format for theo's reach on a two-day-old post.

## Alternate: the objection as the hook

For a later chain post, or if Bassim wants the shorter one.

```
"who's gonna maintain the fork?"

git, mostly. and an agent for the patches git can't apply

autopatch: fork anything, keep your changes

> every night your fork is rebuilt from upstream + your patches
> each patch carries a PATCH.md saying what it's for. when the diff stops applying, an agent re-implements it from that, and your tests have to pass
> healed diffs get saved, so tomorrow git applies them alone

link in replies 👇
```

"git, mostly" is the honest answer, not "the agent is": git applies every patch it can, and the agent only runs on the ones it can't.

## The visual

One image, phone legible (61% of the audience is on iOS): two panels, at most 12 lines each, type big enough to read at 400px wide.

- **Left:** a real `PATCH.md`, cropped to the frontmatter and `## Intent`. herdr's `pane-border-ids` is public and real.
- **Right:** the terminal from a real `autopatch sync` where one patch heals, in its exact shape:

```
upstream 3f2a91c04be1 → 8b0e44d9a7c2, 4 patches
healing pane-border-ids
autopatch: sync herdrdev/herdr to 8b0e44d9a7c2

healed pane-border-ids
pushed 8b0e44d9a7c2 to main, signed by GitHub
```

The SHAs above are placeholders. The image has to come from a real run: move herdr (or a throwaway fork with one patch that conflicts with upstream's tip) onto autopatch and screenshot its first heal. If there's no time for a real run, use the site's hero shot instead, not a mocked terminal.

Better still, if there are 15 minutes: an 8 to 15 second screen recording of that run, ending on the GitHub commit page with "healed pane-border-ids" and the Verified badge.

## Before posting

- [ ] The repo is public and `npx github:AVGVSTVS96/autopatch init owner/repo` works from a clean fork.
- [ ] `node copy/facts.mjs` rerun right before posting; if ~400 or 11 moved, update the post.
- [ ] Image attached, link only in the reply.
- [ ] No em dashes: `rg '\x{2014}' copy/` prints nothing.
