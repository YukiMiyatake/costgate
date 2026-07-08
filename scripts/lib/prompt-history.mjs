/**
 * P9b — aggregate prompt turns with gate JSONL correlation.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readTurns, historyLimit } from "./history-store.mjs";
import { bytesToTokens } from "./parse-probe-logs.mjs";


/** tools/list may arrive before the prompt turn (Gate startup / Cursor cache refresh). */
const TOOLS_LIST_LOOKBACK_MS = 30 * 60 * 1000;
/** Open-ended last turn window when no following prompt exists yet. */
const OPEN_TURN_MS = 30 * 60 * 1000;

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

export function readProbeEvents(logDir) {
  const events = [];
  if (!logDir || !existsSync(logDir)) return events;
  const files = readdirSync(logDir)
    .filter((f) => f.startsWith("probe-") && f.endsWith(".jsonl"))
    .sort();
  for (const file of files) {
    for (const row of parseJsonlLines(readFileSync(join(logDir, file), "utf8"))) {
      if (row?.session_id) events.push(row);
    }
  }
  return events;
}

export function readGateEvents(gateLogDir, options = {}) {
  const events = [];
  if (!gateLogDir || !existsSync(gateLogDir)) return events;
  const projectRoot = options.projectRoot ? normalizeRoot(options.projectRoot) : null;
  const files = readdirSync(gateLogDir)
    .filter((f) => f.startsWith("gate-") && f.endsWith(".jsonl"))
    .sort();
  for (const file of files) {
    for (const row of parseJsonlLines(readFileSync(join(gateLogDir, file), "utf8"))) {
      if (row?.type !== "gate_event") continue;
      if (projectRoot) {
        const rowRoot = row.project_root ? normalizeRoot(row.project_root) : null;
        if (rowRoot && rowRoot !== projectRoot) continue;
      }
      events.push(row);
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

function buildTurnTimeline(turns) {
  const sorted = [...turns].sort(
    (a, b) => Date.parse(a.ts ?? "") - Date.parse(b.ts ?? "")
  );
  return sorted.map((turn, index) => ({
    ...turn,
    nextTs: sorted[index + 1]?.ts ?? null,
  }));
}

/**
 * Infer which prompt generation owns a Gate event using turn boundaries
 * (generation_id from Cursor hook), not a blind time window.
 */
export function inferGenerationForEvent(event, timeline) {
  if (event?.generation_id) {
    return { generation_id: event.generation_id, inferred: false };
  }
  const eventTs = Date.parse(event?.ts ?? "");
  if (Number.isNaN(eventTs)) return null;

  for (let i = timeline.length - 1; i >= 0; i--) {
    const turn = timeline[i];
    const turnTs = Date.parse(turn.ts ?? "");
    if (Number.isNaN(turnTs) || !turn.generation_id) continue;

    const lookback = event.event === "tools_list" ? TOOLS_LIST_LOOKBACK_MS : 0;
    if (eventTs < turnTs - lookback) continue;

    const nextTs = turn.nextTs ? Date.parse(turn.nextTs) : NaN;
    const windowEnd = Number.isNaN(nextTs) ? turnTs + OPEN_TURN_MS : nextTs;
    if (eventTs >= windowEnd) continue;

    if (
      turn.conversation_id &&
      event.conversation_id &&
      turn.conversation_id !== event.conversation_id
    ) {
      continue;
    }
    if (turn.workspace_root && event.project_root) {
      if (normalizeRoot(turn.workspace_root) !== normalizeRoot(event.project_root)) {
        continue;
      }
    }
    return { generation_id: turn.generation_id, inferred: true };
  }
  return null;
}

export function enrichGateEvents(events, timeline) {
  return events.map((event) => {
    if (event?.generation_id) {
      return { ...event, _generation_inferred: false };
    }
    const resolved = inferGenerationForEvent(event, timeline);
    if (!resolved) return event;
    return {
      ...event,
      generation_id: resolved.generation_id,
      _generation_inferred: resolved.inferred,
    };
  });
}

function eventMatchesTurn(event, turn) {
  const gen = turn.generation_id;
  if (!gen || !event.generation_id || event.generation_id !== gen) {
    return false;
  }
  if (
    turn.conversation_id &&
    event.conversation_id &&
    turn.conversation_id !== event.conversation_id
  ) {
    return false;
  }
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

function resolveCorrelation(events, turn) {
  const gen = turn.generation_id;
  const matched = events.filter((e) => e.generation_id === gen);
  if (!matched.length) return "none";
  if (matched.some((e) => !e._generation_inferred)) return "generation_id";
  return "generation_inferred";
}

function buildTurnSummary(turn, events) {
  const agg = aggregateGateEvents(events);

  return {
    generation_id: turn.generation_id,
    source: "turns",
    conversation_id: turn.conversation_id ?? "",
    ts: turn.ts,
    workspace_root: turn.workspace_root ?? "",
    prompt_preview: turn.prompt_preview ?? null,
    prompt: turn.prompt ?? null,
    keywords: turn.keywords ?? "",
    templates: turn.templates ?? [],
    intent_scores: turn.intent_scores ?? {},
    correlation: resolveCorrelation(events, turn),
    metrics: agg.metrics,
    tools_list: agg.toolsList,
    tool_calls: agg.toolCalls,
    tools_called: agg.toolsCalled,
  };
}

function buildProbeSessionSummary(sessionId, events) {
  const toolsList = [];
  const toolCalls = [];
  const toolsCalled = new Set();
  let toolsListTokens = 0;
  let toolCallTokens = 0;
  let ts = null;
  let client = "unknown";

  for (const row of events) {
    if (row.client) client = row.client;
    if (row.ts && (!ts || row.ts < ts)) ts = row.ts;

    if (row.type === "tools_list") {
      const tokens = row.estimated_tokens ?? bytesToTokens(row.total_schema_bytes ?? 0);
      toolsListTokens += tokens;
      toolsList.push({
        ts: row.ts,
        backend: row.backend ?? "probe",
        tools_exposed: row.tool_count ?? row.tools?.length ?? 0,
        tokens_est: tokens,
      });
    }

    if (row.type === "tool_call") {
      const req = row.request_bytes ?? 0;
      const res = row.response_bytes ?? 0;
      const tokens = row.estimated_tokens ?? bytesToTokens(req + res);
      toolCallTokens += tokens;
      if (row.tool) toolsCalled.add(row.tool);
      toolCalls.push({
        ts: row.ts,
        tool: row.tool,
        response_bytes: res,
        compressed: false,
        saved_bytes: 0,
        ok: true,
        error: null,
        estimated_tokens: tokens,
      });
    }
  }

  const tools = [...toolsCalled];
  return {
    generation_id: sessionId,
    session_id: sessionId,
    source: "probe",
    conversation_id: "",
    ts: ts ?? new Date(0).toISOString(),
    workspace_root: "",
    prompt_preview: null,
    prompt: null,
    keywords: tools.length ? tools.join(" ") : `probe session ${sessionId}`,
    templates: [],
    intent_scores: {},
    client,
    correlation: "probe_session",
    metrics: {
      tools_list_events: toolsList.length,
      tools_list_tokens_est: toolsListTokens,
      tool_calls: toolCalls.length,
      tool_call_tokens_est: toolCallTokens,
      saved_tokens_est: 0,
      total_tokens_est: toolsListTokens + toolCallTokens,
    },
    tools_list: toolsList,
    tool_calls: toolCalls,
    tools_called: tools,
  };
}

export function listProbeHistorySessions(options = {}) {
  const limit = options.limit ?? historyLimit();
  const logDir = options.logDir ?? options.gateLogDir;
  const bySession = new Map();

  for (const row of readProbeEvents(logDir)) {
    const sid = row.session_id;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(row);
  }

  const summaries = [...bySession.entries()]
    .map(([sessionId, events]) => buildProbeSessionSummary(sessionId, events))
    .sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts))
    .slice(0, limit);

  return {
    source: "probe",
    limit,
    count: summaries.length,
    turns: summaries,
  };
}

export function listHistory(options = {}) {
  const source = options.source ?? "turns";
  if (source === "probe") {
    return listProbeHistorySessions(options);
  }
  return { source: "turns", ...listHistoryTurns(options) };
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
  const timeline = buildTurnTimeline(turns);
  const gateEvents = enrichGateEvents(
    readGateEvents(options.gateLogDir, {
      projectRoot: options.workspaceRoot ?? options.projectRoot,
    }),
    timeline
  );
  const summaries = selected.map((turn) => {
    const matched = gateEvents.filter((e) => eventMatchesTurn(e, turn));
    return buildTurnSummary(turn, matched);
  });

  return {
    source: "turns",
    limit,
    count: summaries.length,
    turns: [...summaries].reverse(),
  };
}

export function getHistoryTurn(generationId, options = {}) {
  if (!generationId) return null;
  const payload = listHistory({ ...options, limit: 10_000 });
  return payload.turns.find((t) => t.generation_id === generationId) ?? null;
}

export function exportHistoryTurns(generationIds, options = {}) {
  const ids = new Set(generationIds ?? []);
  const payload = listHistory({ ...options, limit: 10_000 });
  return {
    export_version: 1,
    exported_at: new Date().toISOString(),
    source: payload.source ?? options.source ?? "turns",
    turns: payload.turns.filter((t) => ids.has(t.generation_id)),
  };
}

export function historyOptionsFromPaths(paths = {}, url = null) {
  const limitRaw = url?.searchParams?.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
  const source = url?.searchParams?.get("source") ?? "turns";
  return {
    historyDir: paths.historyDir,
    gateLogDir: paths.gateLogDir ?? paths.logDir,
    logDir: paths.logDir ?? paths.gateLogDir,
    workspaceRoot: paths.projectRoot ?? url?.searchParams?.get("workspace_root") ?? undefined,
    limit: Number.isFinite(limit) && limit > 0 ? limit : undefined,
    source: source === "probe" ? "probe" : "turns",
  };
}
