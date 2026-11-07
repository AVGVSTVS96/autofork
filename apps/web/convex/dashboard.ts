import { v } from "convex/values";

import { internalMutation, query } from "./_generated/server";
import { PER_MONTH } from "./ledger";

const MARK_LIFETIME = 86_400_000;

export const prune = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oldMarks = await ctx.db
      .query("gone")
      .withIndex("at", (q) => q.lt("at", Date.now() - MARK_LIFETIME))
      .take(500);

    await Promise.all(
      oldMarks.map(async (old) => {
        await ctx.db.delete(old._id);
      }),
    );
  },
});

export const forks = query({
  args: { names: v.array(v.string()), since: v.number() },
  handler: async (ctx, { names, since }) =>
    await Promise.all(
      names.slice(0, 100).map(async (asked) => {
        const name = asked.toLowerCase();

        const fork = await ctx.db
          .query("forks")
          .withIndex("name", (q) => q.eq("name", name))
          .unique();

        const month = await ctx.db
          .query("rebuilds")
          .withIndex("name", (q) => q.eq("name", name).gte("_creationTime", since))
          .order("desc")
          .take(PER_MONTH);

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
          name,
          linked: fork !== null,
          rebuilds,
          spent: rebuilds.reduce((sum, row) => sum + row.cost, 0),
        };
      }),
    ),
});
