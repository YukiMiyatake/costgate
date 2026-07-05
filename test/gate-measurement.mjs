#!/usr/bin/env node
/**
 * Minimal MCP client to smoke-test CostGate Gate transparent proxy.
 */
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import { baseGateEnv, gateBin } from "../scripts/lib/paths.mjs";

const env = baseGateEnv("gate-test", {
  COSTGATE_GATE_MODE: "transparent",
});

async function main() {
  await withMcpProcess(
    gateBin(),
    [],
    env,
    async (client) => {
      const init = await client.initialize("gate-test");
      console.error("[gate-test] initialize ok:", init.result?.serverInfo?.name);

      const tools = await client.listTools();
      console.error(`[gate-test] tools/list: ${tools.length} tools`);

      if (tools.length === 0) {
        throw new Error("expected tools from GitHub backend");
      }
    },
    { label: "gate-transparent", startupMs: 5000 }
  );
  console.error("[gate-test] done");
}

main().catch((e) => {
  console.error("[gate-test] fatal:", e);
  process.exit(1);
});
