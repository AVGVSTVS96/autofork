import { expect, test } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { configOf, configure, file, harness, write } from "../harness.ts";
import { fixup, loads, stack } from "./stack.ts";

const h = harness();
const { home, sh, autofork } = h;
const { checkedAgent, savePatch } = stack(h);

test("one agent run fixes every patch that fails verify, each in its own commit, and the patches are read back from them", () => {
  const origin = path.join(home, "stacked");
  const mine = path.join(home, "stacked-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} stacked-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () => {
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      );
    },
    mine,
  );
  savePatch(
    "b-wink",
    "wink.js has wink(), the name with a wink.",
    () => {
      write(
        mine,
        "wink.js",
        'import { who } from "./name.js";\nexport const wink = () => who() + " ;)";\n',
      );
    },
    mine,
  );
  savePatch(
    "c-louder",
    "loud() ends with an exclamation mark.",
    () => {
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase() + "!";\n',
      );
    },
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  sh(origin, "git commit -qam 'who is whom now'");
  checkedAgent(
    {
      fix: [
        "git reset -q --hard $(git log -1 --format=%H --grep='^upstream ')",
        `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js && git add -A && git commit -qm a-loud`,
        `printf 'import { whom } from "./name.js";\\nexport const wink = () => whom() + " ;)";\\n' > wink.js && git add -A && git commit -qm b-wink`,
        `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase() + "!";\\n' > loud.js && git commit -qam c-louder`,
      ].join(" && "),
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed a-loud\nhealed b-wink\nhealed c-louder");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(mine, "loud.js")).toBe(
    'import { whom } from "./name.js";\nexport const loud = () => whom().toUpperCase() + "!";\n',
  );
  expect(file(mine, "wink.js")).toContain('whom() + " ;)"');
  expect(file(mine, ".autofork/a-loud/a-loud.patch")).toContain(
    "+export const loud = () => whom().toUpperCase();",
  );
  expect(file(mine, ".autofork/c-louder/c-louder.patch")).toContain(
    '+export const loud = () => whom().toUpperCase() + "!";',
  );
  expect(existsSync(path.join(mine, "loaded.txt"))).toBe(false);
});

