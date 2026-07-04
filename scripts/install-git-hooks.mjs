#!/usr/bin/env node
/** Enable repo-local git hooks (.githooks/pre-push). */
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const HOOKS = join(ROOT, ".githooks");

mkdirSync(HOOKS, { recursive: true });

const prePush = `#!/bin/sh
# CostGate: block direct push to main/develop
branch="$(git symbolic-ref --short HEAD 2>/dev/null || true)"
case "$branch" in
  main|develop|master)
    echo "[costgate] push to '$branch' is blocked."
    echo "Use: npm run feat:ship -- --message \\"...\\""
    exit 1
    ;;
esac
exit 0
`;

writeFileSync(join(HOOKS, "pre-push"), prePush, { mode: 0o755 });
chmodSync(join(HOOKS, "pre-push"), 0o755);

execSync("git config core.hooksPath .githooks", { cwd: ROOT, stdio: "inherit" });
console.log("[hooks] installed: .githooks/pre-push → blocks push to main/develop");
