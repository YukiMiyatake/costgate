import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export function defaultLogDir() {
  return (
    process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate", "logs")
  );
}

export function bytesToTokens(bytes) {
  if (!bytes || bytes <= 0) return 0;
  return Math.max(1, Math.ceil(bytes / 4));
}

/**
 * Parse Probe JSONL into global + per-session token breakdown.
 */
export function parseProbeLogs(logDir = defaultLogDir()) {
  const global = {
    sessions: 0,
    tools_list_events: 0,
    tools_list_tokens: 0,
    tool_calls: 0,
    tool_call_tokens: 0,
    tool_call_request_bytes: 0,
    tool_call_response_bytes: 0,
  };
  const bySession = new Map();

  if (!existsSync(logDir)) {
    return { logDir, global, sessions: [], period: null };
  }

  let from = null;
  let to = null;

  for (const file of readdirSync(logDir).filter(
    (f) => f.startsWith("probe-") && f.endsWith(".jsonl")
  )) {
    for (const line of readFileSync(join(logDir, file), "utf8").split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        continue;
      }
      if (row.ts) {
        if (!from || row.ts < from) from = row.ts;
        if (!to || row.ts > to) to = row.ts;
      }
      const sid = row.session_id;
      if (!sid) continue;

      if (!bySession.has(sid)) {
        bySession.set(sid, {
          session_id: sid,
          client: row.client ?? "unknown",
          tools_list_events: 0,
          tools_list_tokens: 0,
          tool_calls: 0,
          tool_call_tokens: 0,
        });
      }
      const s = bySession.get(sid);
      if (row.client) s.client = row.client;

      if (row.type === "tools_list") {
        const tok = row.estimated_tokens ?? bytesToTokens(row.total_schema_bytes ?? 0);
        s.tools_list_events++;
        s.tools_list_tokens += tok;
        global.tools_list_events++;
        global.tools_list_tokens += tok;
      }

      if (row.type === "tool_call") {
        const req = row.request_bytes ?? 0;
        const res = row.response_bytes ?? 0;
        const tok =
          row.estimated_tokens ?? bytesToTokens(req + res);
        s.tool_calls++;
        s.tool_call_tokens += tok;
        global.tool_calls++;
        global.tool_call_tokens += tok;
        global.tool_call_request_bytes += req;
        global.tool_call_response_bytes += res;
      }
    }
  }

  global.sessions = bySession.size;
  const sessions = [...bySession.values()].sort(
    (a, b) => b.tools_list_tokens + b.tool_call_tokens - (a.tools_list_tokens + a.tool_call_tokens)
  );

  return {
    logDir,
    global,
    sessions,
    period: from && to ? { from, to } : null,
  };
}

export function mcpMeasurableTokens(global) {
  return global.tools_list_tokens + global.tool_call_tokens;
}

export function fixedSharePct(global) {
  const total = mcpMeasurableTokens(global);
  if (total <= 0) return 0;
  return Math.round((global.tools_list_tokens / total) * 1000) / 10;
}

export function scenarioOverallReduction(fixedSavings, hypotheticalTotal) {
  if (!hypotheticalTotal || hypotheticalTotal <= 0) return 0;
  return Math.round((fixedSavings / hypotheticalTotal) * 1000) / 10;
}
