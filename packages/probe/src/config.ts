import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface BackendConfig {
  always?: boolean;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

export interface ProbeConfig {
  backends: Record<string, BackendConfig>;
}

/** Serena is always direct in Cursor — never a Probe backend. */
export const EXCLUDED_PROBE_BACKENDS = ["serena"] as const;

export function resolveConfigPath(): string {
  if (process.env.COSTGATE_CONFIG) {
    return process.env.COSTGATE_CONFIG;
  }
  return join(homedir(), ".costgate", "backends.json");
}

export function loadConfig(): ProbeConfig {
  const configPath = resolveConfigPath();
  if (!existsSync(configPath)) {
    throw new Error(
      `CostGate Probe config not found: ${configPath}\n` +
        "Copy examples/backends.github.json to ~/.costgate/backends.json and set GITHUB_PERSONAL_ACCESS_TOKEN"
    );
  }

  const raw = JSON.parse(readFileSync(configPath, "utf8")) as ProbeConfig;
  if (!raw.backends || Object.keys(raw.backends).length === 0) {
    throw new Error(`No backends defined in ${configPath}`);
  }

  for (const name of EXCLUDED_PROBE_BACKENDS) {
    if (raw.backends[name]) {
      throw new Error(
        `Probe must not configure "${name}" as a backend. ` +
          "Keep serena direct in Cursor mcp.json; Probe targets GitHub and other MCPs only."
      );
    }
  }

  return raw;
}

/** Single primary backend (github preferred, otherwise first non-excluded entry). */
export function getPrimaryBackend(
  config: ProbeConfig
): { name: string; backend: BackendConfig } {
  const entries = Object.entries(config.backends).filter(
    ([name]) => !EXCLUDED_PROBE_BACKENDS.includes(name as (typeof EXCLUDED_PROBE_BACKENDS)[number])
  );

  if (entries.length === 0) {
    throw new Error(
      "No Probe backends configured. Add github (or another MCP). Serena stays direct in Cursor."
    );
  }

  if (config.backends.github) {
    return { name: "github", backend: config.backends.github };
  }

  const [name, backend] = entries[0];
  return { name, backend };
}
