import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv, { type ValidateFunction } from "ajv";
import addFormats from "ajv-formats";

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
  if (!validator) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    addFormats(ajv);
    validator = ajv.compile(loadLogEventSchema() as object);
  }
  return validator;
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
