import { stripVTControlCharacters } from "node:util";

import { EVERY, LIMITS, WORKFLOW_FILE, workflow as autoforkWorkflow } from "@autofork/contract";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schedule from "effect/Schedule";
import * as Schema from "effect/Schema";

import { NotFound, Problem, split, squash } from "../shared/api.ts";
import type {
  Agent,
  Change,
  ForkState,
  Limits,
  MyFork,
  Repo,
  Run,
  Settings,
} from "../shared/api.ts";
import {
  cronLines,
  parses,
  readableFollow,
  readableLimits,
  readSettings,
  upstreamOf,
  withCron,
  withSettings,
} from "../shared/settings.ts";
import { Env } from "./env.ts";
import * as GitHub from "./github.ts";
import { keep } from "./lru.ts";
import type { User } from "./session.ts";

const Owner = Schema.Struct({ login: Schema.String });

const Listed = Schema.Struct({
  name: Schema.String,
  owner: Owner,
  description: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
});

const GitHubRepo = Schema.Struct({
  id: Schema.Number,
  name: Schema.String,
  full_name: Schema.String,
  owner: Owner,
  description: Schema.NullOr(Schema.String),
  stargazers_count: Schema.Number,
  default_branch: Schema.String,
  has_issues: Schema.Boolean,
  created_at: Schema.String,
  private: Schema.Boolean,
  parent: Schema.optionalKey(
    Schema.Struct({
      full_name: Schema.String,
      description: Schema.NullOr(Schema.String),
      default_branch: Schema.String,
    }),
  ),
  permissions: Schema.optionalKey(Schema.Struct({ admin: Schema.Boolean, push: Schema.Boolean })),
});

type GitHubRepo = typeof GitHubRepo.Type;

const toRepo = (repo: typeof Listed.Type): Repo => ({
  owner: repo.owner.login,
  name: repo.name,
  description: repo.description,
  stars: repo.stargazers_count,
  avatar: `/api/icon/${repo.owner.login}/${repo.name}`,
});

const problem = (message: string) => () => Effect.fail(new Problem({ message }));

const GITHUB =
  /^(?:https?:\/\/)?(?:www\.)?(?:github\.com\/)?(?<owner>[\w.-]+)\/(?<name>[\w.-]+?)(?:\.git)?(?:[/?#].*)?$/iu;

const searched = new Map<string, { repos: Repo[]; at: number }>();

/* GraphQL search spends one of the GraphQL API's 5,000 points an hour, where REST search allows 30 searches a minute:
   https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api */
const SEARCH = `query($q: String!) {
  search(query: $q, type: REPOSITORY, first: 10) { nodes { ... on Repository { name owner { login } description stargazers_count: stargazerCount } } }
}`;

const SearchAnswer = Schema.Struct({
  data: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        search: Schema.optionalKey(
          Schema.NullOr(Schema.Struct({ nodes: Schema.Array(Schema.NullOr(Listed)) })),
        ),
      }),
    ),
  ),
});

const search = Effect.fn(function* search(app: string, token: GitHub.Token) {
  const key = squash(app);
  const hit = searched.get(key);

  if (hit && Date.now() - hit.at < 3_600_000) {
    return hit.repos;
  }

  const found = yield* GitHub.post(
    token,
    "/graphql",
    { query: SEARCH, variables: { q: `${app.trim()} fork:false is:public sort:stars` } },
    SearchAnswer,
  ).pipe(Effect.option);

  const nodes = Option.getOrUndefined(found)?.data?.search?.nodes;

  if (!nodes) {
    if (hit) {
      return hit.repos;
    }

    return yield* new Problem({
      message: "GitHub search is busy. Name the repo as owner/name instead.",
    });
  }

  const repos = nodes.filter((node) => node !== null).map(toRepo);
  keep(searched, key, { repos, at: Date.now() }, 2000);

  return repos;
});

export const resolve = Effect.fn(function* resolve(q: string, token: GitHub.Token) {
  const { app, change } = split(q);
  const named = GITHUB.exec(app)?.groups;

  if (named?.owner !== undefined && named.name !== undefined) {
    const missing = problem(`There's no public repo at github.com/${named.owner}/${named.name}.`);

    const repo = yield* GitHub.get(token, `/repos/${named.owner}/${named.name}`, GitHubRepo).pipe(
      Effect.catch(missing),
    );

    if (repo.private) {
      return yield* missing();
    }

    return { repo: toRepo(repo), change, others: [] };
  }

  const repos = yield* search(app, token);
  const exact = repos.find((repo) => squash(repo.name) === squash(app));
  const repo = exact ?? repos[0];

  if (!repo) {
    return yield* new Problem({
      message: `No open source repo on GitHub matches "${app}". Try owner/name.`,
    });
  }

  return { repo, change, others: exact ? [] : repos.slice(1, 4) };
});

const SITE = "https://autofork.com";

const FILLER = new Set(["the", "a", "an", "to", "and", "so", "of", "it", "that"]);

const slug = (change: string) =>
  change
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, " ")
    .trim()
    .split(" ")
    .filter((word) => !FILLER.has(word))
    .slice(0, 5)
    .join("-")
    .slice(0, 48)
    .replace(/-+$/u, "") || "change";

const NOTE = "fork-readme";

const freshId = (entries: readonly { name: string }[], change: string) => {
  const taken = new Set([NOTE, ...entries.map((entry) => entry.name)]);
  let id = slug(change);

  for (let n = 2; taken.has(id); n += 1) {
    id = `${slug(change)}-${n}`;
  }

  return id;
};

const patchDoc = (change: string) =>
  `${change.trim().replace(/^\w/u, (first) => first.toUpperCase())}\n`;

const Person = Schema.Struct({
  login: Schema.String,
  name: Schema.NullOr(Schema.String),
  type: Schema.String,
});

