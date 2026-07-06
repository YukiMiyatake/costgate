#!/usr/bin/env node
/**
 * Gate multi-backend integration tests (mock-mcp + mock-filesystem-mcp).
 */
import { fileURLToPath } from "node:url";
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import { gateBin, mockMultiGateEnv } from "../scripts/lib/paths.mjs";

const MOCK_TOOLS = 16;
const FILESYSTEM_TOOLS = 9;
const TOTAL_TOOLS = MOCK_TOOLS + FILESYSTEM_TOOLS;

async function testGateMultiTransparent() {
  const env = mockMultiGateEnv("integration-gate-multi-transparent", {
    COSTGATE_GATE_MODE: "transparent",
  });
  await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize("integration-gate-multi-transparent");
      const tools = await client.listTools();
      const names = tools.map((t) => t.name);
      if (tools.length !== TOTAL_TOOLS) {
        throw new Error(`transparent expected ${TOTAL_TOOLS} tools, got ${tools.length}`);
      }
      if (!names.includes("mock/echo")) {
        throw new Error("mock/echo missing from tools/list");
      }
      if (!names.includes("filesystem/read_file")) {
        throw new Error("filesystem/read_file missing from tools/list");
      }
      if (names.includes("echo")) {
        throw new Error("unqualified echo should not appear with multiple backends");
      }

      const echo = await client.callTool("mock/echo", { message: "multi" });
      const echoText = echo?.content?.[0]?.text ?? "";
      if (!echoText.includes("multi")) {
        throw new Error("mock/echo failed");
      }

      const read = await client.callTool("filesystem/read_file", { path: "/tmp/test.go" });
      const readText = read?.content?.[0]?.text ?? "";
      if (!readText.includes("mock file")) {
        throw new Error("filesystem/read_file failed");
      }
    },
    { label: "gate-multi-transparent", startupMs: 6000 }
  );
  console.error("[integration] gate multi transparent ok");
}

async function testGateMultiFilter() {
  const env = mockMultiGateEnv("integration-gate-multi-filter", {
    COSTGATE_GATE_MODE: "filter",
    COSTGATE_INTENT: "pull request",
    COSTGATE_INTENT_DYNAMIC: "0",
  });
  await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize("integration-gate-multi-filter");
      const tools = await client.listTools();
      const names = tools.map((t) => t.name);
      if (!names.includes("discover_tools") || !names.includes("invoke_tool")) {
        throw new Error("meta tools missing");
      }
      if (names.length >= TOTAL_TOOLS) {
        throw new Error(`expected filtered list (<${TOTAL_TOOLS}), got ${names.length}`);
      }

      const discover = await client.callTool("discover_tools", {
        query: "fork",
        limit: 3,
      });
      const text = discover?.content?.[0]?.text ?? "";
      if (!text.includes("mock/fork_repository")) {
        throw new Error("discover_tools did not return qualified fork tool");
      }

      const invoke = await client.callTool("invoke_tool", {
        name: "mock/echo",
        arguments: { message: "multi-invoke" },
      });
      const invokeText = invoke?.content?.[0]?.text ?? "";
      if (!invokeText.includes("multi-invoke")) {
        throw new Error("invoke_tool with qualified name failed");
      }
    },
    { label: "gate-multi-filter", startupMs: 6000 }
  );
  console.error("[integration] gate multi filter ok");
}

async function main() {
  await testGateMultiTransparent();
  await testGateMultiFilter();
  console.error("[integration] gate multi-backend all passed");
}

export { testGateMultiTransparent, testGateMultiFilter };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error("[integration] gate multi-backend fatal:", e);
    process.exit(1);
  });
}
