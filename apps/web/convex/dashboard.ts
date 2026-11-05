import { v } from "convex/values";

import { internal } from "./_generated/api";
import { internalMutation, query } from "./_generated/server";
import { thisMonth } from "./ledger";

export const allow = internalMutation({
  args: {
    user: v.string(),
    repos: v.array(v.object({ id: v.number(), name: v.string() })),
    mode: v.union(v.literal("replace"), v.literal("add"), v.literal("drop")),
  },
  handler: async (ctx, { user, repos, mode }) => {
    const row = await ctx.db
      .query("access")
      .withIndex("user", (q) => q.eq("user", user))
      .unique();

    const others = (row?.repos ?? []).filter(
      (repo) => !repos.some((given) => given.id === repo.id || given.name === repo.name),
    );

    const confirmed = repos.map((repo) => ({ ...repo, at: Date.now() }));

    const next = { replace: confirmed, add: [...others, ...confirmed], drop: others }[mode];

    if (row) {
      await ctx.db.patch(row._id, { repos: next });

      return;
    }

    await ctx.db.insert("access", { user, repos: next });
  },
});

const UNCONFIRMED_GRANT_LIFETIME = 86_400_000;

export const prune = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())) },
  handler: async (ctx, { cursor = null }) => {
    const cutoff = Date.now() - UNCONFIRMED_GRANT_LIFETIME;

    const { page, continueCursor, isDone } = await ctx.db
      .query("access")
      .paginate({ cursor, numItems: 100 });

    const confirmed = page.map((row) => ({
      row,
      fresh: row.repos.filter((repo) => (repo.at ?? 0) > cutoff),
    }));

    await Promise.all(
      confirmed
        .filter(({ row, fresh }) => fresh.length !== row.repos.length)
        .map(async ({ row, fresh }) => {
          await ctx.db.patch(row._id, { repos: fresh });
        }),
    );

    const oldMarks = await ctx.db
      .query("gone")
      .withIndex("at", (q) => q.lt("at", cutoff))
      .take(500);

    await Promise.all(
      oldMarks.map(async (old) => {
        await ctx.db.delete(old._id);
      }),
    );

    if (!isDone) {
      await ctx.scheduler.runAfter(0, internal.dashboard.prune, { cursor: continueCursor });
    }
  },
});

export const forks = query({
  args: { since: v.number() },
  handler: async (ctx, { since }) => {
    const identity = await ctx.auth.getUserIdentity();

    if (!identity) {
      return null;
    }

    const access = await ctx.db
      .query("access")
      .withIndex("user", (q) => q.eq("user", identity.subject))
      .unique();

    return await Promise.all(
      (access?.repos ?? []).map(async ({ id: repoId, name }) => {
        const fork = await ctx.db
          .query("forks")
          .withIndex("repoId", (q) => q.eq("repoId", repoId))
          .unique();

        const month = await thisMonth(ctx, repoId, since);

        const rebuilds = month.map((row) => ({
          id: row._id,
          patch: row.patch,
          agent: row.agent,
          model: row.model,
          cap: row.cap,
          cost: row.cost,
          status: row.status,
          startedAt: row._creationTime,
          endedAt: row.endedAt,
          runUrl: `https://github.com/${row.name}/actions/runs/${row.runId}`,
        }));

        return {
          repoId,
          name,
          linked: fork !== null,
          rebuilds,
          spent: rebuilds.reduce((sum, row) => sum + row.cost, 0),
        };
      }),
    );
  },
});