const describe = Effect.fn(
  function* describe(token: GitHub.Token, repo: GitHubRepo) {
    const owner = yield* GitHub.get(token, `/users/${repo.owner.login}`, Person);
    const full = owner.name?.trim();
    const called = owner.type === "User" ? full?.split(/\s+/u)[0] : full;
    const who = called === undefined || called === "" ? owner.login : called;
    const theirs = repo.parent?.description ?? "";
    const description = theirs === "" ? `${who}'s autofork` : `${who}'s autofork · ${theirs}`;

    if (description !== repo.description) {
      yield* GitHub.send(token, "PATCH", `/repos/${repo.full_name}`, { description });
    }
  },
  (effect) => Effect.ignore(effect),
);

const Readme = Schema.Struct({ path: Schema.String, sha: Schema.String, content: Schema.String });

const readme = (token: GitHub.Token, repo: string, ref?: string) =>
  GitHub.get(token, `/repos/${repo}/readme${ref === undefined ? "" : `?ref=${ref}`}`, Readme);

const readmeNote = (token: GitHub.Token, fork: string, branch: string, upstream: string) =>
  Effect.all([readme(token, fork, branch), readme(token, upstream)], { concurrency: 2 }).pipe(
    Effect.map(([mine, theirs]): GitHub.File[] => {
      const [, name = upstream] = upstream.split("/");
      const text = Buffer.from(mine.content, "base64").toString();

      return mine.sha === theirs.sha &&
        /^readme\.md$/iu.test(mine.path) &&
        text.trim() !== "" &&
        !text.includes("autofork.com")
        ? [
            {
              path: `.autofork/${NOTE}/PATCH.md`,
              content: `One line under the README's title says this is a personal fork of ${name} that updates itself with autofork, linking ${name}, https://autofork.com and this fork's \`.autofork/\` folder. The rest of the README stays as upstream wrote it.

To drop the line, delete it from the README and delete this folder, in the same commit.
`,
            },
          ]
        : [];
    }),
    Effect.orElseSucceed(() => []),
  );

const DirEntry = Schema.Struct({
  name: Schema.String,
  type: Schema.String,
  size: Schema.Number,
  sha: Schema.String,
});

const listDir = (token: GitHub.Token, owner: string, name: string, path: string) =>
  GitHub.get(token, `/repos/${owner}/${name}/contents/${path}`, Schema.Array(DirEntry)).pipe(
    Effect.catchIf(GitHub.missing, () => Effect.succeed(Arr.empty<typeof DirEntry.Type>())),
  );

const existingFork = (user: User, upstream: GitHubRepo, into: string) =>
  GitHub.get(user.token, `/repos/${into}/${upstream.name}`, GitHubRepo).pipe(
    Effect.map((repo) => (repo.parent?.full_name === upstream.full_name ? repo : null)),
    Effect.catchIf(GitHub.missing, () => Effect.succeed(null)),
  );

const makeFork = (user: User, upstream: GitHubRepo, into: string) =>
  GitHub.post(
    user.token,
    `/repos/${upstream.full_name}/forks`,
    into === user.login
      ? { default_branch_only: true }
      : { default_branch_only: true, organization: into },
    GitHubRepo,
  ).pipe(
    Effect.catchIf(
      (error) => error.status === 403,
      () => Effect.succeed(null),
    ),
  );

const Installation = Schema.Struct({
  id: Schema.Number,
  account: Schema.Struct({ login: Schema.String, type: Schema.String }),
  repository_selection: Schema.Literals(["all", "selected"]),
});

type Installation = typeof Installation.Type;

const installations = (user: User) =>
  GitHub.get(
    user.token,
    "/user/installations",
    Schema.Struct({ installations: Schema.Array(Installation) }),
  ).pipe(
    Effect.map((answer) => answer.installations),
    Effect.orElseSucceed(() => Arr.empty<Installation>()),
  );

const accessPage = (installation: Installation | undefined) => {
  if (!installation) {
    return "https://github.com/settings/installations";
  }

  return installation.account.type === "Organization"
    ? `https://github.com/organizations/${installation.account.login}/settings/installations/${installation.id}`
    : `https://github.com/settings/installations/${installation.id}`;
};

const reachable = (user: User, owner: string, name: string) =>
  GitHub.get(user.token, `/repos/${owner}/${name}/actions/secrets/public-key`, Schema.Unknown).pipe(
    Effect.as(true),
    Effect.catch(() => Effect.succeed(false)),
  );

export const prepare = Effect.fn(function* prepare(
  user: User,
  owner: string,
  name: string,
  into: string | undefined,
  preview: boolean,
) {
  const installed = yield* installations(user);

  const places = [
    user.login,
    ...installed
      .filter((each) => each.account.type === "Organization")
      .map((each) => each.account.login),
  ];

  const place = into !== undefined && places.includes(into) ? into : user.login;

  const upstream = yield* GitHub.get(user.token, `/repos/${owner}/${name}`, GitHubRepo).pipe(
    Effect.catch(problem(`Can't find github.com/${owner}/${name}.`)),
  );

  if (upstream.private) {
    return yield* new Problem({ message: "autofork works with public repos." });
  }

  if (upstream.owner.login === place) {
    return yield* new Problem({
      message: "That repo is already yours. Name the repo you'd fork.",
    });
  }

  const installation = installed.find((each) => each.account.login === place);

  if (!installation) {
    const { appSlug } = yield* Env;

    return {
      owner: place,
      name: upstream.name,
      status: "install",
      link: `https://github.com/apps/${appSlug}/installations/new`,
      places,
    } satisfies ForkState;
  }

  const fork = yield* existingFork(user, upstream, place).pipe(
    Effect.flatMap((found) =>
      found || preview ? Effect.succeed(found) : makeFork(user, upstream, place),
    ),
    Effect.catchIf(
      (error) => !GitHub.busy(error),
      problem("GitHub couldn't make the fork. Try again in a moment."),
    ),
  );

  if (!fork && preview && installation.repository_selection === "all") {
    return {
      owner: place,
      name: upstream.name,
      status: "new",
      link: null,
      places,
    } satisfies ForkState;
  }

  if (!fork) {
    return {
      owner: place,
      name: upstream.name,
      status: "fork",
      link: `https://github.com/${upstream.full_name}/fork`,
      places,
    } satisfies ForkState;
  }

  const fresh = Date.now() - Date.parse(fork.created_at) < 120_000;

  const ready = yield* reachable(user, fork.owner.login, fork.name).pipe(
    Effect.flatMap((ok) => (ok || !fresh ? Effect.succeed(ok) : Effect.fail("not yet"))),
    Effect.retry({ schedule: Schedule.spaced("1 second"), times: 8 }),
    Effect.orElseSucceed(() => false),
  );

  return {
    owner: fork.owner.login,
    name: fork.name,
    status: ready ? "ready" : "grant",
    link: ready
      ? null
      : accessPage(installed.find((each) => each.account.login === fork.owner.login)),
    places,
  } satisfies ForkState;
});

