/**
 * Shared repo paths for scripts and tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

export function repoRoot() {
  return ROOT;
}

export function gateBin() {
  return process.env.COSTGATE_GATE_BIN ?? join(ROOT, "packages/gate/bin/costgate-gate");
}

export function probeJs() {
  return join(ROOT, "packages/probe/dist/index.js");
}

export function mockMcpJs() {
  return join(ROOT, "test/fixtures/mock-mcp/index.mjs");
}

export function costgateConfig() {
  return process.env.COSTGATE_CONFIG ?? join(homedir(), ".costgate/backends.json");
}

export function probeLogDir() {
  return process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate/logs");
}

/** Write a backends.json pointing at mock-mcp (for CI / integration tests). */
export function mockBackendsConfigPath() {
  const dir = join(ROOT, "test/fixtures/.generated");
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "backends.mock.json");
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
  };
}

/** Base env for Gate/Probe against mock MCP. */
export function mockGateEnv(clientName, extra = {}) {
  const paths = mockTestPaths(clientName);
  return baseGateEnv(clientName, {
    COSTGATE_CONFIG: mockBackendsConfigPath(),
    COSTGATE_USAGE_PATH: paths.usage,
    COSTGATE_PROBE_LOG_DIR: paths.logs,
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
