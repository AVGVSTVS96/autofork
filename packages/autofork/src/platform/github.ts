import { githubToken } from "./env.ts";
import { run } from "./process.ts";

export const githubApi = async (route: string) =>
  await fetch(`https://api.github.com/${route}`, {
    headers: {
      accept: "application/vnd.github+json",
      ...(githubToken === undefined ? undefined : { authorization: `Bearer ${githubToken}` }),
    },
  });

export const githubRepo = (upstream: string) =>
  /^(?:https:\/\/github\.com\/)?(?<repo>[\w.-]+\/[\w.-]+?)(?:\.git)?$/u.exec(upstream)?.groups
    ?.repo;

const ORIGIN = /(?:^|[@/.])github\.com(?::\d+)?[/:](?<repo>[\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/u;

export const origin = (root: string) => {
  for (const args of [
    ["remote", "get-url", "origin"],
    ["config", "--get", "remote.origin.url"],
  ]) {
    const repo = ORIGIN.exec(run("git", args, root).out.toString().trim())?.groups?.repo;

    if (repo !== undefined) {
      return repo;
    }
  }

  return "";
};
