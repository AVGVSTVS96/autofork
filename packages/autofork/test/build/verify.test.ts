import { expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { configure, file, harness, write } from "../harness.ts";
import { fixup, loads, stack } from "./stack.ts";

const h = harness();
const { home, sh, autofork } = h;

const checked = path.join(home, "checked");

const checkedFork = path.join(home, "checked-fork");

const stacked = stack(h);

const checkedAgent = (heals: Record<string, string>) => {
  stacked.checkedAgent(heals, checkedFork);
};

const savePatch = (id: string, intent: string, change: () => void) => {
  stacked.savePatch(id, intent, change, checkedFork);
};

const checkWith = (verify: string) => {
  configure(checkedFork, { verify });
  checkedAgent({ fix: "true" });
};

test("a patch that still applies but fails verify waits for a run that heals", () => {
  mkdirSync(checked);
  sh(checked, "git init -q && echo one > notes.txt");
  write(checked, "name.js", 'export const name = () => "world";\n');
  write(
    checked,
    "app.js",
    'import { name } from "./name.js";\nexport const greet = () => "hello " + name();\n',
  );
  sh(checked, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${checked} checked-fork`);
  expect(autofork(checkedFork, "init", checked, "--verify", loads).ok).toBe(true);
  sh(checkedFork, "git add -A && git commit -qm 'track upstream'");
  savePatch("a-notes", "notes.txt says the notes are mine.", () => {
    write(checkedFork, "notes.txt", "mine\n");
  });
  savePatch("b-shout", "extra.js has shout(), the name in upper case.", () => {
    write(
      checkedFork,
      "extra.js",
      'import { name } from "./name.js";\nexport const shout = () => name().toUpperCase();\n',
    );
  });
  write(checked, "name.js", 'export const who = () => "world";\n');
  write(
    checked,
    "app.js",
    'import { who } from "./name.js";\nexport const greet = () => "hello " + who();\n',
  );
  sh(checked, "git commit -qam 'name is who now'");
  checkedAgent({});
  const head = sh(checkedFork, "git rev-parse HEAD");
  const { ok, log, output } = autofork(checkedFork, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(output.result).toBe("waiting");
  expect(log).toContain(
    "verify fails, so a patch needs rebuilding. The next run that heals rebuilds it.",
  );
  expect(log).not.toContain("alone");
  expect(sh(checkedFork, "git rev-parse HEAD")).toBe(head);
});

test("verify that still fails after the agent's fix fails the sync instead of calling it again", () => {
  savePatch("c-wave", "greet() waves at the end.", () => {
    write(
      checkedFork,
      "app.js",
      'import { name } from "./name.js";\nexport const greet = () => "hello " + name() + " o/";\n',
    );
  });
  checkedAgent({ fix: "true", "c-wave": "true" });
  const head = sh(checkedFork, "git rev-parse HEAD");
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(`verify still fails after the agent's fix: ${loads}`);
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(sh(checkedFork, "git rev-parse HEAD")).toBe(head);
});

test("verify that fails on a patch the agent just rebuilt fails the sync instead of paying for a fix", () => {
  checkedAgent({
    fix: fixup({
      "b-shout": `printf 'import { who } from "./name.js";\\nexport const shout = () => who().toUpperCase();\\n' > extra.js`,
    }),
    "c-wave": `printf 'import { whom } from "./name.js";\\nexport const greet = () => "hello " + whom() + " o/";\\n' > app.js`,
  });
  const head = sh(checkedFork, "git rev-parse HEAD");
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("verify fails with c-wave, which the agent healed");
  expect(file(home, "agent-runs.log")).toBe("fix\nc-wave\n");
  expect(sh(checkedFork, "git rev-parse HEAD")).toBe(head);
});

test("patches that still apply but fail verify are fixed in their own commits by one agent run, before the agent builds a later patch on top of them", () => {
  checkedAgent({
    fix: fixup({
      "b-shout": `printf 'import { who } from "./name.js";\\nexport const shout = () => who().toUpperCase();\\n' > extra.js`,
    }),
    "c-wave": `printf 'import { who } from "./name.js";\\nexport const greet = () => "hello " + who() + " o/";\\n' > app.js`,
  });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("verify fails, verify with upstream");
  expect(log).toContain("healed b-shout\nhealed c-wave");
  expect(file(home, "agent-runs.log")).toBe("fix\nc-wave\n");
  expect(file(home, "prompt-fix.txt")).toContain(
    `with the patches on top, one commit each, named by its id: a-notes, b-shout. They all apply, but \`${loads}\` fails with them. Its last lines:`,
  );
  expect(file(home, "prompt-fix.txt")).toContain("does not provide an export named 'name'");
  expect(file(home, "prompt-fix.txt")).toContain(
    "Patches after these aren't applied yet: c-wave. Each goes on top, so leave what its PATCH.md asks for to it.",
  );
  expect(file(home, "prompt-fix.txt")).toContain(
    "The sync keeps your commits and puts .autofork/ and .github/workflows/ back after you, except what this asks you to write there.",
  );
  expect(file(checkedFork, "extra.js")).toContain("who().toUpperCase()");
  expect(file(checkedFork, "app.js")).toContain('who() + " o/"');
  expect(file(checkedFork, "notes.txt")).toBe("mine\n");
  expect(file(checkedFork, ".autofork/b-shout/b-shout.patch")).toContain(
    "+export const shout = () => who().toUpperCase();",
  );
});

test("verify that fails on upstream itself fails the sync without the agent", () => {
  write(checked, "name.js", 'export const whom = () => "world";\n');
  sh(checked, "git commit -qam 'break upstream'");
  checkedAgent({ "b-shout": "true", "c-wave": "true" });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(
    `verify fails on upstream ${sh(checked, "git rev-parse HEAD").slice(0, 12)} itself`,
  );
  expect(file(home, "agent-runs.log")).toBe("");
});

test("each new patch keeps the note its agent added to PATCH.md, when a later patch is built in the same sync", () => {
  write(checked, "name.js", 'export const who = () => "world";\n');
  sh(checked, "git commit -qam 'fix upstream'");

  for (const id of ["d-bang", "e-tilde"]) {
    mkdirSync(path.join(checkedFork, ".autofork", id), { recursive: true });
    write(checkedFork, `.autofork/${id}/PATCH.md`, `notes.txt ends with a ${id.slice(2)}.\n`);
  }

  sh(checkedFork, "git add -A && git commit -qm 'two new patches'");
  checkedAgent({
    "d-bang": `echo '!' >> notes.txt; printf '\\nA line of its own.\\n' >> .autofork/d-bang/PATCH.md`,
    "e-tilde": `echo '~' >> notes.txt; printf '\\nAfter the bang.\\n' >> .autofork/e-tilde/PATCH.md`,
  });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built d-bang\nbuilt e-tilde");
  expect(file(checkedFork, "notes.txt")).toBe("mine\n!\n~\n");
  expect(file(checkedFork, ".autofork/d-bang/PATCH.md")).toBe(
    "notes.txt ends with a bang.\n\nA line of its own.\n",
  );
  expect(file(checkedFork, ".autofork/e-tilde/PATCH.md")).toBe(
    "notes.txt ends with a tilde.\n\nAfter the bang.\n",
  );
});

test("patches that fail verify are fixed before the agent rebuilds a later one that no longer applies", () => {
  savePatch("f-wink", "wink.js has wink(), the name with a wink.", () => {
    write(
      checkedFork,
      "wink.js",
      'import { who } from "./name.js";\nexport const wink = () => who() + " ;)";\n',
    );
  });
  savePatch("g-loud", "shout() ends with an exclamation mark.", () => {
    write(
      checkedFork,
      "extra.js",
      'import { who } from "./name.js";\nexport const shout = () => who().toUpperCase() + "!";\n',
    );
  });
  write(checked, "name.js", 'export const whom = () => "world";\n');
  write(
    checked,
    "app.js",
    'import { whom } from "./name.js";\nexport const greet = () => "hello " + whom();\n',
  );
  sh(checked, "git commit -qam 'who is whom now'");
  checkedAgent({
    "fix a-notes, b-shout.": fixup({
      "b-shout": `printf 'import { whom } from "./name.js";\\nexport const shout = () => whom().toUpperCase();\\n' > extra.js`,
    }),
    "c-wave": `printf 'import { whom } from "./name.js";\\nexport const greet = () => "hello " + whom() + " o/";\\n' > app.js`,
    "fix a-notes, b-shout, c-wave, d-bang, e-tilde, f-wink.": fixup({
      "f-wink": `printf 'import { whom } from "./name.js";\\nexport const wink = () => whom() + " ;)";\\n' > wink.js`,
    }),
    "g-loud": `printf 'import { whom } from "./name.js";\\nexport const shout = () => whom().toUpperCase() + "!";\\n' > extra.js`,
  });
  const { ok, log } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed b-shout\nhealed c-wave\nhealed f-wink\nhealed g-loud");
  expect(file(home, "agent-runs.log")).toBe("fix\nc-wave\nfix\ng-loud\n");
  expect(file(home, "prompt-fix.txt")).toContain(
    `named by its id: a-notes, b-shout, c-wave, d-bang, e-tilde, f-wink. They all apply, but \`${loads}\` fails with them.`,
  );
  expect(file(checkedFork, "extra.js")).toContain('whom().toUpperCase() + "!"');
  expect(file(checkedFork, "wink.js")).toContain('whom() + " ;)"');
  expect(file(checkedFork, "app.js")).toContain('whom() + " o/"');
  expect(file(checkedFork, "notes.txt")).toBe("mine\n!\n~\n");
  expect(existsSync(path.join(checkedFork, "loaded.txt"))).toBe(false);
});

test("verify that fails once and passes when run again lets the sync through after an agent run that changes nothing", () => {
  write(checked, "readme.txt", "hi\n");
  sh(checked, "git add -A && git commit -qm readme");
  checkWith(`test -e ${home}/verified || { touch ${home}/verified; exit 1; }`);
  const { ok, log, output } = autofork(checkedFork, "sync");
  expect(ok).toBe(true);
  expect(output.result).toBe("synced");
  expect(log).not.toContain("healed");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(checkedFork, "readme.txt")).toBe("hi\n");
  expect(file(checkedFork, "extra.js")).toContain('whom().toUpperCase() + "!"');
});
