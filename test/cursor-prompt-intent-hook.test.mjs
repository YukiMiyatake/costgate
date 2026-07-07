#!/usr/bin/env node
/**
 * Cursor prompt-intent hook tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleCursorPromptIntentHook } from "../scripts/cursor-prompt-intent-hook.mjs";
import { readLatestPromptIntent } from "../scripts/lib/prompt-intent.mjs";
import { readTurns } from "../scripts/lib/history-store.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const base = join(tmpdir(), `costgate-prompt-hook-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  process.env.COSTGATE_PROMPT_INTENT_DIR = base;
  process.env.COSTGATE_HISTORY_DIR = join(base, "history");
  process.env.COSTGATE_HISTORY = "1";
  return base;
}

function cleanupEnv() {
  delete process.env.COSTGATE_PROMPT_INTENT_DIR;
  delete process.env.COSTGATE_HISTORY_DIR;
  delete process.env.COSTGATE_HISTORY;
}

function testBeforeSubmitPrompt() {
  const dir = tempDir();
  const result = handleCursorPromptIntentHook({
    hook_event_name: "beforeSubmitPrompt",
    prompt: "Create a GitHub pull request",
    conversation_id: "conv-hook",
    generation_id: "gen-hook",
    workspace_roots: ["/tmp/ws"],
  });
  assert(result.ok === true, "ok");
  assert(result.keywords.includes("github"), "keywords");
  const loaded = readLatestPromptIntent({ dir });
  assert(loaded?.conversation_id === "conv-hook", "persisted");
  const turns = readTurns({ dir: join(dir, "history") });
  assert(turns.length === 1 && turns[0].generation_id === "gen-hook", "history turn");
  console.error("[prompt-hook] beforeSubmitPrompt ok");
  cleanupEnv();
}

function testSkipOtherEvents() {
  const result = handleCursorPromptIntentHook({ hook_event_name: "sessionStart" });
  assert(result.skipped === true, "skipped");
  console.error("[prompt-hook] skip ok");
}

function testTranscriptOptIn() {
  const dir = tempDir();
  const transcript = join(dir, "transcript.jsonl");
  writeFileSync(
    transcript,
    `${JSON.stringify({ role: "user", text: "query postgres database" })}\n`
  );
  process.env.COSTGATE_PROMPT_INTENT_TRANSCRIPT = "1";
  const result = handleCursorPromptIntentHook({
    hook_event_name: "beforeSubmitPrompt",
    prompt: "help me",
    transcript_path: transcript,
    conversation_id: "conv-tr",
    generation_id: "gen-tr",
  });
  assert(result.keywords.includes("postgres") || result.keywords.includes("database"), "transcript boost");
  console.error("[prompt-hook] transcript opt-in ok");
  delete process.env.COSTGATE_PROMPT_INTENT_TRANSCRIPT;
  cleanupEnv();
}

async function main() {
  testBeforeSubmitPrompt();
  testSkipOtherEvents();
  testTranscriptOptIn();
  console.error("[prompt-hook] all passed");
}

main().catch((e) => {
  console.error("[prompt-hook] fatal:", e);
  process.exit(1);
});
