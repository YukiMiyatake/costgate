#!/usr/bin/env node
/**
 * Smoke test for CostGate Gate filter mode (Tier A/B/C + meta tools).
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const env = {
  ...process.env,
  COSTGATE_CONFIG: process.env.COSTGATE_CONFIG ?? "/home/yuki/.costgate/backends.json",
  COSTGATE_CLIENT: "gate-filter-test",
  COSTGATE_GATE_MODE: "filter",
  COSTGATE_INTENT: process.env.COSTGATE_INTENT ?? "pull request",
  COSTGATE_INTENT_DYNAMIC: process.env.COSTGATE_INTENT_DYNAMIC ?? "0",
};

const gate = spawn("/home/yuki/work/costgate/packages/gate/bin/costgate-gate", [], {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});

let id = 0;
const pending = new Map();

function send(method, params = {}) {
  const msg = { jsonrpc: "2.0", id: ++id, method, params };
  gate.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 120000);
  });
}

const rl = createInterface({ input: gate.stdout });
rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id != null && pending.has(msg.id)) {
      pending.get(msg.id).resolve(msg);
      pending.delete(msg.id);
    }
  } catch {
    // ignore
  }
});

async function main() {
  console.error("[gate-filter-test] waiting for gate...");
  await new Promise((r) => setTimeout(r, 5000));

  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "gate-filter-test", version: "0.1.0" },
  });
  gate.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
  );

  const tools = await send("tools/list", {});
  const names = (tools.result?.tools ?? []).map((t) => t.name);
  console.error(`[gate-filter-test] tools/list: ${names.length} tools`);

  if (!names.includes("discover_tools") || !names.includes("invoke_tool")) {
    throw new Error("meta tools missing");
  }
  if (names.length >= 26) {
    throw new Error(`expected filtered list (<26), got ${names.length}`);
  }

  const discover = await send("tools/call", {
    name: "discover_tools",
    arguments: { query: "fork", limit: 3 },
  });
  const text = discover.result?.content?.[0]?.text ?? "";
  if (!text.includes("fork")) {
    throw new Error("discover_tools did not return fork-related tools");
  }
  console.error("[gate-filter-test] discover_tools ok");

  gate.kill("SIGTERM");
  console.error("[gate-filter-test] done");
}

main().catch((e) => {
  console.error("[gate-filter-test] fatal:", e);
  gate.kill();
  process.exit(1);
});
