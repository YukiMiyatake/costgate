import { existsSync, readFileSync } from "node:fs";

/** Read JSON file; returns null if missing or invalid. */
export function readJson(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
