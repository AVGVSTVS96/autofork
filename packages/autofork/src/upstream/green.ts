import type { Config } from "../config/types.ts";
import { say } from "../platform/action.ts";
import { git, short } from "../platform/git.ts";
import { githubApi, githubRepo } from "../platform/github.ts";
import { has, isNumber, isText, readBody } from "../platform/json.ts";
import { parseFollow } from "./follow.ts";

const RED = new Set(["failure", "timed_out", "action_required", "startup_failure"]);

interface CheckRun {
  conclusion: string | null;
}

interface CheckRuns {
  total_count: number;
  check_runs: CheckRun[];
}

const isConclusion = (value: unknown): value is string | null => value === null || isText(value);

const isCheckRun = (value: unknown): value is CheckRun => has(value, "conclusion", isConclusion);

const isCheckRunList = (value: unknown): value is CheckRun[] =>
  Array.isArray(value) && value.every(isCheckRun);

const isCheckRuns = (value: unknown): value is CheckRuns =>
  has(value, "total_count", isNumber) && has(value, "check_runs", isCheckRunList);

const passedFrom = async (
  repo: string,
  sha: string,
  page: number,
  read: number,
): Promise<boolean | undefined> => {
  const response = await githubApi(
    `repos/${repo}/commits/${sha}/check-runs?per_page=100&page=${page}`,
  );

  const runs = response.ok ? await readBody(response, isCheckRuns) : undefined;

  if (runs === undefined) {
    say(`can't read upstream checks (${response.status}), using upstream's tip`);

    return undefined;
  }

  if (
    runs.check_runs.some(
      ({ conclusion }) => conclusion === null || conclusion === "" || RED.has(conclusion),
    )
  ) {
    return false;
  }

  const total = read + runs.check_runs.length;

  return runs.check_runs.length === 0 || total >= runs.total_count
    ? true
    : await passedFrom(repo, sha, page + 1, total);
};

const firstGreen = async (
  repo: string,
  [sha, ...older]: string[],
): Promise<string | undefined | false> => {
  if (sha === undefined) {
    return false;
  }

  const passed = await passedFrom(repo, sha, 1, 0);

  if (passed === undefined) {
    return undefined;
  }

  return passed ? sha : await firstGreen(repo, older);
};

export const newestGreen = async (root: string, config: Config, base: string, tip: string) => {
  const repo = githubRepo(config.upstream);

  if (config.green === false || !("branch" in parseFollow(config.follow)) || repo === undefined) {
    return tip;
  }

  const commits = git(root, "rev-list", "--first-parent", "--max-count=30", `${base}..${tip}`)
    .split("\n")
    .filter(Boolean);

  if (commits.length === 0) {
    return tip;
  }

  const green = await firstGreen(repo, commits);

  if (green === undefined) {
    return tip;
  }

  if (green === false) {
    say(`no newer upstream commit has passed its checks yet, staying on ${short(base)}`);

    return base;
  }

  if (green !== tip) {
    say(`upstream's tip isn't green yet, using ${short(green)}`);
  }

  return green;
};
