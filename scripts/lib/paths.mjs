/**
 * Shared repo paths for scripts and tests.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export function repoRoot() {
  return process.env.COSTGATE_RUNTIME_ROOT ?? ROOT;
}

export function gateBin() {
  if (process.env.COSTGATE_GATE_BIN) {
    return process.env.COSTGATE_GATE_BIN;
  }
  const installed = join(homedir(), ".costgate", "bin", "costgate-gate");
  if (existsSync(installed)) {
    return installed;
  }
  return join(ROOT, "packages/gate/bin/costgate-gate");
}

export function probeJs() {
  return join(ROOT, "packages/probe/dist/index.js");
}

export function mockMcpJs() {
  return join(ROOT, "test/fixtures/mock-mcp/index.mjs");
}

export function mockFilesystemMcpJs() {
  return join(ROOT, "test/fixtures/mock-filesystem-mcp/index.mjs");
}

export function costgateConfig() {
  return process.env.COSTGATE_CONFIG ?? join(homedir(), ".costgate/backends.json");
}

export function probeLogDir() {
  return process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate/logs");
}

/** Write backends.json for a named mock backend fixture. */
export function mockBackendsConfigPath(backend = "mock", fixtureJs = mockMcpJs()) {
  const dir = join(ROOT, "test/fixtures/.generated");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `backends.${backend}.json`);
  writeFileSync(
    path,
    JSON.stringify(
      {
        backends: {
          [backend]: {
            always: true,
            command: process.execPath,
            args: [fixtureJs],
          },
        },
      },
      null,
      2
    )
  );
  return path;
}

/** Write backends.json with mock-mcp + mock-filesystem-mcp for multi-backend tests. */
export function mockMultiBackendsConfigPath() {
  const dir = join(ROOT, "test/fixtures/.generated");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "backends.multi.json");
  writeFileSync(
    path,
    JSON.stringify(
      {
        backends: {
          mock: {
            always: true,
            command: process.execPath,
            args: [mockMcpJs()],
          },
          filesystem: {
            always: true,
            command: process.execPath,
            args: [mockFilesystemMcpJs()],
          },
        },
      },
      null,
      2
    )
  );
  return path;
}

/** Base env for Gate with two mock backends. */
export function mockMultiGateEnv(clientName, extra = {}) {
  const paths = mockTestPaths(clientName);
  mkdirSync(paths.vault, { recursive: true });
  writeFileSync(
    paths.trust,
    `${JSON.stringify(
      {
        version: 1,
        defaults: { gate_backend: "standard", direct_mcp: "restricted", unknown: "restricted" },
        servers: {
          "costgate-gate": { trust: "trusted", source: "builtin" },
          mock: { trust: "standard" },
          filesystem: { trust: "standard" },
        },
      },
      null,
      2
    )}\n`
  );
  const env = baseGateEnv(clientName, {
    COSTGATE_CONFIG: mockMultiBackendsConfigPath(),
    COSTGATE_USAGE_PATH: paths.usage,
    COSTGATE_PROBE_LOG_DIR: paths.logs,
    COSTGATE_PROMPT_INTENT_DIR: paths.promptIntent,
    COSTGATE_SHIELD_DIR: paths.vault,
    COSTGATE_TRUST_PATH: paths.trust,
    COSTGATE_TOOL_OVERRIDES: paths.overrides,
    COSTGATE_GATE_SETTINGS_PATH: paths.gateSettings,
    ...extra,
  });
  syncMockGateSettingsFile(paths.gateSettings, env);
  return env;
}

/** Isolated usage + log paths for integration tests. */
export function mockTestPaths(prefix = "integration") {
  const base = join(tmpdir(), `costgate-${prefix}-${process.pid}`);
  mkdirSync(base, { recursive: true });
  const overrides = join(base, "tool-overrides.json");
  writeFileSync(overrides, `${JSON.stringify({ version: 1, tools: {} }, null, 2)}\n`);
  const gateSettings = join(base, "gate-settings.json");
  writeFileSync(
    gateSettings,
    `${JSON.stringify(
      {
        version: 1,
        gate_mode: "filter",
        intent_dynamic: false,
        intent_probe: false,
        intent_prompt: false,
        static_intent: "",
      },
      null,
      2
    )}\n`
  );
  return {
    usage: join(base, "usage.json"),
    logs: join(base, "logs"),
    promptIntent: join(base, "prompt-intent"),
    vault: join(base, "vault"),
    trust: join(base, "mcp-trust.json"),
    overrides,
    gateSettings,
  };
}

/** Keep gate-settings.json aligned with COSTGATE_* env for mock Gate tests. */
function syncMockGateSettingsFile(path, env = {}) {
  const settings = {
    version: 1,
    gate_mode: env.COSTGATE_GATE_MODE === "transparent" ? "transparent" : "filter",
    compress: env.COSTGATE_COMPRESS !== "0",
    code_mode: env.COSTGATE_CODE_MODE !== "0",
    intent_dynamic: env.COSTGATE_INTENT_DYNAMIC !== "0",
    intent_probe: env.COSTGATE_INTENT_PROBE !== "0",
    intent_prompt: env.COSTGATE_INTENT_PROMPT !== "0",
    static_intent: env.COSTGATE_INTENT ?? "",
    exposure_mode: env.COSTGATE_EXPOSURE_MODE ?? "conservative",
    exposure_max_b: Number(env.COSTGATE_EXPOSURE_MAX_B ?? 5),
    exposure_token_budget: Number(env.COSTGATE_EXPOSURE_TOKEN_BUDGET ?? 4000),
    slim_list: env.COSTGATE_SLIM_LIST === "1",
  };
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`);
}

/** Base env for Gate/Probe against mock MCP. */
export function mockGateEnv(clientName, extra = {}, backend = "mock") {
  const fixtureJs =
    backend === "filesystem" ? mockFilesystemMcpJs() : mockMcpJs();
  const paths = mockTestPaths(clientName);
  mkdirSync(paths.vault, { recursive: true });
  writeFileSync(
    paths.trust,
    `${JSON.stringify(
      {
        version: 1,
        defaults: { gate_backend: "standard", direct_mcp: "restricted", unknown: "restricted" },
        servers: {
          "costgate-gate": { trust: "trusted", source: "builtin" },
          [backend]: { trust: "standard" },
        },
      },
      null,
      2
    )}\n`
  );
  const env = baseGateEnv(clientName, {
    COSTGATE_CONFIG: mockBackendsConfigPath(backend, fixtureJs),
    COSTGATE_USAGE_PATH: paths.usage,
    COSTGATE_PROBE_LOG_DIR: paths.logs,
    COSTGATE_PROMPT_INTENT_DIR: paths.promptIntent,
    COSTGATE_SHIELD_DIR: paths.vault,
    COSTGATE_TRUST_PATH: paths.trust,
    COSTGATE_TOOL_OVERRIDES: paths.overrides,
    COSTGATE_GATE_SETTINGS_PATH: paths.gateSettings,
    ...extra,
  });
  syncMockGateSettingsFile(paths.gateSettings, env);
  return env;
}

/** Base env for Gate MCP subprocesses. */
export function baseGateEnv(clientName, extra = {}) {
  return {
    COSTGATE_CONFIG: costgateConfig(),
    COSTGATE_CLIENT: clientName,
    ...extra,
  };
}
