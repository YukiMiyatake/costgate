/**
 * Minimal stdio MCP client for CostGate test/compare scripts.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

export function createMcpClient(proc, { timeoutMs = 120000 } = {}) {
  let id = 0;
  const pending = new Map();

  const rl = createInterface({ input: proc.stdout });
  rl.on("line", (line) => {
    try {
      const msg = JSON.parse(line);
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id).resolve(msg);
        pending.delete(msg.id);
      }
    } catch {
      // ignore non-json lines
    }
  });

  function send(method, params = {}) {
    const msg = { jsonrpc: "2.0", id: ++id, method, params };
    proc.stdin.write(JSON.stringify(msg) + "\n");
    return new Promise((resolve, reject) => {
      pending.set(msg.id, { resolve, reject });
      setTimeout(() => reject(new Error(`timeout: ${method}`)), timeoutMs);
    });
  }

  async function initialize(clientName = "costgate-client") {
    const init = await send("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: clientName, version: "0.1.0" },
    });
    proc.stdin.write(
      JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n"
    );
    return init;
  }

  async function listTools() {
    const res = await send("tools/list", {});
    return res.result?.tools ?? [];
  }

  return { send, initialize, listTools };
}

export async function withMcpProcess(command, args, env, fn, options = {}) {
  const { startupMs = 5000, label = command } = options;
  const proc = spawn(command, args, {
    env: { ...process.env, ...env },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const client = createMcpClient(proc, options);
  try {
    if (startupMs > 0) {
      await new Promise((r) => setTimeout(r, startupMs));
    }
    return await fn(client);
  } finally {
    proc.kill("SIGTERM");
  }
}

/** Rough token estimate (≈4 bytes per token), matches @costgate/probe metrics. */
export function summarizeTools(tools) {
  const stats = tools.map((tool) => {
    const serialized = JSON.stringify(tool);
    const schema_bytes = Buffer.byteLength(serialized, "utf8");
    return {
      name: tool.name,
      schema_bytes,
      estimated_tokens: Math.max(1, Math.ceil(schema_bytes / 4)),
    };
  });
  const total_schema_bytes = stats.reduce((s, t) => s + t.schema_bytes, 0);
  return {
    tool_count: stats.length,
    total_schema_bytes,
    estimated_tokens: Math.max(1, Math.ceil(total_schema_bytes / 4)),
    tools: stats,
  };
}

export function pctReduction(before, after) {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}
