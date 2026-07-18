# Contributing

Contributions and ideas are welcome. PATCH.md is an early draft, and proposals that improve the standard, its wording, its conventions, or its examples are just as valuable as code. Open an [issue](https://github.com/AVGVSTVS96/patch_md-spec/issues) to discuss an idea, or a PR if you already have a change in mind.

## Repo layout

The spec has a single source of truth: [`apps/website/src/spec.mdx`](apps/website/src/spec.mdx), rendered directly on the [website](https://patchmd.vercel.app). The README's spec section (between the `spec:start` and `spec:end` markers) is generated from it by `scripts/gen-readme.mjs`, so edit the source file, never that region of the README. Regeneration happens automatically on commit via the pre-commit hook, or manually with:

```bash
vp run gen-readme
```

Everything outside the markers (intro, footer) is hand-written and freely editable.

## Development

This is a Vite+ monorepo, managed with the `vp` CLI:

```bash
vp install      # install dependencies
vp run dev      # run the website dev server
vp run ready    # format, lint, type check, test, build
```
