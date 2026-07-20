/**
 * Token estimates for Dashboard scripts.
 * Avoids top-level @costgate/probe import so Dashboard starts when DrvFs node_modules is corrupt.
 */

export const TOKEN_ENCODING = "estimate";

export function bytesToTokens(bytes) {
  const n = Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.max(1, Math.ceil(n / 4));
}

export function countTokens(text) {
  const s = String(text ?? "");
  if (!s.length) return 0;
  return Math.max(1, Math.ceil(s.length / 4));
}

/** @param {Array<{ name: string; [key: string]: unknown }>} tools */
export function summarizeTools(tools = []) {
  const stats = tools.map((tool) => {
    const serialized = JSON.stringify(tool);
    const schema_bytes = Buffer.byteLength(serialized, "utf8");
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
