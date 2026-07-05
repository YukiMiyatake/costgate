/**
 * Binary file detection — skip Read sanitization for non-text files.
 */
import { extname } from "node:path";

const BINARY_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".ico",
  ".bmp",
  ".pdf",
  ".zip",
  ".gz",
  ".tar",
  ".tgz",
  ".bz2",
  ".xz",
  ".7z",
  ".rar",
  ".mp3",
  ".mp4",
  ".wav",
  ".avi",
  ".mov",
  ".mkv",
  ".woff",
  ".woff2",
  ".ttf",
  ".otf",
  ".eot",
  ".exe",
  ".dll",
  ".so",
  ".dylib",
  ".bin",
  ".dat",
  ".wasm",
  ".class",
  ".jar",
  ".pyc",
  ".o",
  ".a",
]);

const SAMPLE_BYTES = 8192;

/** Heuristic: known binary extension or NUL byte in the first 8 KiB. */
export function isBinaryFile(filePath, content = null) {
  const ext = extname(filePath).toLowerCase();
  if (BINARY_EXTENSIONS.has(ext)) return true;

  if (content == null) return false;

  const sample =
    typeof content === "string"
      ? Buffer.from(content.slice(0, SAMPLE_BYTES), "utf8")
      : content.subarray(0, SAMPLE_BYTES);

  for (let i = 0; i < sample.length; i++) {
    if (sample[i] === 0) return true;
  }
  return false;
}
