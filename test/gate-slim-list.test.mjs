#!/usr/bin/env node
/**
 * Gate slim tools/list smoke (mock MCP).
 */
import { withMcpProcess, summarizeTools } from "../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv } from "../scripts/lib/paths.mjs";

async function main() {
  const baseline = await withMcpProcess(
    gateBin(),
    [],
    {
      ...mockGateEnv("slim-off", {}, "mock"),
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT_DYNAMIC: "0",
      COSTGATE_SLIM_LIST: "0",
    },
    async (client) => {
      await client.initialize("slim-off");
      return summarizeTools(await client.listTools());
    },
    { label: "slim-off", startupMs: 5000 }
  );

  const slim = await withMcpProcess(
    gateBin(),
    [],
    {
      ...mockGateEnv("slim-on", {}, "mock"),
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT_DYNAMIC: "0",
      COSTGATE_SLIM_LIST: "1",
      COSTGATE_SLIM_LIST_MAX_CHARS: "40",
    },
    async (client) => {
      await client.initialize("slim-on");
      const tools = await client.listTools();
      const names = tools.map((t) => t.name);
      if (!names.includes("discover_tools") || !names.includes("invoke_tool")) {
        throw new Error("meta tools missing with slim_list");
      }
      return summarizeTools(tools);
    },
    { label: "slim-on", startupMs: 5000 }
  );

  if (slim.tool_count !== baseline.tool_count) {
    throw new Error(
      `slim_list changed tool count (${slim.tool_count} vs ${baseline.tool_count})`
    );
  }
  if (slim.estimated_tokens > baseline.estimated_tokens) {
    throw new Error(
      `slim_list should not increase tokens (${slim.estimated_tokens} > ${baseline.estimated_tokens})`
    );
  }

  console.error(
    `[gate-slim-list] tools=${slim.tool_count} tokens=${slim.estimated_tokens} (baseline ${baseline.estimated_tokens})`
  );
  console.error("[gate-slim-list] ok");
}

main().catch((e) => {
  console.error("[gate-slim-list] fatal:", e);
  process.exit(1);
});