const retrying = { schedule: Schedule.spaced("2 seconds"), times: 15 };

const MergeBase = Schema.Struct({ merge_base_commit: Schema.Struct({ sha: Schema.String }) });

const upstreamWorkflowsToDelete = Effect.fn(
  function* upstreamWorkflowsToDelete(token: GitHub.Token, repo: GitHubRepo, branch: string) {
    if (!repo.parent) {
      return [];
    }

    const [parentOwner = "", parentName = ""] = repo.parent.full_name.split("/");

    const { merge_base_commit } = yield* GitHub.get(
      token,
      `/repos/${repo.full_name}/compare/${parentOwner}:${repo.parent.default_branch}...${branch}`,
      MergeBase,
    );

    const asBranched = yield* listDir(
      token,
      parentOwner,
      parentName,
      `.github/workflows?ref=${merge_base_commit.sha}`,
    );

    const untouched = new Set(asBranched.map((entry) => `${entry.name} ${entry.sha}`));
    const current = yield* listDir(token, repo.owner.login, repo.name, ".github/workflows");

    return current
      .filter(
        (entry) => entry.name !== "autofork.yml" && untouched.has(`${entry.name} ${entry.sha}`),
      )
      .map((entry): GitHub.File => ({ path: `.github/workflows/${entry.name}`, deleted: true }));
  },
  Effect.retry({ schedule: Schedule.exponential("1 second"), times: 2 }),
  Effect.orElseSucceed(() => Arr.empty<GitHub.File>()),
);

const SECRETS = {
  claude: "CLAUDE_CODE_OAUTH_TOKEN",
  chatgpt: "CODEX_AUTH",
} as const satisfies Record<Agent, string>;

const TotalCount = Schema.Struct({ total_count: Schema.Number });

const kickOff = (token: string, owner: string, name: string, branch: string, sha: string) =>
  GitHub.get(
    token,
    `/repos/${owner}/${name}/actions/runs?head_sha=${sha}&per_page=1`,
    TotalCount,
  ).pipe(
    Effect.flatMap(({ total_count }) =>
      total_count > 0 ? Effect.void : Effect.fail("no run yet"),
    ),
    Effect.retry({ schedule: Schedule.spaced("2 seconds"), times: 5 }),
    Effect.catch(() =>
      GitHub.send(
        token,
        "POST",
        `/repos/${owner}/${name}/actions/workflows/autofork.yml/dispatches`,
        { ref: branch },
      ).pipe(Effect.ignore),
    ),
  );

export const start = Effect.fn(function* start(
  user: User,
  owner: string,
  name: string,
  change: string,
  agent: Agent,
  credential: string,
) {
  if (!change.trim()) {
    return yield* new Problem({ message: "Say what you'd change." });
  }

  const repo = yield* GitHub.get(user.token, `/repos/${owner}/${name}`, GitHubRepo).pipe(
    Effect.retry(retrying),
  );

  if (repo.permissions?.admin !== true) {
    return yield* new Problem({ message: "That fork isn't yours." });
  }

  const branch = repo.default_branch;
  yield* GitHub.head(user.token, owner, name, branch).pipe(Effect.retry(retrying));

  const control = yield* listDir(user.token, owner, name, ".autofork");
  const managed = control.some((entry) => entry.name === "config.json");

  const flow = yield* GitHub.fileText(
    user.token,
    `/repos/${owner}/${name}/contents/.github/workflows/autofork.yml?ref=${branch}`,
  ).pipe(Effect.catchIf(GitHub.missing, () => Effect.succeed("")));

  if (managed && flow !== "" && !flow.includes(SECRETS[agent])) {
    return yield* new Problem({
      message: `This fork's .github/workflows/autofork.yml doesn't pass ${SECRETS[agent]} to autofork. Add it to the autofork step's env, or pick the other agent.`,
    });
  }

  yield* GitHub.setSecret(user.token, owner, name, SECRETS[agent], credential);
  yield* GitHub.deleteSecret(
    user.token,
    owner,
    name,
    SECRETS[agent === "claude" ? "chatgpt" : "claude"],
  );
  yield* GitHub.send(user.token, "PUT", `/repos/${owner}/${name}/actions/permissions`, {
    enabled: true,
    allowed_actions: "all",
  });

  if (!repo.has_issues) {
    yield* GitHub.send(user.token, "PATCH", `/repos/${owner}/${name}`, {
      has_issues: true,
    }).pipe(Effect.ignore);
  }

  yield* describe(user.token, repo);

  const id = freshId(control, change);
  const files: GitHub.File[] = [{ path: `.autofork/${id}/PATCH.md`, content: patchDoc(change) }];

  if (!managed || flow === "") {
    files.push({
      path: WORKFLOW_FILE,
      content: autoforkWorkflow({ branch, cron: EVERY["15m"], site: SITE, workflowTokens: true }),
    });
  }

  if (!managed) {
    const upstream = repo.parent?.full_name ?? `${owner}/${name}`;
    const noted = !repo.parent || control.some((entry) => entry.name === NOTE);

    files.push(
      {
        path: ".autofork/config.json",
        content: `${JSON.stringify({ upstream, limits: LIMITS }, null, 2)}\n`,
      },
      ...(noted ? [] : yield* readmeNote(user.token, `${owner}/${name}`, branch, upstream)),
      ...(yield* upstreamWorkflowsToDelete(user.token, repo, branch)),
    );
  }

  const sha = yield* GitHub.commit(
    user.token,
    owner,
    name,
    branch,
    `autofork: ${change.trim()}`,
    files,
  );

  yield* kickOff(user.token, owner, name, branch, sha);

  return { owner, name };
});

