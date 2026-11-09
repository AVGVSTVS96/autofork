import { AutoforkError } from "../failure.ts";
import { say } from "../platform/action.ts";
import { origin } from "../platform/github.ts";
import { claudeSteps, codexHint, firstSync, FORK_OPTIONS, LINK_HINT } from "./messages.ts";
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
    `Give the fork a Claude sign-in (paste the token setup-token prints), then commit and push:\n${claudeSteps(repo)}\nIf you pushed before the secret was set, start the first sync by hand:\n${firstSync(repo)}\n${codexHint(repo)}`,
  );
  say(LINK_HINT);
};
