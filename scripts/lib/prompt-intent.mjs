/**
 * Phase 28: infer Gate intent keywords from Cursor prompt hook payload.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { loadMarketplaceCatalog } from "./dashboard-marketplace.mjs";
import { detectProjectSignals } from "./dashboard-project-recommend.mjs";

const PROJECT_SIGNAL_TEMPLATES = {
  playwright: ["browser"],
  "go.mod": ["filesystem", "github"],
  cursor_rules_gh_pr: ["github"],
};

/** Regex boosts: pattern → template ids */
const PATTERN_BOOSTS = [
  { re: /\b(pull request|pull-request|\bpr\b|merge|github|issue|repository)\b/i, templates: ["github"], strength: 1.0 },
  { re: /\b(slack|channel|通知|チャンネル)\b/i, templates: ["slack"], strength: 1.0 },
  { re: /\b(browser|playwright|screenshot|e2e|スクリーンショット)\b/i, templates: ["browser", "playwright"], strength: 1.0 },
  { re: /\b(postgres|postgresql|sqlite|database|sql|query|データベース)\b/i, templates: ["postgres", "sqlite"], strength: 1.0 },
  { re: /\b(search|google|brave|fetch|検索)\b/i, templates: ["brave-search", "fetch"], strength: 0.8 },
  { re: /\b(notion)\b/i, templates: ["notion"], strength: 1.0 },
  { re: /\b(linear)\b/i, templates: ["linear"], strength: 1.0 },
  { re: /\b(docker|container|コンテナ)\b/i, templates: ["docker"], strength: 1.0 },
  { re: /\b(filesystem|file system|read file|write file)\b/i, templates: ["filesystem"], strength: 0.7 },
  { re: /\b(git commit|git push|git clone)\b/i, templates: ["git", "github"], strength: 0.8 },
];

const SCORE_THRESHOLD = 0.5;
const MAX_KEYWORDS = 20;

function truthyEnv(name, defaultVal = false) {
  const v = process.env[name];
  if (v == null || v === "") return defaultVal;
  return v === "1" || v.toLowerCase() === "true";
}

export function promptIntentDir(options = {}) {
  return (
    options.dir ??
    process.env.COSTGATE_PROMPT_INTENT_DIR ??
    join(homedir(), ".costgate", "prompt-intent")
  );
}

export function latestPromptIntentPath(options = {}) {
  return join(promptIntentDir(options), "latest.json");
}

function catalogIndex(catalog = loadMarketplaceCatalog()) {
  const byId = new Map();
  const tagToTemplates = new Map();
  for (const item of catalog) {
    byId.set(item.id, item);
    for (const tag of item.tags ?? []) {
      const key = tag.toLowerCase();
      if (!tagToTemplates.has(key)) tagToTemplates.set(key, new Set());
      tagToTemplates.get(key).add(item.id);
    }
  }
  return { byId, tagToTemplates };
}

function addScore(scores, templateId, amount) {
  if (!templateId || amount <= 0) return;
  scores[templateId] = (scores[templateId] ?? 0) + amount;
}

function scoreText(text, weight, scores, catalogIdx) {
  const hay = String(text ?? "");
  if (!hay.trim()) return;

  for (const { re, templates, strength } of PATTERN_BOOSTS) {
    if (!re.test(hay)) continue;
    for (const tid of templates) {
      addScore(scores, tid, weight * strength);
    }
  }

  const lower = hay.toLowerCase();
  for (const [tag, templateIds] of catalogIdx.tagToTemplates) {
    if (tag.length < 3) continue;
    if (!lower.includes(tag)) continue;
    for (const tid of templateIds) {
      addScore(scores, tid, weight * 0.3);
    }
  }
}

function scoreProjectSignals(projectRoot, weight, scores, sources) {
  if (!projectRoot || !existsSync(projectRoot)) return;
  const signals = detectProjectSignals(projectRoot);
  if (signals.length) sources.push("project");
  for (const signal of signals) {
    for (const tid of PROJECT_SIGNAL_TEMPLATES[signal] ?? []) {
      addScore(scores, tid, weight);
    }
  }
}

