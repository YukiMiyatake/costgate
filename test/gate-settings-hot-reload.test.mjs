#!/usr/bin/env node
/**
 * Gate gate-settings.json hot-reload integration (mock MCP).
 */
import { writeFileSync } from "node:fs";
import { withMcpProcess } from "../scripts/lib/mcp-client.mjs";
import { gateBin, mockGateEnv } from "../scripts/lib/paths.mjs";

const BASE_SETTINGS = {
  version: 1,
  gate_mode: "filter",
  intent_dynamic: false,
  intent_probe: false,
  intent_prompt: false,
  static_intent: "",
};

async function waitFor(fn, { timeoutMs = 8000, intervalMs = 400, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function main() {
  const envBase = mockGateEnv(
    "gate-settings-reload",
    {
      COSTGATE_GATE_MODE: "filter",
      COSTGATE_INTENT_DYNAMIC: "0",
      COSTGATE_INTENT_PROBE: "0",
      COSTGATE_INTENT_PROMPT: "0",
    },
    "mock"
  );
  const settingsPath = envBase.COSTGATE_GATE_SETTINGS_PATH;

  await withMcpProcess(
    gateBin(),
    [],
    envBase,
    async (client) => {
      await client.initialize("gate-settings-reload");
      const before = (await client.listTools()).length;

      writeFileSync(
        settingsPath,
        `${JSON.stringify(
          {
            ...BASE_SETTINGS,
            static_intent: "github pull merge issue search",
          },
          null,
          2
        )}\n`
      );
      await new Promise((r) => setTimeout(r, 100));

      await waitFor(async () => (await client.listTools()).length > before, {
        label: "more tools after static_intent hot-reload",
      });

      const after = (await client.listTools()).length;
      console.error(`[gate-settings-hot-reload] tools ${before} -> ${after}`);
      console.error("[gate-settings-hot-reload] ok");
    },
    { label: "gate-settings-hot-reload", startupMs: 5000, timeoutMs: 180000 }
  );
}

main().catch((e) => {
  console.error("[gate-settings-hot-reload] fatal:", e);
  process.exit(1);
});
