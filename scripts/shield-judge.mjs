#!/usr/bin/env node
/**
 * P7b — Shield redaction quality LLM judge.
 *
 *   npm run judge:shield:smoke
 *   npm run judge:shield -- --mock --collect --json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  buildShieldJudgeReport,
  collectShieldPair,
  judgeShieldPair,
  loadShieldPairs,
} from "./lib/shield-judge.mjs";
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
  console.log("# CostGate shield judge\n");
  console.log(
    `Provider: ${report.provider} · Pairs: ${report.summary.pairs} · Avg: ${report.summary.avg_score}/5 · Pass≥${report.summary.pass_threshold}: ${report.summary.passed}/${report.summary.pairs}\n`
  );
  for (const r of report.results) {
    console.log(`- ${r.pair_id}: ${r.score}/5 — ${r.rationale}`);
    if (r.missing_facts?.length) {
      console.log(`  issues: ${r.missing_facts.join(", ")}`);
    }
  }
  console.log("");
}

async function main() {
  const config = resolveJudgeConfig();
  const effectiveProvider = provider ?? (useMock ? "mock" : config.provider);

  let pairs = [];
  if (pairsPath) {
    pairs = loadShieldPairs(pairsPath);
  } else if (collect) {
    if (!jsonOut) console.error("[judge:shield] collecting shield pair from Gate...");
    pairs = [await collectShieldPair({ mock: useMock })];
  } else {
    console.error("[judge:shield] use --collect or --pairs <file>");
    process.exit(1);
  }

  if (!jsonOut) {
    console.error(`[judge:shield] judging ${pairs.length} pair(s) (${effectiveProvider})...`);
  }
  const results = [];
  for (const pair of pairs) {
    results.push(await judgeShieldPair(pair, { provider: effectiveProvider }));
  }

  const report = buildShieldJudgeReport(results, {
    provider: effectiveProvider,
    pass_threshold: passThreshold,
    source: collect ? "gate-collect" : pairsPath,
  });

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
    console.error(`[judge:shield] wrote ${outPath}`);
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
  console.error("[judge:shield] fatal:", e);
  process.exit(1);
});
