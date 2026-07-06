/**
 * Phase 33b: Prompt Shield block events + sanitize for Dashboard / CLI.
 * Local-only store: ~/.costgate/shield-prompt/
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  Mode,
  inferSecrets,
  promptInferMode,
  redactText,
  shieldPromptAggressive,
} from "./shield-redact.mjs";
import { ShieldVault } from "./shield-vault.mjs";

const BLOCK_WINDOW_MS = 24 * 60 * 60 * 1000;

function truthyEnv(name) {
  const v = process.env[name];
  return v === "1" || v === "true" || v === "yes";
}

export function shieldPromptBlockDir(options = {}) {
  return (
    options.dir ??
    process.env.COSTGATE_SHIELD_PROMPT_DIR ??
    join(homedir(), ".costgate", "shield-prompt")
  );
}

export function latestShieldPromptBlockPath(options = {}) {
  return join(shieldPromptBlockDir(options), "latest.json");
}

export function shieldPromptStatsPath(options = {}) {
  return join(shieldPromptBlockDir(options), "stats.json");
}

export function shieldPromptAuditPath(options = {}) {
  return join(shieldPromptBlockDir(options), "blocks.jsonl");
}

function readJsonFile(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export function readShieldPromptStats(options = {}) {
  const raw = readJsonFile(shieldPromptStatsPath(options));
  return {
    block_count: Number(raw?.block_count) || 0,
    last_ts: raw?.last_ts ?? null,
  };
}

export function readLatestPromptBlock(options = {}) {
  return readJsonFile(latestShieldPromptBlockPath(options));
}

function bumpStats(options = {}) {
  const path = shieldPromptStatsPath(options);
  const current = readShieldPromptStats(options);
  const next = {
    block_count: current.block_count + 1,
    last_ts: Date.now(),
  };
  const dir = shieldPromptBlockDir(options);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  writeFileSync(path, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

/**
 * Build sanitized prompt + vault placeholders for a blocked prompt.
 */
export function sanitizePromptText(text, options = {}) {
  if (!text || !String(text).trim()) {
    return { sanitized: "", findings: [], mode: Mode.Off, vault_path: null };
  }
  const mode = options.mode ?? promptInferMode();
  const vault = new ShieldVault(options.vaultOptions ?? {});
  const sanitized = redactText(String(text), mode, vault);
  vault.save();
  const findings = inferSecrets(String(text), { mode });
  return {
    sanitized,
    findings,
    mode,
    aggressive: mode >= Mode.Aggressive,
    vault_path: vault.filePath(),
  };
}

/**
 * Persist a prompt block event (local only — never logged to stdout).
 */
export function writePromptBlockEvent(record, options = {}) {
  const dir = shieldPromptBlockDir(options);
  mkdirSync(dir, { recursive: true, mode: 0o700 });

  const prompt = typeof record.prompt === "string" ? record.prompt : "";
  const sanitizedResult = prompt
    ? sanitizePromptText(prompt, options)
    : { sanitized: "", findings: record.findings ?? [], mode: promptInferMode(), aggressive: shieldPromptAggressive() };

  const payload = {
    ts: record.ts ?? Date.now(),
    conversation_id: record.conversation_id ?? null,
    generation_id: record.generation_id ?? null,
    workspace_root: record.workspace_root ?? null,
    findings: record.findings ?? sanitizedResult.findings,
    message: record.message ?? null,
    prompt,
    sanitized: sanitizedResult.sanitized,
    mode: sanitizedResult.mode,
    aggressive: sanitizedResult.aggressive,
  };

  writeFileSync(latestShieldPromptBlockPath(options), `${JSON.stringify(payload, null, 2)}\n`, {
    mode: 0o600,
  });

  if (options.audit ?? truthyEnv("COSTGATE_SHIELD_PROMPT_AUDIT")) {
    const audit = {
      ts: payload.ts,
      conversation_id: payload.conversation_id,
      generation_id: payload.generation_id,
      findings: payload.findings,
      message: payload.message,
      aggressive: payload.aggressive,
    };
    writeFileSync(shieldPromptAuditPath(options), `${JSON.stringify(audit)}\n`, {
      flag: "a",
      mode: 0o600,
    });
  }

  const stats = bumpStats(options);
  return { path: latestShieldPromptBlockPath(options), stats, record: payload };
}

/** Count audit lines when stats file is missing (fallback). */
export function countPromptBlockEvents(options = {}) {
  const stats = readShieldPromptStats(options);
  if (stats.block_count > 0) return stats.block_count;
  const auditPath = shieldPromptAuditPath(options);
  if (!existsSync(auditPath)) return 0;
  try {
    const lines = readFileSync(auditPath, "utf8").trim().split("\n").filter(Boolean);
    return lines.length;
  } catch {
    return 0;
  }
}

/** Latest block snapshot for Dashboard overview (secrets never echoed in full). */
export function buildShieldPromptSnapshot(options = {}) {
  const dir = shieldPromptBlockDir(options);
  const latest = readLatestPromptBlock(options);
  const stats = readShieldPromptStats(options);
  const blockCount = stats.block_count || countPromptBlockEvents(options);

  if (!latest?.findings?.length && blockCount === 0) {
    return {
      enabled: true,
      block_count: 0,
      last_block: null,
      aggressive: shieldPromptAggressive(),
    };
  }

  const ageMs = latest?.ts ? (options.now ?? Date.now()) - latest.ts : null;
  const kinds = [...new Set((latest?.findings ?? []).map((f) => f.kind))];

  return {
    enabled: true,
    block_count: blockCount,
    aggressive: shieldPromptAggressive(),
    last_block: latest
      ? {
          ts: latest.ts ?? null,
          age_sec: ageMs != null ? Math.round(ageMs / 1000) : null,
          stale: ageMs != null && ageMs > BLOCK_WINDOW_MS,
          kinds,
          findings: latest.findings ?? [],
          message: latest.message ?? null,
          conversation_id: latest.conversation_id ?? null,
          has_sanitized: Boolean(latest.sanitized?.trim()),
          sanitized_preview: latest.sanitized ? latest.sanitized.slice(0, 120) : null,
        }
      : null,
  };
}

export function buildShieldPromptApiPayload(options = {}) {
  const latest = readLatestPromptBlock(options);
  const snapshot = buildShieldPromptSnapshot(options);
  return {
    ...snapshot,
    paths: {
      dir: shieldPromptBlockDir(options),
      latest: latestShieldPromptBlockPath(options),
      stats: shieldPromptStatsPath(options),
    },
    latest: latest
      ? {
          ...latest,
          prompt: undefined,
        }
      : null,
    levels: ["secrets", "aggressive"],
    aggressive_env: "COSTGATE_SHIELD_PROMPT_AGGRESSIVE",
  };
}

export function sanitizePromptApiBody(body = {}, options = {}) {
  const text = typeof body.text === "string" ? body.text : "";
  if (!text.trim()) {
    throw new Error("text required");
  }
  const mode =
    body.aggressive === true || body.mode === "aggressive"
      ? Mode.Aggressive
      : body.mode === "secrets"
        ? Mode.Secrets
        : promptInferMode();
  return sanitizePromptText(text, { ...options, mode });
}
