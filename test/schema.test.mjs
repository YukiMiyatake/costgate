#!/usr/bin/env node
/**
 * @costgate/schema validation smoke test.
 */
import { validateLogEvent } from "@costgate/schema";

function assertValid(row, label) {
  const result = validateLogEvent(row);
  if (!result.valid) {
    throw new Error(`${label}: ${result.errors?.join("; ")}`);
  }
}

function assertInvalid(row, label) {
  const result = validateLogEvent(row);
  if (result.valid) {
    throw new Error(`${label}: expected invalid`);
  }
}

assertValid(
  {
    type: "session_start",
    ts: new Date().toISOString(),
    session_id: "abc",
    client: "test",
  },
  "session_start"
);

assertValid(
  {
    type: "tools_list",
    ts: new Date().toISOString(),
    session_id: "abc",
    tool_count: 1,
    total_schema_bytes: 100,
    estimated_tokens: 25,
    tools: [{ name: "echo", schema_bytes: 100, estimated_tokens: 25 }],
  },
  "tools_list"
);

assertInvalid(
  {
    type: "session_start",
    session_id: "abc",
  },
  "missing ts"
);

console.error("[schema-test] ok");
