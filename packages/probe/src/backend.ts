import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { BackendConfig } from "./config.js";

export async function connectBackend(
  name: string,
  config: BackendConfig
): Promise<Client> {
  const transport = new StdioClientTransport({
    command: config.command,
    args: config.args ?? [],
    env: config.env,
    cwd: config.cwd,
    stderr: "inherit",
  });

  const client = new Client(
    { name: "costgate-probe", version: "0.1.0" },
    { capabilities: {} }
  );

  await client.connect(transport);
  console.error(`[costgate-probe] backend connected: ${name}`);
  return client;
}
