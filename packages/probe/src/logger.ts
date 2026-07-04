import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

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

export function createLogger(options: LoggerOptions): Logger {
  const sessionId = randomUUID();
  mkdirSync(options.logDir, { recursive: true });

  const logFile = join(
    options.logDir,
    `probe-${new Date().toISOString().slice(0, 10)}.jsonl`
  );

  const log = (event: Record<string, unknown>) => {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      session_id: sessionId,
      client: options.client,
      ...event,
    });
    appendFileSync(logFile, `${line}\n`, "utf8");
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
