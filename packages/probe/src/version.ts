import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/** @costgate/probe package version from package.json (single source of truth). */
export function probeVersion(): string {
  return String(require("../package.json").version ?? "0.0.0");
}
