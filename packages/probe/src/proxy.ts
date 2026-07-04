/** stdio MCP proxy — implementation pending */
export interface ProxyOptions {
  backends: Record<string, unknown>;
}

export function createProxy(_options: ProxyOptions) {
  return {
  start() {
      // TODO: stdio relay
    },
  };
}
