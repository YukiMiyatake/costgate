#!/usr/bin/env node
/**
 * Phase 33b: shield-prompt block events, sanitize, Dashboard API.
 */
import { mkdirSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  buildShieldPromptApiPayload,
  buildShieldPromptSnapshot,
  readLatestPromptBlock,
  readShieldPromptStats,
  sanitizePromptText,
  writePromptBlockEvent,
} from "../scripts/lib/shield-prompt.mjs";
import { Mode, promptInferMode, shieldPromptAggressive } from "../scripts/lib/shield-redact.mjs";
import { handleCursorShieldPromptHook } from "../scripts/cursor-shield-prompt-hook.mjs";
import { createDashboardServer } from "../scripts/dashboard-server.mjs";
import { buildDashboardData } from "../scripts/lib/dashboard-data.mjs";
import { cmdSanitizePrompt } from "../scripts/costgate-shield.mjs";

const GITHUB_TOKEN = "ghp_1234567890abcdefghijklmnopqrstuv";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const dir = join(tmpdir(), `costgate-shield-33b-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function testSanitizePrompt() {
  const dir = tempDir();
  const result = sanitizePromptText(`token=${GITHUB_TOKEN}`, { dir, mode: Mode.Secrets });
  assert(result.sanitized.includes("[[CG:"), "placeholder in sanitized");
  assert(!result.sanitized.includes(GITHUB_TOKEN), "secret removed");
  assert(result.findings.some((f) => f.kind === "GITHUB_PAT"), "github finding");
  rmSync(dir, { recursive: true, force: true });
  console.error("[shield-33b] sanitize ok");
}

function testWriteBlockEvent() {
  const dir = tempDir();
  const prompt = `Use ${GITHUB_TOKEN} here`;
  writePromptBlockEvent(
    {
      prompt,
      findings: [{ kind: "GITHUB_PAT", masked: "ghp_…uv" }],
      message: "blocked",
      conversation_id: "conv-1",
    },
    { dir }
  );

  const latest = readLatestPromptBlock({ dir });
  assert(latest.conversation_id === "conv-1", "conversation id");
  assert(latest.sanitized.includes("[[CG:"), "stored sanitized");
  assert(latest.prompt === prompt, "stored prompt local-only");

  const stats = readShieldPromptStats({ dir });
  assert(stats.block_count === 1, "block count");

  const snapshot = buildShieldPromptSnapshot({ dir, now: latest.ts + 1000 });
  assert(snapshot.block_count === 1, "snapshot count");
  assert(snapshot.last_block.kinds.includes("GITHUB_PAT"), "snapshot kinds");

  rmSync(dir, { recursive: true, force: true });
  console.error("[shield-33b] write block ok");
}

function testHookPersistsBlock() {
  const dir = tempDir();
  const prev = process.env.COSTGATE_SHIELD_PROMPT;
  process.env.COSTGATE_SHIELD_PROMPT = "1";
  try {
    const result = handleCursorShieldPromptHook(
      { hook_event_name: "beforeSubmitPrompt", prompt: `key ${GITHUB_TOKEN}` },
      { forceEnabled: true, blockOptions: { dir }, skipPersist: false }
    );
    assert(result.continue === false, "blocked");
    const latest = readLatestPromptBlock({ dir });
    assert(latest?.findings?.length >= 1, "persisted findings");
    assert(latest.sanitized.includes("[[CG:"), "hook sanitized");
  } finally {
    if (prev === undefined) delete process.env.COSTGATE_SHIELD_PROMPT;
    else process.env.COSTGATE_SHIELD_PROMPT = prev;
    rmSync(dir, { recursive: true, force: true });
  }
  console.error("[shield-33b] hook persist ok");
}

function testAggressiveEnv() {
  const prev = process.env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE;
  delete process.env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE;
  assert(promptInferMode() === Mode.Secrets, "default secrets mode");
  assert(!shieldPromptAggressive(), "aggressive off");

  process.env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE = "1";
  assert(promptInferMode() === Mode.Aggressive, "aggressive mode");
  assert(shieldPromptAggressive(), "aggressive on");

  if (prev === undefined) delete process.env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE;
  else process.env.COSTGATE_SHIELD_PROMPT_AGGRESSIVE = prev;
  console.error("[shield-33b] aggressive env ok");
}

async function testDashboardApi() {
  const dir = tempDir();
  const logDir = join(dir, "logs");
  mkdirSync(logDir, { recursive: true });

  writePromptBlockEvent(
    {
      prompt: `secret ${GITHUB_TOKEN}`,
      findings: [{ kind: "GITHUB_PAT", masked: "ghp_…uv" }],
      message: "CostGate Shield: blocked",
    },
    { dir }
  );

  const now = Date.now();
  const data = buildDashboardData({
    logDir,
    gateLogDir: logDir,
    usagePath: join(dir, "missing-usage.json"),
    configPath: join(dir, "missing-backends.json"),
    shieldPromptBlockDir: dir,
    now,
    windowDays: 30,
  });
  assert(data.overview.shield_prompt_block_count === 1, "overview block count");
  assert(data.overview.shield_prompt?.last_block?.kinds?.includes("GITHUB_PAT"), "overview kinds");

  const server = createDashboardServer({
    dataOptions: { shieldPromptBlockDir: dir, logDir, gateLogDir: logDir, windowDays: 30, now },
  });
  await new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", (err) => (err ? reject(err) : resolve()));
  });
  const port = server.address().port;
  const base = `http://127.0.0.1:${port}`;

  try {
    const payload = await (await fetch(`${base}/api/shield-prompt`)).json();
    assert(payload.block_count === 1, "api block count");
    assert(payload.latest?.sanitized?.includes("[[CG:"), "api sanitized");
    assert(payload.latest?.prompt === undefined, "api omits raw prompt");

    const sanitized = await (
      await fetch(`${base}/api/shield-prompt/sanitize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: `tok ${GITHUB_TOKEN}` }),
      })
    ).json();
    assert(sanitized.ok === true, "sanitize ok flag");
    assert(sanitized.sanitized.includes("[[CG:"), "sanitize api");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
  console.error("[shield-33b] dashboard api ok");
}

async function testCli() {
  const dir = tempDir();
  const prevVault = process.env.COSTGATE_SHIELD_DIR;
  process.env.COSTGATE_SHIELD_DIR = join(dir, "vault");
  mkdirSync(process.env.COSTGATE_SHIELD_DIR, { recursive: true });

  const stdoutChunks = [];
  const stderrChunks = [];
  const origOut = process.stdout.write.bind(process.stdout);
  const origErr = process.stderr.write.bind(process.stderr);
  process.stdout.write = (chunk) => {
    stdoutChunks.push(String(chunk));
    return true;
  };
  process.stderr.write = (chunk) => {
    stderrChunks.push(String(chunk));
    return true;
  };

  try {
    const code = await cmdSanitizePrompt([`hello ${GITHUB_TOKEN}`, "--json"]);
    assert(code === 0, "cli exit 0");
    const out = stdoutChunks.join("");
    const parsed = JSON.parse(out);
    assert(parsed.sanitized.includes("[[CG:"), "cli json sanitized");
  } finally {
    process.stdout.write = origOut;
    process.stderr.write = origErr;
    if (prevVault === undefined) delete process.env.COSTGATE_SHIELD_DIR;
    else process.env.COSTGATE_SHIELD_DIR = prevVault;
    rmSync(dir, { recursive: true, force: true });
  }
  console.error("[shield-33b] cli ok");
}

async function main() {
  testSanitizePrompt();
  testWriteBlockEvent();
  testHookPersistsBlock();
  testAggressiveEnv();
  await testDashboardApi();
  await testCli();
  console.error("[shield-33b] all passed");
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error("[shield-33b] fatal:", e);
    process.exit(1);
  });
}
