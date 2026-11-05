import { spawnSync } from "node:child_process";

export const MAX_OUTPUT = 2 ** 30;

export const run = (command: string, args: string[], cwd: string, env?: NodeJS.ProcessEnv) => {
  const result = spawnSync(command, args, { cwd, env, maxBuffer: MAX_OUTPUT });
  const stderr: Buffer | undefined = result.stderr;

  return {
    ok: result.status === 0,
    out: result.stdout,
    err: stderr?.toString().trim() ?? "",
  };
};

export const installed = (bin: string) => run("sh", ["-c", `command -v ${bin}`], ".").ok;
