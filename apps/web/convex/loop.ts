import { v } from "convex/values";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import {
  dropToken,
  GitHubError,
  installationToken,
  read,
  retryWithFreshToken,
  send,
} from "./github";

interface Watched {
  id: Id<"forks">;
  name: string;
  branch: string;
  installationId: number;
  seen: string | null;
}

interface WatchPage {
  forks: (Watched & { watch: string })[];
  cursor: string;
  done: boolean;
}

export const watching = internalQuery({
  args: { cursor: v.union(v.string(), v.null()) },
  handler: async (ctx, { cursor }): Promise<WatchPage> => {
    const { page, continueCursor, isDone } = await ctx.db
      .query("forks")
      .paginate({ cursor, numItems: 1000 });

    const forks = page.flatMap(({ _id, name, branch, installationId, seen, watch }) =>
      watch === null ? [] : [{ watch, id: _id, name, branch, installationId, seen: seen ?? null }],
    );

    return { forks, cursor: continueCursor, done: isDone };
  },
});

const allWatches = async (
  ctx: ActionCtx,
  cursor: string | null = null,
  watches = new Map<string, Watched[]>(),
): Promise<Map<string, Watched[]>> => {
  const page: WatchPage = await ctx.runQuery(internal.loop.watching, { cursor });

  for (const { watch, ...fork } of page.forks) {
    const forks = watches.get(watch);

    if (forks) {
      forks.push(fork);
    } else {
      watches.set(watch, [fork]);
    }
  }

  return page.done ? watches : await allWatches(ctx, page.cursor, watches);
};

export const seen = internalMutation({
  args: { forks: v.array(v.object({ id: v.id("forks"), watch: v.string(), seen: v.string() })) },
  handler: async (ctx, { forks }) => {
    await Promise.all(
      forks.map(async ({ id, watch, seen: mark }) => {
        const fork = await ctx.db.get(id);

        if (fork?.watch === watch) {
          await ctx.db.patch(id, { seen: mark });
        }
      }),
    );
  },
});

const Oid = Schema.Struct({ oid: Schema.String });

const Upstream = Schema.Struct({
  isPrivate: Schema.Boolean,
  latestRelease: Schema.NullOr(Schema.Struct({ tagName: Schema.String })),
  releases: Schema.Struct({
    nodes: Schema.Array(Schema.NullOr(Schema.Struct({ tagName: Schema.String }))),
  }),
  refs: Schema.NullOr(
    Schema.Struct({
      nodes: Schema.Array(
        Schema.NullOr(Schema.Struct({ name: Schema.String, target: Schema.NullOr(Oid) })),
      ),
    }),
  ),
  defaultBranchRef: Schema.NullOr(Schema.Struct({ target: Schema.NullOr(Oid) })),
  ref: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        target: Schema.NullOr(
          Schema.Struct({
            oid: Schema.String,
            statusCheckRollup: Schema.optionalKey(
              Schema.NullOr(Schema.Struct({ state: Schema.String })),
            ),
          }),
        ),
      }),
    ),
  ),
});

type Upstream = typeof Upstream.Type;

const decodeUpstream = Schema.decodeUnknownOption(Schema.NullOr(Upstream));

const Answer = Schema.Struct({
  data: Schema.optionalKey(Schema.NullOr(Schema.Record(Schema.String, Schema.Unknown))),
  errors: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        path: Schema.optionalKey(
          Schema.NullOr(Schema.Array(Schema.Union([Schema.String, Schema.Number]))),
        ),
        type: Schema.optionalKey(Schema.NullOr(Schema.String)),
      }),
    ),
  ),
});

const parseWatch = (key: string) => {
  const [repo = "", kind = "", branch = "", any = ""] = key.split(" ");
  const [owner = "", name = ""] = repo.split("/");

  return { owner, name, kind, branch, waitForGreen: any !== "any" };
};

type Watch = ReturnType<typeof parseWatch>;

const fields = ({
  owner,
  name,
  kind,
  branch,
}: Watch) => `repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(name)}) {
    isPrivate
    latestRelease { tagName }
    releases(first: 1, orderBy: { field: CREATED_AT, direction: DESC }) { nodes { tagName } }
    refs(refPrefix: "refs/tags/", first: 1, orderBy: { field: TAG_COMMIT_DATE, direction: DESC }) { nodes { name target { oid } } }
    defaultBranchRef { target { oid } }
    ${kind === "branch" ? `ref(qualifiedName: ${JSON.stringify(`refs/heads/${branch}`)}) { target { oid ... on Commit { statusCheckRollup { state } } } }` : ""}
  }`;

