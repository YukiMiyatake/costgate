import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020, type ValidateFunction } from "ajv/dist/2020.js";
import addFormatsPkg from "ajv-formats";

type AddFormatsFn = (ajv: InstanceType<typeof Ajv2020>) => void;
const addFormats = addFormatsPkg as unknown as AddFormatsFn;

export type LogEventType =
  | "session_start"
  | "session_end"
  | "tools_list"
  | "tool_call"
  | "tool_result"
  | "gate_event";

export type GateEventKind = "tools_list" | "tool_call";

export interface BaseLogEvent {
  type: LogEventType;
  ts: string;
  session_id?: string;
}

export interface GateEventBase extends BaseLogEvent {
  type: "gate_event";
  event: GateEventKind;
}

export interface GateEventToolsList extends GateEventBase {
  event: "tools_list";
  backend: string;
  tools_exposed: number;
  tokens_est: number;
}

export interface GateEventToolCall extends GateEventBase {
  event: "tool_call";
  tool: string;
  response_bytes: number;
  compressed: boolean;
  saved_bytes?: number;
}

export type GateEvent = GateEventToolsList | GateEventToolCall;

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

const __dirname = dirname(fileURLToPath(import.meta.url));

let validator: ValidateFunction | null = null;

/** Load the canonical JSON Schema for log events. */
export function loadLogEventSchema(): unknown {
  const path = join(__dirname, "..", "log-event.schema.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

function getValidator(): ValidateFunction {
  if (validator) {
    return validator;
  }
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const compiled = ajv.compile(loadLogEventSchema() as object);
  validator = compiled;
  return compiled;
}

/** Validate a parsed log event object against the JSON Schema. */
export function validateLogEvent(data: unknown): ValidationResult {
  const validate = getValidator();
  const valid = validate(data);
  if (valid) {
    return { valid: true };
  }
  const errors =
    validate.errors?.map((e) => {
      const path = e.instancePath || "/";
      return `${path} ${e.message ?? "invalid"}`.trim();
    }) ?? [];
  return { valid: false, errors };
}
