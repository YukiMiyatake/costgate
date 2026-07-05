#!/usr/bin/env node
/**
 * Cursor hook: enforce MCP trust policy before Agent MCP tool calls.
 *
 * Event: beforeMCPExecution
 * Install: npm run cursor:registry
 */
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { cursorMcpPath, loadMcpDisabled, mcpDisabledStorePath } from "./lib/dashboard-control.mjs";
import {
  globalMcpTrustPath,
  loadMcpTrust,
  projectMcpTrustPath,
  resolveServerTrust,
} from "./lib/mcp-trust.mjs";
import { resolveWorkspaceRootFromPath } from "./lib/resolve-workspace-root.mjs";

const GATE_NAMES = new Set(["costgate-gate", "costgate-probe"]);

function readStdin() {
  return new Promise((resolve, reject) => {
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(c));
    process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    process.stdin.on("error", reject);
  });
}

function loadMcpConfigSafe(path) {
  if (!existsSync(path)) return { mcpServers: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    return { mcpServers: raw?.mcpServers ?? {} };
  } catch {
    return { mcpServers: {} };
  }
}

/** Cursor often sends the mcp.json config key in `command` (stdio) or `url` (remote). */
export function extractMcpServerName(payload, mcpConfig = {}) {
  if (typeof payload?.mcp_server_name === "string" && payload.mcp_server_name) {
    return payload.mcp_server_name;
  }
  if (typeof payload?.server_name === "string" && payload.server_name) {
    return payload.server_name;
  }

  const servers = mcpConfig.mcpServers ?? {};

  if (typeof payload?.url === "string" && payload.url) {
    for (const [name, cfg] of Object.entries(servers)) {
      if (cfg?.url === payload.url) return name;
    }
  }

  const command = payload?.command;
  if (typeof command === "string" && command) {
    if (Object.prototype.hasOwnProperty.call(servers, command)) return command;
    // Cursor stdio hooks: `command` is the mcp.json key, not the shell command line.
    if (!command.includes(" ") && /^[\w.-]+$/.test(command)) return command;
  }

  return null;
}

export function resolveProjectRoot(payload) {
  const roots = payload?.workspace_roots ?? [];
  for (const root of roots) {
    const resolved = resolveWorkspaceRootFromPath(root);
    if (resolved) return resolved;
  }
  return roots[0] ?? null;
}

export function buildServerMeta(serverName, { mcpConfig, disabledStore } = {}) {
  const servers = mcpConfig?.mcpServers ?? {};
  if (Object.prototype.hasOwnProperty.call(servers, serverName)) {
    return {
      name: serverName,
      enabled: true,
      role: serverName === "costgate-gate" ? "gate" : serverName === "costgate-probe" ? "probe" : "direct",
      source: "mcp.json",
    };
  }
  if (disabledStore && Object.prototype.hasOwnProperty.call(disabledStore, serverName)) {
    return {
      name: serverName,
      enabled: false,
      role: "disabled",
      source: "mcp-disabled.json",
    };
  }
  if (GATE_NAMES.has(serverName)) {
    return { name: serverName, enabled: true, role: "gate", source: "builtin" };
  }
  return { name: serverName, enabled: true, role: "unknown", source: "unknown" };
}

export function trustToPermission(trust) {
  switch (trust) {
    case "trusted":
    case "standard":
      return "allow";
    case "restricted":
      return "ask";
    case "disabled":
    case "untrusted":
      return "deny";
    default:
      return "ask";
  }
}

