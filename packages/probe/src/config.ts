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
        "Copy examples/backends.serena.json to ~/.costgate/backends.json"
    );
  }

  const raw = JSON.parse(readFileSync(configPath, "utf8")) as ProbeConfig;
  if (!raw.backends || Object.keys(raw.backends).length === 0) {
    throw new Error(`No backends defined in ${configPath}`);
  }
  return raw;
}

/** MVP: single primary backend (serena if present, otherwise first entry). */
export function getPrimaryBackend(
  config: ProbeConfig
): { name: string; backend: BackendConfig } {
  if (config.backends.serena) {
    return { name: "serena", backend: config.backends.serena };
  }
  const [name, backend] = Object.entries(config.backends)[0];
  return { name, backend };
}
