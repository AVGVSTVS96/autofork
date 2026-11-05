import { expect, test } from "bun:test";
import { mkdirSync } from "node:fs";
import path from "node:path";

import { file, harness, parse, stub, write } from "../harness.ts";

const h = harness();
const { home, github, sh, autoforkWith } = h;

test("link opens the site's page once the config is pushed, and waits until the fork is linked", () => {
  const app = path.join(github, "me/linked.git");
  mkdirSync(app, { recursive: true });
  sh(app, "git init -q --bare");
  const mine = path.join(home, "linked");
  mkdirSync(mine);
  sh(mine, "git init -q && echo one > app.js && git add -A && git commit -qm init");
  sh(mine, "git remote add origin https://github.com/me/linked && git push -q origin main");
  sh(app, "git symbolic-ref HEAD refs/heads/main");
  const bin = path.join(home, "link-bin");
  stub(bin, "xdg-open", `echo "$1" >> ${home}/opened`);
  stub(bin, "open", `echo "$1" >> ${home}/opened`);
  const siteLog = path.join(home, "link-site.log");

  const linking = (after: number) =>
    autoforkWith(
      {
        PATH: `${bin}:${process.env.PATH}`,
        AUTOFORK_URL: "https://site.test",
        SITE_LOG: siteLog,
        LINK_AFTER: String(after),
      },
      mine,
      "link",
    );

  const early = linking(9);
  expect(early.ok).toBe(false);
  expect(early.log).toContain("push .autofork/config.json to me/linked's default branch first");
  mkdirSync(path.join(mine, ".autofork"));
  write(mine, ".autofork/config.json", "{}");
  sh(mine, "git add -A && git commit -qm config && git push -q origin main");
  const { ok, log } = linking(2);
  expect(ok).toBe(true);
  expect(log).toContain("finish linking in your browser: https://site.test/link/me/linked");
  expect(log).toContain("linked: autofork.com starts it within a minute of upstream changing.");
  expect(file(home, "opened")).toBe("https://site.test/link/me/linked\n");
  expect(parse(file(home, "link-site.log").split("\n")[0] ?? "")).toMatchObject({
    method: "POST",
    path: "/api/link",
    body: { owner: "me", name: "linked" },
  });
  const again = linking(0);
  expect(again.log).toBe("linked: autofork.com starts it within a minute of upstream changing.\n");
});
