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

assertValid(
  {
    type: "gate_event",
    event: "tools_list",
    ts: new Date().toISOString(),
    backend: "github",
    tools_exposed: 8,
    tokens_est: 1200,
  },
  "gate_event tools_list"
);

assertValid(
  {
    type: "gate_event",
    event: "tool_call",
    ts: new Date().toISOString(),
    tool: "search_issues",
    response_bytes: 4096,
    compressed: true,
    saved_bytes: 32000,
  },
  "gate_event tool_call"
);

assertInvalid(
  {
    type: "session_start",
    session_id: "abc",
  },
  "missing ts"
);

console.error("[schema-test] ok");
