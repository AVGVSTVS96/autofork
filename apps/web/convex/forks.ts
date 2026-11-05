import { v } from "convex/values";
import * as Arr from "effect/Array";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { cronLine, githubRepo } from "../shared/settings";
import { internal } from "./_generated/api";
import type { ActionCtx, MutationCtx } from "./_generated/server";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { file, installationToken, read, repoInstallation, retryWithFreshToken } from "./github";

export const watchFor = (upstream: string, given: string | undefined, waitForGreen = true) => {
  const repo = githubRepo(upstream)?.toLowerCase();
  const follow = given?.trim() ?? "";

  if (repo === undefined) {
    return null;
  }

  if (follow.includes("*")) {
    return `${repo} channel`;
  }

  if (follow !== "" && follow !== "releases") {
    return `${repo} branch ${follow}${waitForGreen ? "" : " any"}`;
  }

  return `${repo} releases`;
};

type Linked =
  | { linked: true; cron: string | null; open: boolean }
  | {
      linked: false;
      cron: null;
      open: boolean;
      why: "not installed" | "no config" | "no workflow" | "not on GitHub";
    };

const Repo = Schema.Struct({
  id: Schema.Number,
  full_name: Schema.String,
  default_branch: Schema.String,
  private: Schema.Boolean,
});

const decodeConfig = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      upstream: Schema.String,
      follow: Schema.optionalKey(Schema.Unknown),
      green: Schema.optionalKey(Schema.Unknown),
    }),
  ),
);

const asText = Schema.decodeUnknownOption(Schema.String);

export const refresh = internalAction({
  args: { name: v.string() },
  handler: async (ctx, args): Promise<Linked> => {
    const name = args.name.toLowerCase();
    const readAt = Date.now();
    const [owner = "", repo = ""] = name.split("/");
    const installationId = await repoInstallation(owner, repo);

    if (installationId === null) {
      await ctx.runMutation(internal.forks.unlink, { name, readAt });

      return { linked: false, cron: null, open: false, why: "not installed" };
    }

    const { token, value: found } = await retryWithFreshToken(
      installationId,
      await installationToken(installationId),
      async (attempt) => await read(attempt, "GET", `repos/${name}`, Repo),
    );

    const open = !found.private;

    const [configText, workflow] = await Promise.all([
      file(token, found.full_name, ".autofork/config.json", found.default_branch),
      file(token, found.full_name, ".github/workflows/autofork.yml", found.default_branch),
    ]);

    const config = decodeConfig(configText ?? "");

    if (Option.isNone(config) || workflow === null) {
      await ctx.runMutation(internal.forks.unlink, { name, readAt });

      return {
        linked: false,
        cron: null,
        open,
        why: Option.isSome(config) ? "no workflow" : "no config",
      };
    }

    const { upstream, green } = config.value;
    const follow = Option.getOrUndefined(asText(config.value.follow));
    const watch = watchFor(upstream, follow, green !== false);

    if (watch === null) {
      await ctx.runMutation(internal.forks.unlink, { name, readAt });

      return { linked: false, cron: null, open, why: "not on GitHub" };
    }

    const cron = cronLine(workflow);

    await ctx.runMutation(internal.forks.save, {
      repoId: found.id,
      name: found.full_name.toLowerCase(),
      branch: found.default_branch,
      installationId,
      upstream,
      follow: follow ?? "releases",
      watch,
      cron,
      readAt,
      open,
    });

    return { linked: true, cron, open };
  },
});

const Configured = Schema.Struct({
  data: Schema.optionalKey(
    Schema.NullOr(
      Schema.Record(
        Schema.String,
        Schema.NullOr(
          Schema.Struct({ object: Schema.NullOr(Schema.Struct({ __typename: Schema.String })) }),
        ),
      ),
    ),
  ),
});

const configQuery = (names: readonly string[]) =>
  `{ ${names
    .map((name, index) => {
      const [owner, repo] = name.split("/");

      return `r${index}: repository(owner: ${JSON.stringify(owner)}, name: ${JSON.stringify(repo)}) { object(expression: "HEAD:.autofork/config.json") { __typename } }`;
    })
    .join("\n")} }`;

const configAnswers = async (token: string, names: readonly string[]) => {
  try {
    const { data } = await read(token, "POST", "graphql", Configured, {
      query: configQuery(names),
    });

    return data ?? null;
  } catch {
    return null;
  }
};

const withConfig = async (ctx: ActionCtx, installationId: number, names: readonly string[]) => {
  const linked = new Set(await ctx.runQuery(internal.forks.linkedOf, { names: [...names] }));
  const token = await installationToken(installationId);
  const kept: string[] = [];

  for (const chunk of Arr.chunksOf(names, 50)) {
    // oxlint-disable-next-line eslint/no-await-in-loop -- one query at a time, as GitHub asks: https://docs.github.com/en/rest/using-the-rest-api/best-practices-for-using-the-rest-api#avoid-concurrent-requests
    const answers = await configAnswers(token, chunk);
    const seenWithoutConfig = (index: number) => answers?.[`r${index}`]?.object === null;

    kept.push(
      ...chunk.filter((name, index) => linked.has(name.toLowerCase()) || !seenWithoutConfig(index)),
    );
  }

  return kept;
};

const SCHEDULED_AT_ONCE = 100;
const REFRESH_SPACING = 250;

