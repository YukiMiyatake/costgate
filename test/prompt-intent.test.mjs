#!/usr/bin/env node
/**
 * Phase 28: prompt-intent inference tests.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  inferPromptIntent,
  writePromptIntent,
  readLatestPromptIntent,
  readTranscriptTail,
} from "../scripts/lib/prompt-intent.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function tempDir() {
  const base = join(tmpdir(), `costgate-prompt-intent-${process.pid}-${Date.now()}`);
  mkdirSync(base, { recursive: true });
  return base;
}

function testGithubPromptJa() {
  const record = inferPromptIntent({
    hook_event_name: "beforeSubmitPrompt",
    prompt: "PR を作ってレビュー依頼して",
    conversation_id: "conv-1",
    generation_id: "gen-1",
    workspace_roots: ["/tmp/project"],
  });
  assert(record.templates.includes("github"), "github template");
  assert(record.keywords.includes("github"), "github keyword");
  assert(record.sources.includes("prompt"), "prompt source");
  console.error("[prompt-intent] github JA ok");
}

function testSlackPromptEn() {
  const record = inferPromptIntent({
    prompt: "Post a message to Slack channel #general",
    workspace_roots: [],
  });
  assert(record.templates.includes("slack"), "slack template");
  console.error("[prompt-intent] slack EN ok");
}

function testAttachmentPath() {
  const record = inferPromptIntent({
    prompt: "fix this",
    attachments: [{ type: "file", file_path: "/repo/.github/workflows/ci.yml" }],
    workspace_roots: [],
  });
  assert(record.sources.includes("attachment"), "attachment source");
  console.error("[prompt-intent] attachment ok");
}

function testWriteAndRead() {
  const dir = tempDir();
  const record = inferPromptIntent({
    prompt: "merge pull request on github",
    conversation_id: "conv-write",
    generation_id: "gen-write",
  });
  writePromptIntent(record, { dir });
  const loaded = readLatestPromptIntent({ dir });
  assert(loaded?.keywords === record.keywords, "roundtrip keywords");
  assert(loaded?.generation_id === "gen-write", "generation_id");
  console.error("[prompt-intent] write/read ok");
}

function testTranscriptTail() {
  const dir = tempDir();
  const transcript = join(dir, "transcript.jsonl");
  writeFileSync(
    transcript,
    [
      JSON.stringify({ role: "user", text: "ignore old" }),
      JSON.stringify({ role: "assistant", text: "ok" }),
      JSON.stringify({ role: "user", text: "check postgres database query" }),
    ].join("\n") + "\n"
  );
  const tail = readTranscriptTail(transcript, 2);
  assert(tail.includes("postgres"), "transcript tail");
  console.error("[prompt-intent] transcript tail ok");
}

function testLowScoreEmpty() {
  const record = inferPromptIntent({ prompt: "hello", workspace_roots: [] });
  assert(record.templates.length === 0, "no templates for generic prompt");
  assert(record.keywords === "", "empty keywords");
  console.error("[prompt-intent] low score ok");
}

async function main() {
  testGithubPromptJa();
  testSlackPromptEn();
  testAttachmentPath();
  testWriteAndRead();
  testTranscriptTail();
  testLowScoreEmpty();
  console.error("[prompt-intent] all passed");
}

main().catch((e) => {
  console.error("[prompt-intent] fatal:", e);
  process.exit(1);
});