test("an agent fix that leaves a patch with nothing to add fails the sync instead of emptying it", () => {
  const origin = path.join(home, "overlap");
  const mine = path.join(home, "overlap-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} overlap-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () => {
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      );
    },
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt mentions loud().",
    () => {
      write(mine, "notes.txt", "one\nloud\n");
    },
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  sh(origin, "git commit -qam 'who is whom now'");
  checkedAgent(
    {
      fix: [
        "git reset -q --hard $(git log -1 --format=%H --grep='^upstream ')",
        `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js && echo loud >> notes.txt && git add -A && git commit -qm a-loud`,
        "git commit -q --allow-empty -m b-notes",
      ].join(" && "),
    },
    mine,
  );
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("the agent's fix left b-notes with nothing to add");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("a patch that no longer applies keeps what git could apply, and the agent gets only what's left", () => {
  const origin = path.join(home, "partial");
  const mine = path.join(home, "partial-fork");
  const lines = Array.from({ length: 20 }, (_, index) => `l${index + 1}`);
  mkdirSync(origin);
  write(origin, "one.txt", "1\n2\n3\n");
  write(origin, "two.txt", "a\nb\nc\n");
  write(origin, "three.txt", "x\n");
  write(origin, "four.txt", `${lines.join("\n")}\n`);
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} partial-fork`);
  expect(autofork(mine, "init", origin).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "edit",
    "Each file says it's mine.",
    () => {
      write(mine, "one.txt", "1\nTWO\n3\n");
      write(mine, "two.txt", "a\nB\nc\n");
      write(mine, "three.txt", "y\n");
      write(
        mine,
        "four.txt",
        `${lines.join("\n").replace("l2\n", "L2\n").replace("l19", "L19")}\n`,
      );
    },
    mine,
  );
  const saved = path.join(mine, ".autofork/edit/edit.patch");
  writeFileSync(
    saved,
    readFileSync(saved, "utf-8").replace(/(?<=four\.txt\nindex )[0-9a-f]{40}/, "1111111"),
  );
  sh(mine, "git commit -qam 'four.txt from a commit this clone never had'");
  write(origin, "one.txt", "1\ndeux\n3\n");
  write(origin, "four.txt", `${lines.join("\n").replace("l2\n", "el2\n")}\n`);
  sh(origin, "git rm -q three.txt && git commit -qam 'upstream moves'");
  checkedAgent(
    {
      edit: `grep -q '^<<<<<<< ours' one.txt && test -f four.txt.rej || exit 1; printf '1\\nTWO\\n3\\n' > one.txt; sed -i 's/^el2$/L2/' four.txt`,
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed edit");
  const prompt = file(home, "prompt-edit.txt");
  expect(prompt).toContain(
    "What's left: the conflict markers in one.txt; the hunks that didn't fit, in four.txt.rej; the changes to three.txt, which didn't apply at all.",
  );
  expect(prompt).toMatch(/git diff \w+ \w+ -- one\.txt four\.txt three\.txt$/m);
  expect(prompt).not.toContain("two.txt");
  expect(file(mine, "one.txt")).toBe("1\nTWO\n3\n");
  expect(file(mine, "two.txt")).toBe("a\nB\nc\n");
  expect(file(mine, "four.txt")).toContain("L2\n");
  expect(file(mine, "four.txt")).toContain("L19\n");
  expect(existsSync(path.join(mine, "three.txt"))).toBe(false);
  expect(existsSync(path.join(mine, "four.txt.rej"))).toBe(false);
  expect(file(mine, ".autofork/edit/edit.patch")).toContain("+B");
  expect(file(mine, ".autofork/edit/edit.patch")).toContain("+L19");
});

test("setup installs before the agent and verify run, and generated files are rebuilt instead of patched", () => {
  const origin = path.join(home, "deps");
  const mine = path.join(home, "deps-fork");

  const setup =
    "mkdir -p deps && cp package.json deps/ && sed 's/^/locked /' package.json > lock.txt";

  mkdirSync(origin);
  write(origin, ".gitignore", "deps/\n");
  write(origin, "package.json", '{\n  "a": "1"\n}\n');
  sh(origin, `git init -q && ${setup} && git add -A && git commit -qm init`);
  sh(home, `git clone -q ${origin} deps-fork`);
  expect(autofork(mine, "init", origin, "--verify", "cmp package.json deps/package.json").ok).toBe(
    true,
  );
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "dep-b",
    "The app depends on b.",
    () => {
      write(mine, "package.json", '{\n  "a": "1",\n  "b": "1"\n}\n');
      sh(mine, setup);
    },
    mine,
  );
  expect(file(mine, ".autofork/dep-b/dep-b.patch")).toContain("lock.txt");
  configure(mine, { generated: ["lock.txt"] });
  expect(autofork(mine, "status").log).toContain('"generated" files are rebuilt by "setup"');
  configure(mine, { setup, generated: ["lock.txt"] });
  sh(mine, "git commit -qam 'lock.txt is generated'");
  write(origin, "package.json", '{\n  "a": "1",\n  "c": "1"\n}\n');
  sh(origin, `${setup} && git commit -qam 'depend on c'`);
  checkedAgent(
    {
      "dep-b": `grep -q '^<<<<<<< ours' package.json && test -f deps/package.json || exit 1; printf '{\\n  "a": "1",\\n  "b": "1",\\n  "c": "1"\\n}\\n' > package.json`,
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed dep-b");
  const prompt = file(home, "prompt-dep-b.txt");
  expect(prompt).toContain(`Dependencies are installed: \`${setup}\` ran here`);
  expect(prompt).toContain("What's left: the conflict markers in package.json.");
  expect(prompt).toContain(
    "The sync keeps your source change and puts .autofork/ and .github/workflows/ back after you, except what this asks you to write there. Remove anything your checks generated that git would pick up, but leave lock.txt, which the sync rebuilds.",
  );
  expect(prompt).toContain(" -- package.json\n");
  expect(file(mine, "lock.txt")).toBe(
    'locked {\nlocked   "a": "1",\nlocked   "b": "1",\nlocked   "c": "1"\nlocked }\n',
  );
  expect(file(mine, ".autofork/dep-b/dep-b.patch")).not.toContain("lock.txt");
  expect(sh(mine, "git status --porcelain")).toBe("");
  write(origin, "notes.txt", "one\n");
  sh(origin, "git add -A && git commit -qm notes");
  checkedAgent({}, mine);
  const again = autofork(mine, "sync");
  expect(again.output.result).toBe("synced");
  expect(file(home, "agent-runs.log")).toBe("");
  expect(file(mine, "lock.txt")).toContain('locked   "b": "1",');
});

