import { expect, test } from "bun:test";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

import { configure, file, harness, write } from "../harness.ts";

const h = harness();
const { home, github, sh, autofork, autoforkWith } = h;

test("a new fork starts at the release it follows, and one with changes of its own stays where it is", () => {
  const app = path.join(github, "acme/stable.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && mkdir -p .github/workflows && echo one | tee notes.txt > .github/workflows/ci.yml && git add -A && git commit -qm one && git tag v1.0.0 && echo two | tee notes.txt > .github/workflows/ci.yml && git commit -qam two && echo unreleased | tee notes.txt > .github/workflows/ci.yml && git commit -qam unreleased",
  );
  sh(home, `git clone -q ${app} stable && git clone -q ${app} stable-mine`);
  const mine = path.join(home, "stable");
  expect(autofork(mine, "init", "acme/stable").log).toContain(
    "autofork follows acme/stable's releases.",
  );
  const runs = path.join(home, "stable-runs.log");
  configure(mine, { agent: `echo ran >> ${runs}` }, 0);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  const { ok, log, output } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(output).toMatchObject({ result: "synced", tag: "v1.0.0" });
  expect(file(mine, "notes.txt")).toBe("one\n");
  expect(log).not.toContain("upstream changed");
  sh(app, "git tag v1.1.0 HEAD~1");
  const next = autofork(mine, "sync");
  expect(next.output).toMatchObject({ result: "synced", tag: "v1.1.0" });
  expect(file(mine, "notes.txt")).toBe("two\n");
  expect(next.log).not.toContain("upstream changed");
  expect(existsSync(runs)).toBe(false);

  const own = path.join(home, "stable-mine");
  expect(autofork(own, "init", "acme/stable").ok).toBe(true);
  write(own, "notes.txt", "unreleased, and mine\n");
  mkdirSync(path.join(own, ".autofork/mine"));
  write(own, ".autofork/mine/PATCH.md", "notes.txt is mine.\n");
  expect(autofork(own, "save", "mine").ok).toBe(true);
  sh(own, "git add -A && git commit -qm mine");
  expect(autofork(own, "sync").output.result).toBe("current");
  expect(file(own, "notes.txt")).toBe("unreleased, and mine\n");
});

