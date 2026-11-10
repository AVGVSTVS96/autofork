import { httpRouter } from "convex/server";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import { readLedgerClose, readLedgerOpen, readLinkAsk } from "../shared/ledger";
import { Refused, verifyOidc } from "../shared/oidc";
import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { httpAction } from "./_generated/server";
import { GitHubError, signed } from "./github";
import { monthStart } from "./ledger";

const json = (body: Schema.Json, status = 200) =>
  // oxlint-disable-next-line unicorn/prefer-response-static-json -- Convex's runtime lists Response but not Response.json: https://docs.convex.dev/functions/runtimes
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const noContent = () => new Response(null, { status: 204 });

const caller = async (request: Request) => {
  const claims = await verifyOidc(request.headers.get("authorization"));

  return {
    repoId: Number(claims.repository_id),
    name: claims.repository.toLowerCase(),
    runId: Number(claims.run_id),
    attempt: Number(claims.run_attempt) || 1,
    public: claims.repository_visibility === "public",
  };
};

const guarded = (handle: (ctx: ActionCtx, request: Request) => Promise<Response>) =>
  httpAction(async (ctx, request) => {
    try {
      return await handle(ctx, request);
    } catch (error) {
      if (error instanceof Refused) {
        return json({ error: error.message }, 403);
      }

      if (error instanceof SyntaxError) {
        return json({ error: error.message }, 400);
      }

      if (error instanceof GitHubError) {
        return json({ error: "GitHub didn't answer; try again in a minute" }, 502);
      }

      throw error;
    }
  });

const digest = async (text: string) =>
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));

const same = async (a: string, b: string) => {
  const [x, y] = await Promise.all([digest(a), digest(b)]);

  return new Uint8Array(x).every((byte, index) => byte === new Uint8Array(y)[index]);
};

const fromSite = async (request: Request) => {
  const secret = process.env.AUTOFORK_SERVER_SECRET ?? "";

  return (
    secret !== "" && (await same(request.headers.get("authorization") ?? "", `Bearer ${secret}`))
  );
};

const http = httpRouter();

http.route({
  path: "/ledger",
  method: "GET",
  handler: guarded(async (ctx, request) => {
    const { repoId } = await caller(request);

    return json(await ctx.runQuery(internal.ledger.totals, { repoId, since: monthStart() }));
  }),
});

http.route({
  path: "/ledger",
  method: "POST",
  handler: guarded(async (ctx, request) => {
    const { public: open, ...who } = await caller(request);

    if (!open) {
      return json({ error: "autofork.com tracks spend on public forks only" }, 403);
    }

    const asked = await readLedgerOpen(request);

    if (!asked) {
      return json({ error: "need patch, agent and cap" }, 400);
    }

    const opened = await ctx.runMutation(internal.ledger.open, {
      ...who,
      ...asked,
      patch: asked.patch.slice(0, 200),
    });

    return "id" in opened ? json({ id: opened.id }, 201) : json({ error: opened.full }, 429);
  }),
});

http.route({
  path: "/ledger/close",
  method: "POST",
  handler: guarded(async (ctx, request) => {
    const { repoId } = await caller(request);
    const asked = await readLedgerClose(request);

    if (!asked) {
      return json({ error: "need id and status" }, 400);
    }

    const closed = await ctx.runMutation(internal.ledger.close, { repoId, ...asked });

    return closed
      ? noContent()
      : json({ error: "no running rebuild of this fork with that id" }, 404);
  }),
});

http.route({
  path: "/link",
  method: "POST",
  handler: guarded(async (ctx, request) => {
    const asked = await readLinkAsk(request);

    if (!asked) {
      return json({ error: "need owner and name" }, 400);
    }

    const repo = `${asked.owner}/${asked.name}`.toLowerCase();
    const row = await ctx.runQuery(internal.forks.byName, { name: repo });

    if (row) {
      return json({ linked: true, cron: row.open === true ? row.cron : null });
    }

    if (!(await ctx.runMutation(internal.forks.mayCheck, { name: repo }))) {
      return json({ linked: false, cron: null, checked: false });
    }

    let found;

    try {
      found = await ctx.runAction(internal.forks.refresh, { name: repo });
    } catch {
      return json({ error: "GitHub didn't answer; try again in a minute" }, 502);
    }

    if (!found.open) {
      return json({ linked: found.linked, cron: null });
    }

    return json(
      found.linked
        ? { linked: true, cron: found.cron }
        : { linked: false, cron: null, why: found.why },
    );
  }),
});

