import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  ListResourcesRequestSchema,
  ListResourceTemplatesRequestSchema,
  ListToolsRequestSchema,
  PingRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { Logger } from "./logger.js";
import { byteLength, summarizeTools } from "./metrics.js";

export interface ProxyOptions {
  backendName: string;
  client: Client;
  logger: Logger;
}

export async function startProxy(options: ProxyOptions): Promise<Server> {
  const { backendName, client, logger } = options;
  const capabilities = client.getServerCapabilities() ?? {};

  const server = new Server(
    { name: "costgate-probe", version: "0.1.0" },
    {
      capabilities,
      instructions: client.getInstructions(),
    }
  );

  server.setRequestHandler(PingRequestSchema, async () => ({}));

  if (capabilities.tools) {
    server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      const result = await client.listTools(request.params);
      const summary = summarizeTools(result.tools);
      logger.log({
        type: "tools_list",
        backend: backendName,
        ...summary,
      });
      return result;
    });

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const requestBytes = byteLength(JSON.stringify(request.params));
      const started = Date.now();
      const result = await client.callTool(request.params);
      const responseBytes = byteLength(JSON.stringify(result));
      const durationMs = Date.now() - started;

      logger.log({
        type: "tool_call",
        backend: backendName,
        tool: request.params.name,
        request_bytes: requestBytes,
        response_bytes: responseBytes,
        estimated_tokens: Math.ceil((requestBytes + responseBytes) / 4),
        duration_ms: durationMs,
      });

      return result;
    });
  }

  if (capabilities.resources) {
    server.setRequestHandler(ListResourcesRequestSchema, async (request) =>
      client.listResources(request.params)
    );
    server.setRequestHandler(
      ListResourceTemplatesRequestSchema,
      async (request) => client.listResourceTemplates(request.params)
    );
    server.setRequestHandler(ReadResourceRequestSchema, async (request) =>
      client.readResource(request.params)
    );
  }

  if (capabilities.prompts) {
    server.setRequestHandler(ListPromptsRequestSchema, async (request) =>
      client.listPrompts(request.params)
    );
    server.setRequestHandler(GetPromptRequestSchema, async (request) =>
      client.getPrompt(request.params)
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[costgate-probe] proxy listening on stdio");
  return server;
}
