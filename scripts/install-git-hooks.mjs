#!/usr/bin/env node
/**
 * Install .githooks/pre-push (blocks direct push to main/master).
 */
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PRE_PUSH = join(ROOT, ".githooks", "pre-push");

const hookBody = `#!/bin/sh
# CostGate: block direct push to main/master (tags and feature branches OK)
blocked=0
while read -r local_ref local_sha remote_ref remote_sha; do
  case "$remote_ref" in
    refs/heads/main|refs/heads/master)
      blocked=1
      ;;
  esac
done

if [ "$blocked" -eq 1 ]; then
  echo "[costgate] push to protected branch is blocked."
  echo "Use: npm run feat:ship -- --message \\"...\\""
  exit 1
fi
exit 0
`;

mkdirSync(join(ROOT, ".githooks"), { recursive: true });
writeFileSync(PRE_PUSH, hookBody);
chmodSync(PRE_PUSH, 0o755);

const r = spawnSync("git", ["config", "core.hooksPath", ".githooks"], {
  cwd: ROOT,
  stdio: "inherit",
});
if (r.status !== 0) process.exit(r.status ?? 1);

console.log("[hooks] installed: .githooks/pre-push → blocks push to main/master only");