export const addChange = Effect.fn(function* addChange(
  user: User,
  owner: string,
  name: string,
  change: string,
) {
  if (!change.trim()) {
    return yield* new Problem({ message: "Say what you'd change." });
  }

  const repo = yield* GitHub.get(user.token, `/repos/${owner}/${name}`, GitHubRepo);

  if (repo.permissions?.push !== true) {
    return yield* new Problem({ message: "That fork isn't yours." });
  }

  yield* describe(user.token, repo);
  const id = freshId(yield* listDir(user.token, owner, name, ".autofork"), change);

  const sha = yield* GitHub.commit(
    user.token,
    owner,
    name,
    repo.default_branch,
    `autofork: ${change.trim()}`,
    [{ path: `.autofork/${id}/PATCH.md`, content: patchDoc(change) }],
  );

  yield* kickOff(user.token, owner, name, repo.default_branch, sha);

  return { owner, name };
});

const Step = Schema.Struct({
  name: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
});

const Job = Schema.Struct({
  id: Schema.Number,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  started_at: Schema.String,
  completed_at: Schema.NullOr(Schema.String),
  steps: Schema.optionalKey(Schema.Array(Step)),
});

type Job = typeof Job.Type;

const WorkflowRun = Schema.Struct({
  id: Schema.Number,
  run_attempt: Schema.Number,
  html_url: Schema.String,
  status: Schema.String,
  conclusion: Schema.NullOr(Schema.String),
  run_started_at: Schema.String,
  updated_at: Schema.String,
  head_sha: Schema.String,
  head_branch: Schema.NullOr(Schema.String),
});

type WorkflowRun = typeof WorkflowRun.Type;

const SYNC = "autofork: sync ";
const SUBJECT = /^autofork: sync \S+ to [0-9a-f]{12}(?:\n|$)/u;
const MOVED = /^\S+ changed while this ran, so the next run syncs it instead$/u;
const SKIPPED = "autofork: already failed on upstream ";

type ChangeText = (id: string) => string;

const capitalizedUnlessPatchId = (line: string, changeText: ChangeText) => {
  const first = /^[\w.-]+/u.exec(line)?.[0] ?? "";

  return changeText(first) === first
    ? line.replace(/^[a-z]/u, (letter) => letter.toUpperCase())
    : line;
};

const synced = (message: string, changeText: ChangeText) =>
  message.split("\n").flatMap((line): string[] => {
    if (
      line === `built ${NOTE}` ||
      line === `healed ${NOTE}` ||
      line.startsWith(`upstream has ${NOTE}:`)
    ) {
      return [];
    }

    const built = /^built (?<id>\S+)$/u.exec(line)?.groups?.id;

    if (built !== undefined) {
      return [`Built "${changeText(built)}"`];
    }

    const healed = /^healed (?<id>\S+)$/u.exec(line)?.groups?.id;

    if (healed !== undefined) {
      return [`Rebuilt "${changeText(healed)}" on the new release`];
    }

    const paused = /^upstream has (?<id>\S+): (?<why>.+)$/u.exec(line)?.groups;

    if (paused?.id !== undefined && paused.why !== undefined) {
      return [`Paused "${changeText(paused.id)}": ${paused.why}`];
    }

    return [];
  });

type Story = Pick<Run, "log" | "moved" | "change"> & { readonly skipped?: boolean };

const unsynced = (raw: string, changeText: ChangeText): Story => {
  const lines = raw
    .split("\n")
    .map((line) => stripVTControlCharacters(line.replace(/^\S+Z /u, "")).trim());

  const moved = lines.find((line) => MOVED.test(line));

  if (moved !== undefined) {
    return { log: [moved], moved: true, change: null };
  }

  const reason = lines.findLast((line) => line.startsWith("autofork: ") && !line.startsWith(SYNC));

  return {
    log:
      reason === undefined
        ? []
        : [capitalizedUnlessPatchId(reason.slice("autofork: ".length), changeText)],
    moved: false,
    change: null,
    skipped: reason?.startsWith(SKIPPED) === true,
  };
};

const toldByJob = new Map<number, Story>();

const SyncCommit = Schema.Struct({
  html_url: Schema.String,
  parents: Schema.Array(Schema.Struct({ sha: Schema.String })),
  commit: Schema.Struct({ message: Schema.String }),
});

interface FinishedJob {
  readonly id: number;
  readonly since: string;
  readonly until: string;
}

const jobStory = (
  token: GitHub.Token,
  owner: string,
  name: string,
  run: WorkflowRun,
  job: FinishedJob,
  changeText: ChangeText,
) => {
  const hit = toldByJob.get(job.id);

  if (hit) {
    return Effect.succeed(hit);
  }

  const query = new URLSearchParams({
    sha: run.head_branch ?? run.head_sha,
    since: job.since,
    until: job.until,
    per_page: "20",
  });

  return GitHub.get(
    token,
    `/repos/${owner}/${name}/commits?${query}`,
    Schema.Array(SyncCommit),
  ).pipe(
    Effect.map((commits) =>
      commits.find(
        (each) => each.parents[0]?.sha === run.head_sha && SUBJECT.test(each.commit.message),
      ),
    ),
    Effect.flatMap((sync) =>
      sync
        ? Effect.succeed<Story>({
            log: [...new Set(synced(sync.commit.message, changeText))],
            moved: false,
            change: sync.html_url,
          })
        : GitHub.text(token, `/repos/${owner}/${name}/actions/jobs/${job.id}/logs`).pipe(
            Effect.map((raw) => unsynced(raw, changeText)),
          ),
    ),
    Effect.tap((story) =>
      Effect.sync(() => {
        keep(toldByJob, job.id, story, 500);
      }),
    ),
  );
};

