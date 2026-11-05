import { AutoforkError } from "../failure.ts";
import { say } from "../platform/action.ts";
import { origin } from "../platform/github.ts";
import { codexHint, FORK_OPTIONS, LINK_HINT } from "./messages.ts";
import { claim, options, setup } from "./setup.ts";

export const init = async (root: string, args: string[]) => {
  const [upstream] = args;

  if (upstream === undefined || upstream === "") {
    throw new AutoforkError(`usage: autofork init <owner/repo | git url> ${FORK_OPTIONS}`);
  }

  await setup(root, upstream, options(args));
  claim(root, upstream);
  const mine = origin(root);
  const repo = mine === "" ? "" : ` --repo ${mine}`;

  say(
    `Add a CLAUDE_CODE_OAUTH_TOKEN secret (claude setup-token prints one), commit, and push. If you pushed before the secret was set, start the first sync by hand: gh workflow run autofork.yml${repo}. ${codexHint(repo)}`,
  );
  say(LINK_HINT);
};
