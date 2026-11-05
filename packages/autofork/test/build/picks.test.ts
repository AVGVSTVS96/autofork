import { expect, test } from "bun:test";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";

import { configOf, configure, file, harness, parse, write } from "../harness.ts";
import type { JsonObject } from "../harness.ts";
import { fixup, stack } from "./stack.ts";

const h = harness();
const { home, sh, autofork } = h;

test("a fork with only its upstream gets the setup and verify its first agent picks from upstream's CI", () => {
  const origin = path.join(home, "bare");
  const mine = path.join(home, "bare-fork");
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  write(origin, ".gitignore", "*.patch\nconfig.json\n*.md\n");
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} bare-fork`);
  const script = path.join(home, "bare-agent.sh");
  write(
    home,
    "bare-agent.sh",
    `cat > ${path.join(home, "bare-prompt.txt")}
sed -i 's/+ name/+ name.toUpperCase()/' app.js
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, setup: "echo installed", verify: "node --check app.js && echo verified" }))'
`,
  );
  mkdirSync(path.join(mine, ".autofork/shout"), { recursive: true });
  write(mine, ".autofork/config.json", JSON.stringify({ upstream: origin, agent: `sh ${script}` }));
  write(mine, ".autofork/shout/PATCH.md", "greet() shouts the name.\n");
  sh(
    mine,
    "git add -A && git add -f .autofork && git commit -qm 'autofork: greet() shouts the name'",
  );

  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(file(home, "bare-prompt.txt")).toContain(
    'write .autofork/config.json\'s "setup", which installs dependencies, and "verify", which checks a build',
  );
  expect(log).toContain("built shout");
  expect(log).toContain("setup: echo installed");
  expect(log).toContain("verified");
  expect(configOf(mine)).toEqual({
    upstream: origin,
    agent: `sh ${script}`,
    follow: "main",
    picked: { setup: "echo installed", verify: "node --check app.js && echo verified" },
  });
  expect(sh(mine, "git ls-files .autofork").split("\n")).toEqual(
    expect.arrayContaining([
      ".autofork/config.json",
      ".autofork/shout/PATCH.md",
      ".autofork/shout/shout.patch",
    ]),
  );

  write(origin, "notes.txt", "two\n");
  sh(origin, "git add -A && git commit -qm notes");
  const later = autofork(mine, "sync");
  expect(later.ok).toBe(true);
  expect(later.log).toContain("verified");
  expect(configOf(mine).picked).toEqual({
    setup: "echo installed",
    verify: "node --check app.js && echo verified",
  });
});

const picking = (name: string, own: JsonObject = {}) => {
  const origin = path.join(home, name);
  const mine = path.join(home, `${name}-fork`);
  const tool = path.join(home, `${name}-tool`);
  const runs = path.join(home, `${name}-runs.log`);
  const prompt = path.join(home, `${name}-prompt.txt`);
  const script = path.join(home, `${name}-agent.sh`);
  mkdirSync(origin);
  write(origin, "app.js", 'export const greet = (name) => "hello " + name;\n');
  sh(origin, "git init -q && git add -A && git commit -qm init");
  sh(home, `git clone -q ${origin} ${name}-fork`);

  const agent = (checks: JsonObject, edit = "sed -i 's/+ name/+ name.toUpperCase()/' app.js") => {
    writeFileSync(
      script,
      `cat > ${prompt}
