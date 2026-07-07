#!/usr/bin/env node
/**
 * Gate filter aggressive exposure smoke (mock MCP).
 */
import { withMcpProcess, summarizeTools } from "../scripts/lib/mcp-client.mjs";
import { baseGateEnv, gateBin, mockGateEnv } from "../scripts/lib/paths.mjs";

async function main() {
  const conservative = await withMcpProcess(
    gateBin(),
    [],
    {
      ...mockGateEnv(
        "exposure-conservative",
        {
          COSTGATE_GATE_MODE: "filter",
          COSTGATE_INTENT: "github pull merge issue search",
          COSTGATE_INTENT_DYNAMIC: "0",
          COSTGATE_EXPOSURE_MODE: "conservative",
        },
        "mock"
      ),
    },
    async (client) => {
      await client.initialize("exposure-conservative");
      return summarizeTools(await client.listTools());
    },
    { label: "conservative", startupMs: 5000 }
  );

  const aggressive = await withMcpProcess(
    gateBin(),
    [],
    {
      ...mockGateEnv(
        "exposure-aggressive",
        {
          COSTGATE_GATE_MODE: "filter",
          COSTGATE_INTENT: "github pull merge issue search",
          COSTGATE_INTENT_DYNAMIC: "0",
          COSTGATE_EXPOSURE_MODE: "aggressive",
          COSTGATE_EXPOSURE_MAX_B: "2",
        },
        "mock"
      ),
    },
    async (client) => {
      await client.initialize("exposure-aggressive");
      return summarizeTools(await client.listTools());
    },
    { label: "aggressive", startupMs: 5000 }
  );

  if (aggressive.tool_count > conservative.tool_count) {
    throw new Error(
      `aggressive should not expose more tools than conservative (${aggressive.tool_count} > ${conservative.tool_count})`
    );
  }
  if (aggressive.estimated_tokens > conservative.estimated_tokens) {
    throw new Error("aggressive should not increase list tokens vs conservative");
  }
  console.error(
    `[compare-exposure] conservative=${conservative.tool_count} aggressive=${aggressive.tool_count} tools`
  );
  console.error("[compare-exposure] ok");
}

main().catch((e) => {
  console.error("[compare-exposure] fatal:", e);
  process.exit(1);
});
