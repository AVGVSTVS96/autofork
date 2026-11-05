import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { AutoforkError } from "../failure.ts";
import { configFile, DIR } from "../layout.ts";
import { isObject, parseJson } from "../platform/json.ts";
import type { Config } from "./types.ts";

export const keepPatches = (dir: string) => {
  const file = path.join(dir, DIR, ".gitignore");

  if (!existsSync(file)) {
    writeFileSync(file, "!*.patch\n!*.md\n!*.json\n");
  }
};

export const writeConfig = (
  dir: string,
  { upstream, follow, setup, generated, verify, agent, green, limits }: Config,
) => {
  mkdirSync(path.join(dir, DIR), { recursive: true });
  writeFileSync(
    configFile(dir),
    `${JSON.stringify({ upstream, follow, setup, generated, verify, agent, green, limits }, null, 2)}\n`,
  );
  keepPatches(dir);
};

export const saveConfig = (target: string, { follow, picked }: Config) => {
  const saved = parseJson(readFileSync(configFile(target), "utf-8"), isObject);

  if (saved === undefined) {
    throw new AutoforkError(`${DIR}/config.json isn't valid JSON`);
  }

  const config = { ...saved, follow, picked };

  if (JSON.stringify(config) !== JSON.stringify(saved)) {
    writeFileSync(configFile(target), `${JSON.stringify(config, null, 2)}\n`);
  }
};
