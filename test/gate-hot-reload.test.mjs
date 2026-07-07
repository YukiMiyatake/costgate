#!/usr/bin/env node
/**
 * Gate tool-overrides hot-reload integration (mock MCP).
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv, mockTestPaths } from "../scripts/lib/paths.mjs";

async function waitFor(fn, { timeoutMs = 8000, intervalMs = 400, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const paths = mockTestPaths("hot-reload");
  const overridesPath = paths.overrides;

  await withMcpProcess(
    gateBin(),
    [],
    {
      ...mockGateEnv("gate-hot-reload", {}, "mock"),
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT_DYNAMIC: "0",
      COSTGATE_TOOL_OVERRIDES: overridesPath,
      COSTGATE_GATE_HOT_RELOAD: "1",
    },
    async (client) => {
      await client.initialize("gate-hot-reload");
      const initial = (await client.listTools()).map((t) => t.name);
      if (!initial.includes("get_file_contents")) {
        throw new Error(`get_file_contents missing initially: ${initial.join(", ")}`);
      }

      writeFileSync(
        overridesPath,
        `${JSON.stringify(
          { version: 1, tools: { get_file_contents: { force_tier: "hidden" } } },
          null,
          2
        )}\n`
      );

      await waitFor(
        async () => !(await client.listTools()).map((t) => t.name).includes("get_file_contents"),
        { label: "tool hidden after override" }
      );

      writeFileSync(overridesPath, `${JSON.stringify({ version: 1, tools: {} }, null, 2)}\n`);

      await waitFor(
        async () => (await client.listTools()).map((t) => t.name).includes("get_file_contents"),
        { label: "tool restored after override clear" }
      );

      console.error("[gate-hot-reload] ok");
    },
    { label: "gate-hot-reload", startupMs: 5000, timeoutMs: 180000 }
  );
}

main().catch((e) => {
  console.error("[gate-hot-reload] fatal:", e);
  process.exit(1);
});
