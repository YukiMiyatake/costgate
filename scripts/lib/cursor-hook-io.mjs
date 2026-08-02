/**
 * Shared stdin / path helpers for Cursor hook scripts (Windows/WSL safe).
 */

/** Read hook stdin as UTF-8 text (explicit encoding avoids Windows mojibake). */
export function readHookStdin() {
  return new Promise((resolve, reject) => {
    try {
      process.stdin.setEncoding("utf8");
    } catch {
      // ignore — some hosts already ended stdin
    }
    const chunks = [];
    process.stdin.on("data", (c) => chunks.push(typeof c === "string" ? c : c.toString("utf8")));
    process.stdin.on("end", () => resolve(chunks.join("")));
    process.stdin.on("error", reject);
  });
}

/**
 * Normalize Cursor workspace/file paths.
 * Windows hosts often send `/c:/Users/...` which Node cannot open as-is.
 */
export function normalizeCursorPath(input) {
  if (input == null || input === "") return input;
  let s = String(input).replace(/\\/g, "/");
  const drive = s.match(/^\/([A-Za-z]):(\/.*)?$/);
  if (drive) {
    s = `${drive[1].toUpperCase()}:${drive[2] || "/"}`;
  }
  return s;
}
