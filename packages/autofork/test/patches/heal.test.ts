import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

import { configure, file, harness, write } from "../harness.ts";

const h = harness();
const { home, sh, autofork } = h;

const upstream = path.join(home, "upstream");

const fork = path.join(home, "fork");

const agent = (script: string) => {
  const runner = path.join(home, "agent.sh");
  writeFileSync(runner, `cat > /dev/null\n${script}\n`);
  configure(fork, { agent: `sh ${runner}` });
  sh(fork, "git diff --quiet || git commit -qam 'use test agent'");
};

const commitUpstream = (text: string, message: string) => {
  write(upstream, "app.js", text);
  sh(upstream, `git commit -qam '${message}'`);
};

const patch = (id: string, text: string) => {
  mkdirSync(path.join(fork, ".autofork", id), { recursive: true });
  write(fork, `.autofork/${id}/PATCH.md`, `${text}\n`);
};

test("init tracks upstream", () => {
  mkdirSync(upstream);
  sh(upstream, "git init -q");
  write(upstream, "app.js", 'export function greet(name) {\n  return "hello " + name;\n}\n');
  write(upstream, "notes.txt", "one\n");
  write(upstream, ".gitignore", "*.patch\n");
  sh(upstream, "git add -A && git commit -qm init");
  sh(home, `git clone -q ${upstream} fork`);

  const { ok, log } = autofork(
    fork,
    "init",
    upstream,
    "--verify",
    "node -e \"import('./app.js').then(m => process.exit(m.greet('x') === 'x' ? 1 : 0))\"",
  );

  expect(ok).toBe(true);
  expect(log).toContain(`autofork follows ${upstream}'s main branch, since it has no releases`);
  expect(file(fork, ".github/workflows/autofork.yml")).toContain(
    'push:\n    branches: [main]\n    paths: [".autofork/**"]',
  );
  sh(fork, "git add -A && git commit -qm 'track upstream'");
});

test("save turns your changes into the patch PATCH.md describes", () => {
  write(
    fork,
    "app.js",
    'export function greet(name) {\n  return "hello " + name.toUpperCase();\n}\n',
  );
  expect(autofork(fork, "save", "shout").log).toContain("write .autofork/shout/PATCH.md first");
  patch("shout", "greet() shouts the name in upper case.");
  const { ok, log } = autofork(fork, "save", "shout");
  expect(ok).toBe(true);
  expect(log).toContain("saved 1 file to .autofork/shout");
  expect(file(fork, ".autofork/shout/shout.patch")).toContain(
    '+  return "hello " + name.toUpperCase();',
  );
  sh(fork, "git add -A && git commit -qm 'shout'");
  expect(sh(fork, "git ls-files .autofork/shout")).toContain("shout.patch");
});

test("a run killed while it set up its worktree doesn't block the next one", () => {
  const root = sh(fork, "git rev-parse --show-toplevel");
  const hash = createHash("sha256").update(root).digest("hex").slice(0, 8);
  const dir = path.join(home, "autofork", `fork-${hash}`);
  sh(fork, `git worktree add -q --detach ${dir} && git worktree lock --reason initializing ${dir}`);
  expect(autofork(fork, "status").ok).toBe(true);
  expect(sh(fork, "git worktree list")).not.toContain(dir);
});

test("sync with nothing new is a no-op", () => {
  agent("exit 1");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
});

