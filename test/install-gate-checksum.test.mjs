#!/usr/bin/env node
import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parseChecksumsFile,
  sha256File,
  verifyArchiveChecksum,
} from "../packages/cli/src/install-gate.mjs";

const ROOT = join(fileURLToPath(import.meta.url), "..");

function test(name, fn) {
  try {
    fn();
    console.error(`ok ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}:`, e.message);
    process.exitCode = 1;
  }
}

test("parseChecksumsFile reads goreleaser format", () => {
  const text = `aabbccdd${"0".repeat(56)}  costgate-gate_0.5.0_linux_amd64.tar.gz
${"1".repeat(64)}  costgate-gate_0.5.0_darwin_arm64.tar.gz`;
  const map = parseChecksumsFile(text);
  assert.equal(map.size, 2);
  assert.equal(
    map.get("costgate-gate_0.5.0_linux_amd64.tar.gz"),
    `aabbccdd${"0".repeat(56)}`
  );
});

test("sha256File + verifyArchiveChecksum", () => {
  const dir = join(ROOT, ".tmp-install-gate-checksum");
  mkdirSync(dir, { recursive: true });
  const asset = "costgate-gate_0.5.0_linux_amd64.tar.gz";
  const archivePath = join(dir, asset);
  const payload = "fake archive bytes for checksum test";
  writeFileSync(archivePath, payload);
  const hash = sha256File(archivePath);
  const checksums = parseChecksumsFile(`${hash}  ${asset}\n`);
  verifyArchiveChecksum(archivePath, asset, checksums);
  try {
    verifyArchiveChecksum(archivePath, asset, parseChecksumsFile(`${"f".repeat(64)}  ${asset}\n`));
    assert.fail("expected mismatch");
  } catch (e) {
    assert.match(e.message, /checksum mismatch/);
  }
  rmSync(dir, { recursive: true, force: true });
});

if (process.exitCode) process.exit(process.exitCode);
console.error("[install-gate-checksum] all passed");
