/**
 * Download costgate-gate from GitHub Releases → ~/.costgate/bin/
 */
import {
  chmodSync,
  copyFileSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { homedir, platform, arch as nodeArch } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cliPackageRoot, readCliPackageVersion } from "./cli-runtime.mjs";

export const REPO = "YukiMiyatake/costgate";
export const DEFAULT_INSTALL_DIR = join(homedir(), ".costgate", "bin");

export function gateInstallDir(dir = process.env.COSTGATE_BIN_DIR) {
  return dir ?? DEFAULT_INSTALL_DIR;
}

export function installedGatePath(dir = gateInstallDir()) {
  const ext = platform() === "win32" ? ".exe" : "";
  return join(dir, `costgate-gate${ext}`);
}

export function installedGateVersionMetaPath(dir = gateInstallDir()) {
  return join(dir, ".costgate-gate-version");
}

export function normalizeVersion(version) {
  return String(version ?? "").trim().replace(/^v/, "");
}

export function parseGateVersionOutput(stdout) {
  const match = String(stdout ?? "").trim().match(/^costgate-gate\s+(\S+)/);
  return match ? normalizeVersion(match[1]) : null;
}

export function readInstalledGateVersionMeta(dir = gateInstallDir()) {
  const metaPath = installedGateVersionMetaPath(dir);
  if (!existsSync(metaPath)) return null;
  try {
    return normalizeVersion(readFileSync(metaPath, "utf8")) || null;
  } catch {
    return null;
  }
}

export function writeInstalledGateVersionMeta(version, dir = gateInstallDir()) {
  const ver = normalizeVersion(version);
  if (!ver) return;
  mkdirSync(dir, { recursive: true });
  writeFileSync(installedGateVersionMetaPath(dir), `${ver}\n`, "utf8");
}

export function readInstalledGateVersion(gatePath = installedGatePath()) {
  if (!existsSync(gatePath)) return null;
  try {
    const out = execFileSync(gatePath, ["--version"], {
      encoding: "utf8",
      timeout: 10_000,
    });
    return parseGateVersionOutput(out);
  } catch {
    return null;
  }
}

export function gateBinaryMatchesCliVersion(gatePath, cliVersion, installDir = gateInstallDir()) {
  const want = normalizeVersion(cliVersion);
  if (!want || !existsSync(gatePath)) return false;
  const metaVer = readInstalledGateVersionMeta(installDir);
  if (metaVer === want) return true;
  return readInstalledGateVersion(gatePath) === want;
}

export function detectPlatform() {
  let os = platform();
  if (os === "win32") os = "windows";
  let arch = nodeArch();
  if (arch === "x64") arch = "amd64";
  return { os, arch };
}

export function releaseAssetName(version, os, arch) {
  const ver = version.replace(/^v/, "");
  const ext = os === "windows" ? "zip" : "tar.gz";
  return { asset: `costgate-gate_${ver}_${os}_${arch}.${ext}`, ext, ver };
}

export async function fetchLatestTag() {
  const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
  if (!res.ok) {
    throw new Error(`GitHub API ${res.status}: no releases found for ${REPO}`);
  }
  const data = await res.json();
  return data.tag_name;
}

export async function downloadToFile(url, dest) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`download failed ${res.status}: ${url}`);
  }
  await pipeline(res.body, createWriteStream(dest));
}

/** Parse goreleaser checksums.txt (`<sha256>  <filename>` per line). */
export function parseChecksumsFile(text) {
  const map = new Map();
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^([a-fA-F0-9]{64})\s+(.+)$/);
    if (!match) continue;
    map.set(match[2].trim(), match[1].toLowerCase());
  }
  return map;
}

export async function fetchReleaseChecksums(tag) {
  const normalizedTag = String(tag ?? "").startsWith("v") ? tag : `v${normalizeVersion(tag)}`;
  const url = `https://github.com/${REPO}/releases/download/${normalizedTag}/checksums.txt`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`checksum download failed ${res.status}: ${url}`);
  }
  return parseChecksumsFile(await res.text());
}

export function sha256File(path) {
  const data = readFileSync(path);
  return createHash("sha256").update(data).digest("hex");
}

