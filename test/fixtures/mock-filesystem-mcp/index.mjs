#!/usr/bin/env node
/**
 * Minimal filesystem MCP mock for catalog / compare tests.
 */
import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "read_file",
    description: "Read file contents from disk",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "read_multiple_files",
    description: "Read multiple files",
    inputSchema: {
      type: "object",
      properties: { paths: { type: "array", items: { type: "string" } } },
      required: ["paths"],
    },
  },
  {
    name: "write_file",
    description: "Write content to a file",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, content: { type: "string" } },
      required: ["path", "content"],
    },
  },
  {
    name: "list_directory",
    description: "List directory entries",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "create_directory",
    description: "Create a directory",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "move_file",
    description: "Move or rename a file",
    inputSchema: {
      type: "object",
      properties: { source: { type: "string" }, destination: { type: "string" } },
      required: ["source", "destination"],
    },
  },
  {
    name: "search_files",
    description: "Search files by glob pattern",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" }, pattern: { type: "string" } },
      required: ["path", "pattern"],
    },
  },
  {
    name: "get_file_info",
    description: "Get file metadata",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "list_allowed_directories",
    description: "List roots allowed for filesystem access",
    inputSchema: { type: "object", properties: {} },
  },
];

function reply(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
}

function replyError(id, code, message) {
  process.stdout.write(
    JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }) + "\n"
  );
}

function handleCall(name, args) {
  if (name === "read_file") {
    const path = args?.path ?? "unknown";
    const text =
      path.endsWith(".json") || path.endsWith(".lock")
        ? JSON.stringify({ dependencies: { mock: "x".repeat(8000) } })
        : `// mock file: ${path}\n` + "line\n".repeat(400);
    return { content: [{ type: "text", text }] };
  }
  if (name === "list_directory") {
    return {
      content: [{ type: "text", text: JSON.stringify(["src/", "package.json", "README.md"]) }],
    };
  }
  if (name === "search_files") {
    return {
      content: [{ type: "text", text: `[mock-fs] matches for ${args?.pattern ?? "*"}` }],
    };
  }
  return { content: [{ type: "text", text: `[mock-fs] ${name} ok` }] };
}

const rl = createInterface({ input: process.stdin });

rl.on("line", (line) => {
  let msg;
  try {
    msg = JSON.parse(line);
  } catch {
    return;
  }

  const { id, method, params } = msg;
  if (id == null) return;

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock-filesystem-mcp", version: "0.1.0" },
      });
      break;
    case "tools/list":
      reply(id, { tools: TOOLS });
      break;
    case "tools/call": {
      const name = params?.name;
      if (!name) {
        replyError(id, -32602, "missing tool name");
        break;
      }
      if (!TOOLS.find((t) => t.name === name)) {
        replyError(id, -32602, `unknown tool: ${name}`);
        break;
      }
      reply(id, handleCall(name, params?.arguments ?? {}));
      break;
    }
    default:
      replyError(id, -32601, `method not found: ${method}`);
  }
});

process.stderr.write("[mock-filesystem-mcp] ready (9 tools)\n");
