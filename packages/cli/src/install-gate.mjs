/**
 * Download costgate-gate from GitHub Releases → ~/.costgate/bin/
 */
import { chmodSync, copyFileSync, createWriteStream, existsSync, mkdirSync, rmSync } from "node:fs";
import { homedir, platform, arch as nodeArch } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { execFileSync } from "node:child_process";
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

  if (!opts.force && existsSync(dest)) {
    return { path: dest, skipped: true, version: opts.version };
  }

  const tag = opts.tag ?? (opts.version ? `v${opts.version.replace(/^v/, "")}` : await fetchLatestTag());
  const ver = tag.replace(/^v/, "");
  const { asset, ext: archiveExt } = releaseAssetName(ver, os, arch);
  const url = `https://github.com/${REPO}/releases/download/${tag}/${asset}`;

  const tmp = join(installDir, ".download");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  mkdirSync(installDir, { recursive: true });

  const archivePath = join(tmp, `archive.${archiveExt}`);
  await downloadToFile(url, archivePath);

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

  return { path: dest, skipped: false, version: ver, tag, url };
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
  if (existsSync(installed)) {
    return installed;
  }

  const ver = opts.version ?? readCliPackageVersion();
  try {
    const result = await installGateBinary({ version: ver, tag: opts.tag, force: true });
    return result.path;
  } catch (err) {
    throw new Error(
      `costgate-gate not found. Run "costgate init" or build from source (npm run build:gate). ${err.message}`
    );
  }
}
