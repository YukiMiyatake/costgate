/**
 * Token counting via tiktoken (cl100k_base — Claude/GPT-4 family).
 * Falls back to bytes/4 when only byte counts are available (legacy logs).
 */
import { getEncoding } from "js-tiktoken";

let encoding;

function enc() {
  if (!encoding) encoding = getEncoding("cl100k_base");
  return encoding;
}

export const TOKEN_ENCODING = "cl100k_base";

/** Count tokens in UTF-8 text. */
export function countTokens(text) {
  if (!text) return 0;
  return enc().encode(text).length;
}

/** Legacy fallback when only byte size is known (no text). */
export function bytesToTokens(bytes) {
  if (!bytes || bytes <= 0) return 0;
  return Math.max(1, Math.ceil(bytes / 4));
}

/** Prefer tiktoken on text; fall back to bytes estimate. */
export function tokensFromTextOrBytes(text, bytes) {
  if (text) return countTokens(text);
  return bytesToTokens(bytes ?? 0);
}