echo ran >> ${runs}
touch ${tool}
${edit}
node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, ...JSON.parse(process.argv[1]) }))' '${JSON.stringify(checks).replaceAll("'", "'\\''")}'
`,
    );
  };

  mkdirSync(path.join(mine, ".autofork/shout"), { recursive: true });
  write(
    mine,
    ".autofork/config.json",
    JSON.stringify({ upstream: origin, agent: `sh ${script}`, ...own }),
  );
  write(mine, ".autofork/shout/PATCH.md", "greet() shouts the name.\n");
  sh(mine, "git add -A && git commit -qm 'autofork: greet() shouts the name'");

  const moveUpstream = () => {
    write(origin, "notes.txt", "two\n");
    sh(origin, "git add -A && git commit -qm notes");
  };

  return { origin, mine, tool, runs, prompt, script, agent, moveUpstream };
};

test("checks an agent picked that fail on upstream alone are dropped, and the sync ships without them, even one that doesn't heal", () => {
  const { mine, tool, runs, prompt, agent, moveUpstream } = picking("handmade", { setup: "true" });
  agent({ verify: `test -f ${tool}` });
  expect(autofork(mine, "sync").ok).toBe(true);
  expect(readFileSync(prompt, "utf-8")).toContain(
    'write .autofork/config.json\'s "verify", which checks a build, as one `sh -c` command. A sync runs it on a fresh machine after `true`',
  );
  expect(configOf(mine).picked).toEqual({
    verify: `test -f ${tool}`,
  });
  rmSync(tool);
  moveUpstream();
  const { ok, log } = autofork(mine, "sync", "--no-heal");
  expect(ok).toBe(true);
  expect(log).toContain(
    `\`test -f ${tool}\` fails on upstream alone, so the checks an agent picked are dropped`,
  );
  expect(readFileSync(runs, "utf-8")).toBe("ran\n");
  expect(file(mine, "notes.txt")).toBe("two\n");
  expect(file(mine, "app.js")).toContain("name.toUpperCase()");
  const config = configOf(mine);
  expect(config.setup).toBe("true");
  expect(config.picked).toBeUndefined();
});

