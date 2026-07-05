import { getEncoding, type Tiktoken } from "js-tiktoken";

export const TOKEN_ENCODING = "cl100k_base";

let encoding: Tiktoken | null = null;

function enc(): Tiktoken {
  if (!encoding) encoding = getEncoding(TOKEN_ENCODING);
  return encoding;
}

/** Count tokens in UTF-8 text (cl100k_base). */
export function countTokens(text: string): number {
  if (!text) return 0;
  return enc().encode(text).length;
}

/** Fallback when only byte size is known (legacy / approximate). */
export function bytesToTokens(bytes: number): number {
  if (!bytes || bytes <= 0) return 0;
  return Math.max(1, Math.ceil(bytes / 4));
}
