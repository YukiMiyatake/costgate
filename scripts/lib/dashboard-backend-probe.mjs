/**
 * Live MCP tools/list probe for backends without tier catalogs (e.g. serena, aieph).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { summarizeTools } from "@costgate/probe/metrics";
import { readJson } from "./read-json.mjs";

const DEFAULT_TTL_MS = 10 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20_000;

export function backendToolsCachePath() {
  return (
    process.env.COSTGATE_BACKEND_TOOLS_CACHE ??
    join(homedir(), ".costgate", "backend-tools-cache.json")
  );
}

function cacheTtlMs() {
  const raw = process.env.COSTGATE_BACKEND_PROBE_TTL_MS;
  if (raw == null || raw === "") return DEFAULT_TTL_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TTL_MS;
}

function probeTimeoutMs() {
  const raw = process.env.COSTGATE_BACKEND_PROBE_TIMEOUT_MS;
  if (raw == null || raw === "") return DEFAULT_TIMEOUT_MS;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_TIMEOUT_MS;
}

export function backendConfigFingerprint(config = {}) {
  const payload = {
    command: config.command ?? null,
    args: config.args ?? null,
    url: config.url ?? null,
    env: config.env ?? null,
    headers: config.headers ?? null,
    cwd: config.cwd ?? null,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 16);
}

export function loadBackendToolsCache(path = backendToolsCachePath()) {
  const raw = readJson(path);
  if (!raw?.backends || typeof raw.backends !== "object") {
    return { version: 1, backends: {} };
  }
  return { version: raw.version ?? 1, backends: raw.backends };
}

export function saveBackendToolsCache(cache, path = backendToolsCachePath()) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(cache, null, 2)}\n`, "utf8");
}

export function isBackendCacheStale(cache, backendName, config) {
  const entry = cache?.backends?.[backendName];
  if (!entry?.probed_at) return true;
  if (entry.fingerprint !== backendConfigFingerprint(config)) return true;
  const age = Date.now() - Date.parse(entry.probed_at);
  return Number.isNaN(age) || age > cacheTtlMs();
}

export function backendsNeedingProbe(backends, catalogs) {
  return Object.keys(backends ?? {}).filter((name) => {
    const overrides = catalogs?.[name]?.overrides;
    return !overrides || Object.keys(overrides).length === 0;
  });
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}: timeout after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function probeOneBackend(name, config, options = {}) {
  const timeoutMs = options.timeoutMs ?? probeTimeoutMs();
  const client = new Client(
    { name: "costgate-dashboard", version: "0.1.0" },
    { capabilities: {} }
  );

  let transport;
  if (config.url) {
    transport = new StreamableHTTPClientTransport(new URL(config.url), {
      requestInit: config.headers ? { headers: config.headers } : undefined,
    });
  } else if (config.command) {
    transport = new StdioClientTransport({
      command: config.command,
      args: config.args ?? [],
      env: { ...process.env, ...(config.env ?? {}) },
      cwd: config.cwd,
      stderr: "pipe",
    });
  } else {
    throw new Error(`backend "${name}" requires url or command`);
  }

  try {
    await withTimeout(client.connect(transport), timeoutMs, name);
    const listed = await withTimeout(client.listTools(), timeoutMs, `${name} tools/list`);
    const summary = summarizeTools(listed.tools ?? []);
    return {
      backend: name,
      probed_at: new Date().toISOString(),
      fingerprint: backendConfigFingerprint(config),
      tool_count: summary.tool_count,
      estimated_tokens: summary.estimated_tokens,
      tools: summary.tools.map((t) => ({
        name: t.name,
        estimated_list_tokens: t.estimated_tokens,
      })),
      error: null,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

/**
 * Probe backends that lack tier catalogs; merge into cache file.
 * @returns {{ cache: object, errors: Record<string, string> }}
 */
export async function ensureBackendToolsCache(backends, catalogs, options = {}) {
  const cachePath = options.cachePath ?? backendToolsCachePath();
  const cache = loadBackendToolsCache(cachePath);
  const errors = {};
  const targets = backendsNeedingProbe(backends, catalogs).filter((name) =>
    options.force ? true : isBackendCacheStale(cache, name, backends[name])
  );

  if (!targets.length) {
    return { cache, errors };
  }

  const results = await Promise.allSettled(
    targets.map(async (name) => {
      const result = await probeOneBackend(name, backends[name], options);
      cache.backends[name] = result;
      return result;
    })
  );

  for (let i = 0; i < targets.length; i++) {
    const name = targets[i];
    const outcome = results[i];
    if (outcome.status === "fulfilled") continue;
    const message = outcome.reason?.message ?? String(outcome.reason);
    errors[name] = message;
    cache.backends[name] = {
      backend: name,
      probed_at: new Date().toISOString(),
      fingerprint: backendConfigFingerprint(backends[name]),
      tool_count: 0,
      tools: [],
      error: message,
    };
  }

  saveBackendToolsCache(cache, cachePath);
  return { cache, errors };
}

/** Merge cached live probe tools into probeByTool map (mutates map). */
export function mergeBackendToolsCache(probeByTool, cache, backends) {
  if (!cache?.backends) return;
  for (const [backendName, entry] of Object.entries(cache.backends)) {
    if (!backends[backendName]) continue;
    for (const tool of entry.tools ?? []) {
      if (!tool?.name) continue;
      const cur = probeByTool.get(tool.name) ?? {
        name: tool.name,
        backend: backendName,
        call_count: 0,
        last_used: null,
        estimated_list_tokens: 0,
        list_samples: 0,
        source: "backend_probe",
      };
      cur.backend = backendName;
      if (tool.estimated_list_tokens != null) {
        const tok = tool.estimated_list_tokens;
        cur.estimated_list_tokens =
          cur.list_samples > 0
            ? (cur.estimated_list_tokens * cur.list_samples + tok) / (cur.list_samples + 1)
            : tok;
        cur.list_samples = (cur.list_samples ?? 0) + 1;
      }
      if (!cur.source) cur.source = "backend_probe";
      probeByTool.set(tool.name, cur);
    }
  }
}