const runs = (token: GitHub.Token, owner: string, name: string, query: string) =>
  GitHub.get(
    token,
    `/repos/${owner}/${name}/actions/workflows/autofork.yml/runs?exclude_pull_requests=true&${query}`,
    Schema.Struct({ workflow_runs: Schema.Array(WorkflowRun) }),
  ).pipe(Effect.map(({ workflow_runs }) => workflow_runs));

const jobOf = (token: GitHub.Token, owner: string, name: string, run: WorkflowRun) =>
  GitHub.get(
    token,
    `/repos/${owner}/${name}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
    Schema.Struct({ jobs: Schema.Array(Job) }),
  ).pipe(Effect.map(({ jobs }) => jobs[0]));

const FAILED = ["failure", "cancelled", "timed_out"];

const AUTOFORK_STEP = /\/(?:autofork|autopatch)@/u;

const TreeEntry = Schema.Struct({
  path: Schema.String,
  type: Schema.String,
  size: Schema.optionalKey(Schema.Number),
  sha: Schema.String,
});

type TreeEntry = typeof TreeEntry.Type;

const finishedAttemptJobs = new Map<string, Job | undefined>();
const trees = new Map<string, readonly TreeEntry[]>();
const blobs = new Map<string, string>();

const bySha = <A>(
  cache: Map<string, A>,
  sha: string,
  load: Effect.Effect<A, GitHub.GitHubError>,
) => {
  const hit = cache.get(sha);

  return hit === undefined
    ? Effect.tap(load, (value) =>
        Effect.sync(() => {
          keep(cache, sha, value, 2000);
        }),
      )
    : Effect.succeed(hit);
};

const failureSkippedOver = Effect.fn(function* failureSkippedOver(
  token: GitHub.Token,
  owner: string,
  name: string,
  skip: WorkflowRun,
) {
  const found = yield* Effect.all(
    FAILED.map((status) =>
      runs(token, owner, name, `head_sha=${skip.head_sha}&status=${status}&per_page=20`),
    ),
    { concurrency: 3 },
  );

  const failed = found.flat().toSorted((a, b) => b.run_started_at.localeCompare(a.run_started_at));

  for (let at = 0; at < failed.length; at += 10) {
    const chunk = failed.slice(at, at + 10);

    const jobs = yield* Effect.all(
      chunk.map((run) =>
        bySha(finishedAttemptJobs, `${run.id}-${run.run_attempt}`, jobOf(token, owner, name, run)),
      ),
      { concurrency: 10 },
    );

    const hit = jobs.findIndex(
      (job) =>
        job?.steps?.some(
          (step) => AUTOFORK_STEP.test(step.name) && FAILED.includes(step.conclusion ?? ""),
        ) === true,
    );

    const run = chunk[hit];

    if (run) {
      return { run, job: jobs[hit] };
    }
  }

  return null;
});

const latestRun = Effect.fn(
  function* latestRun(token: GitHub.Token, owner: string, name: string, changeText: ChangeText) {
    const [newest] = yield* runs(token, owner, name, "per_page=1");

    if (!newest) {
      return null;
    }

    const told = (run: WorkflowRun, job: Job | undefined) => {
      const untold: Story = { log: [], moved: false, change: null };
      const until = job?.completed_at ?? "";

      return job && until !== ""
        ? jobStory(
            token,
            owner,
            name,
            run,
            { id: job.id, since: job.started_at, until },
            changeText,
          ).pipe(Effect.orElseSucceed(() => untold))
        : Effect.succeed(untold);
    };

    const latest = yield* jobOf(token, owner, name, newest);
    const latestStory = yield* told(newest, latest);

    const failed =
      latestStory.skipped === true
        ? yield* failureSkippedOver(token, owner, name, newest).pipe(
            Effect.orElseSucceed(() => null),
          )
        : null;

    const { run, job } = failed ?? { run: newest, job: latest };
    const story = failed ? yield* told(run, job) : latestStory;

    return {
      url: run.html_url,
      status: run.status,
      conclusion: run.conclusion,
      startedAt: run.run_started_at,
      updatedAt: run.updated_at,
      steps: (job?.steps ?? []).map((step) => ({
        name: step.name,
        status: step.status,
        conclusion: step.conclusion,
      })),
      log: story.log,
      moved: story.moved,
      change: story.change,
      latestAt: newest.run_started_at,
    } satisfies Run;
  },
  Effect.catchIf(GitHub.missing, () => Effect.succeed(null)),
);

const summary = (doc: string) => {
  const paragraph =
    doc
      .trim()
      .replace(/^#+\s*/u, "")
      .split(/\n\s*\n/u)[0]
      ?.replaceAll(/\s*\n\s*/gu, " ") ?? "";

  return /^.+?[.!?](?=\s|$)/u.exec(paragraph)?.[0] ?? paragraph;
};

const tree = (token: GitHub.Token, owner: string, name: string, sha: string) =>
  bySha(
    trees,
    sha,
    GitHub.get(
      token,
      `/repos/${owner}/${name}/git/trees/${sha}`,
      Schema.Struct({ tree: Schema.Array(TreeEntry) }),
    ).pipe(Effect.map((answer) => answer.tree)),
  );

const blob = (token: GitHub.Token, owner: string, name: string, sha: string) =>
  bySha(
    blobs,
    sha,
    GitHub.get(
      token,
      `/repos/${owner}/${name}/git/blobs/${sha}`,
      Schema.Struct({ content: Schema.String }),
    ).pipe(Effect.map(({ content }) => Buffer.from(content, "base64").toString())),
  );

const upstreamFor = (config: string | null, self: string, parent: string | undefined) => {
  const named = upstreamOf(config) ?? parent ?? null;

  return named?.toLowerCase() === self.toLowerCase() ? null : named;
};

const agentOf = (secrets: ReadonlySet<string>): Agent | null => {
  if (secrets.has(SECRETS.claude)) {
    return "claude";
  }

  return secrets.has(SECRETS.chatgpt) ? "chatgpt" : null;
};

const Issue = Schema.Struct({ title: Schema.String, html_url: Schema.String });

export const status = Effect.fn(function* status(owner: string, name: string) {
  const token = yield* GitHub.repoToken(owner, name).pipe(Effect.catch(() => GitHub.appToken));

  const repo = yield* GitHub.get(token, `/repos/${owner}/${name}`, GitHubRepo).pipe(
    Effect.catchIf(GitHub.missing, () => Effect.fail(new NotFound({ from: null }))),
  );

  const readableByAnyone = !repo.private;

  if (!readableByAnyone) {
    return yield* new NotFound({ from: null });
  }

  const control = yield* listDir(token, owner, name, ".autofork");
  const config = control.find((entry) => entry.name === "config.json" && entry.type === "file");

  if (!config) {
    return yield* new NotFound({ from: repo.parent?.full_name ?? repo.full_name });
  }

  const upstream = upstreamFor(
    yield* blob(token, owner, name, config.sha).pipe(Effect.orElseSucceed(() => null)),
    repo.full_name,
    repo.parent?.full_name,
  );

  const found = yield* Effect.all(
    control
      .filter((entry) => entry.type === "dir")
      .map(
        Effect.fn(function* readChange(dir: typeof DirEntry.Type) {
          const files = yield* tree(token, owner, name, dir.sha);

          const read = (file: string) => {
            const entry = files.find((each) => each.path === file);

            return entry
              ? blob(token, owner, name, entry.sha).pipe(Effect.orElseSucceed(() => ""))
              : Effect.succeed("");
          };

          const paused = files.some((file) => file.path === "UPSTREAM.md")
            ? summary(yield* read("UPSTREAM.md"))
            : null;

          const built = files.some((file) => file.path.endsWith(".patch") && (file.size ?? 0) > 0);

          return { id: dir.name, text: summary(yield* read("PATCH.md")), paused, built };
        }),
      ),
    { concurrency: 6 },
  );

  const issues = found.some((change) => change.paused !== null)
    ? yield* GitHub.get(
        token,
        `/repos/${owner}/${name}/issues?state=open&per_page=100`,
        Schema.Array(Issue),
      ).pipe(
        Effect.map((list) => new Map(list.map((issue) => [issue.title, issue.html_url]))),
        Effect.orElseSucceed(() => new Map<string, string>()),
      )
    : new Map<string, string>();

  const note = found.some((change) => change.id === NOTE);

  const changes = found
    .filter((change) => change.id !== NOTE)
    .map(({ id, text, paused, built }): Change => {
      if (paused !== null) {
        return {
          id,
          text,
          state: "paused",
          upstream: paused,
          issue: issues.get(`${id}: upstream does this now`) ?? null,
        };
      }

      return { id, text, state: built ? "built" : "building", upstream: null, issue: null };
    });

  const secrets = yield* GitHub.get(
    token,
    `/repos/${owner}/${name}/actions/secrets`,
    Schema.Struct({ secrets: Schema.Array(Schema.Struct({ name: Schema.String })) }),
  ).pipe(
    Effect.map((answer) => new Set(answer.secrets.map((secret) => secret.name))),
    Effect.orElseSucceed(() => new Set<string>()),
  );

  return {
    owner: repo.owner.login,
    name: repo.name,
    upstream,
    agent: agentOf(secrets),
    changes,
    note,
    run: yield* latestRun(
      token,
      owner,
      name,
      (id) => changes.find((change) => change.id === id)?.text ?? id,
    ),
  };
});

export const yours = (viewer: User, owner: string, name: string) =>
  GitHub.get(viewer.token, `/repos/${owner}/${name}`, GitHubRepo).pipe(
    Effect.map((seen) => ({
      id: seen.id,
      name: seen.full_name,
      push: seen.permissions?.push === true,
    })),
    Effect.catchIf(GitHub.missing, () =>
      Effect.succeed({ id: 0, name: `${owner}/${name}`, push: false }),
    ),
    Effect.option,
  );

const FileText = Schema.NullOr(
  Schema.Struct({ text: Schema.optionalKey(Schema.NullOr(Schema.String)) }),
);

const Node = Schema.Struct({
  name: Schema.String,
  databaseId: Schema.Number,
  createdAt: Schema.String,
  viewerPermission: Schema.NullOr(Schema.String),
  owner: Owner,
  parent: Schema.NullOr(Schema.Struct({ nameWithOwner: Schema.String })),
  config: FileText,
  workflow: FileText,
});

type Node = typeof Node.Type;

const NODE = `name databaseId createdAt viewerPermission owner { login } parent { nameWithOwner }
    config: object(expression: "HEAD:.autofork/config.json") { ... on Blob { text } }
    workflow: object(expression: "HEAD:.github/workflows/autofork.yml") { ... on Blob { text } }`;

/* Reading each repo's two files is most of the cost, so forks are listed 50 a page, inside GitHub's GraphQL timeout:
   https://docs.github.com/en/graphql/overview/rate-limits-and-query-limits-for-the-graphql-api#timeouts */
const FORKS = `query($after: String) { viewer { repositories(first: 50, after: $after, isFork: true, affiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR], ownerAffiliations: [OWNER, ORGANIZATION_MEMBER, COLLABORATOR], orderBy: { field: CREATED_AT, direction: DESC }) {
  nodes { ${NODE} }
  pageInfo { hasNextPage endCursor }
} } }`;

const OWN_NON_FORKS = `query($after: String) { viewer { repositories(first: 100, after: $after, isFork: false, affiliations: [OWNER], ownerAffiliations: [OWNER]) {
  nodes { name owner { login } }
  pageInfo { hasNextPage endCursor }
} } }`;

const Named = Schema.Struct({ name: Schema.String, owner: Owner });

const pageOf = <A, I>(node: Schema.Codec<A, I>) =>
  Schema.Struct({
    data: Schema.optionalKey(
      Schema.NullOr(
        Schema.Struct({
          viewer: Schema.Struct({
            repositories: Schema.Struct({
              nodes: Schema.Array(Schema.NullOr(node)),
              pageInfo: Schema.Struct({
                hasNextPage: Schema.Boolean,
                endCursor: Schema.NullOr(Schema.String),
              }),
            }),
          }),
        }),
      ),
    ),
    errors: Schema.optionalKey(Schema.Array(Schema.Unknown)),
  });

const PAGES = 20;

const everyRepo = Effect.fn(function* everyRepo<A, I>(
  token: string,
  query: string,
  node: Schema.Codec<A, I>,
) {
  const Page = pageOf(node);
  const nodes: A[] = [];
  let after: string | null = null;
  let failed = false;

  for (let page = 0; page < PAGES; page += 1) {
    const { data, errors }: typeof Page.Type = yield* GitHub.post(
      token,
      "/graphql",
      { query, variables: { after } },
      Page,
    ).pipe(
      Effect.catchIf(
        () => page > 0,
        () => Effect.succeed<typeof Page.Type>({}),
      ),
    );

    if (!data && page > 0) {
      return { nodes, complete: false };
    }

    if (!data) {
      return yield* new Problem({
        message: `GitHub couldn't list your repositories${errors ? "" : " right now"}. Try again.`,
      });
    }

    failed ||= errors !== undefined;
    nodes.push(...data.viewer.repositories.nodes.filter((each) => each !== null));

    if (!data.viewer.repositories.pageInfo.hasNextPage) {
      return { nodes, complete: !failed };
    }

    after = data.viewer.repositories.pageInfo.endCursor;
  }

  return { nodes, complete: false };
});

