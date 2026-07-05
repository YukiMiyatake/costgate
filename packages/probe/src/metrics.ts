import { countTokens, bytesToTokens } from "./tokens.js";

export function byteLength(value: string | Uint8Array): number {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8");
  }
  return value.byteLength;
}

/** Token count via tiktoken cl100k_base. */
export function estimateTokens(text: string): number {
  return countTokens(text);
}

/** Approximate tokens from bytes when text is unavailable. */
export function estimateTokensFromBytes(bytes: number): number {
  return bytesToTokens(bytes);
}

export interface ToolSchemaStats {
  name: string;
  schema_bytes: number;
  estimated_tokens: number;
}

export function summarizeTools(
  tools: Array<{ name: string; [key: string]: unknown }>
): {
  tool_count: number;
  total_schema_bytes: number;
  estimated_tokens: number;
  tools: ToolSchemaStats[];
} {
  const stats = tools.map((tool) => {
    const serialized = JSON.stringify(tool);
    const schema_bytes = byteLength(serialized);
    return {
      name: tool.name,
      schema_bytes,
      estimated_tokens: countTokens(serialized),
    };
  });

  const total_schema_bytes = stats.reduce((sum, t) => sum + t.schema_bytes, 0);
  const estimated_tokens = stats.reduce((sum, t) => sum + t.estimated_tokens, 0);
  return {
    tool_count: stats.length,
    total_schema_bytes,
    estimated_tokens: estimated_tokens || bytesToTokens(total_schema_bytes),
    tools: stats,
  };
}
