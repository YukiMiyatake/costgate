#!/usr/bin/env node
/**
 * Cursor prompt-intent hook tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleCursorPromptIntentHook } from "../scripts/cursor-prompt-intent-hook.mjs";
import { readLatestPromptIntent } from "../scripts/lib/prompt-intent.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const base = join(tmpdir(), `costgate-prompt-hook-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  process.env.COSTGATE_PROMPT_INTENT_DIR = base;
  return base;
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
  console.error("[prompt-hook] beforeSubmitPrompt ok");
  delete process.env.COSTGATE_PROMPT_INTENT_DIR;
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
  delete process.env.COSTGATE_PROMPT_INTENT_DIR;
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
