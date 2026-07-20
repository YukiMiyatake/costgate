/**
 * Minimal stdio MCP client for CostGate test/compare scripts.
 */
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { countTokens, bytesToTokens } from "./tokens.mjs";
import { summarizeTools as probeSummarizeTools } from "@costgate/probe/metrics";

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

  async function callTool(name, arguments_ = {}) {
    const res = await send("tools/call", { name, arguments: arguments_ });
    if (res.error) {
      throw new Error(res.error.message ?? JSON.stringify(res.error));
    }
    return res.result;
  }

  return { send, initialize, listTools, callTool };
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

/** Token estimate via tiktoken cl100k_base (from @costgate/probe). */
export function summarizeTools(tools) {
  return probeSummarizeTools(tools);
}

export function pctReduction(before, after) {
  if (before <= 0) return 0;
  return Math.round((1 - after / before) * 1000) / 10;
}

export function summarizeCallResult(result) {
  const serialized = JSON.stringify(result ?? {});
  const response_bytes = Buffer.byteLength(serialized, "utf8");
  let text_chars = 0;
  for (const item of result?.content ?? []) {
    if (item?.type === "text" && item.text) {
      text_chars += item.text.length;
    }
  }
  return {
    response_bytes,
    text_chars,
    estimated_tokens: countTokens(serialized) || bytesToTokens(response_bytes),
  };
}

/** Concatenate text parts from an MCP tools/call result. */
export function extractResultText(result) {
  return (result?.content ?? [])
    .filter((c) => c?.type === "text" && c.text)
    .map((c) => c.text)
    .join("\n");
}
