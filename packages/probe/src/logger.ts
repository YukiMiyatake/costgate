/** JSONL metrics logger — implementation pending */
export interface LoggerOptions {
  logDir: string;
  client: string;
}

export function createLogger(_options: LoggerOptions) {
  return {
    log(_event: Record<string, unknown>) {
      // TODO: append JSONL
    },
  };
}
