import { readFileSync } from "node:fs";

export const readText = (file: string) => {
  try {
    return readFileSync(file, "utf-8");
  } catch {
    return "";
  }
};
