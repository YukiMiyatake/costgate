/**
 * P9a — append-only turn index for Dashboard prompt history.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_LIMIT = 50;
const PREVIEW_CHARS = 120;

function envTruthy(name, defaultVal = false) {
  const v = process.env[name];
  if (v == null || v === "") return defaultVal;
  const val = String(v).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(val)) return true;
  if (["0", "false", "no", "off"].includes(val)) return false;
  return defaultVal;
}

export function historyEnabled() {
  return envTruthy("COSTGATE_HISTORY", true);
}

export function historyLimit(options = {}) {
  if (options.limit != null) return Math.max(1, Number(options.limit) || DEFAULT_LIMIT);
  const raw = process.env.COSTGATE_HISTORY_LIMIT;
  if (raw == null || raw === "") return DEFAULT_LIMIT;
  const n = Number.parseInt(String(raw), 10);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_LIMIT;
}

/** @returns {"off"|"preview"|"full"} */
export function historyPromptMode() {
  const v = String(process.env.COSTGATE_HISTORY_PROMPT ?? "preview").trim().toLowerCase();
  if (v === "off" || v === "0" || v === "false" || v === "no") return "off";
  if (v === "full") return "full";
  return "preview";
}

export function historyDir(options = {}) {
  return (
    options.dir ??
    process.env.COSTGATE_HISTORY_DIR ??
    join(homedir(), ".costgate", "history")
  );
}

export function turnsPath(options = {}) {
  return join(historyDir(options), "turns.jsonl");
}

/**
 * @param {object} record prompt-intent record
 * @param {{ prompt?: string }} [options]
 */
export function buildTurnEntry(record, options = {}) {
  const prompt = String(options.prompt ?? "");
  const mode = historyPromptMode();
  const entry = {
    type: "turn",
    ts: new Date(record.ts ?? Date.now()).toISOString(),
    conversation_id: record.conversation_id ?? "",
    generation_id: record.generation_id ?? "",
    workspace_root: record.workspace_root ?? "",
    client: "cursor",
    keywords: record.keywords ?? "",
    templates: record.templates ?? [],
    intent_scores: record.scores ?? {},
  };

  if (mode === "full" && prompt) {
    entry.prompt = prompt;
  } else if (mode === "preview" && prompt) {
    entry.prompt_preview = prompt.slice(0, PREVIEW_CHARS);
  } else if (record.prompt_preview) {
    entry.prompt_preview = record.prompt_preview;
  }

  return entry;
}

export function pruneTurnsFile(path, limit) {
  if (!existsSync(path)) return 0;
  const lines = readFileSync(path, "utf8").split("\n").filter((l) => l.trim());
  if (lines.length <= limit) return lines.length;
  const kept = lines.slice(-limit);
  writeFileSync(path, `${kept.join("\n")}\n`, "utf8");
  return kept.length;
}

/**
 * Append one turn row and prune to COSTGATE_HISTORY_LIMIT.
 * @returns {string|null} turns.jsonl path
 */
export function appendTurn(record, options = {}) {
  if (!historyEnabled()) return null;
  if (!record?.generation_id) return null;

  const path = turnsPath(options);
  mkdirSync(historyDir(options), { recursive: true });
  const entry = buildTurnEntry(record, options);
  writeFileSync(path, `${JSON.stringify(entry)}\n`, { flag: "a" });
  pruneTurnsFile(path, historyLimit(options));
  return path;
}

export function readTurns(options = {}) {
  const path = turnsPath(options);
  if (!existsSync(path)) return [];
  const rows = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      // skip malformed
    }
  }
  return rows;
}
