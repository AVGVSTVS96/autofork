import { AutoforkError } from "../failure.ts";
import { say } from "../platform/action.ts";
import { origin } from "../platform/github.ts";
import { FORK_OPTIONS, LINK_HINT, signIn } from "./messages.ts";
import { claim, options, parentOf, setup } from "./setup.ts";

export const init = async (root: string, args: string[]) => {
  const [named = ""] = args;
  const upstream = named === "" || named.startsWith("-") ? parentOf(root) : named;

  if (upstream === undefined) {
    throw new AutoforkError(
      `couldn't tell this fork's upstream from GitHub, so name it: autofork init <owner/repo | git url> ${FORK_OPTIONS}`,
    );
  }

  const drift = await setup(root, upstream, options(args));
  claim(root, upstream);
  const mine = origin(root);

  say(`${drift.length > 0 ? "Then commit" : "Commit"} and push, and the fork follows upstream.`);
  say(signIn(mine === "" ? "" : ` --repo ${mine}`));
  say(LINK_HINT);
};