test("a patch fixed for verify keeps a later patch upstream merged as is paused", () => {
  const origin = path.join(home, "merged-later");
  const mine = path.join(home, "merged-later-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} merged-later-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () => {
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      );
    },
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt has a second line.",
    () => {
      write(mine, "notes.txt", "one\ntwo\n");
    },
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  write(origin, "notes.txt", "one\ntwo\n");
  sh(origin, "git commit -qam 'who is whom now, and notes has two lines'");
  const loud = `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js`;
  checkedAgent({ fix: fixup({ "b-notes": loud }) }, mine);
  const misplaced = autofork(mine, "sync");
  expect(misplaced.ok).toBe(false);
  expect(misplaced.log).toContain("the agent's fix changed b-notes, which upstream already has");
  checkedAgent(
    {
      fix: fixup({
        "a-loud": `printf 'import { whom } from "./name.js";\\nexport const loud = () => whom().toUpperCase();\\n' > loud.js`,
      }),
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed a-loud\nupstream has b-notes: the same change, line for line");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(home, "prompt-fix.txt")).toContain(
    "named by its id: a-loud, b-notes. Upstream already has b-notes: leave its commit empty.",
  );
  expect(sh(mine, "ls .autofork/b-notes")).toBe("PATCH.md\nUPSTREAM.md");
});

test("verify that fails on a rebuilt patch under one that applied cleanly fails the sync instead of paying for a fix", () => {
  const origin = path.join(home, "rebuilt-under");
  const mine = path.join(home, "rebuilt-under-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  write(
    origin,
    "app.js",
    'import { who } from "./name.js";\nexport const greet = () => "hello " + who();\n',
  );
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} rebuilt-under-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-wave",
    "greet() waves at the end.",
    () => {
      write(
        mine,
        "app.js",
        'import { who } from "./name.js";\nexport const greet = () => "hello " + who() + " o/";\n',
      );
    },
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt says hi.",
    () => {
      write(mine, "notes.txt", "hi\n");
    },
    mine,
  );
  write(origin, "name.js", 'export const whom = () => "world";\n');
  write(
    origin,
    "app.js",
    'import { whom } from "./name.js";\nexport const greet = () => "hello " + whom();\n',
  );
  sh(origin, "git commit -qam 'who is whom now'");
  checkedAgent(
    {
      "a-wave": `printf 'import { who } from "./name.js";\\nexport const greet = () => "hello " + who() + " o/";\\n' > app.js`,
      fix: "true",
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("verify fails with a-wave, which the agent healed");
  expect(file(home, "agent-runs.log")).toBe("a-wave\n");
});

test("a patch that still applies but fails verify because upstream now does it is paused by the fix", () => {
  const origin = path.join(home, "duplicated");
  const mine = path.join(home, "duplicated-fork");
  mkdirSync(origin);
  write(origin, "name.js", 'export const who = () => "world";\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} duplicated-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-loud",
    "loud.js has loud(), the name in upper case.",
    () => {
      write(
        mine,
        "loud.js",
        'import { who } from "./name.js";\nexport const loud = () => who().toUpperCase();\n',
      );
    },
    mine,
  );
  write(
    origin,
    "name.js",
    'export const whom = () => "world";\nexport const loud = () => "WORLD";\n',
  );
  sh(origin, "git commit -qam 'name.js has loud() now'");
  checkedAgent(
    {
      fix: [
        "git reset -q --hard $(git log -1 --format=%H --grep='^upstream ')",
        "echo 'name.js exports loud()' > .autofork/a-loud/UPSTREAM.md",
        "git add -A && git commit -qm a-loud",
      ].join(" && "),
    },
    mine,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("upstream has a-loud: name.js exports loud()");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(existsSync(path.join(mine, "loud.js"))).toBe(false);
  expect(sh(mine, "ls .autofork/a-loud")).toBe("PATCH.md\nUPSTREAM.md");
});

test("verify sees the generated files setup rebuilt for the patches under it", () => {
  const origin = path.join(home, "locked");
  const mine = path.join(home, "locked-fork");
  const setup = "sed 's/^/locked /' package.json > lock.txt";
  mkdirSync(origin);
  write(origin, "package.json", '{\n  "a": "1"\n}\n');
  sh(origin, `git init -q && ${setup} && git add -A && git commit -qm init`);
  sh(home, `git clone -q ${origin} locked-fork`);
  const verify = "sed 's/^/locked /' package.json | cmp - lock.txt";
  const unset = autofork(mine, "init", origin, "--generated", "lock.txt", "--verify", verify);
  expect(unset.log).toContain("--generated files are rebuilt by --setup, so set it too");
  expect(existsSync(path.join(mine, ".autofork"))).toBe(false);
  expect(
    autofork(
      mine,
      "init",
      origin,
      "--setup",
      setup,
      "--generated",
      "lock.txt,other.lock",
      "--verify",
      verify,
    ).ok,
  ).toBe(true);
  const config = configOf(mine);
  expect(config).toMatchObject({ setup, generated: ["lock.txt", "other.lock"], verify });
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "dep-b",
    "The app depends on b.",
    () => {
      write(mine, "package.json", '{\n  "a": "1",\n  "b": "1"\n}\n');
      sh(mine, setup);
    },
    mine,
  );
  expect(file(mine, ".autofork/dep-b/dep-b.patch")).not.toContain("lock.txt");
  write(origin, "notes.txt", "one\n");
  sh(origin, "git add -A && git commit -qm notes");
  checkedAgent({}, mine);
  const { ok, output } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(output.result).toBe("synced");
  expect(file(home, "agent-runs.log")).toBe("");
  expect(file(mine, "lock.txt")).toContain('locked   "b": "1"');
});

