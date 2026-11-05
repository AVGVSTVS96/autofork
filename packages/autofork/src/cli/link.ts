import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import type { LinkAsk } from "@autofork/contract";

import { AutoforkError } from "../failure.ts";
import { DIR } from "../layout.ts";
import { say } from "../platform/action.ts";
import { site } from "../platform/env.ts";
import { origin } from "../platform/github.ts";
import { has, isObject, readBody } from "../platform/json.ts";
import { run } from "../platform/process.ts";

const OPENERS = new Map<string, string>([
  ["darwin", "open"],
  ["win32", "explorer"],
]);

const POLL = 3000;

const WAIT = 600_000;

const answerOf = async (response: Response) => {
  if (!response.ok && response.status < 500 && response.status !== 429) {
    throw new AutoforkError(
      `${site}/api/link answered ${response.status}: ${await response.text()}`,
    );
  }

  const answer = response.ok ? await readBody(response, isObject) : undefined;

  return answer === undefined ? undefined : has(answer, "linked", (value) => value === true);
};

const linked = async (ask: LinkAsk) => {
  let answer: boolean | undefined;

  try {
    answer = await answerOf(
      await fetch(`${site}/api/link`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(ask),
        signal: AbortSignal.timeout(10_000),
      }),
    );
  } catch (error) {
    if (error instanceof AutoforkError) {
      throw error;
    }
  }

  return answer;
};

const linkedBefore = async (ask: LinkAsk, deadline: number): Promise<boolean> => {
  if (Date.now() >= deadline) {
    return false;
  }

  await sleep(POLL);

  return await ((await linked(ask)) === true || linkedBefore(ask, deadline));
};

const openInBrowser = (page: string) => {
  spawn(OPENERS.get(process.platform) ?? "xdg-open", [page], { detached: true, stdio: "ignore" })
    // oxlint-disable-next-line no-empty-function -- the page's address is printed above, so a browser that won't open needs nothing more
    .on("error", () => {})
    .unref();
};

export const link = async (root: string) => {
  const [owner = "", name] = origin(root).split("/");

  if (name === undefined || name === "") {
    throw new AutoforkError("run autofork link inside a clone of your fork on GitHub");
  }

  const ask = { owner, name } satisfies LinkAsk;
  const now = await linked(ask);

  if (now === undefined) {
    throw new AutoforkError(`can't reach ${site}, try again in a minute`);
  }

  if (!now) {
    const fetched = run("git", ["fetch", "--quiet", "origin", "HEAD"], root);

    if (!fetched.ok) {
      throw new AutoforkError(`can't fetch ${owner}/${name}: ${fetched.err}`);
    }

    if (!run("git", ["cat-file", "-e", `FETCH_HEAD:${DIR}/config.json`], root).ok) {
      throw new AutoforkError(`push ${DIR}/config.json to ${owner}/${name}'s default branch first`);
    }

    const page = `${site}/link/${owner}/${name}`;

    say(`finish linking in your browser: ${page}`);
    openInBrowser(page);

    if (!(await linkedBefore(ask, Date.now() + WAIT))) {
      throw new AutoforkError(`not linked yet: finish at ${page}, then run autofork link again`);
    }
  }

  say("linked: autofork.com starts it within a minute of upstream changing.");
};
