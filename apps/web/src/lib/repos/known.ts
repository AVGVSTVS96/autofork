import { squash } from "../../../shared/api.ts";
import type { Repo } from "../../../shared/api.ts";
import lookedUpAhead from "./known.json";

export interface Found {
  repo: Repo;
  others: readonly Repo[];
}

const examples: Readonly<Record<string, Found>> = lookedUpAhead;

export const known = (app: string): Found | undefined => examples[squash(app)];

const savedIcons = new Map(
  Object.values(examples).map(({ repo }) => [
    `${repo.owner}/${repo.name}`.toLowerCase(),
    repo.avatar,
  ]),
);

export const savedIcon = (repo: string) => savedIcons.get(repo.toLowerCase());
const detectedIcon = (repo: string) => `/api/icon/${repo}`;
export const repoIcon = (repo: string) => savedIcon(repo) ?? detectedIcon(repo);
