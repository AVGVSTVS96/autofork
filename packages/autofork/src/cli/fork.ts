import path from "node:path";

import { AutoforkError } from "../failure.ts";
import { DIR, OWN_WORKFLOW } from "../layout.ts";
import { say } from "../platform/action.ts";
import { claudeToken } from "../platform/env.ts";
import { git } from "../platform/git.ts";
import { origin } from "../platform/github.ts";
import { run } from "../platform/process.ts";
import { codexHint, FORK_OPTIONS, LINK_HINT } from "./messages.ts";
import { claim, options, setup } from "./setup.ts";

const OWNER_REPO = /^[\w.-]+\/(?<name>[\w.-]+)$/u;

const secretSet = (root: string, repo: string) =>
  claudeToken !== undefined &&
  run(
    "gh",
    ["secret", "set", "CLAUDE_CODE_OAUTH_TOKEN", "--repo", repo, "--body", claudeToken],
    root,
  ).ok;

export const fork = async (cwd: string, args: string[]) => {
  const [upstream = ""] = args;
  const name = OWNER_REPO.exec(upstream)?.groups?.name;

  if (name === undefined) {
    throw new AutoforkError(`usage: autofork fork <owner/repo> ${FORK_OPTIONS}`);
  }

  const chosen = options(args);

  if (!run("gh", ["repo", "fork", upstream, "--clone", "--default-branch-only"], cwd).ok) {
    throw new AutoforkError("gh couldn't fork it. Is the GitHub CLI installed and logged in?");
  }

  const root = path.join(cwd, name);

  await setup(root, upstream, chosen);
  claim(root, upstream);
  const repo = origin(root);
  const secret = secretSet(root, repo);

  git(root, "add", DIR, OWN_WORKFLOW);
  git(root, "commit", "--quiet", "-m", `autofork: follow ${upstream}`);
  git(root, "push", "--quiet");
  say(
    `${repo} now keeps itself current with ${upstream}. It's cloned in ./${path.basename(root)}.`,
  );

  if (!secret) {
    say(
      `Last step: run claude setup-token, then gh secret set CLAUDE_CODE_OAUTH_TOKEN --repo ${repo}, then start its first sync: gh workflow run autofork.yml --repo ${repo}. ${codexHint(` --repo ${repo}`)}`,
    );
  }

  say(LINK_HINT.replace("npx", `cd ${path.basename(root)} && npx`));
};