export function buildPermissionMessages(trust, serverName, toolName, resolvedFrom) {
  const tool = toolName ?? "unknown tool";
  if (trust === "restricted") {
    return {
      user_message: `CostGate Shield: MCP "${serverName}" has restricted trust (${resolvedFrom}). Allow "${tool}"?`,
      agent_message: `MCP "${serverName}" is restricted-trust (${resolvedFrom}). User approval is required before running "${tool}".`,
    };
  }
  if (trust === "disabled") {
    return {
      user_message: `CostGate Shield: MCP "${serverName}" is disabled (mcp-disabled.json). Tool "${tool}" was blocked.`,
      agent_message: `MCP "${serverName}" is disabled in CostGate Dashboard. Do not retry "${tool}" until it is re-enabled.`,
    };
  }
  if (trust === "untrusted") {
    return {
      user_message: `CostGate Shield: MCP "${serverName}" is untrusted. Tool "${tool}" was blocked.`,
      agent_message: `MCP "${serverName}" is untrusted. Do not retry "${tool}"; use a trusted MCP or ask the user to raise trust in CostGate Dashboard.`,
    };
  }
  return {};
}

export function toCursorHookOutput(result) {
  const out = { permission: result.permission ?? "allow" };
  if (result.user_message) out.user_message = result.user_message;
  if (result.agent_message) out.agent_message = result.agent_message;
  return out;
}

export function handleCursorShieldMcpHook(payload, context = {}) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  if (event !== "beforeMCPExecution") {
    return { ok: true, skipped: true, event, permission: "allow" };
  }

  const mcpPath = context.mcpPath ?? cursorMcpPath();
  const disabledPath = context.disabledPath ?? mcpDisabledStorePath();
  const mcpConfig = context.mcpConfig ?? loadMcpConfigSafe(mcpPath);
  const disabledStore = context.disabledStore ?? loadMcpDisabled(disabledPath);

  const serverName = extractMcpServerName(payload, mcpConfig) ?? "unknown";
  const meta = buildServerMeta(serverName, { mcpConfig, disabledStore });

  const projectRoot = context.projectRoot ?? resolveProjectRoot(payload);
  const trustPaths = {
    globalPath: context.globalPath ?? globalMcpTrustPath(),
    ...(projectRoot
      ? {
          projectRoot,
          projectPath: context.projectPath ?? projectMcpTrustPath(projectRoot),
        }
      : {}),
  };

  const trust = context.trust ?? loadMcpTrust(trustPaths);
  const resolved = resolveServerTrust(serverName, {
    trust,
    meta,
    marketplaceDir: context.marketplaceDir,
    marketplaceCatalog: context.marketplaceCatalog,
    catalogIndex: context.catalogIndex,
  });

  const permission = trustToPermission(resolved.trust);
  const messages =
    permission === "allow"
      ? {}
      : buildPermissionMessages(
          resolved.trust,
          serverName,
          payload?.tool_name,
          resolved.resolved_from
        );

  return {
    ok: true,
    event,
    server: serverName,
    tool_name: payload?.tool_name ?? null,
    trust: resolved.trust,
    resolved_from: resolved.resolved_from,
    permission,
    ...messages,
  };
}

async function main() {
  const raw = (await readStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ permission: "allow" })}\n`);
    return;
  }

  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cursor-shield-mcp-hook] invalid JSON on stdin\n");
    process.stdout.write(
      `${JSON.stringify({
        permission: "deny",
        user_message: "CostGate Shield: hook received invalid input; MCP call blocked.",
        agent_message: "MCP call blocked because the trust hook could not parse its input.",
      })}\n`
    );
    return;
  }

  try {
    const result = handleCursorShieldMcpHook(payload);
    process.stdout.write(`${JSON.stringify(toCursorHookOutput(result))}\n`);
  } catch (e) {
    process.stderr.write(`[cursor-shield-mcp-hook] ${e.message ?? e}\n`);
    process.stdout.write(
      `${JSON.stringify({
        permission: "deny",
        user_message: "CostGate Shield: trust hook failed; MCP call blocked.",
        agent_message: "MCP call blocked because the CostGate trust hook encountered an error.",
      })}\n`
    );
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[cursor-shield-mcp-hook] ${e.message ?? e}\n`);
    process.stdout.write(
      `${JSON.stringify({
        permission: "deny",
        user_message: "CostGate Shield: trust hook crashed; MCP call blocked.",
        agent_message: "MCP call blocked because the CostGate trust hook crashed.",
      })}\n`
    );
    process.exit(0);
  });
}
