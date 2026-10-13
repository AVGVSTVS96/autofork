# autofork · brand

**The idea in a sentence:** a fork is a branch that keeps going. The original's line runs straight through; yours peels off from beneath it, runs beside it and ends in your node. The wordmark's underline, the site's rail, the icon and the OG graph are all that one drawing.

Bassim, Oct 12: "That's why i love the branch design of the hero in the first place, because it's like we're opening a parallel branch to the upstream, and we are keeping it up to date with our own changes."

## Personality

- **A finished product, not a hacker tool.** Lovable-simple on the surface; the GitHub App and CLI are there for people who want them.
- **Plain.** Says what happened: which release, which change, whether the agent had to rebuild it.
- **Real runs only.** T3 Code is the example everywhere. Anything that didn't happen is labeled.

## The visual system

### Type: Host Grotesk + Fragment Mono (both OFL)

- **Host Grotesk** 800 for the wordmark, headlines and the icon, `letter-spacing` about `-0.03em`, line-height about 1. Body and UI at 400 to 700. Picked by Bassim, Oct 12: "Host Grotesk".
- **Fragment Mono** 400 for what the computer says: tags, versions, small status lines. Never as costume.
- Subsets in `fonts/`, full TTFs in `fonts/src/` (the generators read `Host-800.ttf`).

### Color: one ultramarine, and the gray it branches from

| token | light | dark | means |
| --- | --- | --- | --- |
| `--bg` | `#FBFBFC` | `#0C0C0F` | the page |
| `--panel` | `#FFFFFF` | `#141419` | cards, the composer |
| `--panel-2` | `#F4F4F6` | `#1A1A20` | badges, insets |
| `--ink` | `#0E0E12` | `#EEEEF2` | text, the wordmark |
| `--ink-2` | `#4D4D57` | `#A6A6B2` | prose |
| `--ink-3` | `#6E6E78` | `#8A8A96` | labels |
| `--trunk` | `#CACAD2` | `#34343D` | the original's line and its releases |
| `--you` | `#3B2BFF` | `#8F84FF` | yours: your line, your node, the second headline row, the button |
| `--you-soft` | `#EDEBFF` | `#1D1A3A` | the release you're looking at |

Rule: **ultramarine is yours, gray is theirs.** Ink is for words. In dark, the ultramarine goes light (`#8F84FF`) and stays light; it never sits on the dark field at low opacity.

### Motifs

1. **The branch.** Two lanes. The original's line is straight; yours leaves from beneath it with flat tangents at both ends (a peel, not a turn), and your node is 1.8 lines wide with a full line's width of clear space from the original's line. Every lane change in every asset follows this rule.
2. **The git graph.** Releases are hollow gray rings on the trunk, your change is a filled node one lane over, and each release pulls your change up on top of it.
3. **The composer.** One rounded bar, a neutral border, the app in a badge like T3 Code's composer chips, and the button nested at the same curve (its radius is the bar's minus the inset).

## Logo

**Wordmark:** `logo/autofork.svg`, `logo/autofork-dark.svg`, `logo/autofork-classes.svg` (classes `ink`, `app`, `you`, `node` for inlining). autofork in Host Grotesk 800 on the original's line, which is flush with the ink of the a and the k; yours peels off under the f to a node flush with the k.

**Icon, 4 · auto over fork in ultramarine** (picked Oct 13: "icon pick 4 works"). The name stacked in the tile where there's room; at 32 and 16 it hands off to the rails, which have their own 16px drawing.

- `logo/icon.svg`, `icon-dark.svg`: rounded tile, for sheets and docs.
- `logo/github-app.svg` → `github-app.png` (1024): the GitHub App logo. GitHub draws it at 55% of a round badge, so the mark fills the tile and the badge color is `#3B2BFF`.
- `logo/app-icon.svg` → `app-icon.png` (1024), `site/public/apple-touch-icon.png` (180) and `icon-512.png`, all full bleed; iOS and GitHub round them.
- `logo/mark.svg`, `mark-dark.svg`, `mark-16.svg`, `mark-16-dark.svg`: the rails.
- `logo/favicon.svg`: the rails, picking the 16px drawing when drawn at 24px or less, and following the system theme.

**On file, 3 · auto over fork on paper.** Bassim, Oct 13: "keep 3 in our back pocket, different colors fit well still." The same set in `logo/alt/`, handing off to the branch at 32 and 16.

Clear space: a quarter of the icon on every side; the wordmark's x-height around the wordmark. Minimum: 16px icon, 14px wordmark height. The icon is the name, so never set it beside the wordmark.

`logo-sheet.html` → `logo-sheet.png` shows the whole set in both themes. The round 4 proposals are in `icons/` (`proposals.html`, drawn by `icons/gen.mjs` from the same `logo/icon.mjs`).

## Files

```
brand/
├ BRAND.md            this
├ logo/               wordmark, icon set, alt/ (icon 3), icon.mjs (the drawings), gen.mjs
├ icons/              round 4 proposals
├ fonts/              Host Grotesk, Fragment Mono (OFL)
├ readme/             header-{light,dark}.html → .png (1676×600, 2x of GitHub's 838 column)
├ social-preview.png  GitHub social preview, 1280×640, from site/og.html
└ directions/         earlier rounds
site/og.html          → site/public/og.png, 1200×630
```

Rebuild everything from `brand/`: `bun run logo` (SVGs and icon PNGs), `bun run og`, `bun run readme`. The app (`autofork-app/public/`) and the engine README (`autofork/assets/`) take copies of `favicon.svg`, the two icon PNGs and the README headers.
