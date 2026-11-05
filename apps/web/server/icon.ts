import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";

import * as GitHub from "./github.ts";
import { keep } from "./lru.ts";

/* T3 Code's sidebar icon lookup, asked of the default branch in one GraphQL query instead of ~30 stats on disk:
   https://github.com/pingdotgg/t3code/blob/main/apps/server/src/project/ProjectFaviconResolver.ts */
const FAVICON_CANDIDATES = [
  "favicon.svg",
  "favicon.ico",
  "favicon.png",
  "public/favicon.svg",
  "public/favicon.ico",
  "public/favicon.png",
  "app/favicon.ico",
  "app/favicon.png",
  "app/icon.svg",
  "app/icon.png",
  "app/icon.ico",
  "src/favicon.ico",
  "src/favicon.svg",
  "src/app/favicon.ico",
  "src/app/icon.svg",
  "src/app/icon.png",
  "assets/icon.svg",
  "assets/icon.png",
  "assets/logo.svg",
  "assets/logo.png",
  ".idea/icon.svg",
  "Resources/AppIcon.icns",
  "AppIcon.icns",
];

const ICON_SOURCE_FILES = [
  "index.html",
  "public/index.html",
  "app/routes/__root.tsx",
  "src/routes/__root.tsx",
  "app/root.tsx",
  "src/root.tsx",
  "src/index.html",
];

const LINK_ICON_HTML_RE =
  /<link\b(?=[^>]*\brel=["'](?:icon|shortcut icon)["'])(?=[^>]*\bhref=["'](?<href>[^"'?]+))[^>]*>/iu;

const ICON_REL_RE = /\brel\s*:\s*["'](?:icon|shortcut icon)["']/iu;
const ICON_HREF_RE = /\bhref\s*:\s*["'](?<href>[^"'?]+)/iu;

const extractIconHref = (source: string) => {
  const html = LINK_ICON_HTML_RE.exec(source)?.groups?.href;

  if (html !== undefined) {
    return html;
  }

  for (const run of source.split("}")) {
    const href = ICON_REL_RE.test(run) ? ICON_HREF_RE.exec(run)?.groups?.href : undefined;

    if (href !== undefined) {
      return href;
    }
  }

  return null;
};

const inRepo = (path: string) => {
  const clean = path.replace(/^\.?\//u, "");

  return clean && !clean.includes("://") && !clean.split("/").includes("..") ? [clean] : [];
};

const hrefPaths = (href: string) => inRepo(href).flatMap((clean) => [`public/${clean}`, clean]);

const extensionOf = (path: string) => path.slice(path.lastIndexOf(".") + 1).toLowerCase();

const LARGEST_ICON = 512 * 1024;
const LARGEST_ICNS_BUNDLE = 8 * 1024 * 1024;
const ICNS_SMALLEST_SERVED_WIDTH = 96;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCodePoint(...bytes.subarray(start, end));

const isPng = (bytes: Uint8Array) => ascii(bytes, 1, 4) === "PNG";
const isJpeg = (bytes: Uint8Array) => bytes[0] === 0xff && bytes[1] === 0xd8;

interface Format {
  readonly type: string;
  readonly served: string;
  readonly largestFile: number;
  readonly looksRight: (bytes: Uint8Array) => boolean;
}

const FORMATS = new Map<string, Format>([
  [
    "svg",
    {
      type: "image/svg+xml",
      served: "svg",
      largestFile: LARGEST_ICON,
      looksRight: (bytes) => /<svg[\s>]/iu.test(new TextDecoder().decode(bytes)),
    },
  ],
  ["png", { type: "image/png", served: "png", largestFile: LARGEST_ICON, looksRight: isPng }],
  [
    "ico",
    {
      type: "image/x-icon",
      served: "ico",
      largestFile: LARGEST_ICON,
      looksRight: (bytes) => bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0,
    },
  ],
  [
    "icns",
    { type: "image/png", served: "png", largestFile: LARGEST_ICNS_BUNDLE, looksRight: isPng },
  ],
  ["jpg", { type: "image/jpeg", served: "jpg", largestFile: LARGEST_ICON, looksRight: isJpeg }],
  ["jpeg", { type: "image/jpeg", served: "jpeg", largestFile: LARGEST_ICON, looksRight: isJpeg }],
  [
    "gif",
    {
      type: "image/gif",
      served: "gif",
      largestFile: LARGEST_ICON,
      looksRight: (bytes) => ascii(bytes, 0, 4) === "GIF8",
    },
  ],
  [
    "webp",
    {
      type: "image/webp",
      served: "webp",
      largestFile: LARGEST_ICON,
      looksRight: (bytes) => ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP",
    },
  ],
  [
    "avif",
    {
      type: "image/avif",
      served: "avif",
      largestFile: LARGEST_ICON,
      looksRight: (bytes) => ascii(bytes, 4, 8) === "ftyp",
    },
  ],
]);

/* T3 Code's extractIcnsPng: https://github.com/pingdotgg/t3code/blob/main/apps/server/src/assets/icns.ts */
const icnsPng = (bytes: Uint8Array) => {
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (bytes.length < 8 || ascii(bytes, 0, 4) !== "icns") {
    return null;
  }

  const end = Math.min(data.getUint32(4), bytes.length);
  let best: { png: Uint8Array; width: number } | null = null;

  for (let offset = 8; offset + 8 <= end;) {
    const length = data.getUint32(offset + 4);

    if (length < 8 || offset + length > end) {
      break;
    }

    const entry = bytes.subarray(offset + 8, offset + length);
    offset += length;

    if (entry.length < 24 || !isPng(entry)) {
      continue;
    }

    const width = new DataView(entry.buffer, entry.byteOffset + 16, 4).getUint32(0);

    const better =
      best === null ||
      (best.width < ICNS_SMALLEST_SERVED_WIDTH
        ? width > best.width
        : width >= ICNS_SMALLEST_SERVED_WIDTH && width < best.width);

    if (better) {
      best = { png: entry, width };
    }
  }

  return best === null ? null : new Uint8Array(best.png);
};

const Blob = Schema.NullOr(
  Schema.Struct({
    byteSize: Schema.optionalKey(Schema.Number),
    text: Schema.optionalKey(Schema.NullOr(Schema.String)),
  }),
);

const decodeBlob = Schema.decodeUnknownOption(Blob);

const Answer = Schema.Struct({
  data: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        repository: Schema.NullOr(
          Schema.StructWithRest(
            Schema.Struct({
              owner: Schema.Struct({ avatarUrl: Schema.String }),
              defaultBranchRef: Schema.NullOr(
                Schema.Struct({ target: Schema.Struct({ oid: Schema.String }) }),
              ),
            }),
            [Schema.Record(Schema.String, Schema.Unknown)],
          ),
        ),
      }),
    ),
  ),
});

const blob = (alias: string, path: string, field: string) =>
  `${alias}: object(expression: ${JSON.stringify(`HEAD:${path}`)}) { ... on Blob { ${field} } }`;

const ask = (
  token: GitHub.Token,
  owner: string,
  name: string,
  sizes: readonly string[],
  texts: readonly string[] = [],
) => {
  const query = `query($owner: String!, $name: String!) { repository(owner: $owner, name: $name) {
    owner { avatarUrl(size: 96) }
    defaultBranchRef { target { oid } }
    ${[...sizes.map((path, i) => blob(`s${i}`, path, "byteSize")), ...texts.map((path, i) => blob(`t${i}`, path, "text"))].join("\n")}
  } }`;

  return GitHub.post(token, "/graphql", { query, variables: { owner, name } }, Answer).pipe(
    Effect.map(({ data }) => {
      const repository = data?.repository ?? null;
      const alias = (key: string) => Option.getOrNull(decodeBlob(repository?.[key]));

      return {
        repository,
        size: (i: number) => alias(`s${i}`)?.byteSize,
        text: (i: number) => alias(`t${i}`)?.text ?? null,
      };
    }),
  );
};

const download = (owner: string, name: string, oid: string, path: string) =>
  Effect.tryPromise(async () => {
    const response = await fetch(
      `https://raw.githubusercontent.com/${owner}/${name}/${oid}/${path.split("/").map(encodeURIComponent).join("/")}`,
    );

    return response.ok ? new Uint8Array(await response.arrayBuffer()) : null;
  }).pipe(Effect.orElseSucceed(() => null));

export interface Icon {
  readonly path: string;
  readonly type: string;
  readonly extension: string;
  readonly bytes: Uint8Array;
}

const decodeT3Json = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ iconPath: Schema.String })),
);

