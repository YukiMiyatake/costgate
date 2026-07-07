/**
 * Probe/Gate session → eval replay fixtures (P6c).
 */
import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { defaultLogDir } from "./parse-probe-logs.mjs";

export function parseJsonl(text) {
  const rows = [];
  for (const line of text.trim().split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return rows;
}

export function readJsonlFile(path) {
  return parseJsonl(readFileSync(path, "utf8"));
}

/**
 * List sessions in probe JSONL files with tool_call counts.
 */
export function listProbeSessions(logDir = defaultLogDir()) {
  const sessions = new Map();
  if (!existsSync(logDir)) return [];

  for (const file of readdirSync(logDir).filter(
    (f) => f.startsWith("probe-") && f.endsWith(".jsonl")
  )) {
    for (const row of readJsonlFile(join(logDir, file))) {
      if (row.type !== "tool_call" || !row.tool) continue;
      const sid = row.session_id ?? "unknown";
      const entry = sessions.get(sid) ?? {
        session_id: sid,
        tool_calls: 0,
        tools: new Set(),
        source_file: file,
      };
      entry.tool_calls++;
      entry.tools.add(row.tool);
      sessions.set(sid, entry);
    }
  }

  return [...sessions.values()]
    .map((s) => ({
      session_id: s.session_id,
      tool_calls: s.tool_calls,
      tools: [...s.tools],
      source_file: s.source_file,
    }))
    .sort((a, b) => b.tool_calls - a.tool_calls);
}

/**
 * Build a replay fixture from probe JSONL events.
 */
export function sessionToReplayFixture(events, options = {}) {
  const sessionId = options.sessionId;
  const filtered = sessionId
    ? events.filter((e) => !e.session_id || e.session_id === sessionId)
    : events;

  const toolCalls = filtered.filter((e) => e.type === "tool_call" && e.tool);
  const uniqueTools = [...new Set(toolCalls.map((e) => e.tool))];
  const id = options.id ?? sessionId ?? "session-replay";
  const keywords = options.keywords ?? uniqueTools.map((t) => t.replace(/_/g, " ")).join(" ");

  return {
    version: 1,
    id,
    name: options.name ?? `Replay session ${sessionId ?? id}`,
    session_id: sessionId ?? null,
    seed_probe_log: uniqueTools.map((tool) => ({ tool })),
    seed_prompt_intent: options.include_prompt_intent
      ? { keywords, templates: options.templates ?? [] }
      : undefined,
    metadata: {
      tool_call_count: toolCalls.length,
      unique_tools: uniqueTools,
      source: options.source ?? "probe-replay",
      exported_at: new Date().toISOString(),
    },
  };
}

/** Convert replay fixture → eval task for sweep harness. */
export function replayFixtureToEvalTask(fixture, options = {}) {
  const task = {
    id: fixture.id,
    name: fixture.name,
    steps: options.steps ?? [
      {
        action: "list_tools",
        assert: {
          min_count: 3,
          max_count: 20,
          includes: ["discover_tools", "invoke_tool"],
        },
      },
      {
        action: "call",
        tool: "discover_tools",
        args: {
          query: (fixture.seed_probe_log?.[0]?.tool ?? "tool").split("_")[0],
          limit: 5,
        },
        assert_text_contains: fixture.seed_probe_log?.[0]?.tool ?? "discover",
      },
    ],
  };
  if (fixture.seed_probe_log?.length) task.seed_probe_log = fixture.seed_probe_log;
  if (fixture.seed_prompt_intent) task.seed_prompt_intent = fixture.seed_prompt_intent;
  if (fixture.seed_trust) task.seed_trust = fixture.seed_trust;
  return task;
}

export function loadReplayFixture(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (!raw.id || !raw.seed_probe_log) {
    throw new Error(`invalid replay fixture: ${path}`);
  }
  return raw;
}

export function exportReplayFixture(events, outPath, options = {}) {
  const fixture = sessionToReplayFixture(events, options);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
  return fixture;
}

/**
 * Export from log directory (newest file containing session, or --file).
 */
export function exportSessionFromLogs(options = {}) {
  const logDir = options.logDir ?? defaultLogDir();
  const sessionId = options.sessionId;
  let events = [];

  if (options.file) {
    events = readJsonlFile(options.file);
  } else if (!existsSync(logDir)) {
    throw new Error(`log dir not found: ${logDir}`);
  } else {
    const files = readdirSync(logDir)
      .filter((f) => f.startsWith("probe-") && f.endsWith(".jsonl"))
      .sort()
      .reverse();
    for (const file of files) {
      const rows = readJsonlFile(join(logDir, file));
      const hasSession = !sessionId || rows.some((r) => r.session_id === sessionId);
      if (hasSession) {
        events = rows;
        break;
      }
    }
  }

  if (!events.length) {
    throw new Error(sessionId ? `session not found: ${sessionId}` : "no probe events found");
  }

  return sessionToReplayFixture(events, {
    sessionId,
    id: options.id,
    name: options.name,
    include_prompt_intent: options.includePromptIntent ?? true,
    source: options.file ?? logDir,
  });
}