const breaksSetup = (name: string, verify?: string) => {
  const origin = path.join(home, name);
  const mine = path.join(home, `${name}-fork`);
  const setup = `while read d; do test -f "pkgs/$d" || { echo "no package $d"; exit 1; }; done < deps.txt`;
  mkdirSync(path.join(origin, "pkgs"), { recursive: true });
  write(origin, "deps.txt", "a\n");
  write(origin, "pkgs/a", "");
  write(origin, "pkgs/b", "");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ${name}-fork`);
  expect(autofork(mine, "init", origin, ...(verify ? ["--verify", verify] : [])).ok).toBe(true);
  configure(mine, { setup });
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "dep-b",
    "The app depends on b.",
    () => {
      write(mine, "deps.txt", "a\nb\n");
    },
    mine,
  );
  sh(origin, "git mv pkgs/b pkgs/bee && git commit -qm 'b is bee now'");
  checkedAgent({ fix: fixup({ "dep-b": `printf 'a\\nbee\\n' > deps.txt` }) }, mine);
  const waiting = autofork(mine, "sync", "--no-heal");
  expect(waiting.output.result).toBe("waiting");
  expect(waiting.log).toContain("setup fails, so a patch needs rebuilding");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed dep-b");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  const prompt = file(home, "prompt-fix.txt");
  expect(prompt).toContain(`but \`${setup}\` fails with them. Its last lines:`);
  expect(prompt).not.toContain("Dependencies are installed");
  expect(prompt).toContain("no package b");
  expect(file(mine, "deps.txt")).toBe("a\nbee\n");
};

test("a patch that still applies but breaks setup is fixed like one that fails verify", () => {
  breaksSetup("installs", "test -f deps.txt");
});

test("setup without verify is the check a sync has to pass", () => {
  breaksSetup("installs-only");
});

test("a patch the build needs is fixed when verify fails with it, even though upstream alone never passes verify", () => {
  const origin = path.join(home, "split");
  const mine = path.join(home, "split-fork");
  mkdirSync(origin);
  write(
    origin,
    "app.js",
    'import { who } from "./lib/name.js";\nexport const greet = () => "hello " + who();\n',
  );
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} split-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-standalone",
    "lib/name.js stands in for the monorepo's name package, so the app builds on its own.",
    () => {
      mkdirSync(path.join(mine, "lib"));
      write(mine, "lib/name.js", 'export const who = () => "world";\n');
      write(mine, "notes.txt", "one\nstandalone\n");
    },
    mine,
  );
  savePatch(
    "b-shout",
    "extra.js has shout(), the name in upper case.",
    () => {
      write(
        mine,
        "extra.js",
        'import { who } from "./lib/name.js";\nexport const shout = () => who().toUpperCase();\n',
      );
    },
    mine,
  );
  write(
    origin,
    "app.js",
    'import { whom } from "./lib/name.js";\nexport const greet = () => "hello " + whom();\n',
  );
  sh(origin, "git commit -qam 'greet whom'");
  checkedAgent(
    {
      fix: fixup({
        "a-standalone": `printf 'export const who = () => "world";\\nexport const whom = who;\\n' > lib/name.js`,
      }),
    },
    mine,
  );
  const failed = autofork(mine, "sync");
  expect(failed.ok).toBe(true);
  expect(failed.log).toContain(
    "verify fails on upstream alone where the fork was too, so the patches are what make it pass",
  );
  expect(failed.log).toContain("healed a-standalone");
  expect(file(home, "agent-runs.log")).toBe("fix\n");
  expect(file(home, "prompt-fix.txt")).toContain("named by its id: a-standalone, b-shout.");
  expect(file(mine, "lib/name.js")).toContain("export const whom = who;");
  expect(file(mine, "extra.js")).toContain("who().toUpperCase()");

  write(origin, "notes.txt", "uno\n");
  sh(origin, "git commit -qam 'notes in spanish'");
  checkedAgent(
    {
      "a-standalone": `grep -q '^<<<<<<< ours' notes.txt || exit 1; printf 'uno\\nstandalone\\n' > notes.txt`,
    },
    mine,
  );
  const drifted = autofork(mine, "sync");
  expect(drifted.ok).toBe(true);
  expect(drifted.log).toContain("healed a-standalone");
  expect(file(home, "agent-runs.log")).toBe("a-standalone\n");
  expect(file(mine, "notes.txt")).toBe("uno\nstandalone\n");
  expect(file(mine, "lib/name.js")).toContain("export const whom = who;");
});

