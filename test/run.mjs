#!/usr/bin/env node
/**
 * Integration tests: Probe / Gate against mock MCP (no GitHub token).
 *
 *   npm run test:integration
 */
import { existsSync } from "node:fs";
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import {
  gateBin,
  mockGateEnv,
  probeJs,
} from "../scripts/lib/paths.mjs";

const MOCK_TOOLS = 16;

async function testProbeMock() {
  const env = mockGateEnv("integration-probe");
  await withMcpProcess(
    "node",
    [probeJs()],
    env,
    async (client) => {
      const init = await client.initialize("integration-probe");
      if (init.result?.serverInfo?.name !== "costgate-probe") {
        throw new Error(`expected costgate-probe, got ${init.result?.serverInfo?.name}`);
      }
      const tools = await client.listTools();
      if (tools.length !== MOCK_TOOLS) {
        throw new Error(`probe expected ${MOCK_TOOLS} tools, got ${tools.length}`);
      }
      await client.callTool("echo", { message: "integration" });
    },
    { label: "probe-mock", startupMs: 3000 }
  );
  if (!existsSync(env.COSTGATE_PROBE_LOG_DIR)) {
    throw new Error("probe log dir missing after session");
  }
  console.error("[integration] probe + mock ok");
}

async function testGateTransparentMock() {
  const env = mockGateEnv("integration-gate-transparent", {
    COSTGATE_GATE_MODE: "transparent",
  });
  await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize("integration-gate-transparent");
      const tools = await client.listTools();
      if (tools.length !== MOCK_TOOLS) {
        throw new Error(`transparent expected ${MOCK_TOOLS} tools, got ${tools.length}`);
      }
      const result = await client.callTool("echo", { message: "gate" });
      const text = result?.content?.[0]?.text ?? "";
      if (!text.includes("gate")) {
        throw new Error("echo tool failed");
      }
    },
    { label: "gate-transparent-mock", startupMs: 4000 }
  );
  console.error("[integration] gate transparent + mock ok");
}

async function testGateFilterMock() {
  const env = mockGateEnv("integration-gate-filter", {
    COSTGATE_GATE_MODE: "filter",
    COSTGATE_INTENT: "pull request",
    COSTGATE_INTENT_DYNAMIC: "0",
  });
  await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize("integration-gate-filter");
      const tools = await client.listTools();
      const names = tools.map((t) => t.name);
      console.error(`[integration] gate filter tools: ${names.length}`);

      if (!names.includes("discover_tools") || !names.includes("invoke_tool")) {
        throw new Error("meta tools missing");
      }
      if (names.length >= MOCK_TOOLS) {
        throw new Error(`expected filtered list (<${MOCK_TOOLS}), got ${names.length}`);
      }

      const discover = await client.callTool("discover_tools", {
        query: "fork",
        limit: 3,
      });
      const text = discover?.content?.[0]?.text ?? "";
      if (!text.includes("fork")) {
        throw new Error("discover_tools did not return fork-related tools");
      }

      const invoke = await client.callTool("invoke_tool", {
        name: "echo",
        arguments: { message: "invoke" },
      });
      const invokeText = invoke?.content?.[0]?.text ?? "";
      if (!invokeText.includes("invoke")) {
        throw new Error("invoke_tool failed");
      }
    },
    { label: "gate-filter-mock", startupMs: 4000 }
  );
  console.error("[integration] gate filter + mock ok");
}

async function main() {
  await testProbeMock();
  await testGateTransparentMock();
  await testGateFilterMock();
  console.error("[integration] all passed");
}

main().catch((e) => {
  console.error("[integration] fatal:", e);
  process.exit(1);
});