test("a clean upstream change applies without the agent", () => {
  write(upstream, "notes.txt", "two\n");
  sh(upstream, "git commit -qam notes");
  const { ok, log } = autofork(fork, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(log).not.toContain("healing");
  expect(file(fork, "notes.txt")).toBe("two\n");
  expect(file(fork, "app.js")).toContain("toUpperCase");
  expect(sh(fork, "git log -1 --format=%P").split(" ")).toHaveLength(2);
});

test("a drifted patch waits for a run that heals", () => {
  commitUpstream('export function greet(name) {\n  return "hi " + name;\n}\n', "hi");
  const head = sh(fork, "git rev-parse HEAD");
  const { ok, log } = autofork(fork, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(log).toContain("shout doesn't apply");
  expect(log).toContain("The next run that heals rebuilds it");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
});

test("an agent that leaves conflict markers fails the heal after one run", () => {
  agent(`echo run >> ${path.join(home, "runs")}`);
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("the agent left conflict markers in app.js while healing shout");
  expect(file(home, "runs")).toBe("run\n");
});

test("a drifted patch is healed from git's conflict markers and its PATCH.md", () => {
  agent(
    `grep -q '^<<<<<<< ours' app.js || exit 1\nprintf 'export function greet(name) {\\n  return "hi " + name.toUpperCase();\\n}\\n' > app.js`,
  );
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healing shout");
  expect(log).toContain("healed shout");
  expect(file(fork, "app.js")).toContain('"hi " + name.toUpperCase()');
  expect(file(fork, ".autofork/shout/shout.patch")).toContain(
    '+  return "hi " + name.toUpperCase();',
  );
  expect(file(fork, ".autofork/config.json")).not.toContain("picked");
  agent("exit 1");
  expect(autofork(fork, "sync").log).toContain("already up to date");
});

test("changes no patch holds wait quietly until upstream moves", () => {
  write(fork, "notes.txt", "mine\n");
  sh(fork, "git commit -qam 'stray change'");
  const head = sh(fork, "git rev-parse HEAD");
  const idle = autofork(fork, "sync");
  expect(idle.ok).toBe(true);
  expect(idle.output.result).toBe("current");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
});

test("once upstream moves, sync refuses to drop changes no patch holds, and fails only once", () => {
  write(upstream, "license.txt", "MIT\n");
  sh(upstream, "git add -A && git commit -qm license");
  const { ok, log, output } = autofork(fork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("notes.txt");
  expect(output.key).toBeTruthy();
  const again = autofork(fork, "sync", "--skip", output.key ?? "");
  expect(again.ok).toBe(true);
  expect(again.output.result).toBe("skipped");
  sh(fork, "git reset -q --hard HEAD~1");
});

test("a patch upstream now does is paused, not applied, until you pick it up", () => {
  commitUpstream(
    'export function greet(name) {\n  return "hi " + name.toUpperCase() + "!";\n}\n',
    "shout upstream",
  );
  agent("echo 'upstream greet() upper-cases the name now' > .autofork/shout/UPSTREAM.md");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("upstream has shout: upstream greet() upper-cases the name now");
  expect(sh(fork, "ls .autofork/shout")).toBe("PATCH.md\nUPSTREAM.md");
  expect(file(fork, ".autofork/shout/UPSTREAM.md")).toContain(
    "autofork stopped applying this patch",
  );
  expect(file(fork, "app.js")).toContain('"hi " + name.toUpperCase() + "!"');
  expect(autofork(fork, "status").log).toContain("shout  (upstream has it");
  agent("exit 1");
  write(upstream, "notes.txt", "two and a half\n");
  sh(upstream, "git commit -qam notes");
  expect(autofork(fork, "sync").ok).toBe(true);
  expect(file(fork, "notes.txt")).toBe("two and a half\n");
});

test("deleting UPSTREAM.md brings your version back", () => {
  write(
    fork,
    ".autofork/shout/PATCH.md",
    "greet() shouts the name and ends with three bangs, not upstream's one.\n",
  );
  sh(fork, "git rm -q .autofork/shout/UPSTREAM.md && git commit -qam 'keep mine'");
  agent(`sed -i 's/ + "!";/ + "!!!";/' app.js`);
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built shout");
  expect(file(fork, "app.js")).toContain('"!!!"');
  sh(
    fork,
    "git rm -rq .autofork/shout && git checkout refs/autofork/upstream -- app.js && git commit -qm 'take upstream'",
  );
});

test("a patch that's only a PATCH.md is built by the agent", () => {
  patch("wave", "greet() waves at the end.");
  sh(fork, "git add -A && git commit -qm wave");
  expect(autofork(fork, "status").log).toContain("wave  (not built yet)");
  const head = sh(fork, "git rev-parse HEAD");
  const waiting = autofork(fork, "sync", "--no-heal");
  expect(waiting.ok).toBe(true);
  expect(waiting.log).toContain("wave isn't built yet. The next run that heals rebuilds it.");
  expect(waiting.output.result).toBe("waiting");
  expect(waiting.output.limits).toBeUndefined();
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
  write(upstream, "notes.txt", "wave pending\n");
  sh(upstream, "git commit -qam notes");
  expect(autofork(fork, "sync", "--no-heal").output.result).toBe("waiting");
  expect(sh(fork, "git rev-parse HEAD")).toBe(head);
  agent(
    `sed -i 's/ + "!";/ + "! o\\/";/' app.js\nprintf '\\nThe wave is text, so it works in any terminal.\\n' >> .autofork/wave/PATCH.md`,
  );
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("built wave");
  expect(file(fork, "app.js")).toContain('"! o/"');
  expect(file(fork, ".autofork/wave/wave.patch")).toContain('"! o/"');
  expect(file(fork, ".autofork/wave/PATCH.md")).toBe(
    "greet() waves at the end.\n\nThe wave is text, so it works in any terminal.\n",
  );
  agent("exit 1");
  expect(autofork(fork, "sync").log).toContain("already up to date");
});

test("an agent that changes nothing fails the build after one run", () => {
  patch("idle", "greet() idles.");
  sh(fork, "git add -A && git commit -qm idle");
  agent(`echo run >> ${path.join(home, "idle-runs")}`);
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("the agent changed nothing while building idle");
  expect(file(home, "idle-runs")).toBe("run\n");
  sh(fork, "git rm -rq .autofork/idle && git commit -qm 'drop idle'");
});

test("a patch upstream merged as is is paused without the agent", () => {
  commitUpstream(file(fork, "app.js"), "merge the wave");
  agent("exit 1");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("upstream has wave: the same change, line for line");
  expect(sh(fork, "ls .autofork/wave")).toBe("PATCH.md\nUPSTREAM.md");
});

test("files verify leaves behind stay out of the fork", () => {
  configure(fork, { verify: "touch verify-output.log" });
  sh(fork, "git commit -qam 'noisy verify'");
  write(upstream, "notes.txt", "three\n");
  sh(upstream, "git commit -qam notes");
  const { ok } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(sh(fork, "git ls-files verify-output.log")).toBe("");
});

test("a fork can follow upstream's releases instead of a branch", () => {
  sh(upstream, "git tag v1.0.0");
  write(upstream, "notes.txt", "four\n");
  sh(upstream, "git commit -qam notes && git tag v1.1.0-beta.1");
  configure(fork, { follow: "releases" });
  sh(fork, "git commit -qam 'follow releases'");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
  expect(file(fork, "notes.txt")).toBe("three\n");
  sh(upstream, "git tag v1.1.0");
  expect(autofork(fork, "sync").ok).toBe(true);
  expect(file(fork, "notes.txt")).toBe("four\n");
});

test("a fork ahead of upstream's newest release stays where it is", () => {
  const follow = (to: string) => {
    configure(fork, { follow: to });
    sh(fork, `git commit -qam 'follow ${to}'`);
  };

  follow("main");
  write(upstream, "notes.txt", "five\n");
  sh(upstream, "git commit -qam notes");
  expect(autofork(fork, "sync").ok).toBe(true);
  follow("releases");
  const { ok, log } = autofork(fork, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("already up to date");
  expect(file(fork, "notes.txt")).toBe("five\n");
});

test("a patch whose deletion upstream made too is healed when the agent finds nothing left, and git applies it after", () => {
  const origin = path.join(home, "deleted");
  mkdirSync(origin);
  sh(
    origin,
    "git init -q && echo one > notes.txt && echo old > old.txt && git add -A && git commit -qm one",
  );
  sh(home, `git clone -q ${origin} deleted-fork`);
  const mine = path.join(home, "deleted-fork");
  expect(autofork(mine, "init", origin).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm track");
  sh(mine, "git rm -q old.txt && echo mine >> notes.txt && mkdir -p .autofork/tidy");
  write(mine, ".autofork/tidy/PATCH.md", "Drop old.txt and add a line to notes.txt.\n");
  expect(autofork(mine, "save", "tidy").ok).toBe(true);
  const prompt = path.join(home, "deleted-prompt.txt");
  configure(mine, { agent: `cat > ${prompt}` }, 0);
  sh(mine, "git add -A && git commit -qm tidy");
  sh(origin, "git rm -q old.txt && git commit -qm 'drop old.txt'");
  const { ok, log, output } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(output.result).toBe("synced");
  expect(file(home, "deleted-prompt.txt")).toContain(
    "the deletion of old.txt, which upstream deleted too",
  );
  expect(log).toContain("healed tidy");
  expect(file(mine, "notes.txt")).toBe("one\nmine\n");
  expect(file(mine, ".autofork/tidy/tidy.patch")).not.toContain("old.txt");
  rmSync(prompt);
  sh(origin, "echo two > two.txt && git add -A && git commit -qm two");
  expect(autofork(mine, "sync").output.result).toBe("synced");
  expect(existsSync(prompt)).toBe(false);
});

test("save has an agent rebuild a patch whose change overlaps a later patch's lines", () => {
  const origin = path.join(home, "refold");
  const mine = path.join(home, "refold-fork");
  mkdirSync(origin);
  write(origin, "lines.txt", "one\ntwo\nthree\nfour\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} refold-fork`);
  expect(autofork(mine, "init", origin).ok).toBe(true);
  sh(mine, "git add -A && git commit -qm track");

  for (const [id, from, to] of [
    ["a", "two", "TWO"],
    ["b", "three", "THREE"],
  ] as const) {
    sh(mine, `sed -i s/${from}/${to}/ lines.txt && mkdir .autofork/${id}`);
    write(mine, `.autofork/${id}/PATCH.md`, `Line ${from} reads ${to}.\n`);
    expect(autofork(mine, "save", id).ok).toBe(true);
    sh(mine, `git add -A && git add -f .autofork && git commit -qm ${id}`);
  }

  const script = path.join(home, "refold-agent.sh");
  write(
    home,
    "refold-agent.sh",
    `grep -q '^<<<<<<<' lines.txt || exit 1
case "$(cat)" in
  *.autofork/b/PATCH.md*) printf 'one\\nTwo!\\nTHREE\\nfour\\n' > lines.txt ;;
  *) printf 'one\\nTwo!\\nthree\\nfour\\n' > lines.txt ;;
esac
`,
  );
  configure(mine, { agent: `sh ${script}` }, 0);
  sh(mine, "git commit -qam agent && sed -i s/TWO/Two!/ lines.txt");
  const { ok, log } = autofork(mine, "save", "a");
  expect(log).toContain("your changes to a touch lines a later patch changes too");
  expect(ok).toBe(true);
  expect(file(mine, ".autofork/a/a.patch")).toContain("+Two!");
  expect(file(mine, ".autofork/b/b.patch")).toContain("+THREE");
  expect(file(mine, "lines.txt")).toBe("one\nTwo!\nTHREE\nfour\n");
});
