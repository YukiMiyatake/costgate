#!/usr/bin/env node
/**
 * P7a — Compression quality LLM judge.
 *
 *   npm run judge:compress -- --mock --collect --json
 *   npm run judge:compress -- --mock --pairs test/fixtures/compress-judge/sample-pair.json
 *   COSTGATE_JUDGE_PROVIDER=openai npm run judge:compress -- --collect
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildCompressJudgeReport,
  collectCompressPair,
  judgeCompressionBatch,
  loadCompressPairs,
} from "./lib/compress-judge.mjs";
import { resolveJudgeConfig } from "./lib/llm-judge.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");
const useMock = args.includes("--mock") || !args.includes("--live");
const collect = args.includes("--collect");

function readArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? "" : "";
}

const pairsPath = readArg("--pairs");
const outPath = readArg("--out");
const provider = readArg("--provider") || undefined;
const passThreshold = Number(readArg("--pass-threshold") || "3");

function printReport(report) {
  console.log("# CostGate compression judge\n");
  console.log(
    `Provider: ${report.provider} · Pairs: ${report.summary.pairs} · Avg: ${report.summary.avg_score}/5 · Pass≥${report.summary.pass_threshold}: ${report.summary.passed}/${report.summary.pairs}\n`
  );
  for (const r of report.results) {
    console.log(`- ${r.pair_id}: ${r.score}/5 — ${r.rationale}`);
    if (r.missing_facts?.length) {
      console.log(`  missing: ${r.missing_facts.join(", ")}`);
    }
  }
  console.log("");
}

async function main() {
  const config = resolveJudgeConfig();
  const effectiveProvider = provider ?? (useMock ? "mock" : config.provider);

  let pairs = [];
  if (pairsPath) {
    pairs = loadCompressPairs(pairsPath);
  } else if (collect) {
    if (!jsonOut) console.error("[judge:compress] collecting compress pair from Gate...");
    pairs = [
      await collectCompressPair({
        mock: useMock,
        tool: readArg("--tool") || undefined,
      }),
    ];
  } else {
    console.error("[judge:compress] use --collect or --pairs <file>");
    process.exit(1);
  }

  if (!jsonOut) console.error(`[judge:compress] judging ${pairs.length} pair(s) (${effectiveProvider})...`);
  const results = [];
  for (const pair of pairs) {
    const batch = await judgeCompressionBatch([pair], {
      provider: effectiveProvider,
      meta: { pass_threshold: passThreshold },
    });
    results.push(batch.results[0]);
  }

  const report = buildCompressJudgeReport(results, {
    provider: effectiveProvider,
    pass_threshold: passThreshold,
    source: collect ? "gate-collect" : pairsPath,
  });

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`[judge:compress] wrote ${outPath}`);
  }

  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  if (report.summary.passed < report.summary.pairs) {
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("[judge:compress] fatal:", e);
  process.exit(1);
});
