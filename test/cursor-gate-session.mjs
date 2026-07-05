#!/usr/bin/env node
/**
 * Simulates a Cursor MCP session against costgate-gate (filter mode).
 */
import { withMcpProcess, summarizeTools } from "../scripts/lib/mcp-client.mjs";
import { baseGateEnv, gateBin } from "../scripts/lib/paths.mjs";

const env = baseGateEnv("cursor", {
  COSTGATE_GATE_MODE: "filter",
});

async function main() {
  const summary = await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      const init = await client.initialize("cursor");
      const server = init.result?.serverInfo?.name;
      if (server !== "costgate-gate") {
        throw new Error(`expected costgate-gate, got ${server}`);
      }
      const tools = await client.listTools();
      return summarizeTools(tools);
    },
    { label: "cursor-gate", startupMs: 5000 }
  );

  console.error(
    `[cursor-session] gate filter: ${summary.tool_count} tools, ~${summary.estimated_tokens} est. tokens`
  );
  if (!summary.tools.some((t) => t.name === "discover_tools")) {
    throw new Error("discover_tools missing");
  }
  console.error("[cursor-session] ok — restart Cursor if you switched mcp.json");
}

main().catch((e) => {
  console.error("[cursor-session] fatal:", e);
  process.exit(1);
});
