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

/** Isolated usage + log paths for integration tests. */
export function mockTestPaths(prefix = "integration") {
  const base = join(tmpdir(), `costgate-${prefix}-${process.pid}`);
  mkdirSync(base, { recursive: true });
  return {
    usage: join(base, "usage.json"),
    logs: join(base, "logs"),
    promptIntent: join(base, "prompt-intent"),
    vault: join(base, "vault"),
    trust: join(base, "mcp-trust.json"),
  };
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
  return baseGateEnv(clientName, {
    COSTGATE_CONFIG: mockBackendsConfigPath(backend, fixtureJs),
    COSTGATE_USAGE_PATH: paths.usage,
    COSTGATE_PROBE_LOG_DIR: paths.logs,
    COSTGATE_PROMPT_INTENT_DIR: paths.promptIntent,
    COSTGATE_SHIELD_DIR: paths.vault,
    COSTGATE_TRUST_PATH: paths.trust,
    ...extra,
  });
}

/** Base env for Gate MCP subprocesses. */
export function baseGateEnv(clientName, extra = {}) {
  return {
    COSTGATE_CONFIG: costgateConfig(),
    COSTGATE_CLIENT: clientName,
    ...extra,
  };
}
