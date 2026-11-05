export const EVERY = {
  "5m": "2-59/5 * * * *",
  "15m": "7-59/15 * * * *",
  "1h": "17 * * * *",
  "1d": "17 6 * * *",
} as const;

export type Every = keyof typeof EVERY;

export const isEvery = (value: string): value is Every => Object.hasOwn(EVERY, value);

export const LIMITS = { rebuilds: 10, month: 200, rebuild: 20 } as const;

export interface Limits {
  readonly rebuilds: number;
  readonly month: number;
  readonly rebuild: number;
}
