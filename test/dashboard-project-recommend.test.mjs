#!/usr/bin/env node
/**
 * Phase 27: project-based MCP recommendation tests.
 */
import { mkdirSync, copyFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildProjectRecommendations,
  detectProjectSignals,
} from "../scripts/lib/dashboard-project-recommend.mjs";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FIX = join(ROOT, "test/fixtures/project-recommend");
const MARKETPLACE = join(ROOT, "catalog/marketplace");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function testPlaywrightBrowser() {
  const root = join(FIX, "playwright");
  const signals = detectProjectSignals(root);
  assert(signals.includes("playwright"), "playwright signal");

  const { items } = buildProjectRecommendations({
    projectRoot: root,
    mcpPath: join(ROOT, "test/fixtures/dashboard/mcp.json"),
    configPath: join(FIX, "empty-backends.json"),
    marketplaceDir: MARKETPLACE,
  });
  const browser = items.find((r) => r.kind === "add_mcp" && r.template === "browser");
  assert(browser, "browser recommendation");
  assert(browser.reason === "recommend_add", "recommend_add reason");
  assert(browser.score > 0, "positive score");
  assert(browser.signals.includes("playwright"), "playwright in signals");
  console.error("[project-recommend] playwright → browser ok");
}

function testGoModFilesystemGithub() {
  const root = join(FIX, "go-mod");
  const signals = detectProjectSignals(root);
  assert(signals.includes("go.mod"), "go.mod signal");

  const { items } = buildProjectRecommendations({
    projectRoot: root,
    mcpPath: join(ROOT, "test/fixtures/dashboard/mcp.json"),
    configPath: join(FIX, "empty-backends.json"),
    marketplaceDir: MARKETPLACE,
  });

  assert(items.some((r) => r.template === "filesystem"), "filesystem rec");
  assert(items.some((r) => r.template === "github"), "github rec");
  console.error("[project-recommend] go.mod → filesystem+github ok");
}

function testRulesGhPr() {
  const root = join(FIX, "rules-gh-pr");
  const signals = detectProjectSignals(root);
  assert(signals.includes("cursor_rules_gh_pr"), "rules signal");

  const { items } = buildProjectRecommendations({
    projectRoot: root,
    mcpPath: join(ROOT, "test/fixtures/dashboard/mcp.json"),
    configPath: join(FIX, "empty-backends.json"),
    marketplaceDir: MARKETPLACE,
  });

  const gh = items.find((r) => r.template === "github");
  assert(gh, "github from rules");
  assert(gh.detail.includes("rules"), "rules detail");
  console.error("[project-recommend] rules gh/PR → github ok");
}

function testDuplicatePenaltyGithub() {
  const root = join(FIX, "go-mod");
  const { items } = buildProjectRecommendations({
    projectRoot: root,
    mcpPath: join(ROOT, "test/fixtures/dashboard/mcp.json"),
    configPath: join(FIX, "with-github-backend/backends.json"),
    marketplaceDir: MARKETPLACE,
  });

  const gh = items.find((r) => r.template === "github");
  assert(!gh, "github suppressed when backend already installed");
  assert(items.some((r) => r.template === "filesystem"), "filesystem still recommended");
  console.error("[project-recommend] duplicate penalty ok");
}

function testSwitchToGate() {
  const { items } = buildProjectRecommendations({
    projectRoot: join(FIX, "playwright"),
    mcpPath: join(FIX, "direct-github/mcp.json"),
    configPath: join(ROOT, "test/fixtures/dashboard/backends.json"),
    marketplaceDir: MARKETPLACE,
  });

  const sw = items.find((r) => r.kind === "switch_mcp");
  assert(sw, "switch_mcp recommendation");
  assert(sw.target === "github", "direct github server name");
  assert(sw.template === "github", "gate github template");
  console.error("[project-recommend] switch to gate ok");
}

function testSerenaNotDetectedAsGithub() {
  const { items } = buildProjectRecommendations({
    projectRoot: join(FIX, "playwright"),
    mcpPath: join(FIX, "serena-not-github/mcp.json"),
    configPath: join(ROOT, "test/fixtures/dashboard/backends.json"),
    marketplaceDir: MARKETPLACE,
  });

  const sw = items.find((r) => r.kind === "switch_mcp");
  assert(!sw, "serena with github.com git URL must not trigger switch_mcp");
  console.error("[project-recommend] serena not github ok");
}

function testConsolidateSearch() {
  const { items } = buildProjectRecommendations({
    projectRoot: join(FIX, "playwright"),
    mcpPath: join(FIX, "multi-search/mcp.json"),
    configPath: join(ROOT, "test/fixtures/dashboard/backends.json"),
    marketplaceDir: MARKETPLACE,
  });

  const con = items.find((r) => r.kind === "consolidate_mcp");
  assert(con, "consolidate recommendation");
  assert(con.signals.includes("multiple_search_mcps"), "search signal");
  console.error("[project-recommend] consolidate search ok");
}

function testDashboardMerge() {
  const now = Date.parse("2026-07-05T12:00:00.000Z");
  const logDir = join(ROOT, "test/fixtures/dashboard/.generated-logs");
  mkdirSync(logDir, { recursive: true });
  copyFileSync(
    join(ROOT, "test/fixtures/dashboard/probe-sample.jsonl"),
    join(logDir, "probe-fixture.jsonl")
  );
  copyFileSync(
    join(ROOT, "test/fixtures/dashboard/gate-sample.jsonl"),
    join(logDir, "gate-fixture.jsonl")
  );
  const data = buildDashboardData({
    logDir,
    gateLogDir: logDir,
    usagePath: join(ROOT, "test/fixtures/dashboard/usage.json"),
    configPath: join(ROOT, "test/fixtures/dashboard/backends.json"),
    mcpPath: join(ROOT, "test/fixtures/dashboard/mcp.json"),
    projectRoot: join(FIX, "playwright"),
    marketplaceDir: MARKETPLACE,
    windowDays: 30,
    now,
  });

  assert(data.recommendations.project_root?.includes("playwright"), "project_root set");
  assert(data.recommendations.signals_detected?.includes("playwright"), "signals in API");
  assert(
    data.recommendations.items.some((r) => r.kind === "add_mcp"),
    "add_mcp merged into recommendations"
  );
  assert(
    data.recommendations.items.some((r) => r.reason === "stale_90d"),
    "delete recs still present"
  );
  assert(data.overview.add_recommendation_count >= 1, "add count in overview");
  console.error("[project-recommend] dashboard merge ok");
}

async function main() {
  testPlaywrightBrowser();
  testGoModFilesystemGithub();
  testRulesGhPr();
  testDuplicatePenaltyGithub();
  testSwitchToGate();
  testSerenaNotDetectedAsGithub();
  testConsolidateSearch();
  testDashboardMerge();
  console.error("[project-recommend] all passed");
}

main().catch((e) => {
  console.error("[project-recommend] fatal:", e);
  process.exit(1);
});
