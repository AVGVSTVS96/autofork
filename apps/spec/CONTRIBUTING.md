# Contributing

Contributions and ideas are welcome. PATCH.md is an early draft, and proposals that improve the standard, its wording, its conventions, or its examples are just as valuable as code. Open an [issue](https://github.com/AVGVSTVS96/patch_md-spec/issues) to discuss an idea, or a PR if you already have a change in mind.

## Repo layout

The spec itself lives in [`apps/website/src/spec.mdx`](apps/website/src/spec.mdx) and is rendered on the [website](https://patchmd.vercel.app). The README mirrors the same content, so a change to the spec should update both.

## Development

This is a Vite+ monorepo, managed with the `vp` CLI:

```bash
vp install      # install dependencies
vp run dev      # run the website dev server
vp run ready    # format, lint, type check, test, build
```
