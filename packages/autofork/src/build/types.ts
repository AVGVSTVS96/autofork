import type { Check } from "../config/types.ts";

export interface Failed {
  check: Check;
  lines: string;
}

export interface Build {
  dir: string;
  steps: [string, ...string[]];
  source: string;
  healed: Map<string, string>;
  upstreamHas: Map<string, string>;
  ready?: string | undefined;
  rebuilt?: string | undefined;
}

export const lastStep = ({ steps }: Build) => steps.at(-1) ?? steps[0];

export const stepAt = ({ steps }: Build, index: number) => {
  const step = steps[index];

  if (step === undefined) {
    throw new RangeError(`the build has ${steps.length} steps, not ${index + 1}`);
  }
  return step;
};

export const stepPairs = ([first, ...rest]: readonly [string, ...string[]]) => {
  let from = first;

  return rest.map((to) => {
    const pair = { from, to };

    from = to;

    return pair;
  });
};
