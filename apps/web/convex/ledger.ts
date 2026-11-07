import { v } from "convex/values";

import type { QueryCtx } from "./_generated/server";
import { internalMutation, internalQuery } from "./_generated/server";

export const monthStart = (now = Date.now()) => {
  const date = new Date(now);

  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
};

const PER_RUN = 50;
export const PER_MONTH = 200;
const ENGINE_RETRY_WINDOW = 30_000;

// Queries take the month's start as an argument: https://docs.convex.dev/understanding/best-practices/#date-in-queries
export const thisMonth = async (ctx: QueryCtx, repoId: number, since = monthStart()) =>
  await ctx.db
    .query("rebuilds")
    .withIndex("repoId", (q) => q.eq("repoId", repoId).gte("_creationTime", since))
    .order("desc")
    .take(PER_MONTH);

export const totals = internalQuery({
  args: { repoId: v.number(), since: v.number() },
  handler: async (ctx, { repoId, since }) => {
    const rows = await thisMonth(ctx, repoId, since);

    return { rebuilds: rows.length, spent: rows.reduce((sum, row) => sum + row.cost, 0) };
  },
});

export const open = internalMutation({
  args: {
    repoId: v.number(),
    name: v.string(),
    runId: v.number(),
    attempt: v.number(),
    patch: v.string(),
    agent: v.string(),
    cap: v.number(),
  },
  handler: async (ctx, row) => {
    const month = await thisMonth(ctx, row.repoId);

    const retried = month.find(
      (rebuild) =>
        rebuild.status === "running" &&
        rebuild.runId === row.runId &&
        (rebuild.attempt ?? 1) === row.attempt &&
        rebuild.patch === row.patch &&
        rebuild._creationTime > Date.now() - ENGINE_RETRY_WINDOW,
    );

    if (retried) {
      return { id: retried._id };
    }

    if (month.length >= PER_MONTH) {
      return { full: `autofork records up to ${PER_MONTH} rebuilds a fork a month` };
    }

    if (
      month.filter(
        (rebuild) => rebuild.runId === row.runId && (rebuild.attempt ?? 1) === row.attempt,
      ).length >= PER_RUN
    ) {
      return { full: `autofork records up to ${PER_RUN} rebuilds a run` };
    }

    return {
      id: await ctx.db.insert("rebuilds", {
        ...row,
        cost: row.cap,
        model: null,
        inputTokens: null,
        outputTokens: null,
        status: "running",
        endedAt: null,
      }),
    };
  },
});

export const close = internalMutation({
  args: {
    repoId: v.number(),
    id: v.string(),
    status: v.union(v.literal("done"), v.literal("stopped")),
    cost: v.optional(v.number()),
    model: v.optional(v.string()),
    inputTokens: v.optional(v.number()),
    outputTokens: v.optional(v.number()),
  },
  handler: async (ctx, { repoId, id, status, cost, model, inputTokens, outputTokens }) => {
    const key = ctx.db.normalizeId("rebuilds", id);
    const row = key === null ? null : await ctx.db.get(key);

    if (row === null || row.repoId !== repoId || row.status !== "running") {
      return false;
    }

    await ctx.db.patch(row._id, {
      status,
      endedAt: Date.now(),
      cost: cost ?? row.cost,
      model: model?.slice(0, 100) ?? null,
      inputTokens: inputTokens ?? null,
      outputTokens: outputTokens ?? null,
    });

    return true;
  },
});

// GitHub ends a job after 6 hours: https://docs.github.com/en/actions/reference/limits
const JOB_TIME_LIMIT = 6 * 3_600_000;

export const expire = internalMutation({
  args: {},
  handler: async (ctx) => {
    const unreported = await ctx.db
      .query("rebuilds")
      .withIndex("status", (q) =>
        q.eq("status", "running").lt("_creationTime", Date.now() - JOB_TIME_LIMIT),
      )
      .take(500);

    await Promise.all(
      unreported.map(async (row) => {
        await ctx.db.patch(row._id, { status: "stopped", endedAt: Date.now() });
      }),
    );
  },
});
