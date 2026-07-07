#!/usr/bin/env node
/**
 * P6c — Export Probe JSONL session → eval replay fixture.
 *
 *   npm run session-replay:export -- \
 *     --file test/fixtures/dashboard/probe-sample.jsonl \
 *     --session sess-001 \
 *     --out test/eval/replay-fixtures/sample-github-session.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  exportSessionFromLogs,
  listProbeSessions,
  readJsonlFile,
  sessionToReplayFixture,
} from "./lib/session-replay.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json");

function readArg(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] ?? "" : "";
}

const logDir = readArg("--log-dir");
const file = readArg("--file");
const sessionId = readArg("--session");
const outPath = readArg("--out");
const listOnly = args.includes("--list");
const noPromptIntent = args.includes("--no-prompt-intent");

async function main() {
  if (listOnly) {
    const sessions = listProbeSessions(logDir || undefined);
    if (jsonOut) {
      console.log(JSON.stringify(sessions, null, 2));
    } else {
      console.log("# Probe sessions\n");
      for (const s of sessions) {
        console.log(
          `- ${s.session_id}: ${s.tool_calls} calls · ${s.tools.length} tools (${s.source_file})`
        );
      }
      console.log("");
    }
    return;
  }

  let fixture;
  if (file) {
    const events = readJsonlFile(file);
    fixture = sessionToReplayFixture(events, {
      sessionId: sessionId || undefined,
      id: readArg("--id") || undefined,
      name: readArg("--name") || undefined,
      include_prompt_intent: !noPromptIntent,
      source: file,
    });
    if (outPath) {
      mkdirSync(dirname(outPath), { recursive: true });
      writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
      console.error(`[session-replay:export] wrote ${outPath}`);
    }
  } else {
    fixture = exportSessionFromLogs({
      logDir: logDir || undefined,
      sessionId: sessionId || undefined,
      id: readArg("--id") || undefined,
      name: readArg("--name") || undefined,
      includePromptIntent: !noPromptIntent,
    });
    if (!outPath) {
      console.error("[session-replay:export] --out is required without --list");
      process.exit(1);
    }
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(fixture, null, 2)}\n`);
    console.error(`[session-replay:export] wrote ${outPath}`);
  }

  if (jsonOut) {
    console.log(JSON.stringify(fixture, null, 2));
  }
}

main().catch((e) => {
  console.error("[session-replay:export] fatal:", e);
  process.exit(1);
});
