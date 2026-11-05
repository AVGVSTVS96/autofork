import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";

import { githubOutput } from "./env.ts";

export const say = (line: string) => {
  console.error(line);
};

export const output = (values: Record<string, string>) => {
  if (githubOutput === undefined) {
    return;
  }

  const end = `autofork-${randomUUID()}`;

  writeFileSync(
    githubOutput,
    Object.entries(values)
      .map(([key, value]) =>
        value.includes("\n") ? `${key}<<${end}\n${value}\n${end}\n` : `${key}=${value}\n`,
      )
      .join(""),
    { flag: "a" },
  );
};
