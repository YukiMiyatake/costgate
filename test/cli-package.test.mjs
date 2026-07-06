/**
 * @costgate/cli tests (runtime resolution, mcp config, install helpers).
 */
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  cliRuntimeRoot,
  cliPackageRoot,
  readCliPackageVersion,
  runtimeScript,
} from "../packages/cli/src/cli-runtime.mjs";
import {
  detectPlatform,
  releaseAssetName,
  gateInstallDir,
  installedGatePath,
} from "../packages/cli/src/install-gate.mjs";
import { gateMcpServer } from "../packages/cli/src/mcp-config.mjs";

const REPO = join(fileURLToPath(import.meta.url), "..");

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

test("cliRuntimeRoot resolves monorepo in dev", () => {
  const root = cliRuntimeRoot();
  assert.equal(runtimeScript("costgate-gate-launch.mjs"), join(root, "scripts", "costgate-gate-launch.mjs"));
  const monorepo = join(cliPackageRoot(), "..", "..");
  assert.equal(root, monorepo, "monorepo scripts should win over packages/cli/runtime");
});

test("readCliPackageVersion is semver-like", () => {
  const v = readCliPackageVersion();
  assert.match(v, /^\d+\.\d+\.\d+/);
});

test("releaseAssetName linux amd64", () => {
  const { asset, ext } = releaseAssetName("0.5.0", "linux", "amd64");
  assert.equal(asset, "costgate-gate_0.5.0_linux_amd64.tar.gz");
  assert.equal(ext, "tar.gz");
});

test("releaseAssetName windows", () => {
  const { asset } = releaseAssetName("0.5.0", "windows", "arm64");
  assert.equal(asset, "costgate-gate_0.5.0_windows_arm64.zip");
});

test("detectPlatform returns os and arch", () => {
  const p = detectPlatform();
  assert.ok(["linux", "darwin", "windows"].includes(p.os));
  assert.ok(["amd64", "arm64"].includes(p.arch));
});

test("gateMcpServer uses npx @costgate/cli gate", () => {
  const s = gateMcpServer("0.5.0");
  assert.equal(s.command, "npx");
  assert.deepEqual(s.args, ["-y", "@costgate/cli@0.5.0", "gate"]);
  assert.equal(s.env.COSTGATE_SHIELD, "1");
  assert.equal(s.env.COSTGATE_DASHBOARD_AUTO, "1");
});

test("installedGatePath under ~/.costgate/bin", () => {
  const p = installedGatePath(gateInstallDir());
  assert.ok(p.includes(".costgate"));
  assert.ok(p.endsWith("costgate-gate") || p.endsWith("costgate-gate.exe"));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("cli-package tests passed");
