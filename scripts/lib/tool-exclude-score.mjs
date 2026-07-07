/**
 * Score 0–100 for excluding a tool from Gate tools/list (higher = stronger candidate).
 * Aligns with stale_90d / high_cost_unused recommendation rules.
 */
export function computeExcludeScore(tool, { p90 = 0 } = {}) {
  if (!tool || tool.tier === "hidden") return 0;

  let score = 0;
  const tokens = tool.estimated_list_tokens ?? 0;
  const stale = tool.stale_days === Infinity ? 999 : Math.max(0, tool.stale_days ?? 0);
  const calls = tool.call_count ?? 0;

  if (calls === 0 && tokens > 0) {
    const ratio = p90 > 0 ? tokens / p90 : tokens / 100;
    score += Math.min(45, Math.round(ratio * 22));
  } else if (calls > 0 && tokens > 0 && p90 > 0) {
    score += Math.min(12, Math.round((tokens / p90) * 6));
  }

  if (calls === 0) {
    if (stale >= 90) score += 30;
    else if (stale >= 30) score += 20;
    else if (stale >= 7) score += 10;
    else score += 5;
  }

  const tier = String(tool.tier ?? "").toUpperCase();
  if (tier === "C") score += 25;
  else if (tier === "B") score += 12;
  else if (tier === "A") score += 0;
  else score += 18;

  if (tool.recommendation === "stale_90d") score = Math.max(score, 85);
  if (tool.recommendation === "high_cost_unused") score = Math.max(score, 65);

  return Math.min(100, Math.round(score));
}

/** Apply exclude_score to all tools; call after recommendation flags are set. */
export function applyExcludeScores(tools, listTokenSamples) {
  const p90 = percentile(listTokenSamples, 90);
  for (const tool of tools) {
    tool.exclude_score = computeExcludeScore(tool, { p90 });
  }
  return tools;
}

function percentile(values, p) {
  if (!values?.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}
