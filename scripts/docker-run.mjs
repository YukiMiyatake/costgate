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
import { dirname, join } from "node:path";

const ROOT = dirname(fileURLToPath(new URL("..", import.meta.url)));
const args = process.argv.slice(2);

if (args.length === 0) {
  args.push("bash");
}

const cmd = ["compose", "-f", "docker-compose.dev.yml", "run", "--rm", "toolchain", ...args];

const r = spawnSync("docker", cmd, {
  cwd: ROOT,
  stdio: "inherit",
  env: process.env,
});

process.exit(r.status ?? 1);