test("checks an agent picked that fail on upstream alone are dropped before it rebuilds a patch, and it picks new ones", () => {
  const { origin, mine, tool, prompt, agent } = picking("repick");
  agent({ setup: "true", verify: `test -f ${tool}` });
  expect(autofork(mine, "sync").ok).toBe(true);
  expect(readFileSync(prompt, "utf-8")).toContain(
    'write .autofork/config.json\'s "setup", which installs dependencies, and "verify", which checks a build',
  );
  rmSync(tool);
  write(origin, "app.js", 'export const greet = (name) => "hi " + name;\n');
  sh(origin, "git commit -qam hi");
  agent(
    { verify: "node --check app.js" },
    `printf 'export const greet = (name) => "hi " + name.toUpperCase();\\n' > app.js`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("the checks an agent picked are dropped");
  expect(readFileSync(prompt, "utf-8")).toContain("This fork has no check yet");
  expect(file(mine, "app.js")).toContain('"hi " + name.toUpperCase()');
  expect(configOf(mine).picked).toEqual({
    verify: "node --check app.js",
  });
});

test("new picks that replace dropped ones run their own setup on upstream alone, so a patch that breaks them still stops the sync", () => {
  const ready = path.join(home, "replaced-ready");
  const { origin, mine, tool, runs, agent } = picking("replaced");
  agent({ setup: "true", verify: `test -f ${tool}` });
  expect(autofork(mine, "sync").ok).toBe(true);
  rmSync(tool);
  write(origin, "app.js", 'export const greet = (name) => "hi " + name;\n');
  sh(origin, "git commit -qam hi");
  agent(
    { setup: `! grep -q broken app.js && touch ${ready}`, verify: `test -f ${ready}` },
    `printf 'export const greet = (name) => "hi " + name.toUpperCase(); // broken\\n' > app.js`,
  );
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain("the checks an agent picked are dropped");
  expect(log).toContain("setup fails with shout, which the agent healed");
  expect(readFileSync(runs, "utf-8")).toBe("ran\nran\n");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("checks an agent leaves in an unreadable config aren't kept, and the sync says so", () => {
  const { mine, script } = picking("unreadable");
  writeFileSync(
    script,
    `cat > /dev/null
sed -i 's/+ name/+ name.toUpperCase()/' app.js
printf '{"verify": ' > .autofork/config.json
`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("the agent left .autofork/config.json unreadable");
  expect(file(mine, "app.js")).toContain("name.toUpperCase()");
  expect(configOf(mine).picked).toBeUndefined();
});

test("a check an agent picks that fails with the patch it built stops the sync instead of shipping the patch", () => {
  const { mine, runs, agent } = picking("broken");
  agent({ verify: `node -e "import('./app.js')"` }, `printf 'export const broken = ;\\n' > app.js`);
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(
    `verify fails with shout, which the agent built: node -e "import('./app.js')"`,
  );
  expect(readFileSync(runs, "utf-8")).toBe("ran\n");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});

test("a check an agent picks that an earlier saved patch fails gets that patch fixed, instead of failing the one the agent built", () => {
  const { mine, script, runs } = picking("earlier");
  mkdirSync(path.join(mine, ".autofork/amark"));
  write(mine, ".autofork/amark/PATCH.md", "mark.txt marks the fork.\n");
  write(mine, "mark.txt", "bad\n");
  expect(autofork(mine, "save", "amark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm mark");
  writeFileSync(
    script,
    `prompt="$(cat)"
case "$prompt" in
  *'named by its id'*) echo fix >> ${runs}; ${fixup({ amark: "printf 'good\\n' > mark.txt" })} ;;
  *) echo shout >> ${runs}; sed -i 's/+ name/+ name.toUpperCase()/' app.js; node -e 'const fs = require("fs"); const c = JSON.parse(fs.readFileSync(".autofork/config.json")); fs.writeFileSync(".autofork/config.json", JSON.stringify({ ...c, verify: "! grep -qs bad mark.txt" }))' ;;
esac
`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("healed amark");
  expect(readFileSync(runs, "utf-8")).toBe("shout\nfix\n");
  expect(file(mine, "mark.txt")).toBe("good\n");
  expect(file(mine, "app.js")).toContain("name.toUpperCase()");
  expect(configOf(mine).picked).toEqual({
    verify: "! grep -qs bad mark.txt",
  });
});

test("a picked verify that fails on upstream alone is dropped even when a patch broke setup, and the patch is still fixed", () => {
  const tool = path.join(home, "caught-tool");

  const { mine, script, runs, moveUpstream } = picking("caught", {
    setup: "! grep -qs bad mark.txt",
    picked: { verify: `test -f ${tool}` },
  });

  sh(mine, "git rm -rq .autofork/shout && git commit -qm 'no shout'");
  mkdirSync(path.join(mine, ".autofork/zmark"));
  write(mine, ".autofork/zmark/PATCH.md", "mark.txt marks the fork.\n");
  write(mine, "mark.txt", "bad\n");
  expect(autofork(mine, "save", "zmark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm zmark");
  moveUpstream();
  writeFileSync(
    script,
    `cat > /dev/null\necho fix >> ${runs}\n${fixup({ zmark: "printf 'good\\n' > mark.txt" })}\n`,
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain(
    `\`test -f ${tool}\` fails on upstream alone, so the checks an agent picked are dropped`,
  );
  expect(log).toContain("healed zmark");
  expect(file(mine, "mark.txt")).toBe("good\n");
  expect(readFileSync(runs, "utf-8")).toBe("fix\n");
  const config = configOf(mine);
  expect(config.setup).toBe("! grep -qs bad mark.txt");
  expect(config.picked).toBeUndefined();
});

test("a check an agent picked that fails with a saved patch gets the patch fixed, like a check you wrote", () => {
  const { mine, script, agent, moveUpstream } = picking("gate");
  agent({ verify: "! grep -qs bad mark.txt" });
  expect(autofork(mine, "sync").ok).toBe(true);
  mkdirSync(path.join(mine, ".autofork/zmark"));
  write(mine, ".autofork/zmark/PATCH.md", "mark.txt marks the fork.\n");
  write(mine, "mark.txt", "bad\n");
  expect(autofork(mine, "save", "zmark").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm mark");
  moveUpstream();
  writeFileSync(
    script,
    "cat > /dev/null\nprintf 'good\\n' > mark.txt\ngit -c user.name=a -c user.email=a@a commit -qa --amend --no-edit\n",
  );
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain("fixing verify in the patches");
  expect(log).toContain("healed zmark");
  expect(file(mine, "mark.txt")).toBe("good\n");
  expect(configOf(mine).picked).toEqual({
    verify: "! grep -qs bad mark.txt",
  });
});

test("once you write your own verify, the agent's picks count as yours and stop the sync when upstream breaks them", () => {
  const { origin, mine, agent, moveUpstream } = picking("owned");
  agent({ setup: "test ! -f notes.txt", verify: "true" });
  expect(autofork(mine, "sync").ok).toBe(true);
  configure(mine, { verify: "true && true" }, 0);
  sh(mine, "git commit -qam 'my verify'");
  moveUpstream();
  agent({});
  const head = sh(mine, "git rev-parse HEAD");
  const { ok, log } = autofork(mine, "sync");
  expect(ok).toBe(false);
  expect(log).toContain(
    `setup fails on upstream ${sh(origin, "git rev-parse HEAD").slice(0, 12)} itself: test ! -f notes.txt`,
  );
  expect(log).not.toContain("dropped");
  expect(sh(mine, "git rev-parse HEAD")).toBe(head);
});
