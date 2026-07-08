#!/usr/bin/env node
/**
 * Bump npm package versions in the repo (committed before tag push).
 *
 *   npm run release:version -- 0.6.0
 *   npm run release:version -- 0.6.0 --note "Dashboard history improvements"
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PKG_PATHS = [
  "packages/schema/package.json",
  "packages/probe/package.json",
  "packages/cli/package.json",
];

function parseArgs(argv) {
  const version = argv.find((a) => /^\d+\.\d+\.\d+/.test(a)) ?? "";
  const noteIdx = argv.indexOf("--note");
  const note = noteIdx >= 0 ? (argv[noteIdx + 1] ?? "") : "";
  return { version, note };
}

function readJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function writeJson(rel, data) {
  writeFileSync(join(ROOT, rel), `${JSON.stringify(data, null, 2)}\n`);
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function upsertChangelog(version, note) {
  const path = join(ROOT, "CHANGELOG.md");
  let body = "";
  try {
    body = readFileSync(path, "utf8");
  } catch {
    body = "# Changelog\n\nAll notable changes to CostGate npm packages and Gate binaries.\n\n";
  }

  const heading = `## [${version}] - ${todayIso()}`;
  if (body.includes(heading)) {
    console.error(`[release:version] CHANGELOG already has ${heading}`);
    return;
  }

  const section = `${heading}\n\n${note || "- See pull requests merged since the previous release.\n"}\n\n`;
  const insertAt = body.indexOf("\n## ");
  if (insertAt >= 0) {
    body = `${body.slice(0, insertAt + 1)}${section}${body.slice(insertAt + 1)}`;
  } else {
    body = `${body.trimEnd()}\n\n${section}`;
  }
  writeFileSync(path, body);
}

function main() {
  const { version, note } = parseArgs(process.argv.slice(2));
  if (!version) {
    console.error("Usage: npm run release:version -- <semver> [--note \"…\"]");
    process.exit(1);
  }

  for (const rel of PKG_PATHS) {
    const pkg = readJson(rel);
    pkg.version = version;
    writeJson(rel, pkg);
    console.error(`[release:version] ${pkg.name} → ${version}`);
  }

  const probe = readJson("packages/probe/package.json");
  probe.dependencies["@costgate/schema"] = version;
  writeJson("packages/probe/package.json", probe);

  upsertChangelog(version, note);

  console.error("[release:version] done. Next:");
  console.error(`  npm run publish:check`);
  console.error(`  npm run feat:ship -- -m "chore: release v${version}"`);
  console.error(`  # after merge:`);
  console.error(`  git tag v${version} && git push origin v${version}`);
}

main();
