#!/usr/bin/env node
/**
 * Smoke test for CostGate Gate filter mode (Tier A/B/C + meta tools).
 */
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv } from "../scripts/lib/paths.mjs";

const env = {
  ...mockGateEnv("gate-filter-test", {}, "mock"),
  COSTGATE_GATE_MODE: "filter",
  COSTGATE_INTENT: process.env.COSTGATE_INTENT ?? "pull request",
  COSTGATE_INTENT_DYNAMIC: process.env.COSTGATE_INTENT_DYNAMIC ?? "0",
};

async function main() {
  await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      await client.initialize("gate-filter-test");
      const tools = await client.listTools();
      const names = tools.map((t) => t.name);
      console.error(`[gate-filter-test] tools/list: ${names.length} tools`);

      if (!names.includes("discover_tools") || !names.includes("invoke_tool")) {
        throw new Error("meta tools missing");
      }
      if (names.length >= 26) {
        throw new Error(`expected filtered list (<26), got ${names.length}`);
      }

      const discover = await client.callTool("discover_tools", { query: "fork", limit: 3 });
      const text = discover?.content?.[0]?.text ?? "";
      if (!text.includes("fork")) {
        throw new Error("discover_tools did not return fork-related tools");
      }
      console.error("[gate-filter-test] discover_tools ok");
    },
    { label: "gate-filter", startupMs: 5000 }
  );
  console.error("[gate-filter-test] done");
}

main().catch((e) => {
  console.error("[gate-filter-test] fatal:", e);
  process.exit(1);
});