export function verifyArchiveChecksum(archivePath, assetName, checksums) {
  const expected = checksums.get(assetName);
  if (!expected) {
    throw new Error(`checksum missing for ${assetName}`);
  }
  const actual = sha256File(archivePath);
  if (actual !== expected) {
    throw new Error(`checksum mismatch for ${assetName}`);
  }
}

function extractTarGz(archive, destDir) {
  mkdirSync(destDir, { recursive: true });
  const tar = execFileSync("tar", ["-xzf", archive, "-C", destDir], { stdio: ["ignore", "pipe", "pipe"] });
  void tar;
}

function extractZip(archive, destDir) {
  mkdirSync(destDir, { recursive: true });
  execFileSync("unzip", ["-q", archive, "-d", destDir], { stdio: "ignore" });
}

/**
 * @param {{ version?: string, tag?: string, installDir?: string, force?: boolean }} opts
 */
export async function installGateBinary(opts = {}) {
  const { os, arch } = detectPlatform();
  const installDir = gateInstallDir(opts.installDir);
  const dest = installedGatePath(installDir);
  const ext = platform() === "win32" ? ".exe" : "";

  const tag =
    opts.tag ??
    (opts.version ? `v${normalizeVersion(opts.version)}` : await fetchLatestTag());
  const ver = normalizeVersion(tag);

  if (!opts.force && existsSync(dest) && gateBinaryMatchesCliVersion(dest, ver, installDir)) {
    writeInstalledGateVersionMeta(ver, installDir);
    return { path: dest, skipped: true, version: ver, tag: `v${ver}` };
  }
  const { asset, ext: archiveExt } = releaseAssetName(ver, os, arch);
  const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;

  const tmp = join(installDir, ".download");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(installDir, { recursive: true });

  const archivePath = join(tmp, `archive.${archiveExt}`);
  await downloadToFile(url, archivePath);

  if (!opts.skipChecksum) {
    const checksums = await fetchReleaseChecksums(tag);
    verifyArchiveChecksum(archivePath, asset, checksums);
  }

  const extractDir = join(tmp, "extract");
  if (archiveExt === "zip") {
    extractZip(archivePath, extractDir);
  } else {
    extractTarGz(archivePath, extractDir);
  }

  const binName = `costgate-gate${ext}`;
  const src = join(extractDir, binName);
  if (!existsSync(src)) {
    throw new Error(`binary not found in archive: ${binName}`);
  }

  copyFileSync(src, dest);
  if (platform() !== "win32") {
    chmodSync(dest, 0o755);
  }

  rmSync(tmp, { recursive: true, force: true });
  writeInstalledGateVersionMeta(ver, installDir);

  return { path: dest, skipped: false, version: ver, tag, url };
}

/** Install or upgrade Gate when missing or version differs from @costgate/cli. */
export async function ensureGateBinaryForCli(opts = {}) {
  const installDir = gateInstallDir(opts.installDir);
  const dest = installedGatePath(installDir);
  const cliVer = normalizeVersion(opts.version ?? readCliPackageVersion());

  if (!opts.force && existsSync(dest) && gateBinaryMatchesCliVersion(dest, cliVer, installDir)) {
    writeInstalledGateVersionMeta(cliVer, installDir);
    return { path: dest, skipped: true, version: cliVer, tag: `v${cliVer}` };
  }

  return installGateBinary({
    ...opts,
    version: cliVer,
    force: opts.force ?? true,
  });
}

/** Prefer local monorepo build, then installed binary, else download latest release. */
export async function resolveGateBinary(opts = {}) {
  if (process.env.COSTGATE_GATE_BIN && existsSync(process.env.COSTGATE_GATE_BIN)) {
    return process.env.COSTGATE_GATE_BIN;
  }

  const monorepoBin = join(cliPackageRoot(), "..", "..", "packages", "gate", "bin", "costgate-gate");
  if (existsSync(monorepoBin)) {
    return monorepoBin;
  }

  const installed = installedGatePath();
  const cliVer = normalizeVersion(opts.version ?? readCliPackageVersion());
  if (existsSync(installed) && gateBinaryMatchesCliVersion(installed, cliVer)) {
    return installed;
  }

  try {
    const result = await ensureGateBinaryForCli({ version: cliVer, tag: opts.tag });
    return result.path;
  } catch (err) {
    throw new Error(
      `costgate-gate not found. Run "costgate init" or build from source (npm run build:gate). ${err.message}`
    );
  }
}
