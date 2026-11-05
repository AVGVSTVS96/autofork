import { DIR } from "../layout.ts";
import { say } from "../platform/action.ts";
import { git } from "../platform/git.ts";
import { githubApi, githubRepo } from "../platform/github.ts";
import { has, isBoolean, isObject, isText, readBody } from "../platform/json.ts";
import { run } from "../platform/process.ts";

export type Follow = { branch: string } | { channel?: RegExp };

interface Release {
  tag_name: string;
  draft: boolean;
  published_at: string;
}

const isRelease = (value: unknown): value is Release =>
  has(value, "tag_name", isText) &&
  has(value, "draft", isBoolean) &&
  has(value, "published_at", isText);

const isReleases = (value: unknown): value is unknown[] => Array.isArray(value);

const isTagged = (value: unknown): value is { tag_name: string } => has(value, "tag_name", isText);

export const NO_FOLLOW_HINT = `Follow a branch or another channel instead: set "follow" in ${DIR}/config.json`;

export const upstreamUrl = (upstream: string) =>
  /^[\w.-]+\/[\w.-]+$/u.test(upstream) ? `https://github.com/${upstream}.git` : upstream;

export const parseFollow = (follow: string): Follow => {
  if (follow === "releases") {
    return {};
  }

  if (!follow.includes("*")) {
    return { branch: follow };
  }

  const escaped = follow.split("*").map((part) => part.replaceAll(/[.+?^${}()|[\]\\]/gu, "\\$&"));

  return { channel: new RegExp(`^${escaped.join(".*")}$`, "u") };
};

const readReleases = async (repo: string, route: string) => {
  let body: object | undefined;

  try {
    const response = await githubApi(`repos/${repo}/${route}`);

    body = response.ok ? await readBody(response, isObject) : undefined;

    if (!response.ok && response.status !== 404) {
      say(`can't read ${repo}'s releases (${response.status}), using its newest version tag`);
    }
  } catch {
    say(`can't reach GitHub for ${repo}'s releases, using its newest version tag`);
  }

  return body;
};

const releases = async (upstream: string, route: string) => {
  const repo = githubRepo(upstream);

  return repo === undefined ? undefined : await readReleases(repo, route);
};

const publishedOn = async (upstream: string, channel: RegExp) => {
  const listed = await releases(upstream, "releases?per_page=100");

  return (isReleases(listed) ? listed : [])
    .filter((release) => isRelease(release))
    .filter((release) => !release.draft && channel.test(release.tag_name))
    .toSorted((a, b) => b.published_at.localeCompare(a.published_at))[0]?.tag_name;
};

const newestTag = (root: string, upstream: string, channel?: RegExp) =>
  git(root, "ls-remote", "--tags", "--refs", "--sort=-v:refname", upstreamUrl(upstream))
    .split("\n")
    .map((line) => line.split("\t")[1]?.replace("refs/tags/", ""))
    .find(
      (tag) =>
        tag !== undefined && tag !== "" && (channel ? channel.test(tag) : !tag.includes("-")),
    );

const latestPublished = async (upstream: string) => {
  const latest = await releases(upstream, "releases/latest");

  return isTagged(latest) ? latest.tag_name : undefined;
};

export const latestRelease = async (root: string, upstream: string, channel?: RegExp) => {
  const published = channel
    ? await publishedOn(upstream, channel)
    : await latestPublished(upstream);

  return published !== undefined && published !== ""
    ? published
    : newestTag(root, upstream, channel);
};

export const defaultBranch = (root: string, upstream: string) => {
  const head = run(
    "git",
    ["ls-remote", "--symref", upstreamUrl(upstream), "HEAD"],
    root,
  ).out.toString();

  return /^ref: refs\/heads\/(?<branch>\S+)\s+HEAD/mu.exec(head)?.groups?.branch ?? "main";
};

export const defaultFollow = async (root: string, upstream: string) =>
  (await latestRelease(root, upstream)) === undefined ? defaultBranch(root, upstream) : "releases";
