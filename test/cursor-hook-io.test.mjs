#!/usr/bin/env node
/**
 * cursor-hook-io path normalization (Windows /c:/ style).
 */
import { normalizeCursorPath } from "../scripts/lib/cursor-hook-io.mjs";
import { isPathUnder, findContainingWorkspaceRoot } from "../scripts/lib/resolve-workspace-root.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(normalizeCursorPath("/c:/Users/me/proj") === "C:/Users/me/proj", "drive letter normalize");
  assert(normalizeCursorPath("C:\\Users\\me\\proj") === "C:/Users/me/proj", "backslash normalize");
  assert(normalizeCursorPath("/home/me/proj") === "/home/me/proj", "posix unchanged");

  if (process.platform !== "win32") {
    // resolve() on Linux keeps C:/... as a relative-looking path under cwd sometimes;
    // only assert pure normalize + under-check with posix-style after normalize.
    const root = "/tmp/costgate-ws-root";
    const child = "/tmp/costgate-ws-root/src/a.ts";
    assert(isPathUnder(child, root), "posix isPathUnder");
    assert(
      findContainingWorkspaceRoot(child, [root]) === root,
      "findContainingWorkspaceRoot posix"
    );
  }

  console.error("[cursor-hook-io] all passed");
}

main();
