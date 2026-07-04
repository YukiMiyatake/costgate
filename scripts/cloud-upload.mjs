#!/usr/bin/env node
/**
 * Opt-in upload of aggregated metrics to CostGate Cloud API.
 *
 * Requires:
 *   COSTGATE_CLOUD_URL   e.g. http://localhost:8787
 *   COSTGATE_CLOUD_API_KEY
 *
 * Usage:
 *   npm run cloud:upload
 *   npm run cloud:upload -- --dry-run
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

const API_URL = (process.env.COSTGATE_CLOUD_URL ?? "http://localhost:8787").replace(/\/$/, "");
const API_KEY = process.env.COSTGATE_CLOUD_API_KEY ?? "";
const LOG_DIR =
  process.env.COSTGATE_PROBE_LOG_DIR ?? join(homedir(), ".costgate", "logs");

function buildSummary() {
  const sessions = new Set();
  const toolsListTokens = [];
  const toolCallCounts = new Map();
  let from = null;
  let to = null;

  if (existsSync(LOG_DIR)) {
    for (const file of readdirSync(LOG_DIR).filter(
      (f) => f.startsWith("probe-") && f.endsWith(".jsonl")
    )) {
      for (const line of readFileSync(join(LOG_DIR, file), "utf8").split("\n")) {
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
        if (row.session_id) sessions.add(row.session_id);
        if (row.type === "tools_list" && row.estimated_tokens != null) {
          toolsListTokens.push(row.estimated_tokens);
        }
        if (row.type === "tool_call" && row.tool) {
          toolCallCounts.set(row.tool, (toolCallCounts.get(row.tool) ?? 0) + 1);
        }
      }
    }
  }

  const usagePath =
    process.env.COSTGATE_USAGE_PATH ?? join(homedir(), ".costgate", "usage.json");
  let gate;
  if (existsSync(usagePath)) {
    try {
      const usage = JSON.parse(readFileSync(usagePath, "utf8"));
      const tools = usage.tools ?? {};
      gate = {
        usage_tools: Object.keys(tools).length,
        top_tools: Object.entries(tools)
          .map(([tool, st]) => ({ tool, call_count: st.call_count ?? 0 }))
          .sort((a, b) => b.call_count - a.call_count)
          .slice(0, 10),
      };
    } catch {
      // ignore
    }
  }

  const now = new Date().toISOString();
  return {
    version: "1",
    uploaded_at: now,
    client: process.env.COSTGATE_CLIENT ?? "unknown",
    period: { from: from ?? now, to: to ?? now },
    probe: {
      sessions: sessions.size,
      tools_list_events: toolsListTokens.length,
      avg_tools_list_tokens:
        toolsListTokens.length > 0
          ? Math.round(
              toolsListTokens.reduce((s, t) => s + t, 0) / toolsListTokens.length
            )
          : null,
      tool_calls: [...toolCallCounts.values()].reduce((s, n) => s + n, 0),
      top_tools: [...toolCallCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([tool, count]) => ({ tool, count })),
    },
    gate,
  };
}

async function main() {
  if (!API_KEY && !dryRun) {
    console.error("[cloud-upload] set COSTGATE_CLOUD_API_KEY (opt-in only)");
    process.exit(1);
  }

  const summary = buildSummary();
  const body = JSON.stringify({ summary });

  if (dryRun) {
    console.log(JSON.stringify({ summary }, null, 2));
    return;
  }

  const res = await fetch(`${API_URL}/v1/metrics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body,
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`[cloud-upload] ${res.status}: ${text}`);
    process.exit(1);
  }
  console.log(`[cloud-upload] ok: ${text}`);
}

main().catch((e) => {
  console.error("[cloud-upload] fatal:", e);
  process.exit(1);
});
