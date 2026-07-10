#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PKG = join(ROOT, "packages/probe/package.json");

const pkgVersion = JSON.parse(readFileSync(PKG, "utf8")).version;
assert.match(pkgVersion, /^\d+\.\d+\.\d+/, "probe package.json version");

const indexSrc = readFileSync(join(ROOT, "packages/probe/src/index.ts"), "utf8");
assert(!indexSrc.includes("v0.1.0"), "probe index must not hardcode v0.1.0");
assert(indexSrc.includes("probeVersion()"), "probe index uses probeVersion()");

const build = spawnSync("npm", ["run", "build:probe"], { cwd: ROOT, stdio: "inherit" });
assert.equal(build.status, 0, "build:probe failed");

const { probeVersion } = await import(join(ROOT, "packages/probe/dist/version.js"));
assert.equal(probeVersion(), pkgVersion, "probeVersion matches package.json");

console.error("[probe-version] ok");
