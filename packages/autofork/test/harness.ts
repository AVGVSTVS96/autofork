import { afterAll } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

export type Json = string | number | boolean | null | Json[] | JsonObject;

export interface JsonObject {
  [key: string]: Json;
}

export interface ConfigChanges {
  [key: string]: Json | undefined;
}

const cli = path.join(import.meta.dir, "../dist/autofork.js");

const GITCONFIG =
  "[user]\n\tname = test\n\temail = test@example.com\n[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n[diff]\n\tnoprefix = true\n";

const FAKE_API = `import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
globalThis.fetch = async (url, init = {}) => {
  url = String(url);
  const latest = process.env.LATEST_RELEASE;
  if (latest && url.endsWith("/releases/latest")) return new Response(JSON.stringify({ tag_name: latest }));
  if (process.env.RELEASES && url.includes("/releases?")) return new Response(process.env.RELEASES);
  if (process.env.PRICES && url.endsWith("/model_prices_and_context_window.json")) return new Response(process.env.PRICES);
  if (process.env.CHECK_RUNS && url.includes("/check-runs?")) {
    const { pathname, searchParams } = new URL(url);
    const runs = JSON.parse(process.env.CHECK_RUNS)[pathname.split("/")[5]] ?? [];
    const page = Number(searchParams.get("page") ?? 1);
    return Response.json({ total_count: runs.length, check_runs: runs.slice(page * 100 - 100, page * 100).map((conclusion) => ({ conclusion })) });
  }
  if (url.startsWith("https://token.test/")) return Response.json({ value: "oidc-" + new URL(url).searchParams.get("audience") });
  if (url.startsWith("https://site.test/")) {
    const path = url.slice("https://site.test".length);
    const log = process.env.SITE_LOG;
    let calls = 0;
    try { calls = readFileSync(log, "utf8").split("\\n").filter((line) => line.includes('"' + path + '"')).length; } catch {}
    const body = init.body && JSON.parse(init.body);
    const once = process.env.SITE_FAIL_ONCE === path && log + ".failed";
    if (once && !existsSync(once)) {
      writeFileSync(once, "");
      throw new TypeError("fetch failed");
    }
    appendFileSync(log, JSON.stringify({ method: init.method ?? "GET", path, auth: init.headers?.authorization, body }) + "\\n");
    if (path === "/api/ledger" && !body) return process.env.SITE_TOTALS ? new Response(process.env.SITE_TOTALS) : new Response("{}", { status: 404 });
    if (path === "/api/ledger") return Response.json({ id: "row-1" }, { status: 201 });
    if (path === "/api/ledger/close") return new Response(null, { status: 204 });
    if (path === "/api/link") return Response.json({ linked: calls >= Number(process.env.LINK_AFTER ?? 0), cron: null });
  }
  return new Response("{}", { status: 404 });
};
`;

const OUTPUT_LINE = /^(?<key>\w+)(?:=(?<value>.*)|<<(?<end>\S+)\n(?<block>[\s\S]*?)\n\k<end>)$/gmu;

export const isJsonObject = (value: unknown): value is JsonObject =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const file = (dir: string, name: string) => readFileSync(path.join(dir, name), "utf-8");

export const write = (dir: string, name: string, text: string) => {
  writeFileSync(path.join(dir, name), text);
};

export const parse = (text: string): JsonObject => {
  const value: unknown = JSON.parse(text);

  if (!isJsonObject(value)) {
    throw new TypeError(`not a JSON object: ${text}`);
  }

  return value;
};

export const readJson = (dir: string, name: string) => parse(file(dir, name));

export const configOf = (dir: string) => readJson(dir, ".autofork/config.json");

export const configure = (dir: string, changes: ConfigChanges, indent = 2) => {
  write(
    dir,
    ".autofork/config.json",
    `${JSON.stringify({ ...configOf(dir), ...changes }, null, indent)}\n`,
  );
};

export const stub = (dir: string, name: string, script: string) => {
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), `#!/bin/sh\n${script}\n`, { mode: 0o755 });
};

export const harness = () => {
  const home = mkdtempSync(path.join(tmpdir(), "autofork-test-"));
  const gitconfig = path.join(home, "gitconfig");
  const github = path.join(home, "github");
  const fakeApi = path.join(home, "fake-api.mjs");

  afterAll(() => {
    rmSync(home, { recursive: true, force: true });
  });
  writeFileSync(gitconfig, GITCONFIG);
  writeFileSync(gitconfig, `[url "${github}/"]\n\tinsteadOf = https://github.com/\n`, {
    flag: "a",
  });
  writeFileSync(fakeApi, FAKE_API);

  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_CONFIG_NOSYSTEM: "1",
    RUNNER_TEMP: home,
  };

  const sh = (cwd: string, command: string) => {
    const result = spawnSync("sh", ["-c", command], { cwd, env, encoding: "utf-8" });

    if (result.status !== 0) {
      throw new Error(`${command}\n${result.stderr}`);
    }

    return result.stdout.trim();
  };

  let calls = 0;

  const autoforkWith = (extra: NodeJS.ProcessEnv, cwd: string, ...args: string[]) => {
    const outputs = path.join(home, "github-output");

    calls += 1;
    writeFileSync(outputs, "");

    const result = spawnSync("node", ["--import", fakeApi, cli, ...args], {
      cwd,
      env: {
        ...env,
        AUTOFORK_LEDGER: path.join(home, `ledger-${calls}.json`),
        ...extra,
        GITHUB_OUTPUT: outputs,
      },
      encoding: "utf-8",
    });

    const output = Object.fromEntries(
      [...readFileSync(outputs, "utf-8").matchAll(OUTPUT_LINE)].map(({ groups }) => [
        groups?.key ?? "",
        groups?.value ?? groups?.block ?? "",
      ]),
    );

    return { ok: result.status === 0, log: result.stderr, output };
  };

  const autofork = (cwd: string, ...args: string[]) => autoforkWith({}, cwd, ...args);

  return { home, github, sh, autofork, autoforkWith };
};