test("a commit of the fork's own titled like a sync doesn't move where the next sync starts", () => {
  const origin = path.join(home, "branched");
  const mine = path.join(home, "branched-fork");
  mkdirSync(origin);
  sh(origin, "git init -q && echo one > notes.txt && git add -A && git commit -qm one");
  sh(home, `git clone -q ${origin} branched-fork`);
  sh(
    origin,
    "git checkout -qb stable && echo two > notes.txt && git commit -qam two && git checkout -q main && echo main > main.txt && git add -A && git commit -qm main",
  );
  expect(autofork(mine, "init", origin, "--follow", "stable").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track stable'");
  expect(autofork(mine, "sync").output.result).toBe("synced");
  write(mine, ".github/workflows/autofork.yml", "name: autofork\n");
  sh(mine, "git commit -qam 'autofork: sync on pushes to main, the branch this becomes'");
  const { ok, output } = autofork(mine, "sync");
  expect(ok).toBe(true);
  expect(output.result).toBe("current");
});

test("an upstream commit with a check still running past the first hundred isn't green", () => {
  const app = path.join(github, "acme/green.git");
  mkdirSync(app, { recursive: true });
  sh(app, "git init -q && echo one > notes.txt && git add -A && git commit -qm one");
  sh(home, `git clone -q ${app} green`);
  const mine = path.join(home, "green");
  expect(autofork(mine, "init", "acme/green").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  sh(app, "echo two > notes.txt && git commit -qam two");
  const two = sh(app, "git rev-parse HEAD");
  sh(app, "echo three > notes.txt && git commit -qam three");
  const passed = Array.from({ length: 150 }, () => "success");
  const runs = { [two]: passed, [sh(app, "git rev-parse HEAD")]: [...passed, null] };
  const { ok, log } = autoforkWith({ CHECK_RUNS: JSON.stringify(runs) }, mine, "sync");
  expect(ok).toBe(true);
  expect(log).toContain(`upstream's tip isn't green yet, using ${two.slice(0, 12)}`);
  expect(file(mine, "notes.txt")).toBe("two\n");
});

test("a fork on GitHub follows its latest release, not its highest tag", () => {
  const app = path.join(github, "acme/app.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag v9.0.0",
  );
  sh(
    app,
    "echo two > notes.txt && git commit -qam two && git tag desktop-v1.0.0 && echo three > notes.txt && git commit -qam three",
  );
  sh(home, `git clone -q ${app} app && git -C app reset -q --hard v9.0.0`);
  const mine = path.join(home, "app");
  expect(autofork(mine, "init", "acme/app").log).toContain("autofork follows acme/app's releases.");
  sh(mine, "git add -A && git commit -qm 'track upstream'");
  expect(autofork(mine, "sync").log).toContain("already up to date");
  const released = autoforkWith({ LATEST_RELEASE: "desktop-v1.0.0" }, mine, "sync");
  expect(released.ok).toBe(true);
  expect(released.output.result).toBe("synced");
  expect(file(mine, "notes.txt")).toBe("two\n");
});

test("init follows releases when every release is named with a dash", () => {
  const app = path.join(github, "acme/desktop.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag desktop-v1.0.0",
  );
  sh(home, `git clone -q ${app} desktop`);
  const mine = path.join(home, "desktop");
  expect(
    autoforkWith({ LATEST_RELEASE: "desktop-v1.0.0" }, mine, "init", "acme/desktop").log,
  ).toContain("autofork follows acme/desktop's releases.");
  sh(mine, "rm -rf .autofork .github");
  expect(autofork(mine, "init", "acme/desktop").log).toContain(
    "acme/desktop's main branch, since it has no releases",
  );
});

test("a fork can follow one channel of upstream's releases, named by its tags", () => {
  const app = path.join(github, "acme/nightly.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git tag v1.0.0",
  );
  sh(
    app,
    "echo two > notes.txt && git commit -qam two && git tag v1.1.0-nightly.1 && echo three > notes.txt && git commit -qam three && git tag v1.1.0-preview.1",
  );
  sh(home, `git clone -q ${app} nightly && git -C nightly reset -q --hard v1.0.0`);
  const mine = path.join(home, "nightly");

  const releases = JSON.stringify([
    { tag_name: "v1.1.0-nightly.2", draft: true, prerelease: true, published_at: null },
    {
      tag_name: "v1.1.0-preview.1",
      draft: false,
      prerelease: true,
      published_at: "2026-01-03T00:00:00Z",
    },
    {
      tag_name: "v1.1.0-nightly.1",
      draft: false,
      prerelease: true,
      published_at: "2026-01-02T00:00:00Z",
    },
    { tag_name: "v1.0.0", draft: false, prerelease: false, published_at: "2026-01-01T00:00:00Z" },
  ]);

  const init = autoforkWith(
    { RELEASES: releases, LATEST_RELEASE: "v1.0.0" },
    mine,
    "init",
    "acme/nightly",
  );

  expect(init.log).toContain("autofork follows acme/nightly's releases.");
  configure(mine, { follow: "v*-nightly.*" });
  sh(mine, "git add -A && git commit -qm 'track nightlies'");
  const synced = autoforkWith({ RELEASES: releases }, mine, "sync");
  expect(synced.output).toMatchObject({ result: "synced", tag: "v1.1.0-nightly.1" });
  expect(file(mine, "notes.txt")).toBe("two\n");
  expect(autofork(mine, "sync").output.result).toBe("current");
  expect(file(mine, "notes.txt")).toBe("two\n");
});

test("a new fork of a branch behind where it was forked starts there, even when upstream's checks count", () => {
  const app = path.join(github, "acme/behind.git");
  mkdirSync(app, { recursive: true });
  sh(
    app,
    "git init -q && echo one > notes.txt && git add -A && git commit -qm one && git branch stable && echo two > notes.txt && git commit -qam two",
  );
  sh(home, `git clone -q ${app} behind`);
  const mine = path.join(home, "behind");
  expect(autofork(mine, "init", "acme/behind", "--follow", "stable").ok).toBe(true);
  sh(mine, "git add -A && git commit -qm 'track stable'");
  const { ok, log, output } = autoforkWith({ CHECK_RUNS: "{}" }, mine, "sync");
  expect(ok).toBe(true);
  expect(log).not.toContain("no newer upstream commit");
  expect(output.result).toBe("synced");
  expect(file(mine, "notes.txt")).toBe("one\n");
});