function buildKeywords(templates, catalogIdx) {
  const words = new Set();
  for (const tid of templates) {
    const item = catalogIdx.byId.get(tid);
    for (const tag of item?.tags ?? []) {
      if (tag.length >= 3) words.add(tag.toLowerCase());
    }
    if (tid.length >= 3) words.add(tid.toLowerCase());
  }
  return [...words].slice(0, MAX_KEYWORDS).join(" ");
}

/** Read last user prompts from Cursor transcript JSONL (opt-in). */
export function readTranscriptTail(transcriptPath, maxTurns = 2) {
  if (!transcriptPath || !existsSync(transcriptPath)) return "";
  try {
    const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
    const prompts = [];
    for (let i = lines.length - 1; i >= 0 && prompts.length < maxTurns; i--) {
      try {
        const row = JSON.parse(lines[i]);
        const role = row.role ?? row.type ?? "";
        const text = row.text ?? row.content ?? row.message ?? "";
        if (String(role).includes("user") && text) prompts.unshift(String(text));
      } catch {
        continue;
      }
    }
    return prompts.join("\n");
  } catch {
    return "";
  }
}

/**
 * @param {object} payload Cursor beforeSubmitPrompt hook payload
 * @param {object} [options]
 */
export function inferPromptIntent(payload, options = {}) {
  const prompt = String(payload?.prompt ?? "");
  const attachments = payload?.attachments ?? [];
  const workspaceRoot = payload?.workspace_roots?.[0] ?? "";
  const conversationId = String(payload?.conversation_id ?? "");
  const generationId = String(payload?.generation_id ?? "");
  const catalogIdx = options.catalogIndex ?? catalogIndex(options.catalog);

  const scores = {};
  const sources = [];

  if (prompt.trim()) {
    scoreText(prompt, 1.0, scores, catalogIdx);
    sources.push("prompt");
  }

  for (const att of attachments) {
    const path = att?.file_path ?? att?.path ?? "";
    if (!path) continue;
    scoreText(path, 0.8, scores, catalogIdx);
    if (!sources.includes("attachment")) sources.push("attachment");
  }

  if (workspaceRoot) {
    scoreProjectSignals(workspaceRoot, 0.6, scores, sources);
  }

  const transcriptEnabled =
    options.transcriptEnabled ?? truthyEnv("COSTGATE_PROMPT_INTENT_TRANSCRIPT", false);
  if (transcriptEnabled && payload?.transcript_path) {
    const tail = readTranscriptTail(payload.transcript_path, 2);
    if (tail.trim()) {
      scoreText(tail, 0.4, scores, catalogIdx);
      sources.push("transcript");
    }
  }

  const templates = Object.entries(scores)
    .filter(([, s]) => s >= SCORE_THRESHOLD)
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id);

  const keywords = buildKeywords(templates, catalogIdx);
  const previewEnabled = options.previewEnabled ?? truthyEnv("COSTGATE_PROMPT_INTENT_PREVIEW", false);

  return {
    conversation_id: conversationId,
    generation_id: generationId,
    workspace_root: workspaceRoot,
    keywords,
    templates,
    scores,
    sources,
    ts: Date.now(),
    ...(previewEnabled && prompt ? { prompt_preview: prompt.slice(0, 80) } : {}),
  };
}

export function writePromptIntent(record, options = {}) {
  const dir = promptIntentDir(options);
  mkdirSync(dir, { recursive: true });
  const path = latestPromptIntentPath(options);
  writeFileSync(path, `${JSON.stringify(record, null, 2)}\n`, "utf8");

  const audit = options.audit ?? truthyEnv("COSTGATE_PROMPT_INTENT_AUDIT", false);
  if (audit && record.conversation_id) {
    const auditPath = join(dir, `${record.conversation_id}.jsonl`);
    writeFileSync(auditPath, `${JSON.stringify(record)}\n`, { flag: "a" });
  }
  return path;
}

export function readLatestPromptIntent(options = {}) {
  const path = latestPromptIntentPath(options);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
