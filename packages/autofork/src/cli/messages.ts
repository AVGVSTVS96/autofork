export const signIn = (repo: string) =>
  `An agent builds new patches and the ones upstream breaks. Give it a Claude sign-in:
  claude setup-token
  gh secret set CLAUDE_CODE_OAUTH_TOKEN${repo}
or a ChatGPT one, with device code login on in ChatGPT's security settings:
  sh -c 'd=$(mktemp -d) && trap "rm -rf \\"\\$d\\"" EXIT && CODEX_HOME="$d" codex login --device-auth && gh secret set CODEX_AUTH${repo} < "$d/auth.json"'`;

export const LINK_HINT =
  "To sync on time, and keep a ChatGPT sign-in working past a week: npx autofork link";

export const FORK_OPTIONS =
  "[--follow <releases | channel | branch>] [--setup <command>] [--generated <files>] [--verify <command>] [--every <5m | 15m | 1h | 1d>]";

export const USAGE = `autofork: Customized forks that maintain themselves.
Personal forks of open-source apps that auto-track upstream.

Usage:
  autofork fork <owner/repo>    fork it on GitHub, set it up and push
  autofork init [owner/repo]    set up a fork you already have, from inside it
  autofork save <id>            save your changes as the patch in .autofork/<id>
  autofork status               your patches, and changes no patch holds yet
  autofork sync                 rebuild on upstream; an agent heals what breaks
  autofork link                 have autofork.com start its syncs on time

Options for fork and init:
  --follow <what>               releases (upstream's Latest), a channel of them
                                by tag, like 'v*-nightly.*', or a branch.
                                Default: releases, or the default branch if
                                upstream has none
  --setup <command>             the command that installs dependencies
  --generated <files>           files setup writes, like lockfiles, comma
                                separated: rebuilt by setup, never patched
  --verify <command>            the command that checks a build
  --every <5m|15m|1h|1d>        how often GitHub's timer checks upstream.
                                Default: 15m, or 1h when the repo is private

A patch is .autofork/<id>/PATCH.md, saying what the change does and why, next
to <id>.patch, the diff. https://github.com/AVGVSTVS96/autofork
`;
