#!/usr/bin/env node
/**
 * cursor-hook-io + toHookScriptPath path normalization.
 */
import { normalizeCursorPath } from "../scripts/lib/cursor-hook-io.mjs";
import { toHookScriptPath, windowsPathToWslMount } from "../scripts/lib/cursor-hooks.mjs";
import { isPathUnder, findContainingWorkspaceRoot } from "../scripts/lib/resolve-workspace-root.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function main() {
  assert(normalizeCursorPath("/c:/Users/me/proj") === "C:/Users/me/proj", "drive letter normalize");
  assert(normalizeCursorPath("C:\\Users\\me\\proj") === "C:/Users/me/proj", "backslash normalize");
  assert(normalizeCursorPath("/home/me/proj") === "/home/me/proj", "posix unchanged");

  assert(
    toHookScriptPath("/mnt/e/Work/wsl/costgate/scripts/x.mjs", { platform: "win32" }) ===
      "E:\\Work\\wsl\\costgate\\scripts\\x.mjs",
    "/mnt/e → E:\\"
  );
  assert(
    toHookScriptPath("/e/Work/wsl/costgate/scripts/x.mjs", { platform: "win32" }) ===
      "E:\\Work\\wsl\\costgate\\scripts\\x.mjs",
    "MSYS /e/Work → E:\\"
  );
  assert(
    toHookScriptPath("/etc/passwd", { platform: "win32" }).replace(/\\/g, "/").includes("etc"),
    "/etc not rewritten as drive"
  );
  assert(
    windowsPathToWslMount("C:\\Users\\me") === "/mnt/c/Users/me",
    "windowsPathToWslMount"
  );

  if (process.platform !== "win32") {
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
