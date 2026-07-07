/**
 * @costgate/cli tests (runtime resolution, mcp config, install helpers).
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
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
  normalizeVersion,
  parseGateVersionOutput,
  gateBinaryMatchesCliVersion,
  writeInstalledGateVersionMeta,
  readInstalledGateVersionMeta,
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
  assert.equal(s.env.COSTGATE_DASHBOARD_AUTO_OPEN, "once");
});

test("installedGatePath under ~/.costgate/bin", () => {
  const p = installedGatePath(gateInstallDir());
  assert.ok(p.includes(".costgate"));
  assert.ok(p.endsWith("costgate-gate") || p.endsWith("costgate-gate.exe"));
});

test("parseGateVersionOutput", () => {
  assert.equal(parseGateVersionOutput("costgate-gate 0.6.0 (abc1234)\n"), "0.6.0");
  assert.equal(parseGateVersionOutput("costgate-gate v0.6.0 (abc)"), "0.6.0");
  assert.equal(parseGateVersionOutput(""), null);
});

test("normalizeVersion strips v prefix", () => {
  assert.equal(normalizeVersion("v0.6.0"), "0.6.0");
  assert.equal(normalizeVersion("0.6.0"), "0.6.0");
});

test("gateBinaryMatchesCliVersion uses version meta", () => {
  const dir = join(REPO, ".tmp-gate-version-test");
  mkdirSync(dir, { recursive: true });
  const gatePath = join(dir, "costgate-gate");
  writeFileSync(gatePath, "");
  writeInstalledGateVersionMeta("0.6.0", dir);
  try {
    assert.equal(gateBinaryMatchesCliVersion(gatePath, "0.6.0", dir), true);
    assert.equal(gateBinaryMatchesCliVersion(gatePath, "0.7.0", dir), false);
    assert.equal(readInstalledGateVersionMeta(dir), "0.6.0");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log("cli-package tests passed");
