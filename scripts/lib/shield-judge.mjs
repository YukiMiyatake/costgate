/**
 * Shield MCP redaction quality judge (P7b).
 */
import { existsSync, readFileSync } from "node:fs";
import { extractResultText, withMcpProcess } from "./mcp-client.mjs";
import { gateBin, mockGateEnv } from "./paths.mjs";
import { callJudge, clipJudgeText } from "./llm-judge.mjs";

export const SHIELD_JUDGE_RUBRIC = `You are evaluating MCP response redaction (Shield) quality.

Given ORIGINAL tool output, REDACTED output, and TASK_INTENT, score whether an AI agent can still complete the task WITHOUT secret leakage.

Rubric (0–5):
5 — Secrets fully redacted; task-relevant non-secret context preserved
4 — Secrets redacted; minor non-secret detail lost
3 — Secrets redacted but agent may lack context
2 — Secret leaked OR severely over-redacted
1 — Secret leaked and context lost
0 — Unusable

Respond with JSON only:
{
  "score": <number 0-5>,
  "missing_facts": [<short strings>],
  "rationale": "<one sentence>"
}`;

const DEFAULT_MESSAGE =
  "Deploy token=ghp_1234567890abcdefghijklmnopqrst for repo costgate/main";

export function buildShieldJudgePrompt(pair) {
  return [
    `Task intent: ${pair.task_intent ?? "Use tool output safely"}`,
    "",
    "ORIGINAL:",
    clipJudgeText(pair.original),
    "",
    "REDACTED:",
    clipJudgeText(pair.redacted),
  ].join("\n");
}

export async function judgeShieldPair(pair, options = {}) {
  const provider = options.provider;
  if (provider === "mock" || (!provider && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    const mock = await callJudge({
      task: "shield",
      pair,
      provider: "mock",
    });
    return {
      pair_id: pair.id ?? "pair",
      ...mock,
      judged_at: new Date().toISOString(),
    };
  }

  const judged = await callJudge({
    task: "shield",
    system: SHIELD_JUDGE_RUBRIC,
    user: buildShieldJudgePrompt(pair),
    provider,
    model: options.model,
  });

  return {
    pair_id: pair.id ?? "pair",
    ...judged,
    judged_at: new Date().toISOString(),
  };
}

export function buildShieldJudgeReport(results, meta = {}) {
  const scores = results.map((r) => r.score).filter((s) => Number.isFinite(s));
  const avg = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    task: "shield_redaction_quality",
    provider: results[0]?.provider ?? meta.provider ?? "mock",
    summary: {
      pairs: results.length,
      avg_score: avg,
      min_score: scores.length ? Math.min(...scores) : 0,
      pass_threshold: meta.pass_threshold ?? 3,
      passed: results.filter((r) => r.score >= (meta.pass_threshold ?? 3)).length,
    },
    results,
    ...meta,
  };
}

export async function judgeShieldBatch(pairs, options = {}) {
  const results = [];
  for (const pair of pairs) {
    results.push(await judgeShieldPair(pair, options));
  }
  return buildShieldJudgeReport(results, options.meta ?? {});
}

export async function collectShieldPair(options = {}) {
  const gate = gateBin();
  if (!existsSync(gate)) {
    throw new Error(`gate binary not found: ${gate}`);
  }

  const message = options.message ?? DEFAULT_MESSAGE;
  const callArgs = {
    name: "echo",
    arguments: { message },
  };
  const pairId = options.id ?? "shield-echo-token";

  const base = mockGateEnv("shield-judge", {
    COSTGATE_GATE_MODE: "filter",
    COSTGATE_INTENT: "pull request",
    COSTGATE_INTENT_DYNAMIC: "0",
  });

  const originalResult = await withMcpProcess(
    gate,
    [],
    { ...base, COSTGATE_SHIELD: "0" },
    async (client) => {
      await client.initialize("shield-judge-raw");
      return client.callTool("invoke_tool", callArgs);
    },
    { label: "shield-judge-raw", startupMs: options.startupMs ?? 5000 }
  );

  const redactedResult = await withMcpProcess(
    gate,
    [],
    { ...base, COSTGATE_SHIELD: "1" },
    async (client) => {
      await client.initialize("shield-judge-redacted");
      return client.callTool("invoke_tool", callArgs);
    },
    { label: "shield-judge-redacted", startupMs: options.startupMs ?? 5000 }
  );

  return {
    id: pairId,
    task_intent: options.task_intent ?? "Echo deployment message without exposing secrets",
    original: extractResultText(originalResult),
    redacted: extractResultText(redactedResult),
  };
}

export function loadShieldPairs(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (raw.pairs) return raw.pairs;
  return [raw];
}
