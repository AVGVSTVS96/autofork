import { readFile, rename, rm, writeFile } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { buffer } from "node:stream/consumers";
import { pathToFileURL } from "node:url";

import babel from "@rolldown/plugin-babel";
import react, { reactCompilerPreset } from "@vitejs/plugin-react";
import { defineConfig, isRunnableDevEnvironment, loadEnv } from "vite";
import type { Connect, Plugin, ViteDevServer } from "vite";

import type * as Http from "./server/http.ts";
import type * as Prerender from "./src/prerender.tsx";

const handle = async (server: ViteDevServer, req: IncomingMessage, res: ServerResponse) => {
  const { ssr } = server.environments;

  if (!isRunnableDevEnvironment(ssr)) {
    throw new Error("The dev server's ssr environment can't run modules");
  }

  const { app } = await ssr.runner.import<typeof Http>("/server/http.ts");
  const headers = new Headers();

  for (const [name, values] of Object.entries(req.headersDistinct)) {
    for (const value of values ?? []) {
      headers.append(name, value);
    }
  }

  const response = await app.handler(
    new Request(`http://${req.headers.host}${req.url}`, {
      method: req.method ?? "GET",
      headers,
      body:
        req.method === "GET" || req.method === "HEAD" ? null : new Uint8Array(await buffer(req)),
    }),
  );

  res.statusCode = response.status;

  for (const [key, value] of response.headers) {
    if (key !== "set-cookie") {
      res.setHeader(key, value);
    }
  }

  const cookies = response.headers.getSetCookie();

  if (cookies.length > 0) {
    res.setHeader("set-cookie", cookies);
  }

  res.end(Buffer.from(await response.arrayBuffer()));
};

const forward = async (
  server: ViteDevServer,
  req: IncomingMessage,
  res: ServerResponse,
  fail: Connect.NextFunction,
) => {
  try {
    await handle(server, req, res);
  } catch (error) {
    fail(error);
  }
};

const api = (): Plugin => ({
  name: "autofork-api",
  configureServer(server) {
    Object.assign(process.env, loadEnv("development", process.cwd(), ""));
    server.middlewares.use((req, res, next) => {
      if (req.url?.startsWith("/api/") !== true) {
        next();

        return;
      }

      void forward(server, req, res, next);
    });
  },
});

const isPrerender = (module: unknown): module is typeof Prerender =>
  typeof module === "object" && module !== null && "render" in module;

const HEAD_TAGS = /^(?<head>(?:<link[^>]*>|<title>[^<]*<\/title>)*)(?<body>[\s\S]*)$/u;
const TITLE = /<title>[^<]*<\/title>/u;

const prerenderHome = (): Plugin => ({
  name: "autofork-prerender",
  config: () => ({
    environments: {
      ssr: {
        build: {
          outDir: "node_modules/.prerender",
          rolldownOptions: { input: "src/prerender.tsx" },
        },
      },
    },
    builder: {
      async buildApp(builder) {
        const { client, ssr } = builder.environments;

        if (!client || !ssr) {
          throw new Error("The build needs its client and ssr environments");
        }

        await builder.build(client);
        await builder.build(ssr);
        const out = path.resolve(client.config.root, client.config.build.outDir);
        const server = path.resolve(ssr.config.root, ssr.config.build.outDir);
        const loaded: unknown = await import(pathToFileURL(`${server}/prerender.js`).href);

        if (!isPrerender(loaded)) {
          throw new Error(`${server}/prerender.js doesn't export render`);
        }

        const shell = await readFile(`${out}/index.html`, "utf-8");
        const { head = "", body = "" } = HEAD_TAGS.exec(await loaded.render("/"))?.groups ?? {};
        await writeFile(
          `${out}/home.html`,
          shell
            .replace(TITLE, "")
            .replace("</head>", `${head}</head>`)
            .replace('<div id="root"></div>', `<div id="root">${body}</div>`),
        );
        await rename(`${out}/index.html`, `${out}/app.html`);
        await rm(server, { recursive: true });
      },
    },
  }),
});

export default defineConfig({
  plugins: [react(), babel({ presets: [reactCompilerPreset()] }), api(), prerenderHome()],
});
