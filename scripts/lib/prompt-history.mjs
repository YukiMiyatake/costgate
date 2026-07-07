/**
 * P9b — aggregate prompt turns with gate JSONL correlation.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readTurns, historyLimit } from "./history-store.mjs";
import { bytesToTokens } from "./parse-probe-logs.mjs";

const JOIN_WINDOW_MS = 5 * 60 * 1000;

function parseJsonlLines(text) {
  const rows = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return rows;
}

export function readGateEvents(gateLogDir) {
  const events = [];
  if (!gateLogDir || !existsSync(gateLogDir)) return events;
  const files = readdirSync(gateLogDir)
    .filter((f) => f.startsWith("gate-") && f.endsWith(".jsonl"))
    .sort();
  for (const file of files) {
    for (const row of parseJsonlLines(readFileSync(join(gateLogDir, file), "utf8"))) {
      if (row?.type === "gate_event") events.push(row);
    }
  }
  return events;
}

function normalizeRoot(path) {
  if (!path) return "";
  try {
    return resolve(path);
  } catch {
    return String(path);
  }
}

function eventMatchesTurn(event, turn, nextTurnTs) {
  const gen = turn.generation_id;
  if (event.generation_id && gen) {
    return event.generation_id === gen;
  }
  if (event.generation_id) return false;

  const eventTs = Date.parse(event.ts ?? "");
  const turnTs = Date.parse(turn.ts ?? "");
  if (Number.isNaN(eventTs) || Number.isNaN(turnTs)) return false;

  const windowEnd = nextTurnTs
    ? Date.parse(nextTurnTs)
    : turnTs + JOIN_WINDOW_MS;
  if (Number.isNaN(windowEnd)) return false;
  if (eventTs < turnTs || eventTs >= windowEnd) return false;

  if (turn.workspace_root && event.project_root) {
    return normalizeRoot(turn.workspace_root) === normalizeRoot(event.project_root);
  }
  return true;
}

function aggregateGateEvents(events) {
  const toolsList = [];
  const toolCalls = [];
  const toolsCalled = new Set();
  let toolsListTokens = 0;
  let toolCallTokens = 0;
  let savedTokens = 0;

  for (const event of events) {
    if (event.event === "tools_list") {
      const tokens = event.tokens_est ?? 0;
      toolsListTokens += tokens;
      toolsList.push({
        ts: event.ts,
        backend: event.backend,
        tools_exposed: event.tools_exposed,
        tokens_est: tokens,
      });
    }
    if (event.event === "tool_call") {
      const responseBytes = event.response_bytes ?? 0;
      const tokens = bytesToTokens(responseBytes);
      toolCallTokens += tokens;
      const savedBytes = event.saved_bytes ?? 0;
      if (savedBytes > 0) savedTokens += bytesToTokens(savedBytes);
      if (event.tool) toolsCalled.add(event.tool);
      toolCalls.push({
        ts: event.ts,
        tool: event.tool,
        response_bytes: responseBytes,
        compressed: Boolean(event.compressed),
        saved_bytes: savedBytes,
        ok: event.ok !== false,
        error: event.error ?? null,
      });
    }
  }

  return {
    toolsList,
    toolCalls,
    toolsCalled: [...toolsCalled],
    metrics: {
      tools_list_events: toolsList.length,
      tools_list_tokens_est: toolsListTokens,
      tool_calls: toolCalls.length,
      tool_call_tokens_est: toolCallTokens,
      saved_tokens_est: savedTokens,
      total_tokens_est: toolsListTokens + toolCallTokens,
    },
  };
}

function buildTurnSummary(turn, events) {
  const agg = aggregateGateEvents(events);
  const correlatedById = events.some(
    (e) => e.generation_id && e.generation_id === turn.generation_id
  );

  return {
    generation_id: turn.generation_id,
    conversation_id: turn.conversation_id ?? "",
    ts: turn.ts,
    workspace_root: turn.workspace_root ?? "",
    prompt_preview: turn.prompt_preview ?? null,
    prompt: turn.prompt ?? null,
    keywords: turn.keywords ?? "",
    templates: turn.templates ?? [],
    intent_scores: turn.intent_scores ?? {},
    correlation: correlatedById ? "generation_id" : events.length ? "time_window" : "none",
    metrics: agg.metrics,
    tools_list: agg.toolsList,
    tool_calls: agg.toolCalls,
    tools_called: agg.toolsCalled,
  };
}

export function listHistoryTurns(options = {}) {
  const limit = options.limit ?? historyLimit();
  let turns = readTurns({ dir: options.historyDir });
  if (options.workspaceRoot) {
    const root = normalizeRoot(options.workspaceRoot);
    turns = turns.filter(
      (t) => !t.workspace_root || normalizeRoot(t.workspace_root) === root
    );
  }

  const selected = turns.slice(-limit);
  const gateEvents = readGateEvents(options.gateLogDir);
  const summaries = selected.map((turn, index) => {
    const nextTurnTs = selected[index + 1]?.ts;
    const matched = gateEvents.filter((e) => eventMatchesTurn(e, turn, nextTurnTs));
    return buildTurnSummary(turn, matched);
  });

  return {
    limit,
    count: summaries.length,
    turns: [...summaries].reverse(),
  };
}

export function getHistoryTurn(generationId, options = {}) {
  if (!generationId) return null;
  const payload = listHistoryTurns({ ...options, limit: 10_000 });
  return payload.turns.find((t) => t.generation_id === generationId) ?? null;
}

export function exportHistoryTurns(generationIds, options = {}) {
  const ids = new Set(generationIds ?? []);
  const payload = listHistoryTurns({ ...options, limit: 10_000 });
  return {
    export_version: 1,
    exported_at: new Date().toISOString(),
    turns: payload.turns.filter((t) => ids.has(t.generation_id)),
  };
}

export function historyOptionsFromPaths(paths = {}, url = null) {
  const limitRaw = url?.searchParams?.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  return {
    historyDir: paths.historyDir,
    gateLogDir: paths.gateLogDir ?? paths.logDir,
    workspaceRoot: paths.projectRoot ?? url?.searchParams?.get("workspace_root") ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
  };
}
