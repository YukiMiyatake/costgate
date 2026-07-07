/**
 * Score 0–100 for excluding a tool from Gate tools/list (higher = stronger candidate).
 * Aligns with stale_90d / high_cost_unused recommendation rules.
 */

function percentile(values, p) {
  if (!values?.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

/** Merge probe samples with per-tool list token estimates (backend probe cache, etc.). */
export function collectListTokenSamples(tools, extra = []) {
  const samples = [...extra];
  for (const tool of tools ?? []) {
    const tok = tool.estimated_list_tokens;
    if (tok != null && tok > 0) samples.push(tok);
  }
  return samples;
}

export function computeExcludeScore(tool, { p90 = 0, p50 = 0 } = {}) {
  if (!tool || tool.tier === "hidden") return 0;

  let score = 0;
  const tokens = tool.estimated_list_tokens ?? 0;
  const stale = tool.stale_days === Infinity ? 999 : Math.max(0, tool.stale_days ?? 0);
  const calls = tool.call_count ?? 0;
  const ref = p90 > 0 ? p90 : p50 > 0 ? p50 : Math.max(tokens, 100);

  if (tokens > 0) {
    const ratio = tokens / ref;
    if (calls === 0) {
      score += Math.min(40, Math.round(ratio * 20));
    } else {
      score += Math.min(15, Math.round(ratio * 8));
    }
  }

  if (calls === 0) {
    if (stale >= 90) score += 30;
    else if (stale >= 30) score += 20;
    else if (stale >= 7) score += 10;
    else score += 5;
  } else if (stale >= 14) {
    score += Math.min(25, Math.round(stale / 4));
  } else if (stale >= 7) {
    score += 8;
  }

  const tier = String(tool.tier ?? "").toUpperCase();
  if (tier === "C") score += 25;
  else if (tier === "B") score += 12;
  else if (tier === "A") score += 2;
  else score += 18;

  if (tool.recommendation === "stale_90d") score = Math.max(score, 85);
  if (tool.recommendation === "high_cost_unused") score = Math.max(score, 65);

  if (tier === "A" && calls >= 5 && stale < 3 && tokens > 0 && tokens < ref * 0.5) {
    score = Math.min(score, 15);
  }

  return Math.min(100, Math.round(score));
}

/** Minimum exclude_score to treat as a bulk-exclude recommendation. */
export const EXCLUDE_RECOMMEND_MIN_SCORE = 40;

export function isExcludeRecommended(tool, minScore = EXCLUDE_RECOMMEND_MIN_SCORE) {
  if (!tool || tool.tier === "hidden") return false;
  if (tool.exclude_lock) return false;
  return (tool.exclude_score ?? 0) >= minScore;
}

/** Tools eligible for bulk exclude + estimated list-token savings. */
export function summarizeExcludeCandidates(tools, minScore = EXCLUDE_RECOMMEND_MIN_SCORE) {
  const candidates = [];
  let tokensSaved = 0;
  let tokensUnknown = 0;
  for (const tool of tools ?? []) {
    if (!isExcludeRecommended(tool, minScore)) continue;
    candidates.push(tool);
    const tok = tool.estimated_list_tokens;
    if (tok != null && tok > 0) tokensSaved += tok;
    else tokensUnknown += 1;
  }
  return { candidates, count: candidates.length, tokensSaved, tokensUnknown };
}

/** Apply exclude_score to all tools; call after recommendation flags are set. */
export function applyExcludeScores(tools, listTokenSamples) {
  const samples = collectListTokenSamples(tools, listTokenSamples);
  const p90 = percentile(samples, 90);
  const p50 = percentile(samples, 50);
  for (const tool of tools) {
    tool.exclude_score = computeExcludeScore(tool, { p90, p50 });
  }
  return tools;
}