export const refreshAll = internalAction({
  args: { names: v.array(v.string()), installationId: v.optional(v.number()) },
  handler: async (ctx, { names, installationId }) => {
    const wanted =
      installationId === undefined ? names : await withConfig(ctx, installationId, names);

    await Promise.all(
      wanted.slice(0, SCHEDULED_AT_ONCE).map(async (name, index) => {
        await ctx.scheduler.runAfter(index * REFRESH_SPACING, internal.forks.refresh, { name });
      }),
    );

    if (wanted.length > SCHEDULED_AT_ONCE) {
      await ctx.scheduler.runAfter(SCHEDULED_AT_ONCE * REFRESH_SPACING, internal.forks.refreshAll, {
        names: wanted.slice(SCHEDULED_AT_ONCE),
      });
    }
  },
});

export const linkedOf = internalQuery({
  args: { names: v.array(v.string()) },
  handler: async (ctx, { names }) => {
    const rows = await Promise.all(
      names.map(
        async (name) =>
          await ctx.db
            .query("forks")
            .withIndex("name", (q) => q.eq("name", name.toLowerCase()))
            .first(),
      ),
    );

    return rows.flatMap((row) => (row ? [row.name] : []));
  },
});

export const save = internalMutation({
  args: {
    repoId: v.number(),
    name: v.string(),
    branch: v.string(),
    installationId: v.number(),
    upstream: v.string(),
    follow: v.string(),
    watch: v.union(v.string(), v.null()),
    cron: v.union(v.string(), v.null()),
    readAt: v.number(),
    open: v.boolean(),
  },
  handler: async (ctx, fork) => {
    const readLater = (row: { readAt?: number }) => (row.readAt ?? 0) > fork.readAt;

    const row = await ctx.db
      .query("forks")
      .withIndex("repoId", (q) => q.eq("repoId", fork.repoId))
      .unique();

    if (row && readLater(row)) {
      return;
    }

    const gone = await ctx.db
      .query("gone")
      .withIndex("name", (q) => q.eq("name", fork.name))
      .unique();

    if (
      gone &&
      gone.at > fork.readAt &&
      (gone.installationId === undefined || gone.installationId === fork.installationId)
    ) {
      return;
    }

    if (gone) {
      await ctx.db.delete(gone._id);
    }

    const sameName = await ctx.db
      .query("forks")
      .withIndex("name", (q) => q.eq("name", fork.name))
      .collect();

    const others = sameName.filter((stale) => stale.repoId !== fork.repoId);
    const newer = others.findIndex(readLater);

    await Promise.all(
      others.slice(0, newer === -1 ? others.length : newer).map(async (stale) => {
        await ctx.db.delete(stale._id);
      }),
    );

    if (newer !== -1) {
      return;
    }

    if (!row) {
      await ctx.db.insert("forks", fork);

      return;
    }

    await ctx.db.replace(
      row._id,
      row.watch === fork.watch && row.seen !== undefined ? { ...fork, seen: row.seen } : fork,
    );
  },
});

const markGone = async (
  ctx: MutationCtx,
  mark: { name: string; at: number; installationId?: number },
) => {
  const gone = await ctx.db
    .query("gone")
    .withIndex("name", (q) => q.eq("name", mark.name))
    .unique();

  if (!gone) {
    await ctx.db.insert("gone", mark);
  } else if (gone.at < mark.at) {
    await ctx.db.replace(gone._id, mark);
  }
};

export const unlink = internalMutation({
  args: { name: v.string(), readAt: v.optional(v.number()) },
  handler: async (ctx, { name, readAt = Date.now() }) => {
    const rows = await ctx.db
      .query("forks")
      .withIndex("name", (q) => q.eq("name", name))
      .collect();

    await Promise.all(
      rows
        .filter((row) => (row.readAt ?? 0) <= readAt)
        .map(async (row) => {
          await ctx.db.delete(row._id);
        }),
    );

    await markGone(ctx, { name, at: readAt });
  },
});

export const unlinkInstallation = internalMutation({
  args: { installationId: v.number() },
  handler: async (ctx, { installationId }) => {
    const rows = await ctx.db
      .query("forks")
      .withIndex("installationId", (q) => q.eq("installationId", installationId))
      .collect();

    await Promise.all(
      rows.map(async (row) => {
        await ctx.db.delete(row._id);
      }),
    );

    await Promise.all(
      [...new Set(rows.map((row) => row.name))].map(async (name) => {
        await markGone(ctx, { name, at: Date.now(), installationId });
      }),
    );
  },
});

export const namesOn = internalQuery({
  args: { installationId: v.number() },
  handler: async (ctx, { installationId }) => {
    const rows = await ctx.db
      .query("forks")
      .withIndex("installationId", (q) => q.eq("installationId", installationId))
      .collect();

    return rows.map((row) => ({ full_name: row.name }));
  },
});

export const byName = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, { name }) =>
    await ctx.db
      .query("forks")
      .withIndex("name", (q) => q.eq("name", name))
      .unique(),
});

const CHECK_WINDOW = 60_000;
const CHECKS_PER_WINDOW = 30;

export const mayCheck = internalMutation({
  args: { name: v.string() },
  handler: async (ctx, { name }) => {
    const now = Date.now();

    const expired = await ctx.db
      .query("checks")
      .withIndex("at", (q) => q.lt("at", now - CHECK_WINDOW))
      .take(50);

    await Promise.all(
      expired.map(async (old) => {
        await ctx.db.delete(old._id);
      }),
    );

    const checkedLately = await ctx.db
      .query("checks")
      .withIndex("name", (q) => q.eq("name", name))
      .first();

    if (checkedLately !== null) {
      return false;
    }

    const recent = await ctx.db.query("checks").withIndex("at").take(CHECKS_PER_WINDOW);

    if (recent.length >= CHECKS_PER_WINDOW) {
      return false;
    }

    await ctx.db.insert("checks", { name, at: now });

    return true;
  },
});