const REPOS_PER_QUERY = 10;

const GraphQLError = Schema.Struct({
  type: Schema.optionalKey(Schema.String),
  path: Schema.optionalKey(Schema.Array(Schema.Unknown)),
});

const ReposAnswer = Schema.Struct({
  data: Schema.optionalKey(Schema.NullOr(Schema.Record(Schema.String, Schema.NullOr(Node)))),
  errors: Schema.optionalKey(Schema.Array(GraphQLError)),
});

const goneSinceListed = (error: typeof GraphQLError.Type) =>
  error.path?.length === 1 && (error.type === "NOT_FOUND" || error.type === "FORBIDDEN");

const nothingRead = () => ({ nodes: Arr.empty<Node>(), complete: false });

const readRepos = (token: string, repos: readonly (typeof Named.Type)[]) =>
  Effect.all(
    Arr.chunksOf(repos, REPOS_PER_QUERY).map((chunk) =>
      GitHub.post(
        token,
        "/graphql",
        {
          query: `{ ${chunk.map((repo, index) => `r${index}: repository(owner: ${JSON.stringify(repo.owner.login)}, name: ${JSON.stringify(repo.name)}) { ${NODE} }`).join("\n")} }`,
        },
        ReposAnswer,
      ).pipe(
        Effect.map(({ data, errors = [] }) => ({
          nodes: Object.values(data ?? {}).filter((each) => each !== null),
          complete: data !== undefined && data !== null && errors.every(goneSinceListed),
        })),
        Effect.orElseSucceed(nothingRead),
      ),
    ),
    { concurrency: 20 },
  ).pipe(
    Effect.map((chunks) => ({
      nodes: chunks.flatMap((chunk) => chunk.nodes),
      complete: chunks.every((chunk) => chunk.complete),
    })),
  );

