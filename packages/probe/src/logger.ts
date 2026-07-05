import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateLogEvent } from "@costgate/schema";

export interface LoggerOptions {
  logDir: string;
  client: string;
}

export interface Logger {
  sessionId: string;
  log(event: Record<string, unknown>): void;
  sessionStart(): void;
  sessionEnd(): void;
}

function strictValidation(): boolean {
  const v = process.env.COSTGATE_LOG_STRICT?.trim().toLowerCase();
  return v === "1" || v === "true";
}

export function createLogger(options: LoggerOptions): Logger {
  const sessionId = randomUUID();
  mkdirSync(options.logDir, { recursive: true });

  const logFile = join(
    options.logDir,
    `probe-${new Date().toISOString().slice(0, 10)}.jsonl`
  );

  const log = (event: Record<string, unknown>) => {
    const row = {
      ts: new Date().toISOString(),
      session_id: sessionId,
      client: options.client,
      ...event,
    };
    const result = validateLogEvent(row);
    if (!result.valid) {
      console.error(
        "[costgate-probe] log validation:",
        result.errors?.join("; ") ?? "invalid"
      );
      if (strictValidation()) {
        return;
      }
    }
    appendFileSync(logFile, `${JSON.stringify(row)}\n`, "utf8");
  };

  return {
    sessionId,
    log,
    sessionStart() {
      log({ type: "session_start" });
    },
    sessionEnd() {
      log({ type: "session_end" });
    },
  };
}
