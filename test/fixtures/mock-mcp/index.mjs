#!/usr/bin/env node
/**
 * Minimal stdio MCP server for integration tests (no external tokens).
 */
import { createInterface } from "node:readline";

const TOOLS = [
  {
    name: "get_file_contents",
    description: "Read a file from a repository",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        path: { type: "string" },
      },
      required: ["owner", "repo", "path"],
    },
  },
  {
    name: "list_issues",
    description: "List issues in a repository",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" } },
      required: ["owner", "repo"],
    },
  },
  {
    name: "search_code",
    description: "Search code in a repository",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
  {
    name: "create_issue",
    description: "Create a new issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
      },
      required: ["owner", "repo", "title"],
    },
  },
  {
    name: "merge_pull_request",
    description: "Merge a pull request",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" }, pull_number: { type: "number" } },
      required: ["owner", "repo", "pull_number"],
    },
  },
  {
    name: "fork_repository",
    description: "Fork a repository",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" } },
      required: ["owner", "repo"],
    },
  },
  {
    name: "create_pull_request",
    description: "Open a pull request",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        title: { type: "string" },
        head: { type: "string" },
        base: { type: "string" },
      },
      required: ["owner", "repo", "title", "head", "base"],
    },
  },
  {
    name: "get_issue",
    description: "Get a single issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: { type: "number" },
      },
      required: ["owner", "repo", "issue_number"],
    },
  },
  {
    name: "list_pull_requests",
    description: "List pull requests",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" } },
      required: ["owner", "repo"],
    },
  },
  {
    name: "update_issue",
    description: "Update an issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: { type: "number" },
      },
      required: ["owner", "repo", "issue_number"],
    },
  },
  {
    name: "delete_issue",
    description: "Delete an issue",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        issue_number: { type: "number" },
      },
      required: ["owner", "repo", "issue_number"],
    },
  },
  {
    name: "list_commits",
    description: "List commits",
    inputSchema: {
      type: "object",
      properties: { owner: { type: "string" }, repo: { type: "string" } },
      required: ["owner", "repo"],
    },
  },
  {
    name: "get_commit",
    description: "Get a commit",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
        sha: { type: "string" },
      },
      required: ["owner", "repo", "sha"],
    },
  },
  {
    name: "create_repository",
    description: "Create a repository",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "echo",
    description: "Echo a message back (integration test helper)",
    inputSchema: {
      type: "object",
      properties: { message: { type: "string" } },
      required: ["message"],
    },
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
  if (name === "echo") {
    const message = args?.message ?? "";
    return {
      content: [{ type: "text", text: `[mock-mcp echo] ${message}` }],
    };
  }
  if (name === "get_file_contents") {
    const path = args?.path ?? "unknown";
    if (path.endsWith(".json") || path.endsWith(".lock")) {
      const payload = JSON.stringify({ dependencies: { mock: "x".repeat(20000) } });
      return {
        content: [{ type: "text", text: payload }],
      };
    }
    const body = [
      "package main",
      "",
      "import \"fmt\"",
      "",
      "// Hello says hi.",
      "func hello() {",
      "  fmt.Println(\"hi\")",
      "}",
      "",
      "type Config struct {",
      "  Name string",
      "}",
      "",
      "// ".repeat(1200),
    ].join("\n");
    return {
      content: [{ type: "text", text: body }],
    };
  }
  return {
    content: [{ type: "text", text: `[mock-mcp] ${name} ok` }],
  };
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
  if (id == null) {
    return;
  }

  switch (method) {
    case "initialize":
      reply(id, {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock-mcp", version: "0.1.0" },
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
      const tool = TOOLS.find((t) => t.name === name);
      if (!tool) {
        replyError(id, -32602, `unknown tool: ${name}`);
        break;
      }
      reply(id, handleCall(name, params?.arguments ?? {}));
      break;
    }
    case "ping":
      reply(id, {});
      break;
    default:
      replyError(id, -32601, `method not found: ${method}`);
  }
});

process.stdin.resume();
console.error(`[mock-mcp] ready (${TOOLS.length} tools)`);
