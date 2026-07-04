#!/usr/bin/env node
/**
 * Minimal MCP client to exercise CostGate Probe for measurement test.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const env = {
  ...process.env,
  COSTGATE_CONFIG: process.env.COSTGATE_CONFIG ?? "/home/yuki/.costgate/backends.json",
  COSTGATE_PROBE_LOG_DIR: process.env.COSTGATE_PROBE_LOG_DIR ?? "/home/yuki/.costgate/logs",
  COSTGATE_CLIENT: "probe-test",
};

const probe = spawn("node", ["/home/yuki/work/costgate/packages/probe/dist/index.js"], {
  env,
  stdio: ["pipe", "pipe", "inherit"],
});

let id = 0;
const pending = new Map();

function send(method, params = {}) {
  const msg = { jsonrpc: "2.0", id: ++id, method, params };
  probe.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    setTimeout(() => reject(new Error(`timeout: ${method}`)), 60000);
  });
}

const rl = createInterface({ input: probe.stdout });
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
  console.error("[probe-test] waiting for probe...");
  await new Promise((r) => setTimeout(r, 3000));

  const init = await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "probe-test", version: "0.1.0" },
  });
  console.error("[probe-test] initialize ok:", init.result?.serverInfo?.name);

  probe.stdin.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
  );

  const tools = await send("tools/list", {});
  const count = tools.result?.tools?.length ?? 0;
  console.error(`[probe-test] tools/list: ${count} tools`);

  if (count > 0) {
    const first = tools.result.tools[0].name;
    console.error(`[probe-test] calling tool: ${first}`);
    try {
      await send("tools/call", { name: first, arguments: {} });
    } catch (e) {
      console.error("[probe-test] tools/call (expected may fail):", String(e).slice(0, 80));
    }
  }

  probe.kill("SIGTERM");
  console.error("[probe-test] done — check", env.COSTGATE_PROBE_LOG_DIR);
}

main().catch((e) => {
  console.error("[probe-test] fatal:", e);
  probe.kill();
  process.exit(1);
});
