import type { Config } from "../config/types.ts";
import { AutoforkError } from "../failure.ts";
import { sourcePaths } from "../layout.ts";
import { git } from "../platform/git.ts";
import { run } from "../platform/process.ts";
import { latestRelease, NO_FOLLOW_HINT, parseFollow, upstreamUrl } from "./follow.ts";

const SYNC_SUBJECT = /^auto(?:fork|patch): sync .+ to (?<sha>[0-9a-f]{7,40})$/u;

export const fetchUpstream = async (root: string, { upstream, follow }: Config) => {
  const url = upstreamUrl(upstream);
  const followed = parseFollow(follow);

  const tag =
    "branch" in followed ? undefined : await latestRelease(root, upstream, followed.channel);

  if (!("branch" in followed) && tag === undefined) {
    throw new AutoforkError(
      `${url} has no releases${followed.channel ? ` matching ${follow}` : ""}. ${NO_FOLLOW_HINT}`,
    );
  }

  const ref = "branch" in followed ? `refs/heads/${followed.branch}` : `refs/tags/${tag}`;

  git(
    root,
    "fetch",
    "--quiet",
    "--no-tags",
    url,
    `+${ref}:refs/autofork/upstream`,
    "+HEAD:refs/autofork/branch",
  );

  return { tip: git(root, "rev-parse", "refs/autofork/upstream^{commit}"), tag };
};

export const lastSync = (root: string) => {
  const subjects = git(
    root,
    "log",
    "--first-parent",
    "--format=%s",
    "-E",
    "--grep=^auto(fork|patch): sync ",
    "HEAD",
  ).split("\n");

  let last: ReturnType<typeof run> | undefined;

  for (const subject of subjects) {
    const synced = SYNC_SUBJECT.exec(subject)?.groups?.sha;

    last =
      synced === undefined
        ? undefined
        : run("git", ["rev-parse", "--verify", "--quiet", `${synced}^{commit}`], root);

    if (last?.ok === true) {
      break;
    }
  }

  return last?.ok === true ? last : undefined;
};

export const baseline = (root: string) => {
  const base = lastSync(root) ?? run("git", ["merge-base", "HEAD", "refs/autofork/branch"], root);

  if (!base.ok) {
    throw new AutoforkError("this branch shares no history with upstream");
  }

  return base.out.toString().trim();
};

export const syncTarget = (root: string, config: Config, base: string, candidate: string) => {
  const candidateIsBehind =
    candidate !== base && run("git", ["merge-base", "--is-ancestor", candidate, base], root).ok;

  const forkHasHistory =
    lastSync(root) !== undefined ||
    !run("git", ["diff", "--quiet", base, "HEAD", "--", ...sourcePaths(config)], root).ok;

  return candidateIsBehind && forkHasHistory ? base : candidate;
};
