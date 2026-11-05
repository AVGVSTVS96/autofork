#!/usr/bin/env node
import { fork } from "./cli/fork.ts";
import { init } from "./cli/init.ts";
import { link } from "./cli/link.ts";
import { USAGE } from "./cli/messages.ts";
import { save } from "./cli/save.ts";
import { status } from "./cli/status.ts";
import { sync } from "./cli/sync.ts";
import { AutoforkError } from "./failure.ts";
import { output, say } from "./platform/action.ts";
import { run } from "./platform/process.ts";

const commands = { init, link, save, status, sync } satisfies Record<
  string,
  (root: string, args: string[]) => Promise<void>
>;

const isCommand = (name: string | undefined): name is keyof typeof commands =>
  name !== undefined && Object.hasOwn(commands, name);

const main = async ([name, ...args]: string[]) => {
  if (name === "fork") {
    await fork(process.cwd(), args);

    return;
  }

  if (!isCommand(name)) {
    process.stdout.write(USAGE);

    return;
  }

  const top = run("git", ["rev-parse", "--show-toplevel"], process.cwd());

  if (!top.ok) {
    throw new AutoforkError("run autofork inside your fork's git checkout");
  }

  await commands[name](top.out.toString().trim(), args);
};

try {
  await main(process.argv.slice(2));
} catch (error) {
  output({ error: (error instanceof Error ? error.message : String(error)).slice(0, 50_000) });

  if (!(error instanceof AutoforkError)) {
    throw error;
  }

  say(`autofork: ${error.message}`);
  process.exitCode = 1;
}
