#!/usr/bin/env node
/**
 * Cursor hook: infer Gate intent from user prompt before Agent runs.
 *
 * Event: beforeSubmitPrompt
 * Install: npm run cursor:registry
 */
import { inferPromptIntent, writePromptIntent } from "./lib/prompt-intent.mjs";
import { appendTurn } from "./lib/history-store.mjs";
import { readHookStdin } from "./lib/cursor-hook-io.mjs";
import { pathToFileURL } from "node:url";

export function handleCursorPromptIntentHook(payload) {
  const event = payload?.hook_event_name ?? payload?.event ?? "";
  if (event !== "beforeSubmitPrompt") {
    return { ok: true, skipped: true, event };
  }
  const record = inferPromptIntent(payload);
  const path = writePromptIntent(record);
  const historyPath = appendTurn(record, { prompt: payload?.prompt ?? "" });
  return { ok: true, event, path, historyPath, keywords: record.keywords, templates: record.templates };
}

async function main() {
  const raw = (await readHookStdin()).trim();
  if (!raw) {
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
    return;
  }
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch {
    process.stderr.write("[cursor-prompt-intent-hook] invalid JSON on stdin\n");
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
    return;
  }
  handleCursorPromptIntentHook(payload);
  process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    process.stderr.write(`[cursor-prompt-intent-hook] ${e.message ?? e}\n`);
    process.stdout.write(`${JSON.stringify({ continue: true })}\n`);
    process.exit(0);
  });
}
