import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { EVERY, isEvery, LIMITS, workflow } from "@autofork/contract";
import type { Every } from "@autofork/contract";

import { compare } from "../build/compare.ts";
import type { Config } from "../config/types.ts";
import { writeConfig } from "../config/write.ts";
import { AutoforkError } from "../failure.ts";
import { configFile, DIR, OWN_WORKFLOW, WORKFLOWS } from "../layout.ts";
import { addNote, NOTE } from "../patches/note.ts";
import { say } from "../platform/action.ts";
import { site } from "../platform/env.ts";
import { git, workingTree } from "../platform/git.ts";
import { githubRepo, origin } from "../platform/github.ts";
import { has, isObject, isText, parseJson } from "../platform/json.ts";
import { run } from "../platform/process.ts";
import { baseline, fetchUpstream } from "../upstream/fetch.ts";
import { defaultBranch, defaultFollow, parseFollow } from "../upstream/follow.ts";
import { flag } from "./args.ts";

export interface Chosen {
  follow?: string | undefined;
  setup?: string | undefined;
  generated?: string[] | undefined;
  verify?: string | undefined;
  every?: Every | undefined;
}

const KEEPS_ID_TOKEN = /^\s*(?:id-token:\s*['"]?write|permissions:\s*['"]?write-all)/mu;

const commandFlag = (args: string[], name: string) => {
  const command = flag(args, name);

  return command === "" ? undefined : command;
};

export const options = (args: string[]): Chosen => {
  const setup = commandFlag(args, "--setup");
  const generated = flag(args, "--generated")?.split(",");

  if (generated !== undefined && setup === undefined) {
    throw new AutoforkError("--generated files are rebuilt by --setup, so set it too");
  }

  const asked = flag(args, "--every");
  const every = asked !== undefined && isEvery(asked) ? asked : undefined;

  if (args.includes("--every") && every === undefined) {
    throw new AutoforkError(
      `--every takes ${Object.keys(EVERY).join(", ")}, not ${asked ?? "nothing"}`,
    );
  }

  return {
    follow: flag(args, "--follow"),
    setup,
    generated,
    verify: commandFlag(args, "--verify"),
    every,
  };
};

const privacyOf = (root: string, every: Every | undefined) => {
  const repo = every === undefined ? origin(root) : "";

  const asked =
    repo === "" ? undefined : run("gh", ["api", `repos/${repo}`, "--jq", ".private"], root);

  return {
    asked: asked !== undefined,
    answer: asked?.ok === true ? asked.out.toString().trim() : undefined,
  };
};

const writeWorkflow = (root: string, upstream: string, every: Every | undefined) => {
  const file = path.join(root, OWN_WORKFLOW);

  mkdirSync(path.join(root, WORKFLOWS), { recursive: true });

  if (existsSync(file)) {
    if (every !== undefined || !KEEPS_ID_TOKEN.test(readFileSync(file, "utf-8"))) {
      say(
        `Kept your ${OWN_WORKFLOW} as it is: its cron line is the schedule, and spend reporting needs \`id-token: write\` in its permissions.`,
      );
    }

    return;
  }

  const { asked, answer } = privacyOf(root, every);
  const hourly = asked && answer !== "false";

  if (hourly) {
    say(
      `${answer === "true" ? "This repo is private" : "Couldn't tell whether this repo is private"}, and a private repo's scheduled runs bill Actions minutes, so it checks hourly (--every 1h).`,
    );
  }

  writeFileSync(
    file,
    workflow({
      branch: git(root, "branch", "--show-current") || defaultBranch(root, upstream),
      cron: EVERY[every ?? (hourly ? "1h" : "15m")],
      site,
      workflowTokens: false,
    }),
  );
};

const tellWhatItFollows = (upstream: string, follow: string, chosen: boolean) => {
  if ("branch" in parseFollow(follow)) {
    say(
      `autofork follows ${upstream}'s ${follow} branch${chosen ? "" : ", since it has no releases"}.`,
    );
  } else {
    say(`autofork follows ${upstream}'s ${follow === "releases" ? "" : `${follow} `}releases.`);
  }
};

const inheritedWorkflows = (root: string, base: string) => {
  const upstreamHas = new Set(
    git(root, "ls-tree", "-r", "--name-only", base, "--", WORKFLOWS).split("\n"),
  );

  return git(root, "ls-files", WORKFLOWS)
    .split("\n")
    .filter((file) => file !== "" && upstreamHas.has(file) && !file.endsWith("/autofork.yml"));
};

export const setup = async (root: string, upstream: string, { every, ...chosen }: Chosen) => {
  if (existsSync(configFile(root))) {
    throw new AutoforkError(`${DIR}/config.json already exists`);
  }

  const follow = chosen.follow ?? (await defaultFollow(root, upstream));
  const config: Config = { ...chosen, upstream, follow, limits: LIMITS };

  await fetchUpstream(root, config);
  const base = baseline(root);

  writeConfig(root, config);
  writeWorkflow(root, upstream, every);
  const { drift } = await compare(root, { ...config, patches: [] }, workingTree(root), base);
  const readme = addNote(root, upstream, base, drift);
  const inherited = inheritedWorkflows(root, base);

  tellWhatItFollows(upstream, follow, chosen.follow !== undefined);

  if (inherited.length > 0) {
    say(
      `Your fork has ${inherited.length} workflow${inherited.length === 1 ? "" : "s"} copied from upstream, and they run here too. Delete the ones you don't want. autofork leaves workflows to you: it never copies upstream's new ones in, and when upstream changes one you keep, the sync's agent brings that into your copy, or opens an issue when the workflow's token can't push workflow files.`,
    );
  }

  if (readme !== undefined) {
    say(
      `The first sync adds a line to ${readme} saying this is a personal fork kept current by autofork. To skip it, delete ${DIR}/${NOTE}/.`,
    );
  }

  if (drift.length > 0) {
    say(
      `Your branch already changes ${drift.length} file${drift.length === 1 ? "" : "s"}. Save them as a patch: write ${DIR}/<id>/PATCH.md, then autofork save <id>`,
    );
  }
};

const ghApi = (root: string, ...args: string[]) => {
  const result = run("gh", ["api", ...args], root);

  return result.ok ? parseJson(result.out.toString(), isObject) : undefined;
};

const forkOn = (root: string, repo: string) => {
  const answer = ghApi(root, `repos/${repo}`);

  return has(answer, "fork", (fork) => fork === true)
    ? {
        parent: has(answer, "parent", (parent) => has(parent, "full_name", isText))
          ? answer.parent.full_name
          : undefined,
        description: has(answer, "description", isText) ? answer.description.trim() : "",
        login: has(answer, "owner", (owner) => has(owner, "login", isText))
          ? answer.owner.login
          : "",
      }
    : undefined;
};

const ownerName = (root: string, login: string) => {
  const owner = ghApi(root, `users/${login}`);
  const name = has(owner, "name", isText) ? owner.name.trim() : undefined;
  const called = has(owner, "type", (type) => type === "User") ? name?.split(/\s+/u)[0] : name;

  return called === undefined || called === "" ? login : called;
};

export const claim = (root: string, upstream: string) => {
  const repo = origin(root);
  const fork = repo === "" ? undefined : forkOn(root, repo);

  if (fork === undefined) {
    return;
  }

  run("gh", ["api", "-X", "PUT", `repos/${repo}/actions/permissions`, "-F", "enabled=true"], root);
  run("gh", ["repo", "edit", repo, "--enable-issues"], root);

  if (fork.parent?.toLowerCase() !== githubRepo(upstream)?.toLowerCase()) {
    return;
  }

  if (/autofork/iu.test(fork.description)) {
    return;
  }

  const who = ownerName(root, fork.login);

  ghApi(
    root,
    "-X",
    "PATCH",
    `repos/${repo}`,
    "-f",
    `description=${[`${who}'s autofork`, fork.description].filter(Boolean).join(" · ")}`,
  );
};
