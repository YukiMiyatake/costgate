/**
 * Live MCP tools/list probe for backends without tier catalogs (e.g. serena, aieph).
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { summarizeTools } from "./tokens.mjs";
import {
  loadMcpSdkClient,
  loadMcpSdkStdioTransport,
  loadMcpSdkStreamableHttpTransport,
} from "./mcp-sdk-resolve.mjs";
import { readJson } from "./read-json.mjs";
import { isMultiBackend, toolRowKey } from "./tool-override-names.mjs";

const DEFAULT_TTL_MS = 6 * 60 * 60 * 1000;
/** HTTP/url backends: cheap probe, tool defs change rarely. */
export const URL_BACKEND_TTL_MS = 24 * 60 * 60 * 1000;
/** stdio backends that spawn heavy processes (e.g. serena). */
export const SERENA_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 20_000;

const SERENA_PROBE_FLAGS = [
  ["--open-web-dashboard", "false"],
  ["--enable-gui-log-window", "false"],
];

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

export function isUrlBackend(config = {}) {
  return Boolean(config.url || config.probe_url || config.probeUrl);
}

export function backendProbeTtlMs(backendName, config = {}) {
  const envKey = `COSTGATE_BACKEND_PROBE_TTL_${String(backendName).toUpperCase()}_MS`;
  const raw = process.env[envKey];
  if (raw != null && raw !== "") {
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) return n;
  }
  if (isUrlBackend(config)) return URL_BACKEND_TTL_MS;
  if (backendName === "serena" || isSerenaBackend(backendName, config)) return SERENA_TTL_MS;
  return cacheTtlMs();
}

function hasCliFlag(args, flag) {
  return (args ?? []).some(
    (arg, index) =>
      arg === flag ||
      arg.startsWith(`${flag}=`) ||
      (index > 0 && args[index - 1] === flag)
  );
}

function appendCliFlags(args, flagPairs) {
  const next = [...(args ?? [])];
  for (const [flag, value] of flagPairs) {
    if (hasCliFlag(next, flag)) continue;
    next.push(flag, value);
  }
  return next;
}

export function isSerenaBackend(name, config = {}) {
  if (name === "serena") return true;
  const args = config.args ?? [];
  const joined = [config.command, ...args].filter(Boolean).join(" ");
  return /\bserena\b/.test(joined) && /\bstart-mcp-server\b/.test(joined);
}

/** Probe-only overrides: no browser/GUI when spawning Serena for tools/list. */
export function prepareProbeConfig(name, config = {}) {
  if (!config.command) return { ...config };
  if (!isSerenaBackend(name, config)) return { ...config };
  return {
    ...config,
    args: appendCliFlags(config.args, SERENA_PROBE_FLAGS),
  };
}

/** Prefer probe_url (reuse running HTTP MCP) over spawning stdio. */
export function resolveProbeConfig(name, config = {}) {
  const probeUrl = config.probe_url ?? config.probeUrl;
  if (probeUrl) {
    return {
      url: probeUrl,
      headers: config.probe_headers ?? config.headers ?? null,
    };
  }
  if (config.url) return config;
  return prepareProbeConfig(name, config);
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
  return Number.isNaN(age) || age > backendProbeTtlMs(backendName, config);
}

export function isBackendCacheMissing(cache, backendName) {
  const entry = cache?.backends?.[backendName];
  return !entry?.tools?.length && !entry?.error;
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
  const probeConfig = resolveProbeConfig(name, config);
  const [Client, StdioClientTransport, StreamableHTTPClientTransport] = await Promise.all([
    loadMcpSdkClient(),
    loadMcpSdkStdioTransport(),
    loadMcpSdkStreamableHttpTransport(),
  ]);
  const client = new Client(
    { name: "costgate-dashboard", version: "0.1.0" },
    { capabilities: {} }
  );

  let transport;
  if (probeConfig.url) {
    transport = new StreamableHTTPClientTransport(new URL(probeConfig.url), {
      requestInit: probeConfig.headers ? { headers: probeConfig.headers } : undefined,
    });
  } else if (probeConfig.command) {
    transport = new StdioClientTransport({
      command: probeConfig.command,
      args: probeConfig.args ?? [],
      env: { ...process.env, ...(probeConfig.env ?? {}) },
      cwd: probeConfig.cwd,
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
  const candidates = backendsNeedingProbe(backends, catalogs);
  const only = options.only?.length ? new Set(options.only) : null;
  const targets = candidates.filter((name) => {
    if (only && !only.has(name)) return false;
    if (options.force) return true;
    return isBackendCacheStale(cache, name, backends[name]);
  });

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
  const multiBackend = isMultiBackend(backends);
  for (const [backendName, entry] of Object.entries(cache.backends)) {
    if (!backends[backendName]) continue;
    for (const tool of entry.tools ?? []) {
      if (!tool?.name) continue;
      const rowKey = toolRowKey(tool.name, backendName, multiBackend);
      const cur = probeByTool.get(rowKey) ?? probeByTool.get(tool.name) ?? {
        name: rowKey,
        backend: backendName,
        call_count: 0,
        last_used: null,
        estimated_list_tokens: 0,
        list_samples: 0,
        source: "backend_probe",
      };
      cur.name = rowKey;
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
      probeByTool.set(rowKey, cur);
    }
  }
}
