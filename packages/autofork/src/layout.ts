import path from "node:path";

export const DIR = ".autofork";
export const WORKFLOWS = ".github/workflows";
export const OWN_WORKFLOW = `${WORKFLOWS}/autofork.yml`;
export const CONTROL = [DIR, WORKFLOWS];

interface Generated {
  readonly generated?: string[] | undefined;
}

export const sourcePaths = ({ generated }: Generated) => [
  ".",
  ...CONTROL.map((control) => `:(exclude)${control}`),
  ...(generated ?? []).map((file) => `:(exclude)${file}`),
];

export const skipGenerated = ({ generated }: Generated) =>
  (generated ?? []).map((file) => `--exclude=${file}`);

export const configFile = (dir: string) => path.join(dir, DIR, "config.json");

export const patchFile = (dir: string, id: string) => path.join(dir, DIR, id, `${id}.patch`);

export const patchDoc = (dir: string, id: string) => path.join(dir, DIR, id, "PATCH.md");

export const upstreamDoc = (dir: string, id: string) => path.join(dir, DIR, id, "UPSTREAM.md");