test("a rebuild under the patch that makes upstream build doesn't pay for a fix on the stack below it", () => {
  const origin = path.join(home, "split-later");
  const mine = path.join(home, "split-later-fork");
  mkdirSync(origin);
  write(
    origin,
    "app.js",
    'import { who } from "./lib/name.js";\nexport const greet = () => "hello " + who();\n',
  );
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} split-later-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-extra",
    "extra.js says hi.",
    () => {
      write(mine, "extra.js", "export const hi = 1;\n");
    },
    mine,
  );
  savePatch(
    "b-notes",
    "notes.txt has a second line.",
    () => {
      write(mine, "notes.txt", "one\ntwo\n");
    },
    mine,
  );
  savePatch(
    "c-standalone",
    "lib/name.js stands in for the monorepo's name package, so the app builds on its own.",
    () => {
      mkdirSync(path.join(mine, "lib"));
      write(mine, "lib/name.js", 'export const who = () => "world";\n');
    },
    mine,
  );
  write(origin, "notes.txt", "uno\n");
  sh(origin, "git commit -qam 'notes in spanish'");
  checkedAgent({ "b-notes": "printf 'uno\\ntwo\\n' > notes.txt", fix: "true" }, mine);
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed b-notes");
  expect(file(home, "agent-runs.log")).toBe("b-notes\n");
  expect(file(mine, "notes.txt")).toBe("uno\ntwo\n");
});

test("a rebuilt patch upstream needs to build fails the sync without paying for a fix, even under a patch that applies", () => {
  const origin = path.join(home, "split-last");
  const mine = path.join(home, "split-last-fork");
  mkdirSync(origin);
  write(
    origin,
    "app.js",
    'import { who } from "./lib/name.js";\nexport const greet = () => "hello " + who();\n',
  );
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} split-last-fork`);
  expect(autofork(mine, "init", origin, "--verify", loads).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  savePatch(
    "a-extra",
    "extra.js says hi.",
    () => {
      write(mine, "extra.js", "export const hi = 1;\n");
    },
    mine,
  );
  savePatch(
    "z-standalone",
    "lib/name.js stands in for the monorepo's name package, so the app builds on its own.",
    () => {
      mkdirSync(path.join(mine, "lib"));
      write(mine, "lib/name.js", 'export const who = () => "world";\n');
      write(mine, "notes.txt", "one\nstandalone\n");
    },
    mine,
  );
  write(origin, "notes.txt", "uno\n");
  sh(origin, "git commit -qam 'notes in spanish'");
  checkedAgent(
    { "z-standalone": "printf 'uno\\nstandalone\\n' > notes.txt && rm lib/name.js", fix: "true" },
    mine,
  );
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("verify fails with z-standalone, which the agent healed");
  expect(file(home, "agent-runs.log")).toBe("z-standalone\n");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("a fork without patches whose upstream never passes verify fails the sync instead of pushing", () => {
  const origin = path.join(home, "unpatched");
  const mine = path.join(home, "unpatched-fork");
  mkdirSync(origin);
  write(origin, "notes.txt", "one\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} unpatched-fork`);
  expect(autofork(mine, "init", origin, "--verify", "false").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  write(origin, "notes.txt", "two\n");
  sh(origin, "git commit -qam two");
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(
    `verify fails on upstream ${sh(origin, "git rev-parse HEAD").slice(0, 12)} itself`,
  );
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});
