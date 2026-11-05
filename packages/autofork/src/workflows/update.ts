import { runAgent } from "../agent/run.ts";
import type { Build } from "../build/types.ts";
import type { Fork } from "../config/types.ts";
import { AutoforkError, NoRoomError } from "../failure.ts";
import { OWN_WORKFLOW, WORKFLOWS } from "../layout.ts";
import { say } from "../platform/action.ts";
import { git, reset } from "../platform/git.ts";
import { run } from "../platform/process.ts";

export const workflowsBehind = (root: string, since: string, source: string) => {
  const files = (...args: string[]) =>
    git(root, "diff", "--name-only", "--no-renames", ...args, "--", WORKFLOWS).split("\n");

  const upstreamChanged = new Set(files(since, source));

  return files("--diff-filter=MD", "HEAD", source).filter(
    (file) => file !== "" && upstreamChanged.has(file),
  );
};

const updatePrompt = (upstream: string, files: string[], range: string) =>
  `You are keeping a patched fork of ${upstream} in sync. The workflows in ${WORKFLOWS}/ are the fork's own copies, and upstream changed ${files.join(", ")}: git diff ${range} -- ${WORKFLOWS}

Bring into this fork's copies what it needs from those changes, and keep what the fork does differently. Add a workflow only where upstream split or renamed one the fork keeps. Only what you change in ${WORKFLOWS}/ is kept, except autofork.yml, and the sync commits it.`;

const workflowAgent = async (config: Fork, build: Build, prompt: string) => {
  let ran: boolean | undefined;

  try {
    ran = await runAgent(config, build.dir, "workflow update", prompt);
  } catch (error) {
    if (!(error instanceof AutoforkError)) {
      throw error;
    }

    say(
      `workflow update ${error instanceof NoRoomError ? `has no room: ${error.why}` : `can't run: ${error.message}`}. The workflows stay as they were, and later syncs won't bring them over.`,
    );
  }

  return ran;
};

const keepWorkflowChanges = (dir: string, head: string) => {
  const rest = [".", `:(exclude)${WORKFLOWS}`];

  git(dir, "checkout", "--", ...rest);
  git(dir, "clean", "-fdq", "--", ...rest);
  run("git", ["checkout", "--", OWN_WORKFLOW], dir);
  git(dir, "clean", "-fq", "--", OWN_WORKFLOW);
  git(dir, "add", "-A", "--", WORKFLOWS);

  return git(dir, "diff", "--cached", "--name-only", "--no-renames", head, "--", WORKFLOWS)
    .split("\n")
    .filter(Boolean);
};

export const updateWorkflows = async (
  config: Fork,
  build: Build,
  files: string[],
  range: string,
) => {
  const head = git(build.dir, "rev-parse", "HEAD");

  say(`bringing upstream's changes into ${files.join(", ")}`);
  const ran = await workflowAgent(config, build, updatePrompt(config.upstream, files, range));

  git(build.dir, "reset", "--quiet", head);

  if (ran === false) {
    say("the agent failed while updating workflows, so they stay as they were");
  }

  if (ran !== true) {
    reset(build.dir);
  }

  return ran === true ? keepWorkflowChanges(build.dir, head) : undefined;
};
