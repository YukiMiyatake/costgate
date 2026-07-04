#!/usr/bin/env node
/**
 * Minimal MCP client to smoke-test CostGate Gate transparent proxy.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const env = {
  ...process.env,
  COSTGATE_CONFIG: process.env.COSTGATE_CONFIG ?? "/home/yuki/.costgate/backends.json",
  COSTGATE_CLIENT: "gate-test",
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
  console.error("[gate-test] waiting for gate...");
  await new Promise((r) => setTimeout(r, 5000));

  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "gate-test", version: "0.1.0" },
  });
  console.error("[gate-test] initialize ok:", init.result?.serverInfo?.name);

  gate.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
  );

  const tools = await send("tools/list", {});
  const count = tools.result?.tools?.length ?? 0;
  console.error(`[gate-test] tools/list: ${count} tools`);

  if (count === 0) {
    throw new Error("expected tools from GitHub backend");
  }

  gate.kill("SIGTERM");
  console.error("[gate-test] done");
}

main().catch((e) => {
  console.error("[gate-test] fatal:", e);
  gate.kill();
  process.exit(1);
});
