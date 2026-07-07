/**
 * Compression quality judge (P7a).
 */
import { existsSync, readFileSync } from "node:fs";
import {
  extractResultText,
  summarizeCallResult,
  withMcpProcess,
} from "./mcp-client.mjs";
import { gateBin, mockGateEnv } from "./paths.mjs";
import { callJudge, clipJudgeText } from "./llm-judge.mjs";

export const COMPRESS_JUDGE_RUBRIC = `You are a strict evaluator for MCP tool-result compression quality.

Score how well the COMPRESSED text preserves task-relevant facts from the ORIGINAL response.

Rubric (0–5):
5 — All critical facts preserved; only redundancy removed
4 — Minor non-critical details missing
3 — Some important facts missing but gist remains
2 — Major facts missing; agent may misunderstand
1 — Mostly lossy; unreliable for the task
0 — Unrelated or empty

Respond with JSON only:
{
  "score": <number 0-5>,
  "missing_facts": [<short strings>],
  "rationale": "<one sentence>"
}`;

export function buildCompressionJudgePrompt(pair) {
  const context = pair.context ?? pair.tool ?? "tool result";
  return [
    `Context: ${context}`,
    "",
    "ORIGINAL:",
    clipJudgeText(pair.original),
    "",
    "COMPRESSED:",
    clipJudgeText(pair.compressed),
  ].join("\n");
}

export async function judgeCompressionPair(pair, options = {}) {
  const provider = options.provider;
  if (provider === "mock" || (!provider && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY)) {
    const mock = await callJudge({
      task: "compression",
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
    task: "compression",
    system: COMPRESS_JUDGE_RUBRIC,
    user: buildCompressionJudgePrompt(pair),
    provider,
    model: options.model,
  });

  return {
    pair_id: pair.id ?? "pair",
    ...judged,
    judged_at: new Date().toISOString(),
  };
}

export async function judgeCompressionBatch(pairs, options = {}) {
  const results = [];
  for (const pair of pairs) {
    results.push(await judgeCompressionPair(pair, options));
  }
  return buildCompressJudgeReport(results, options.meta ?? {});
}

export function buildCompressJudgeReport(results, meta = {}) {
  const scores = results.map((r) => r.score).filter((s) => Number.isFinite(s));
  const avg = scores.length
    ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) / 100
    : 0;
  const min = scores.length ? Math.min(...scores) : 0;
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    task: "compression_quality",
    provider: results[0]?.provider ?? meta.provider ?? "mock",
    summary: {
      pairs: results.length,
      avg_score: avg,
      min_score: min,
      pass_threshold: meta.pass_threshold ?? 3,
      passed: results.filter((r) => r.score >= (meta.pass_threshold ?? 3)).length,
    },
    results,
    ...meta,
  };
}

export async function collectCompressPair(options = {}) {
  const gate = gateBin();
  if (!existsSync(gate)) {
    throw new Error(`gate binary not found: ${gate}`);
  }

  const tool = options.tool ?? "get_file_contents";
  const invoke =
    options.invoke ??
    (options.mock === false
      ? { owner: "YukiMiyatake", repo: "costgate", path: "package-lock.json" }
      : { owner: "o", repo: "r", path: "package-lock.json" });

  const baseEnv = options.mock === false
    ? {
        COSTGATE_GATE_MODE: "filter",
        COSTGATE_INTENT: "pull request",
        COSTGATE_INTENT_DYNAMIC: "0",
      }
    : mockGateEnv("compress-judge", {
        COSTGATE_GATE_MODE: "filter",
        COSTGATE_INTENT: "pull request",
        COSTGATE_INTENT_DYNAMIC: "0",
      });

  const callArgs = { name: tool, arguments: invoke };
  const pairId = options.id ?? `${tool}:${invoke.path ?? tool}`;

  const originalResult = await withMcpProcess(
    gate,
    [],
    { ...baseEnv, COSTGATE_COMPRESS: "0" },
    async (client) => {
      await client.initialize("compress-judge-raw");
      return client.callTool("invoke_tool", callArgs);
    },
    { label: "compress-judge-raw", startupMs: options.startupMs ?? 5000, timeoutMs: 180000 }
  );

  const compressedResult = await withMcpProcess(
    gate,
    [],
    { ...baseEnv, COSTGATE_COMPRESS: "1" },
    async (client) => {
      await client.initialize("compress-judge-compressed");
      return client.callTool("invoke_tool", callArgs);
    },
    { label: "compress-judge-compressed", startupMs: options.startupMs ?? 5000, timeoutMs: 180000 }
  );

  const originalText = extractResultText(originalResult);
  const compressedText = extractResultText(compressedResult);

  return {
    id: pairId,
    tool,
    invoke,
    context: `invoke_tool ${tool} ${JSON.stringify(invoke)}`,
    original: originalText,
    compressed: compressedText,
    tokens: {
      original: summarizeCallResult(originalResult).estimated_tokens,
      compressed: summarizeCallResult(compressedResult).estimated_tokens,
    },
  };
}

export function loadCompressPairs(path) {
  const raw = JSON.parse(readFileSync(path, "utf8"));
  if (Array.isArray(raw)) return raw;
  if (raw.pairs) return raw.pairs;
  return [raw];
}
