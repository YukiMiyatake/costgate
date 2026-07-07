#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendTurn,
  buildTurnEntry,
  historyPromptMode,
  pruneTurnsFile,
  readTurns,
} from "../scripts/lib/history-store.mjs";

function withHistoryDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "costgate-history-"));
  const prevHistory = process.env.COSTGATE_HISTORY_DIR;
  const prevHistoryOn = process.env.COSTGATE_HISTORY;
  process.env.COSTGATE_HISTORY_DIR = dir;
  process.env.COSTGATE_HISTORY = "1";
  try {
    fn(dir);
  } finally {
    if (prevHistory === undefined) delete process.env.COSTGATE_HISTORY_DIR;
    else process.env.COSTGATE_HISTORY_DIR = prevHistory;
    if (prevHistoryOn === undefined) delete process.env.COSTGATE_HISTORY;
    else process.env.COSTGATE_HISTORY = prevHistoryOn;
    rmSync(dir, { recursive: true, force: true });
  }
}

function testBuildTurnPreview() {
  const prev = process.env.COSTGATE_HISTORY_PROMPT;
  process.env.COSTGATE_HISTORY_PROMPT = "preview";
  const entry = buildTurnEntry(
    {
      conversation_id: "c1",
      generation_id: "g1",
      workspace_root: "/ws",
      keywords: "github",
      templates: ["github"],
      scores: { github: 1 },
      ts: Date.now(),
    },
    { prompt: "List GitHub pull requests for this repo please" }
  );
  assert.equal(entry.type, "turn");
  assert.equal(entry.generation_id, "g1");
  assert.ok(entry.prompt_preview?.includes("GitHub"));
  assert.equal(entry.prompt, undefined);
  if (prev === undefined) delete process.env.COSTGATE_HISTORY_PROMPT;
  else process.env.COSTGATE_HISTORY_PROMPT = prev;
  console.log("ok buildTurnPreview");
}

function testAppendAndPrune() {
  withHistoryDir((dir) => {
    process.env.COSTGATE_HISTORY_LIMIT = "3";
    for (let i = 1; i <= 5; i++) {
      appendTurn(
        {
          generation_id: `gen-${i}`,
          conversation_id: "c",
          workspace_root: "/ws",
          keywords: `k${i}`,
          ts: Date.now() + i,
        },
        { prompt: `prompt ${i}` }
      );
    }
    const turns = readTurns({ dir });
    assert.equal(turns.length, 3);
    assert.equal(turns[0].generation_id, "gen-3");
    assert.equal(turns[2].generation_id, "gen-5");
    const path = join(dir, "turns.jsonl");
    assert.ok(existsSync(path));
    const lines = readFileSync(path, "utf8").trim().split("\n");
    assert.equal(lines.length, 3);
    console.log("ok appendAndPrune");
  });
}

function testHistoryDisabled() {
  withHistoryDir((dir) => {
    process.env.COSTGATE_HISTORY = "0";
    const path = appendTurn({ generation_id: "g1", ts: Date.now() }, { dir });
    assert.equal(path, null);
    console.log("ok historyDisabled");
  });
}

function testPruneTurnsFile() {
  withHistoryDir((dir) => {
    const path = join(dir, "turns.jsonl");
    for (let i = 0; i < 4; i++) {
      appendTurn({ generation_id: `g${i}`, ts: Date.now() }, { dir });
    }
    const kept = pruneTurnsFile(path, 2);
    assert.equal(kept, 2);
    console.log("ok pruneTurnsFile");
  });
}

function testHistoryPromptMode() {
  const prev = process.env.COSTGATE_HISTORY_PROMPT;
  process.env.COSTGATE_HISTORY_PROMPT = "off";
  assert.equal(historyPromptMode(), "off");
  process.env.COSTGATE_HISTORY_PROMPT = "full";
  assert.equal(historyPromptMode(), "full");
  if (prev === undefined) delete process.env.COSTGATE_HISTORY_PROMPT;
  else process.env.COSTGATE_HISTORY_PROMPT = prev;
  console.log("ok historyPromptMode");
}

testBuildTurnPreview();
testAppendAndPrune();
testHistoryDisabled();
testPruneTurnsFile();
testHistoryPromptMode();
console.log("history-store tests passed");
