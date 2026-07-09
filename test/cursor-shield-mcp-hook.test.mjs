#!/usr/bin/env node
/**
 * Phase 31d: beforeMCPExecution trust hook tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  buildPermissionMessages,
  buildServerMeta,
  extractMcpServerName,
  handleCursorShieldMcpHook,
  trustToPermission,
} from "../scripts/cursor-shield-mcp-hook.mjs";
import { loadMcpTrust, resolveServerTrust } from "../scripts/lib/mcp-trust.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const MARKETPLACE = join(ROOT, "catalog/marketplace");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempRoot() {
  const dir = join(tmpdir(), `costgate-shield-hook-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function trustContext(base, projectRoot = null) {
  const globalPath = join(base, "global", "mcp-trust.json");
  mkdirSync(join(base, "global"), { recursive: true });
  const paths = { globalPath };
  if (projectRoot) {
    paths.projectRoot = projectRoot;
    paths.projectPath = join(projectRoot, ".costgate", "mcp-trust.json");
  }
  const trust = loadMcpTrust(paths);
  return { ...paths, trust };
}

function testExtractServerName() {
  const mcpConfig = {
    mcpServers: {
      "costgate-gate": { command: "gate" },
      notion: { url: "https://mcp.notion.com/mcp" },
    },
  };
  assert(extractMcpServerName({ command: "costgate-gate" }, mcpConfig) === "costgate-gate", "stdio key");
  assert(
    extractMcpServerName({ url: "https://mcp.notion.com/mcp" }, mcpConfig) === "notion",
    "url lookup"
  );
  assert(extractMcpServerName({ mcp_server_name: "github" }, mcpConfig) === "github", "explicit name");
  console.error("[shield-mcp-hook] extract name ok");
}

function testTrustMatrix() {
  assert(trustToPermission("trusted") === "allow", "trusted allow");
  assert(trustToPermission("standard") === "allow", "standard allow");
  assert(trustToPermission("restricted") === "ask", "restricted ask");
  assert(trustToPermission("untrusted") === "deny", "untrusted deny");
  assert(trustToPermission("disabled") === "deny", "disabled deny");
  console.error("[shield-mcp-hook] trust matrix ok");
}

function testAllowTrustedGate() {
  const base = tempRoot();
  const ctx = trustContext(base);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "costgate-gate",
      tool_name: "discover_tools",
      workspace_roots: [base],
    },
    {
      ...ctx,
      mcpConfig: { mcpServers: { "costgate-gate": { command: "gate" } } },
      disabledStore: {},
    }
  );
  assert(result.permission === "allow", "gate allow");
  assert(result.trust === "trusted", "gate trusted");
  console.error("[shield-mcp-hook] allow trusted ok");
}

function testAskRestrictedDirect() {
  const base = tempRoot();
  const ctx = trustContext(base);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "community-mcp",
      tool_name: "run",
      workspace_roots: [base],
    },
    {
      ...ctx,
      mcpConfig: { mcpServers: { "community-mcp": { command: "node evil.mjs" } } },
      disabledStore: {},
      marketplaceCatalog: [],
    }
  );
  assert(result.permission === "ask", "direct restricted ask");
  assert(result.trust === "restricted", "direct trust");
  assert(result.user_message?.includes("restricted"), "restricted user message");
  console.error("[shield-mcp-hook] ask restricted ok");
}

function testAllowCursorBuiltin() {
  const base = tempRoot();
  const ctx = trustContext(base);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "cursor-app-control",
      tool_name: "move_agent_to_root",
      workspace_roots: [base],
    },
    {
      ...ctx,
      mcpConfig: { mcpServers: { "cursor-app-control": { command: "cac" } } },
      disabledStore: {},
      marketplaceCatalog: [],
    }
  );
  assert(result.permission === "allow", "cursor builtin allow");
  assert(result.trust === "standard", "cursor builtin standard");
  console.error("[shield-mcp-hook] allow cursor builtin ok");
}

function testDenyUntrusted() {
  const base = tempRoot();
  mkdirSync(join(base, "global"), { recursive: true });
  writeFileSync(
    join(base, "global", "mcp-trust.json"),
    `${JSON.stringify({
      version: 1,
      servers: { "sketchy-mcp": { trust: "untrusted" } },
    })}\n`
  );
  const ctx = trustContext(base);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "sketchy-mcp",
      tool_name: "run",
      workspace_roots: [base],
    },
    {
      ...ctx,
      trust: loadMcpTrust({ globalPath: ctx.globalPath }),
      mcpConfig: { mcpServers: { "sketchy-mcp": { command: "node evil.mjs" } } },
      disabledStore: {},
    }
  );
  assert(result.permission === "deny", "untrusted deny");
  assert(result.trust === "untrusted", "untrusted level");
  console.error("[shield-mcp-hook] deny untrusted ok");
}

function testDenyDisabled() {
  const base = tempRoot();
  const ctx = trustContext(base);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "old-server",
      tool_name: "ping",
      workspace_roots: [base],
    },
    {
      ...ctx,
      mcpConfig: { mcpServers: {} },
      disabledStore: { "old-server": { command: "echo old" } },
    }
  );
  assert(result.permission === "deny", "disabled deny");
  assert(result.trust === "disabled", "disabled trust");
  assert(result.user_message?.includes("disabled"), "disabled message");
  console.error("[shield-mcp-hook] deny disabled ok");
}

function testProjectTrustOverride() {
  const base = tempRoot();
  const projectRoot = join(base, "project");
  mkdirSync(join(base, "global"), { recursive: true });
  mkdirSync(join(projectRoot, ".costgate"), { recursive: true });
  writeFileSync(
    join(base, "global", "mcp-trust.json"),
    `${JSON.stringify({ version: 1, servers: { github: { trust: "standard" } } })}\n`
  );
  writeFileSync(
    join(projectRoot, ".costgate", "mcp-trust.json"),
    `${JSON.stringify({ version: 1, servers: { github: { trust: "untrusted" } } })}\n`
  );

  const ctx = trustContext(base, projectRoot);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "github",
      tool_name: "search",
      workspace_roots: [projectRoot],
    },
    {
      ...ctx,
      mcpConfig: { mcpServers: { github: { command: "gh" } } },
      disabledStore: {},
      marketplaceCatalog: [{ id: "github", backend_key: "github", official: true }],
    }
  );
  assert(result.permission === "deny", "project untrusted overrides official");
  assert(result.trust === "untrusted", "project trust applied");
  console.error("[shield-mcp-hook] project override ok");
}

function testSkipOtherEvents() {
  const result = handleCursorShieldMcpHook({ hook_event_name: "sessionStart" });
  assert(result.skipped === true, "skipped");
  assert(result.permission === "allow", "skip allow");
  console.error("[shield-mcp-hook] skip other events ok");
}

function testResolveUsesSharedLoader() {
  const base = tempRoot();
  mkdirSync(join(base, "global"), { recursive: true });
  writeFileSync(
    join(base, "global", "mcp-trust.json"),
    `${JSON.stringify({ version: 1, servers: { demo: { trust: "standard" } } })}\n`
  );
  const trust = loadMcpTrust({ globalPath: join(base, "global", "mcp-trust.json") });
  const resolved = resolveServerTrust("demo", {
    trust,
    meta: { role: "direct", source: "mcp.json", enabled: true },
    marketplaceCatalog: [],
  });
  assert(resolved.trust === "standard", "shared resolve");
  const meta = buildServerMeta("demo", {
    mcpConfig: { mcpServers: { demo: { command: "x" } } },
    disabledStore: {},
  });
  assert(meta.enabled === true && meta.role === "direct", "meta direct");
  const msg = buildPermissionMessages("restricted", "demo", "tool", "direct_mcp");
  assert(msg.user_message.includes("demo"), "message server");
  console.error("[shield-mcp-hook] shared loader ok");
}

function testOfficialStandardAllow() {
  const base = tempRoot();
  const ctx = trustContext(base);
  const result = handleCursorShieldMcpHook(
    {
      hook_event_name: "beforeMCPExecution",
      command: "github",
      tool_name: "search",
      workspace_roots: [base],
    },
    {
      ...ctx,
      mcpConfig: { mcpServers: { github: { command: "gh" } } },
      disabledStore: {},
      marketplaceDir: MARKETPLACE,
    }
  );
  assert(result.permission === "allow", "official standard allow");
  assert(result.trust === "standard", "official standard trust");
  console.error("[shield-mcp-hook] official standard ok");
}

async function main() {
  testExtractServerName();
  testTrustMatrix();
  testAllowTrustedGate();
  testAskRestrictedDirect();
  testAllowCursorBuiltin();
  testDenyUntrusted();
  testDenyDisabled();
  testProjectTrustOverride();
  testSkipOtherEvents();
  testResolveUsesSharedLoader();
  testOfficialStandardAllow();
  console.error("[shield-mcp-hook] all passed");
}

main().catch((e) => {
  console.error("[shield-mcp-hook] fatal:", e);
  process.exit(1);
});
