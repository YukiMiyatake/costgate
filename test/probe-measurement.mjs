#!/usr/bin/env node
/**
 * Minimal MCP client to exercise CostGate Probe for measurement test.
 */
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import { baseGateEnv, probeJs, probeLogDir } from "../scripts/lib/paths.mjs";

const env = baseGateEnv("probe-test", {
  COSTGATE_PROBE_LOG_DIR: probeLogDir(),
});

async function main() {
  await withMcpProcess(
    "node",
    [probeJs()],
    env,
    async (client) => {
      const init = await client.initialize("probe-test");
      console.error("[probe-test] initialize ok:", init.result?.serverInfo?.name);

      const tools = await client.listTools();
      console.error(`[probe-test] tools/list: ${tools.length} tools`);

      if (tools.length > 0) {
        const first = tools[0].name;
        console.error(`[probe-test] calling tool: ${first}`);
        try {
          await client.callTool(first, {});
        } catch (e) {
          console.error("[probe-test] tools/call (expected may fail):", String(e).slice(0, 80));
        }
      }
    },
    { label: "probe", startupMs: 3000 }
  );
  console.error("[probe-test] done — check", env.COSTGATE_PROBE_LOG_DIR);
}

main().catch((e) => {
  console.error("[probe-test] fatal:", e);
  process.exit(1);
});
