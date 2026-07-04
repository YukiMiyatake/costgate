export function byteLength(value: string | Uint8Array): number {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8");
  }
  return value.byteLength;
}

/** Rough token estimate (≈4 chars per token). Replace with tiktoken later. */
export function estimateTokens(text: string): number {
  if (text.length === 0) {
    return 0;
  }
  return Math.max(1, Math.ceil(text.length / 4));
}

export function estimateTokensFromBytes(bytes: number): number {
  return Math.max(1, Math.ceil(bytes / 4));
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
      estimated_tokens: estimateTokens(serialized),
    };
  });

  const total_schema_bytes = stats.reduce((sum, t) => sum + t.schema_bytes, 0);
  return {
    tool_count: stats.length,
    total_schema_bytes,
    estimated_tokens: estimateTokensFromBytes(total_schema_bytes),
    tools: stats,
  };
}
