import * as Data from "effect/Data";
import { Base64, Base64Url, Hex } from "effect/encoding";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

const API = "https://api.github.com";

export class GitHubError extends Data.TaggedError("GitHubError")<{
  readonly status: number;
  readonly message: string;
}> {}

export const missing = (error: unknown): error is GitHubError =>
  error instanceof GitHubError && error.status === 404;

export const refused = (error: unknown): error is GitHubError =>
  error instanceof GitHubError && (error.status === 403 || error.status === 404);

const rateLimited = (response: Response, text: string) =>
  response.status === 403 &&
  (response.headers.get("x-ratelimit-remaining") === "0" ||
    response.headers.has("retry-after") ||
    /rate limit/iu.test(text));

const call = async (
  token: string,
  method: string,
  path: string,
  body: Schema.JsonObject | undefined,
) => {
  const headers = new Headers({
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "autofork",
    authorization: `Bearer ${token}`,
  });

  if (body !== undefined) {
    headers.set("content-type", "application/json");
  }

  const response = await fetch(`${API}/${path}`, {
    method,
    headers,
    body: body === undefined ? null : JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });

  const text = await response.text();

  if (!response.ok) {
    throw new GitHubError({
      status: rateLimited(response, text) ? 429 : response.status,
      message: `${method} ${path}: ${response.status} ${text.slice(0, 300)}`,
    });
  }

  return text;
};

export const send = async (
  token: string,
  method: "POST" | "PUT",
  path: string,
  body?: Schema.JsonObject,
) => {
  await call(token, method, path, body);
};

export const read = async <A, I>(
  token: string,
  method: "GET" | "POST",
  path: string,
  schema: Schema.Codec<A, I>,
  body?: Schema.JsonObject,
) => {
  const answer = Schema.decodeUnknownOption(Schema.fromJsonString(schema))(
    await call(token, method, path, body),
  );

  if (Option.isNone(answer)) {
    throw new GitHubError({
      status: 502,
      message: `${method} ${path}: GitHub answered something unexpected`,
    });
  }

  return answer.value;
};

const derLength = (n: number) => {
  if (n < 128) {
    return [n];
  }

  return n < 256 ? [0x81, n] : [0x82, Math.floor(n / 256), n % 256];
};

const der = (tag: number, body: Uint8Array) =>
  Uint8Array.from([tag, ...derLength(body.length), ...body]);

const RSA_ENCRYPTION = [
  0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00,
];

const pkcs1ToPkcs8 = (pem: string) => {
  const bytes = Uint8Array.from(
    Result.getOrThrow(Base64.decode(pem.replaceAll(/-----[^-]+-----|\s/gu, ""))),
  );

  return pem.includes("RSA PRIVATE KEY")
    ? der(0x30, Uint8Array.from([0x02, 0x01, 0x00, ...RSA_ENCRYPTION, ...der(0x04, bytes)]))
    : bytes;
};

const env = (name: string) => {
  const value = process.env[name];

  if (value === undefined) {
    throw new Error(`${name} isn't set`);
  }

  return value;
};

let signer: Promise<CryptoKey> | undefined;

const importSigner = async () =>
  await crypto.subtle.importKey(
    "pkcs8",
    pkcs1ToPkcs8(env("GITHUB_PRIVATE_KEY")),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );

const key = async () => {
  signer ??= importSigner();

  try {
    return await signer;
  } catch (error) {
    signer = undefined;
    throw error;
  }
};

const jwtPart = (value: Schema.JsonObject) => Base64Url.encode(JSON.stringify(value));

const appJwt = async () => {
  const now = Math.floor(Date.now() / 1000);

  const body = `${jwtPart({ alg: "RS256", typ: "JWT" })}.${jwtPart({ iat: now - 60, exp: now + 540, iss: env("GITHUB_CLIENT_ID") })}`;

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await key(),
    new TextEncoder().encode(body),
  );

  return `${body}.${Base64Url.encode(new Uint8Array(signature))}`;
};

const AccessToken = Schema.Struct({ token: Schema.String, expires_at: Schema.String });

const Installation = Schema.Struct({
  id: Schema.Number,
  suspended_at: Schema.NullOr(Schema.String),
});

const tokens = new Map<number, { token: string; until: number }>();

export const installationToken = async (installationId: number) => {
  const cached = tokens.get(installationId);

  if (cached && cached.until > Date.now() + 300_000) {
    return cached.token;
  }

  const { token, expires_at } = await read(
    await appJwt(),
    "POST",
    `app/installations/${installationId}/access_tokens`,
    AccessToken,
  );

  tokens.set(installationId, { token, until: Date.parse(expires_at) });

  return token;
};

export const dropToken = (installationId: number) => {
  tokens.delete(installationId);
};

export const retryWithFreshToken = async <A>(
  installationId: number,
  token: string,
  attempt: (token: string) => Promise<A>,
) => {
  try {
    return { token, value: await attempt(token) };
  } catch (error) {
    if (!refused(error)) {
      throw error;
    }

    dropToken(installationId);
    const fresh = await installationToken(installationId);

    return { token: fresh, value: await attempt(fresh) };
  }
};

export const repoInstallation = async (owner: string, name: string) => {
  try {
    const installation = await read(
      await appJwt(),
      "GET",
      `repos/${owner}/${name}/installation`,
      Installation,
    );

    return installation.suspended_at === null ? installation.id : null;
  } catch (error) {
    if (missing(error)) {
      return null;
    }

    throw error;
  }
};

const Contents = Schema.Struct({ content: Schema.StringFromBase64 });

export const file = async (token: string, repo: string, path: string, ref: string) => {
  try {
    const { content } = await read(
      token,
      "GET",
      `repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`,
      Contents,
    );

    return content;
  } catch (error) {
    if (missing(error)) {
      return null;
    }

    throw error;
  }
};

const SIGNATURE = /^sha256=(?<hex>[0-9a-f]{64})$/u;

// Signed with the App's webhook secret: https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries
export const signed = async (body: string, signature: string | null) => {
  const hex = SIGNATURE.exec(signature ?? "")?.groups?.hex;

  if (hex === undefined) {
    return false;
  }

  const hmac = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(process.env.GITHUB_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );

  return await crypto.subtle.verify(
    "HMAC",
    hmac,
    Uint8Array.from(Result.getOrThrow(Hex.decode(hex))),
    new TextEncoder().encode(body),
  );
};
