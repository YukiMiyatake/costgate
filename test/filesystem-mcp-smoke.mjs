#!/usr/bin/env node
/**
 * Smoke test: filesystem mock backend + tier catalog + compare pattern.
 *
 *   node test/filesystem-mcp-smoke.mjs
 */
import { existsSync } from "node:fs";
import { withMcpProcess, summarizeTools, pctReduction } from "../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv } from "../scripts/lib/paths.mjs";

const GATE_BIN = gateBin();

async function main() {
  if (!existsSync(GATE_BIN)) {
    console.error("[fs-smoke] gate missing. Run: npm run build:gate");
    process.exit(1);
  }

  const baseEnv = mockGateEnv("fs-smoke", {}, "filesystem");

  const before = await withMcpProcess(
    GATE_BIN,
    [],
    { ...baseEnv, COSTGATE_GATE_MODE: "transparent" },
    async (client) => {
      await client.initialize("fs-before");
      return summarizeTools(await client.listTools());
    },
    { startupMs: 4000 }
  );

  const after = await withMcpProcess(
    GATE_BIN,
    [],
    {
      ...baseEnv,
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT: "read file",
      COSTGATE_INTENT_DYNAMIC: "0",
    },
    async (client) => {
      await client.initialize("fs-after");
      return summarizeTools(await client.listTools());
    },
    { startupMs: 4000 }
  );

  const reduction = pctReduction(before.estimated_tokens, after.estimated_tokens);
  console.log(`[fs-smoke] before: ${before.tool_count} tools, ~${before.estimated_tokens} tok`);
  console.log(`[fs-smoke] after:  ${after.tool_count} tools, ~${after.estimated_tokens} tok`);
  console.log(`[fs-smoke] reduction: ${reduction}%`);

  if (before.tool_count < 8) {
    console.error("[fs-smoke] expected >= 8 filesystem tools");
    process.exit(1);
  }
  if (after.tool_count >= before.tool_count) {
    console.error("[fs-smoke] filter should reduce tool count");
    process.exit(1);
  }
  if (after.tool_count < 5) {
    console.error("[fs-smoke] filter should expose at least 5 tools (Tier A + meta)");
    process.exit(1);
  }
  console.log("[fs-smoke] ok");
}

main().catch((e) => {
  console.error("[fs-smoke] fatal:", e);
  process.exit(1);
});
