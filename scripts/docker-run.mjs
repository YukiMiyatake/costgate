#!/usr/bin/env node
/**
 * Run a command inside the Docker toolchain container.
 *
 * Usage:
 *   npm run docker -- npm install
 *   npm run docker -- npm run build
 *   npm run docker -- npm run compare
 *   npm run docker -- bash
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const COMPOSE_FILE = join(ROOT, "docker-compose.dev.yml");
const args = process.argv.slice(2);

if (args.length === 0) {
  args.push("bash");
}

const cmd = ["compose", "-f", COMPOSE_FILE, "run", "--rm", "toolchain", ...args];

const r = spawnSync("docker", cmd, {
  cwd: ROOT,
  stdio: "inherit",
  env: { ...process.env, PWD: ROOT },
});

process.exit(r.status ?? 1);