const Named = Schema.Struct({ full_name: Schema.String });

const Hook = Schema.Struct({
  action: Schema.optionalKey(Schema.String),
  installation: Schema.optionalKey(Schema.Struct({ id: Schema.Number })),
  repositories: Schema.optionalKey(Schema.Array(Named)),
  repositories_added: Schema.optionalKey(Schema.Array(Named)),
  repositories_removed: Schema.optionalKey(Schema.Array(Named)),
  repository_selection: Schema.optionalKey(Schema.String),
  ref: Schema.optionalKey(Schema.String),
  repository: Schema.optionalKey(
    Schema.Struct({ full_name: Schema.String, default_branch: Schema.String }),
  ),
  commits: Schema.optionalKey(
    Schema.Array(
      Schema.Struct({
        added: Schema.Array(Schema.String),
        removed: Schema.Array(Schema.String),
        modified: Schema.Array(Schema.String),
      }),
    ),
  ),
});

const decodeHook = Schema.decodeUnknownOption(Schema.fromJsonString(Hook));

const SETTINGS = new Set([".autofork/config.json", ".github/workflows/autofork.yml"]);

// A push lists at most 2048 commits: https://docs.github.com/en/webhooks/webhook-events-and-payloads#push
const touchesSettings = (commits: typeof Hook.Type.commits = []) =>
  commits.length === 0 ||
  commits.length >= 2048 ||
  commits.some((each) =>
    [...each.added, ...each.removed, ...each.modified].some((path) => SETTINGS.has(path)),
  );

http.route({
  path: "/github/hook",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const body = await request.text();

    if (!(await signed(body, request.headers.get("x-hub-signature-256")))) {
      return json({ error: "bad signature" }, 401);
    }

    const event = request.headers.get("x-github-event");
    const decoded = decodeHook(body);

    if (Option.isNone(decoded)) {
      return json({ error: "unreadable event" }, 400);
    }

    const hook = decoded.value;
    const installationId = hook.installation?.id;

    const refresh = async (repos: readonly { full_name: string }[] = [], via?: number) => {
      if (repos.length === 0) {
        return;
      }

      const names = repos.map((repo) => repo.full_name);

      await ctx.scheduler.runAfter(
        0,
        internal.forks.refreshAll,
        via === undefined ? { names } : { names, installationId: via },
      );
    };

    const uninstalled = hook.action === "deleted" || hook.action === "suspend";

    if (event === "installation" && uninstalled && installationId !== undefined) {
      await ctx.runMutation(internal.forks.unlinkInstallation, { installationId });
    } else if (event === "installation") {
      await refresh(hook.repositories, installationId);
    } else if (event === "installation_repositories") {
      const narrowedFromAll =
        installationId !== undefined &&
        hook.repository_selection === "selected" &&
        (hook.repositories_removed ?? []).length === 0;

      const linked = narrowedFromAll
        ? await ctx.runQuery(internal.forks.namesOn, { installationId })
        : [];

      await refresh(
        [...(hook.repositories_added ?? []), ...(hook.repositories_removed ?? []), ...linked],
        installationId,
      );
    } else if (
      event === "push" &&
      hook.repository &&
      hook.ref === `refs/heads/${hook.repository.default_branch}` &&
      touchesSettings(hook.commits)
    ) {
      await refresh([hook.repository]);
    }

    return noContent();
  }),
});

const decodeRefresh = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ name: Schema.String })),
);

http.route({
  path: "/refresh",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    if (!(await fromSite(request))) {
      return json({ error: "not allowed" }, 403);
    }

    const asked = decodeRefresh(await request.text());

    if (Option.isNone(asked)) {
      return json({ error: "need name" }, 400);
    }

    await ctx.scheduler.runAfter(0, internal.forks.refresh, { name: asked.value.name });

    return noContent();
  }),
});

export default http;
