import type { Limits } from "@autofork/contract";

export const CHECKS = ["setup", "verify"] as const;

export type Check = (typeof CHECKS)[number];

export type Checks = Partial<Record<Check, string>>;

export interface Config {
  upstream: string;
  follow: string;
  setup?: string | undefined;
  generated?: string[] | undefined;
  verify?: string | undefined;
  agent?: string | undefined;
  green?: boolean | undefined;
  limits: Limits;
  picked?: Checks | undefined;
}

export interface Fork extends Config {
  patches: string[];
}
