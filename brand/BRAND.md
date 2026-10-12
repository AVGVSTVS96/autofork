# autopatch · brand

**The idea in a sentence:** the page is a diff. autopatch's whole job is to keep one `+` alive on top of someone else's code, so the brand is built from the unified diff itself: the red `-` row and the green `+` row, set big.

## Why this direction (picked without a round, for a same-day ship)

Three directions were drawn (`logo/explore-*.svg`):

- **A, the hunk:** a red `-` block over a green `+` block. Poppy at 16px, but the green block with a white cross reads as a pharmacy sign, and it outweighed the wordmark.
- **B, the minus-plus sign (picked):** `∓`, a red minus over a green plus. It's the order a diff reads in (old line out, new line in), it's one glyph tall like a letter, and it holds up at 16px as two bars and a cross. It's also exactly what a heal is: a stale line replaced.
- **C, the stack:** patches as bars on an upstream baseline. True to the quilt model, but reads as a generic "layers" icon.

The page system follows from B. Big type sits in real diff rows, so the hero is literally a two-line hunk: a context line (`Fork anything.`) and an added line (`Keep your changes.`). Nothing on the page is a picture of a diff when it could be a diff.

Distinct from hex (poppy blocks, hard shadows) and commonplace (paper, one red pen): autopatch is white or near-black like a diff viewer, three colors that each mean what they mean in `git diff`, and a heavy mono display face.

## Personality

- **Plain.** Says what happened: which upstream commit, which patch, what the agent rewrote, whether verify passed.
- **Real runs only.** Every SHA, line count and log line on the site comes from a real run or a real fork. Examples that didn't happen are labeled "example".
- **Git first.** The model is the exception path, so the visuals show git doing the work and the agent showing up once.

## The visual system

### Type: Commit Mono + Instrument Sans (both OFL)

- **Commit Mono** 400 and 700 (Eigil Nikolajsen). The display face and everything the computer says. A mono called Commit, setting a tool that writes commits. Display at 700, `letter-spacing: -0.045em`, line-height ~1.12, inside diff rows. Code and labels at 400, 13 to 14px. Ligatures off. Subset to Latin, arrows, box drawing, `✓ ✗` (`fonts/commit-mono-{400,700}.woff2`, ~24 KB each). It has no `↗` and no `∓`; the mark is drawn, never typed.
- **Instrument Sans** (variable) for what a person says: section headlines at 600, `-0.025em`, body 17px/1.55.

### Color: the diff's own three

| token | light | dark | means |
| --- | --- | --- | --- |
| `--bg` | `#FBFBFA` | `#0B0D0C` | the page, a diff viewer's field |
| `--bg-2` | `#F2F3F1` | `#131615` | file trees, inline code |
| `--ink` | `#101312` | `#E9ECEA` | text, 1px rules on the primary thing |
| `--ink-2` | `#4A514E` | `#A9B1AD` | prose, context lines |
| `--ink-3` | `#646B68` | `#8B938F` | labels, footnotes |
| `--add-sign` | `#1C9A50` | `#2DB566` | `+`, the mark's plus, the picked commit |
| `--add` | `#16753F` | `#4CCC7F` | green text (passes 4.5:1) |
| `--add-bg` | `#E1F5E7` | `#10301D` | added rows |
| `--del-sign` | `#D7402C` | `#EC5A45` | `-`, the mark's minus |
| `--del` | `#C13A28` | `#F2735F` | red text |
| `--del-bg` | `#FDE8E4` | `#221110` | removed rows |
| `--hunk` | `#1D64A8` | `#6CB4F0` | the agent: heal marks and icons |
| `--hunk-bg` | `#E5F0FA` | `#0F1D2A` | behind the agent's icons |
| `--panel` | `#FFFFFF` | `#121514` | cards |

Rule: **green means it's yours and it's alive; red means upstream made it stale or it was dropped; blue means the agent.** Never decoration. In dark, the removed row is darker than the added row on purpose: same-lightness red and green bands side by side fight.

### Grid

8px base, page max 74rem, gutters `clamp(1rem, 4vw, 3rem)`. Hero diff rows bleed to the gutter edge. Sections are split by hairlines, never by background color. Square corners, no shadows. 1px `--ink` border only on the primary thing in view (the hero command, the top rule of a list).

### Motifs

1. **The diff row.** `-`/`+`/context in a 2-char gutter, tinted row, mono. Used at display size in the hero and OG, at 13px in panels.
2. **The real run.** A real heal as a product UI: what happened, one line per step, with the agent's own words quoted. No SHAs on the page.
3. **Cards.** Code, files and runs sit on `--panel` (white in light, a step above the field in dark) with a hairline border, so the page reads finished, not wireframe.

The blue hunk band over the hero was retired on Oct 12: three stacked bands (blue, field, green) read as stripes, and its SHAs read as a log. The hero is the two rows alone, in the site, the OG image and the README header.

### Motion

The added hero row lands once (a left-to-right clip, 320ms, after 600ms), like a line being written. Nothing loops. `prefers-reduced-motion` turns it off.

## Logo

`logo/autopatch.svg`, `logo/autopatch-dark.svg`, `logo/autopatch-mono.svg` (`currentColor`), `logo/mark.svg`, `logo/mark-dark.svg`, `logo/favicon.svg` (16px grid, follows the theme), `logo/app-icon.svg` (ink tile, for the apple-touch and 512 icons). All from `bun logo/gen.mjs`, which reads Commit Mono 700 from `logo/ttf/`.

Clear space: the mark's width on every side. Minimum: 16px mark, 14px wordmark height.

## Files

```
brand/
├ BRAND.md            this
├ logo/               wordmark, mark, favicon, app icon, explorations, gen.mjs
├ fonts/              Commit Mono 400/700 subsets (OFL), Instrument Sans variable
├ readme/             header-{light,dark}.html → header-{light,dark}.png (1676 wide, 2x of 838)
├ social-preview.png  GitHub social preview, 1280×640, from site/og.html
└ launch-visual.html  → launch-visual.png, 1600×900, the real T3 Code run
site/og.html          → site/public/og.png, 1200×630
```