const branchMark = (ref: Upstream["ref"], waitForGreen: boolean) => {
  const target = ref?.target;

  if (!target) {
    return "";
  }

  if (!waitForGreen) {
    return target.oid;
  }

  const state = target.statusCheckRollup?.state;

  if (state === undefined) {
    return `${target.oid} unchecked`;
  }

  return state === "SUCCESS" ? target.oid : undefined;
};

const movingTag = (found: Upstream) => {
  const newest = found.refs?.nodes[0];

  return newest ? `${newest.name}@${newest.target?.oid ?? ""}` : undefined;
};

const mark = (watch: Watch, found: Upstream | null) => {
  if (found === null) {
    return "";
  }

  if (watch.kind === "branch") {
    return branchMark(found.ref, watch.waitForGreen);
  }

  const tag = movingTag(found);

  if (watch.kind === "channel") {
    return `${found.releases.nodes[0]?.tagName ?? ""} ${tag ?? ""}`;
  }

  return found.latestRelease?.tagName ?? tag ?? found.defaultBranchRef?.target?.oid ?? "";
};

const hashOf = (key: string) =>
  new TextEncoder().encode(key).reduce((hash, byte) => (hash * 31 + byte) % 2 ** 32, 0);

const readerOf = (key: string, forks: readonly Watched[]) => {
  const ids = [...new Set(forks.map((fork) => fork.installationId))].toSorted((a, b) => a - b);

  return ids[hashOf(key) % ids.length];
};

const CHUNK = 50;
const AT_ONCE = 10;

const pool = async <A>(items: readonly A[], run: (item: A) => Promise<void>) => {
  const queue = [...items];

  const worker = async (): Promise<void> => {
    const item = queue.shift();

    if (item === undefined) {
      return;
    }

    try {
      await run(item);
    } catch (error) {
      console.warn(`loop: ${String(error)}`);
    }

    await worker();
  };

  await Promise.all(Array.from({ length: AT_ONCE }, worker));
};

const readUpstreams = async (asks: Map<number, Set<string>>) => {
  const found = new Map<string, Upstream | null>();

  const jobs = [...asks].flatMap(([installationId, keys]) =>
    Arr.chunksOf([...keys], CHUNK).map((chunk) => ({ installationId, keys: chunk })),
  );

  const readChunk = async ({
    installationId,
    keys,
  }: {
    installationId: number;
    keys: readonly string[];
  }) => {
    const query = `{ ${keys.map((key, index) => `w${index}: ${fields(parseWatch(key))}`).join("\n")} }`;

    try {
      const { data, errors = [] } = await read(
        await installationToken(installationId),
        "POST",
        "graphql",
        Answer,
        { query },
      );

      const unanswered = new Set(
        errors
          .filter(
            (error) =>
              error.path?.length === 1 || !["FORBIDDEN", "NOT_FOUND"].includes(error.type ?? ""),
          )
          .map((error) => error.path?.[0]),
      );

      if (errors.some((error) => (error.path ?? []).length === 0)) {
        console.warn(
          `installation ${installationId}: GitHub's answer for ${keys.length} upstreams had an error for none of them`,
        );

        return;
      }

      if (!data) {
        return;
      }

      for (const [index, key] of keys.entries()) {
        if (unanswered.has(`w${index}`)) {
          continue;
        }

        const upstream = decodeUpstream(data[`w${index}`] ?? null);

        if (Option.isNone(upstream)) {
          console.warn(`loop: couldn't read ${key}`);
          continue;
        }

        found.set(`${installationId} ${key}`, upstream.value);
      }
    } catch (error) {
      if (error instanceof GitHubError && error.status === 401) {
        dropToken(installationId);
      }

      console.warn(
        `installation ${installationId} couldn't check ${keys.length} upstreams: ${String(error)}`,
      );
    }
  };

  await pool(jobs, readChunk);

  return found;
};

const ask = (asks: Map<number, Set<string>>, installationId: number, key: string) =>
  asks.set(installationId, (asks.get(installationId) ?? new Set()).add(key));

interface Due {
  fork: Watched;
  watch: string;
  now: string;
}

const tokenFor = async (fork: Watched) => {
  try {
    return await installationToken(fork.installationId);
  } catch (error) {
    console.warn(`no token for ${fork.name}: ${String(error)}`);

    return null;
  }
};

