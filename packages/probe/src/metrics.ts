/** Token and byte estimation — implementation pending */
export function estimateTokens(text: string): number {
  // TODO: tiktoken
  return Math.ceil(text.length / 4);
}

export function byteLength(value: string | Uint8Array): number {
  if (typeof value === "string") {
    return Buffer.byteLength(value, "utf8");
  }
  return value.byteLength;
}
