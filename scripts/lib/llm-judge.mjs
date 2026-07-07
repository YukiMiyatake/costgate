/**
 * LLM-as-judge — provider abstraction (P7a).
 * Default provider: mock (CI-safe, no API key).
 */
const DEFAULT_MODELS = {
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
};

const MAX_FIELD_CHARS = 12_000;

export function clipJudgeText(text, max = MAX_FIELD_CHARS) {
  const s = String(text ?? "");
  if (s.length <= max) return s;
  return `${s.slice(0, max)}\n...[truncated ${s.length - max} chars]`;
}

export function resolveJudgeConfig(env = process.env) {
  const provider = (env.COSTGATE_JUDGE_PROVIDER ?? "mock").toLowerCase();
  const model =
    env.COSTGATE_JUDGE_MODEL ?? DEFAULT_MODELS[provider] ?? "mock";
  return {
    provider,
    model,
    hasOpenAI: Boolean(env.OPENAI_API_KEY),
    hasAnthropic: Boolean(env.ANTHROPIC_API_KEY),
  };
}

export function parseJudgeJson(text) {
  const trimmed = String(text ?? "").trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("judge response is not JSON");
  }
  const parsed = JSON.parse(candidate.slice(start, end + 1));
  const score = Number(parsed.score);
  if (!Number.isFinite(score) || score < 0 || score > 5) {
    throw new Error(`invalid judge score: ${parsed.score}`);
  }
  return {
    score: Math.round(score * 10) / 10,
    missing_facts: Array.isArray(parsed.missing_facts)
      ? parsed.missing_facts.map(String)
      : [],
    rationale: String(parsed.rationale ?? ""),
  };
}

/** Deterministic mock judge for CI (keyword retention heuristic). */
export function mockJudgeCompression({ original, compressed }) {
  const keywords = extractKeywords(original);
  if (!keywords.length) {
    return {
      score: 3,
      missing_facts: [],
      rationale: "mock: insufficient keywords to score",
      provider: "mock",
    };
  }
  const retained = keywords.filter((k) => compressed.toLowerCase().includes(k));
  const ratio = retained.length / keywords.length;
  const missing = keywords.filter((k) => !retained.includes(k)).slice(0, 8);
  const score = Math.max(1, Math.min(5, Math.round(ratio * 5 * 10) / 10));
  return {
    score,
    missing_facts: missing,
    rationale: `mock keyword retention ${Math.round(ratio * 100)}% (${retained.length}/${keywords.length})`,
    provider: "mock",
  };
}

function extractKeywords(text) {
  const words = String(text ?? "")
    .toLowerCase()
    .match(/[a-z0-9_./-]{5,}/g);
  if (!words) return [];
  return [...new Set(words)].slice(0, 40);
}

const SECRET_PATTERNS = [/ghp_[a-zA-Z0-9]{10,}/, /sk-[a-zA-Z0-9]{10,}/];

/** Deterministic mock judge for Shield redaction pairs. */
export function mockJudgeShield({ original, redacted, task_intent }) {
  let score = 5;
  const issues = [];

  for (const pattern of SECRET_PATTERNS) {
    const match = original.match(pattern);
    if (!match) continue;
    const secret = match[0];
    if (redacted.includes(secret)) {
      score -= 2.5;
      issues.push(`secret leaked: ${secret.slice(0, 10)}…`);
    } else if (!redacted.includes("[[CG:") && !redacted.toLowerCase().includes("redact")) {
      score -= 0.5;
      issues.push("no redaction marker");
    }
  }

  const contextTokens = ["deploy", "repo", "costgate", "main", "token"];
  const retained = contextTokens.filter((t) => redacted.toLowerCase().includes(t));
  if (retained.length < 2) {
    score -= 1.5;
    issues.push("task context lost");
  }

  if (redacted.trim().length < 12) {
    score -= 2;
    issues.push("over-redacted");
  }

  score = Math.max(0, Math.min(5, Math.round(score * 10) / 10));
  return {
    score,
    missing_facts: issues,
    rationale: `mock shield: context ${retained.length}/${contextTokens.length}${task_intent ? "" : ""}`,
    provider: "mock",
  };
}

async function callOpenAI({ system, user, model, apiKey }) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `OpenAI HTTP ${res.status}`);
  }
  const text = body?.choices?.[0]?.message?.content ?? "";
  return parseJudgeJson(text);
}

async function callAnthropic({ system, user, model, apiKey }) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      temperature: 0,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error?.message ?? `Anthropic HTTP ${res.status}`);
  }
  const text = body?.content?.find((c) => c.type === "text")?.text ?? "";
  return parseJudgeJson(text);
}

/**
 * @param {{ system: string, user: string, task?: string, provider?: string, model?: string }} opts
 */
export async function callJudge(opts) {
  const config = resolveJudgeConfig();
  const provider = (opts.provider ?? config.provider).toLowerCase();
  const model = opts.model ?? config.model;

  if (provider === "mock") {
    if (opts.task === "compression") {
      return mockJudgeCompression(opts.pair ?? {});
    }
    if (opts.task === "shield") {
      return mockJudgeShield(opts.pair ?? {});
    }
    throw new Error(`mock judge: unsupported task ${opts.task ?? "(none)"}`);
  }

  if (provider === "openai") {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("OPENAI_API_KEY required for judge provider=openai");
    }
    const result = await callOpenAI({
      system: opts.system,
      user: opts.user,
      model,
      apiKey: process.env.OPENAI_API_KEY,
    });
    return { ...result, provider: "openai", model };
  }

  if (provider === "anthropic") {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY required for judge provider=anthropic");
    }
    const result = await callAnthropic({
      system: opts.system,
      user: opts.user,
      model,
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    return { ...result, provider: "anthropic", model };
  }

  throw new Error(`unknown judge provider: ${provider}`);
}