const refreshSoon = async (ctx: ActionCtx, name: string) => {
  try {
    await ctx.scheduler.runAfter(0, internal.forks.refresh, { name });
  } catch (error) {
    console.warn(`couldn't schedule a refresh of ${name}: ${String(error)}`);
  }
};

const WorkflowState = Schema.Struct({ state: Schema.String });

const disabledWorkflow = (error: unknown): error is GitHubError =>
  error instanceof GitHubError && error.status === 422 && /disabled/iu.test(error.message);

// GitHub disables a quiet public repo's scheduled workflows after 60 days: https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/disabling-and-enabling-a-workflow
const dispatch = async (token: string, fork: Watched) => {
  const workflow = `repos/${fork.name}/actions/workflows/autofork.yml`;

  const run = async () => {
    await send(token, "POST", `${workflow}/dispatches`, { ref: fork.branch });
  };

  try {
    await run();
  } catch (error) {
    if (!disabledWorkflow(error)) {
      throw error;
    }

    const { state } = await read(token, "GET", workflow, WorkflowState);

    if (state !== "disabled_inactivity") {
      throw error;
    }

    await send(token, "PUT", `${workflow}/enable`);
    await run();
  }
};

const start = async (ctx: ActionCtx, { fork, watch, now }: Due) => {
  const token = await tokenFor(fork);

  if (token === null) {
    await refreshSoon(ctx, fork.name);

    return;
  }

  try {
    await retryWithFreshToken(fork.installationId, token, async (attempt) => {
      await dispatch(attempt, fork);
    });
    console.log(`${watch} is at ${now}: started ${fork.name}`);
  } catch (error) {
    console.warn(`couldn't start ${fork.name}: ${String(error)}`);

    if (error instanceof GitHubError && error.status === 401) {
      dropToken(fork.installationId);
    }

    const mayHaveStarted = error instanceof Error && error.name === "TimeoutError";

    const refusedForGood =
      error instanceof GitHubError &&
      error.status < 500 &&
      error.status !== 429 &&
      error.status !== 401;

    if (!mayHaveStarted && !refusedForGood) {
      return;
    }

    await refreshSoon(ctx, fork.name);
  }

  await ctx.runMutation(internal.loop.seen, { forks: [{ id: fork.id, watch, seen: now }] });
};

export const tick = internalAction({
  args: {},
  handler: async (ctx) => {
    const watches = await allWatches(ctx);
    const readers = new Map<string, number>();
    const first = new Map<number, Set<string>>();

    for (const [key, forks] of watches) {
      const reader = readerOf(key, forks);

      if (reader !== undefined) {
        readers.set(key, reader);
        ask(first, reader, key);
      }
    }

    const shared = await readUpstreams(first);

    const sharedAnswer = (key: string, fork: Watched) => {
      const reader = readers.get(key);
      const answer = reader === undefined ? undefined : shared.get(`${reader} ${key}`);

      return answer && (!answer.isPrivate || fork.installationId === reader) ? answer : undefined;
    };

    const pending = [...watches].flatMap(([key, forks]) =>
      forks.map((fork) => ({ fork, key, found: sharedAnswer(key, fork) })),
    );

    const own = new Map<number, Set<string>>();

    for (const { fork, key, found } of pending) {
      if (found === undefined) {
        ask(own, fork.installationId, key);
      }
    }

    const second = own.size > 0 ? await readUpstreams(own) : new Map<string, Upstream | null>();

    const due = pending.flatMap(({ fork, key, found }): Due[] => {
      const answer = found ?? second.get(`${fork.installationId} ${key}`);

      if (answer === undefined) {
        return [];
      }

      const now = mark(parseWatch(key), answer);

      if (now === undefined) {
        return fork.seen === null ? [{ fork, watch: key, now: "" }] : [];
      }

      return fork.seen === now ? [] : [{ fork, watch: key, now }];
    });

    const quiet = due.flatMap(({ fork, watch, now }) =>
      fork.seen === null ? [{ id: fork.id, watch, seen: now }] : [],
    );

    await Promise.all(
      Arr.chunksOf(quiet, 1000).map(async (forks) => {
        await ctx.runMutation(internal.loop.seen, { forks });
      }),
    );

    await pool(
      due.filter(({ fork, now }) => fork.seen !== null && now !== ""),
      async (run) => {
        await start(ctx, run);
      },
    );
  },
});
