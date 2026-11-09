import { AutoforkError } from "../failure.ts";
import { say } from "../platform/action.ts";
import { origin } from "../platform/github.ts";
import { claudeSteps, codexHint, FORK_OPTIONS, LINK_HINT } from "./messages.ts";
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
    `Commit and push, then give the fork a Claude sign-in and start its first sync:\n${claudeSteps(repo)}\n${codexHint(repo)}`,
  );
  say(LINK_HINT);
};
