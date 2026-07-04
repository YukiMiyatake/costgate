import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export type LogEventType =
  | "session_start"
  | "session_end"
  | "tools_list"
  | "tool_call"
  | "tool_result";

export interface BaseLogEvent {
  type: LogEventType;
  ts: string;
  session_id: string;
}

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Load the canonical JSON Schema for log events. */
export function loadLogEventSchema(): unknown {
  const path = join(__dirname, "..", "log-event.schema.json");
  return JSON.parse(readFileSync(path, "utf8"));
}