const ownNonForks = (token: string) =>
  everyRepo(token, OWN_NON_FORKS, Named).pipe(
    Effect.flatMap(({ nodes, complete }) =>
      Effect.map(readRepos(token, nodes), (read) => ({
        nodes: read.nodes,
        complete: complete && read.complete,
      })),
    ),
    Effect.orElseSucceed(nothingRead),
  );

const PUSH = new Set(["ADMIN", "MAINTAIN", "WRITE"]);

const canPush = (repo: Node) => PUSH.has(repo.viewerPermission ?? "");

const asMyFork = (repo: Node): MyFork[] => {
  const config = repo.config?.text;

  if (config === undefined || config === null || !canPush(repo)) {
    return [];
  }

  return [
    {
      owner: repo.owner.login,
      name: repo.name,
      upstream: upstreamFor(config, `${repo.owner.login}/${repo.name}`, repo.parent?.nameWithOwner),
      repoId: repo.databaseId,
      settings: readSettings(config, repo.workflow?.text ?? null),
    },
  ];
};

export const mine = (user: User) =>
  Effect.all([everyRepo(user.token, FORKS, Node), ownNonForks(user.token)], {
    concurrency: 2,
  }).pipe(
    Effect.map(([forks, rest]) => {
      const nodes = [...forks.nodes, ...rest.nodes].toSorted((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );

      return {
        complete: forks.complete && rest.complete,
        denied: nodes.flatMap((repo) =>
          canPush(repo) ? [] : [{ id: repo.databaseId, name: `${repo.owner.login}/${repo.name}` }],
        ),
        forks: nodes.flatMap(asMyFork),
      };
    }),
  );

const contents = (token: string, owner: string, name: string, path: string, ref: string) =>
  GitHub.fileText(token, `/repos/${owner}/${name}/contents/${path}?ref=${ref}`).pipe(
    Effect.catchIf(GitHub.missing, () => Effect.succeed(null)),
  );

const settingsAt = (user: User, owner: string, name: string, ref: string) =>
  Effect.all(
    [
      contents(user.token, owner, name, ".autofork/config.json", ref),
      contents(user.token, owner, name, ".github/workflows/autofork.yml", ref),
    ],
    { concurrency: 2 },
  );

const pushable = Effect.fn(function* pushable(user: User, owner: string, name: string) {
  const repo = yield* GitHub.get(user.token, `/repos/${owner}/${name}`, GitHubRepo);

  if (repo.permissions?.push !== true) {
    return yield* new Problem({ message: "That fork isn't yours." });
  }

  const head = yield* GitHub.head(user.token, owner, name, repo.default_branch);
  const [config, workflow] = yield* settingsAt(user, owner, name, head);

  if (config === null) {
    return yield* new Problem({ message: `${owner}/${name} has no .autofork/config.json.` });
  }

  return { repo, head, config, workflow };
});

export const settings = (user: User, owner: string, name: string) =>
  Effect.map(pushable(user, owner, name), ({ head, config, workflow }) => ({
    ...readSettings(config, workflow),
    head,
  }));

const fine = (limit: number) => Number.isFinite(limit) && limit >= 0 && limit <= 100_000;

const SCHEDULES = new Set<string>(Object.values(EVERY));

const scheduleProblem = (workflow: string | null, now: Settings, wanted: Settings) => {
  if (workflow !== null && cronLines(workflow) > 1 && wanted.cron !== now.cron) {
    return "This fork's autofork.yml has more than one schedule. Change it in the repo.";
  }

  if (wanted.cron !== null && wanted.cron !== now.cron && !SCHEDULES.has(wanted.cron)) {
    return "Pick one of the schedules, or set another in autofork.yml.";
  }

  return null;
};

const limitsProblem = ({ rebuilds, month, rebuild }: Limits) => {
  if (![rebuilds, month, rebuild].every(fine) || !Number.isInteger(rebuilds)) {
    return "Limits are whole rebuilds and dollar amounts.";
  }

  if (rebuilds > 200) {
    return "autofork records up to 200 rebuilds a fork a month.";
  }

  if (rebuild === 0) {
    return "A rebuild's cap has to be more than $0. To stop rebuilds, set rebuilds to 0.";
  }

  if (rebuild > month) {
    return "One rebuild's cap can't be more than the month's, or nothing would ever start.";
  }

  return null;
};

const unreadableConfig = (
  repo: string,
  config: string,
  followChanged: boolean,
  limitsChanged: boolean,
) => {
  if (followChanged && !readableFollow(config)) {
    return `${repo}'s "follow" in .autofork/config.json isn't text. Fix it in the repo first.`;
  }

  if (limitsChanged && !readableLimits(config)) {
    return `${repo}'s "limits" in .autofork/config.json aren't numbers autofork can read. Fix them in the repo first.`;
  }

  return null;
};

const savingFailed = (repo: string) => (error: GitHub.GitHubError) =>
  new Problem({
    message:
      error.status === 409
        ? `${repo} moved while saving. Save again.`
        : `Install autofork on ${repo} to change its settings here, or edit .autofork/config.json in the repo.`,
  });

const changedSinceLoad = (
  user: User,
  owner: string,
  name: string,
  loadedAt: string | undefined,
  current: { readonly head: string; readonly config: string; readonly workflow: string | null },
) =>
  loadedAt === undefined || loadedAt === "" || loadedAt === current.head
    ? Effect.succeed(false)
    : settingsAt(user, owner, name, loadedAt).pipe(
        Effect.map(
          ([config, workflow]) => config !== current.config || workflow !== current.workflow,
        ),
      );

export const saveSettings = Effect.fn(function* saveSettings(
  user: User,
  owner: string,
  name: string,
  wanted: Settings,
) {
  const current = yield* pushable(user, owner, name);
  const { repo, head, config, workflow } = current;

  if (yield* changedSinceLoad(user, owner, name, wanted.head, current)) {
    return yield* new Problem({
      message: `${owner}/${name}'s settings changed in the repo since this page loaded. Reload to see them.`,
    });
  }

  if (!parses(config)) {
    return yield* new Problem({
      message: `${owner}/${name}'s .autofork/config.json isn't valid JSON. Fix it in the repo first.`,
    });
  }

  const now = readSettings(config, workflow);
  const limitsChanged = JSON.stringify(now.limits) !== JSON.stringify(wanted.limits);
  const unchanged = now.follow === wanted.follow.trim() && !limitsChanged;

  const refused =
    scheduleProblem(workflow, now, wanted) ??
    (limitsChanged ? limitsProblem(wanted.limits) : null) ??
    unreadableConfig(`${owner}/${name}`, config, !unchanged, limitsChanged);

  if (refused !== null) {
    return yield* new Problem({ message: refused });
  }

  const files: GitHub.File[] = [];

  const nextConfig = unchanged
    ? config
    : withSettings(config, wanted.follow, limitsChanged ? wanted.limits : undefined);

  if (!unchanged) {
    files.push({ path: ".autofork/config.json", content: nextConfig });
  }

  let nextWorkflow = workflow;

  if (wanted.cron !== null && wanted.cron !== "" && wanted.cron !== now.cron) {
    if (workflow === null || workflow === "" || now.cron === null) {
      return yield* new Problem({
        message: "This fork's autofork.yml has no schedule to change.",
      });
    }

    nextWorkflow = withCron(workflow, wanted.cron);
    files.push({ path: ".github/workflows/autofork.yml", content: nextWorkflow });
  }

  const saved =
    files.length > 0
      ? yield* GitHub.commit(
          user.token,
          owner,
          name,
          repo.default_branch,
          "autofork: settings",
          files,
          head,
        ).pipe(
          Effect.catchIf(
            (error) => error.status === 403 || error.status === 404 || error.status === 409,
            (error) => Effect.fail(savingFailed(`${owner}/${name}`)(error)),
          ),
        )
      : head;

  return { ...readSettings(nextConfig, nextWorkflow), head: saved };
});

const installPage = (appSlug: string, ownerId: number, repoId?: number) => {
  const url = new URL(`https://github.com/apps/${appSlug}/installations/new/permissions`);
  url.searchParams.set("suggested_target_id", String(ownerId));

  if (repoId !== undefined) {
    url.searchParams.append("repository_ids[]", String(repoId));
  }

  return url;
};

const Id = Schema.Struct({ id: Schema.Number });

export const installLink = (user: User, owner: string, name: string, appSlug: string) =>
  GitHub.get(
    user.token,
    `/repos/${owner}/${name}`,
    Schema.Struct({ id: Schema.Number, owner: Id }),
  ).pipe(
    Effect.map((repo) => installPage(appSlug, repo.owner.id, repo.id)),
    Effect.catchIf(GitHub.missing, () =>
      Effect.map(GitHub.get(user.token, `/users/${owner}`, Id), (found) =>
        installPage(appSlug, found.id),
      ),
    ),
  );
