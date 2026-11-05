import { execFileSync } from "node:child_process";
import { appendFileSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import sharp from "sharp";
import type { Sharp } from "sharp";

import { detect } from "../server/icon.ts";
import { squash } from "../shared/api.ts";
import type { Repo } from "../shared/api.ts";

const Example = Schema.Struct({
  app: Schema.String,
  repo: Schema.String.check(Schema.isPattern(/^[\w.-]+\/[\w.-]+$/u)),
  change: Schema.String,
  issue: Schema.optionalKey(Schema.Number),
});

type Example = typeof Example.Type;

const Examples = Schema.Struct({ refreshed: Schema.String, examples: Schema.Array(Example) });

const Issue = Schema.Struct({
  pull_request: Schema.optionalKey(Schema.Unknown),
  state: Schema.String,
  repository_url: Schema.String,
  html_url: Schema.String,
});

const GitHubRepo = Schema.Struct({
  full_name: Schema.String,
  name: Schema.String,
  description: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
  owner: Schema.Struct({ login: Schema.String }),
});

const FILE = "src/lib/repos/examples.json";
const KNOWN = "src/lib/repos/known.json";
const EVERY = 4;

const today = new Date().toISOString().slice(0, 10);
const ICONS = "public/repos";
const ICON_SIZE = 96;
const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;

const ownerAndName = (repo: string) => {
  const [owner = "", name = ""] = repo.split("/");

  return { owner, name };
};

const iconName = (repo: string) => ownerAndName(repo).name.toLowerCase();

const read = Schema.decodeUnknownSync(Schema.fromJsonString(Examples));

const output = (key: string, value: string) => {
  if (process.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
  }
};

const github = async <A, I>(path: string, schema: Schema.Codec<A, I>) => {
  const headers = new Headers({ accept: "application/vnd.github+json" });

  if (token !== undefined) {
    headers.set("authorization", `Bearer ${token}`);
  }

  const response = await fetch(`https://api.github.com/${path}`, { headers });

  return response.ok ? Schema.decodeUnknownSync(schema)(await response.json()) : undefined;
};

const sharpFormat = async (image: Sharp) => {
  try {
    const { format } = await image.metadata();

    return format;
  } catch {
    return null;
  }
};

const optimize = async (bytes: Uint8Array, extension: string) => {
  if (extension === "svg") {
    return { bytes, extension };
  }

  const image = sharp(bytes);
  const format = await sharpFormat(image);

  if (format === null) {
    return { bytes, extension };
  }

  const small = image.resize(ICON_SIZE, ICON_SIZE, { fit: "inside", withoutEnlargement: true });

  return format === "jpeg"
    ? {
        bytes: new Uint8Array(await small.jpeg({ quality: 82, mozjpeg: true }).toBuffer()),
        extension: "jpg",
      }
    : {
        bytes: new Uint8Array(
          await small.png({ palette: true, compressionLevel: 9, effort: 10 }).toBuffer(),
        ),
        extension: "png",
      };
};

const download = async (url: string) => {
  const response = await fetch(url);

  return new Uint8Array(await response.arrayBuffer());
};

const saveRepoIcon = async (repo: string) => {
  const { owner, name } = ownerAndName(repo);
  const found = await Effect.runPromise(detect(token, owner, name));

  if (!found) {
    throw new Error(`${repo} isn't a public GitHub repo`);
  }

  const original = found.icon?.bytes ?? (await download(found.avatar));
  const { bytes, extension } = await optimize(original, found.icon?.extension ?? "png");
  const file = `${iconName(repo)}.${extension}`;

  for (const old of readdirSync(ICONS)) {
    if (old !== file && old.slice(0, old.lastIndexOf(".")) === iconName(repo)) {
      rmSync(`${ICONS}/${old}`);
    }
  }

  writeFileSync(`${ICONS}/${file}`, bytes);
  console.log(
    `${repo}: ${found.icon ? found.icon.path : "no icon of its own, so its owner's avatar"}, ${original.length} bytes saved as ${bytes.length}`,
  );

  return `/repos/${file}`;
};

const due = () => {
  const days =
    (Date.parse(today) - Date.parse(read(readFileSync(FILE, "utf-8")).refreshed)) / 86_400_000;

  const now = process.env.GITHUB_EVENT_NAME !== "schedule" || days >= EVERY;
  console.log(
    now
      ? `refreshing, last refresh was ${days} days ago`
      : `refreshed ${days} days ago, next refresh in ${EVERY - days}`,
  );
  output("due", String(now));
};

const unlinked = (examples: readonly Example[]) =>
  examples.filter(({ issue }) => issue === undefined).length;

const issueProblems = async ({ app, repo, issue }: Example) => {
  if (issue === undefined) {
    return [];
  }

  const found = await github(`repos/${repo}/issues/${issue}`, Issue);

  if (!found) {
    return [`${app}: ${repo}#${issue} doesn't exist`];
  }

  const problems: string[] = [];

  if (found.pull_request !== undefined) {
    problems.push(`${app}: ${repo}#${issue} is a pull request, not an issue`);
  }

  if (found.state !== "open") {
    problems.push(`${app}: ${repo}#${issue} is ${found.state}`);
  }

  if (!found.repository_url.toLowerCase().endsWith(`/repos/${repo.toLowerCase()}`)) {
    problems.push(`${app}: ${repo}#${issue} moved to ${found.html_url}`);
  }

  return problems;
};

const check = async () => {
  const before = read(execFileSync("git", ["show", `HEAD:./${FILE}`], { encoding: "utf-8" }));
  const after = read(readFileSync(FILE, "utf-8"));
  const problems: string[] = [];

  for (const [index, mine] of before.examples.entries()) {
    if (
      mine.issue === undefined &&
      JSON.stringify(after.examples[index]) !== JSON.stringify(mine)
    ) {
      problems.push(
        `${mine.app} is Bassim's own change and stays exactly as it was, at position ${index + 1}`,
      );
    }
  }

  if (unlinked(after.examples) !== unlinked(before.examples)) {
    problems.push("every example that isn't Bassim's names the open issue it comes from");
  }

  const apps = after.examples.map(({ app }) => squash(app));

  if (new Set(apps).size !== apps.length) {
    problems.push("each app appears once");
  }

  const [issues, repos] = await Promise.all([
    Promise.all(after.examples.map(issueProblems)),
    Promise.all(
      after.examples.map(async (example) => ({
        example,
        found: await github(`repos/${example.repo}`, GitHubRepo),
      })),
    ),
  ]);

  problems.push(...issues.flat());

  for (const { example, found } of repos) {
    if (!found) {
      problems.push(`${example.app}: ${example.repo} isn't a public GitHub repo`);
    }
  }

  if (problems.length > 0) {
    console.error(problems.map((problem) => `- ${problem}`).join("\n"));
    process.exit(1);
  }

  const known: Record<string, { repo: Repo; others: readonly Repo[] }> = {};

  for (const { example, found } of repos) {
    if (found) {
      known[squash(example.app)] = {
        repo: {
          owner: found.owner.login,
          name: found.name,
          description: found.description,
          stars: found.stargazers_count,
          // oxlint-disable-next-line eslint/no-await-in-loop -- one repo at a time, as GitHub asks: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#avoid-concurrent-requests
          avatar: await saveRepoIcon(found.full_name),
        },
        others: [],
      };
    }
  }

  writeFileSync(KNOWN, `${JSON.stringify(known, null, 2)}\n`);
  writeFileSync(
    FILE,
    `${JSON.stringify({ ...after, refreshed: today }, null, 2)
      .replaceAll(/\n {6}/gu, " ")
      .replaceAll(/\n {4}\}/gu, " }")}\n`,
  );

  const asks = after.examples.flatMap(({ app, issue }) =>
    issue === undefined ? [] : [`${app} #${issue}`],
  );

  console.log(`every example checks out: ${asks.join(", ")}`);
  output(
    "message",
    `The composer's examples are open requests again as of ${today}: ${asks.join(", ")}`,
  );
};

const command = Schema.decodeUnknownSync(Schema.Literals(["due", "check"]))(process.argv[2]);

if (command === "due") {
  due();
} else {
  await check();
}
