import { expect } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { configure, write } from "../harness.ts";
import type { harness } from "../harness.ts";

const FIX = /^fix ?(?<ids>.*)$/u;

export const loads = `for f in *.js; do node -e "import('./$f')" || exit 1; done > loaded.txt`;

export const fixup = (fixes: Record<string, string>) => {
  const commits = Object.entries(fixes).map(
    ([id, script]) =>
      `${script} && git add -A && git commit -q --fixup=$(git log -1 --format=%H --grep='^${id}$') && `,
  );

  return `${commits.join("")}GIT_SEQUENCE_EDITOR=true git rebase -qi --autosquash $(git log -1 --format=%H --grep='^upstream ')`;
};

export const stack = ({ home, sh, autofork }: ReturnType<typeof harness>) => {
  const runs = path.join(home, "agent-runs.log");

  const checkedAgent = (heals: Record<string, string>, fork: string) => {
    const script = path.join(home, "checked-agent.sh");

    const cases = Object.entries(heals).map(([key, heal]) => {
      const ids = FIX.exec(key)?.groups?.ids;
      const [name, pattern] =
        ids === undefined ? [key, `"${key}"`] : ["fix", `named by its id: ${ids}`];

      return `  *'${pattern}'*) echo ${name} >> ${runs}; printf '%s' "$prompt" > ${home}/prompt-${name}.txt; ${heal} ;;`;
    });

    writeFileSync(script, `prompt="$(cat)"\ncase "$prompt" in\n${cases.join("\n")}\nesac\n`);
    writeFileSync(runs, "");
    configure(fork, { agent: `sh ${script}` });
    sh(fork, "git diff --quiet || git commit -qam 'use test agent'");
  };

  const savePatch = (id: string, intent: string, change: () => void, fork: string) => {
    change();
    mkdirSync(path.join(fork, ".autofork", id), { recursive: true });
    write(fork, `.autofork/${id}/PATCH.md`, `${intent}\n`);
    expect(autofork(fork, "save", id).ok).toBe(true);
    sh(fork, `git add -A && git commit -qm ${id}`);
  };

  return { checkedAgent, savePatch };
};