export const detect = Effect.fn(function* detect(token: GitHub.Token, owner: string, name: string) {
  const first = yield* ask(token, owner, name, FAVICON_CANDIDATES, [
    "t3.json",
    ...ICON_SOURCE_FILES,
  ]);

  const repo = first.repository;

  if (!repo) {
    return null;
  }

  const avatar = repo.owner.avatarUrl;
  const oid = repo.defaultBranchRef?.target.oid;

  if (oid === undefined) {
    return { icon: null, avatar };
  }

  const iconPath = Option.match(decodeT3Json(first.text(0)), {
    onNone: () => [],
    onSome: (t3) => inRepo(t3.iconPath),
  });

  const linked = ICON_SOURCE_FILES.flatMap((_, i) => {
    const href = extractIconHref(first.text(i + 1) ?? "");

    return href === null ? [] : hrefPaths(href);
  });

  const sizes = new Map(FAVICON_CANDIDATES.map((path, i) => [path, first.size(i)]));
  const unknown = [...new Set([...iconPath, ...linked])].filter((path) => !sizes.has(path));

  if (unknown.length > 0) {
    const second = yield* ask(token, owner, name, unknown);

    for (const [i, path] of unknown.entries()) {
      sizes.set(path, second.size(i));
    }
  }

  for (const path of [...iconPath, ...FAVICON_CANDIDATES, ...linked]) {
    const size = sizes.get(path);
    const extension = extensionOf(path);
    const format = FORMATS.get(extension);

    if (size === undefined || format === undefined || size > format.largestFile) {
      continue;
    }

    const raw = yield* download(owner, name, oid, path);
    const bytes = raw && extension === "icns" ? icnsPng(raw) : raw;

    if (bytes === null || bytes.length > LARGEST_ICON || !format.looksRight(bytes)) {
      continue;
    }

    return {
      icon: { path, type: format.type, extension: format.served, bytes } satisfies Icon,
      avatar,
    };
  }

  return { icon: null, avatar };
});

const ASK_AGAIN_AFTER = 3_600_000;

const found = new Map<string, { at: number; value: Effect.Success<ReturnType<typeof detect>> }>();

export const lookup = Effect.fn(function* lookup(owner: string, name: string) {
  const key = `${owner}/${name}`.toLowerCase();
  const hit = found.get(key);

  if (hit && Date.now() - hit.at < ASK_AGAIN_AFTER) {
    return hit.value;
  }

  const value = yield* detect(yield* GitHub.appToken, owner, name);
  keep(found, key, { at: Date.now(), value }, 200);

  return value;
});
